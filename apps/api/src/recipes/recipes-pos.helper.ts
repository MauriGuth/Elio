/**
 * Contexto de receta activa para POS (mesas/comandas): grupos de variantes
 * vinculados en ingredientes e insumos visibles para el cliente.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = any;

export type RecipePosIngredientRow = {
  id: string;
  productId: string;
  name: string;
  modifierGroupId: string | null;
};

export async function findActiveRecipeId(
  prisma: PrismaLike,
  productId: string,
): Promise<string | null> {
  const root = await prisma.recipe.findFirst({
    where: { productId, isActive: true, parentId: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  const recipe =
    root ??
    (await prisma.recipe.findFirst({
      where: { productId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    }));
  return recipe?.id ?? null;
}

/**
 * @returns modifierGroupIds vacío si no hay receta o ningún ingrediente con grupo;
 *          ingredientes vacío si no hay receta.
 */
export async function getRecipePosContext(
  prisma: PrismaLike,
  productId: string,
): Promise<{
  recipeId: string | null;
  modifierGroupIds: string[];
  ingredients: RecipePosIngredientRow[];
}> {
  const recipeId = await findActiveRecipeId(prisma, productId);
  if (!recipeId) {
    return { recipeId: null, modifierGroupIds: [], ingredients: [] };
  }

  const ingredientsRows = (await prisma.recipeIngredient.findMany({
    where: { recipeId },
    orderBy: { sortOrder: 'asc' },
    include: {
      product: { select: { id: true, name: true } },
    },
  })) as Array<{
    id: string;
    productId: string;
    modifierGroupId: string | null;
    product: { name: string } | null;
  }>;

  /** Orden = primera aparición en ingredientes (sortOrder asc), no sortOrder del grupo en catálogo. */
  const modifierGroupIds: string[] = [];
  const seenGroup = new Set<string>();
  for (const row of ingredientsRows) {
    const id = row.modifierGroupId;
    if (typeof id === 'string' && id.length > 0 && !seenGroup.has(id)) {
      seenGroup.add(id);
      modifierGroupIds.push(id);
    }
  }

  /**
   * Todas las filas de la receta van al POS: las que tienen `modifierGroupId` sirven para
   * ocultar grupos si el cliente saca ese ingrediente; las sin grupo son el checklist «Incluye».
   * No se excluyen por stock_lines ni sub-recetas: si panceta/salchicha están como base sin
   * variantes, tienen que listarse aunque el mismo producto figure en otra parte.
   */
  const ingredients: RecipePosIngredientRow[] = ingredientsRows.map((r) => ({
    id: r.id,
    productId: r.productId,
    name: r.product?.name ?? 'Producto',
    modifierGroupId: r.modifierGroupId,
  }));

  return { recipeId, modifierGroupIds, ingredients };
}

/**
 * Minutos de elaboración por producto en un local: `recipe_locations.prep_time_min`
 * si existe fila para la receta activa + ubicación; si no, `recipes.prep_time_min`.
 * Valores ≤ 0 se ignoran (se devuelve null para usar fallback en KDS).
 */
export async function getPrepMinutesByProductIdsForLocation(
  prisma: PrismaLike,
  productIds: string[],
  locationId: string,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const uniq = [...new Set(productIds.filter(Boolean))];
  for (const pid of uniq) {
    result.set(pid, null);
  }
  if (uniq.length === 0 || !locationId) {
    return result;
  }

  const recipes = (await prisma.recipe.findMany({
    where: { productId: { in: uniq }, isActive: true },
    select: {
      id: true,
      productId: true,
      parentId: true,
      updatedAt: true,
      prepTimeMin: true,
    },
  })) as Array<{
    id: string;
    productId: string;
    parentId: string | null;
    updatedAt: Date;
    prepTimeMin: number | null;
  }>;

  const byProduct = new Map<string, typeof recipes>();
  for (const r of recipes) {
    if (!byProduct.has(r.productId)) {
      byProduct.set(r.productId, []);
    }
    byProduct.get(r.productId)!.push(r);
  }

  const chosenByProduct = new Map<
    string,
    { id: string; prepTimeMin: number | null }
  >();
  for (const pid of uniq) {
    const list = byProduct.get(pid) ?? [];
    if (list.length === 0) {
      continue;
    }
    const roots = list.filter((r) => r.parentId == null);
    const candidates = roots.length > 0 ? roots : list;
    candidates.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    const chosen = candidates[0]!;
    chosenByProduct.set(pid, {
      id: chosen.id,
      prepTimeMin: chosen.prepTimeMin,
    });
  }

  const recipeIds = [...new Set([...chosenByProduct.values()].map((c) => c.id))];
  if (recipeIds.length === 0) {
    return result;
  }

  const locRows = (await prisma.recipeLocation.findMany({
    where: { locationId, recipeId: { in: recipeIds } },
    select: { recipeId: true, prepTimeMin: true },
  })) as Array<{ recipeId: string; prepTimeMin: number | null }>;

  const locByRecipe = new Map<string, number | null>();
  for (const row of locRows) {
    locByRecipe.set(row.recipeId, row.prepTimeMin);
  }

  for (const pid of uniq) {
    const ch = chosenByProduct.get(pid);
    if (!ch) {
      continue;
    }
    const locMin = locByRecipe.get(ch.id);
    if (locMin != null && typeof locMin === 'number' && locMin > 0) {
      result.set(pid, Math.round(locMin));
      continue;
    }
    const fb = ch.prepTimeMin;
    if (fb != null && typeof fb === 'number' && fb > 0) {
      result.set(pid, Math.round(fb));
    }
  }

  return result;
}

/**
 * IDs de grupos de modificadores que el POS/API deben validar para este ítem.
 * - Con receta: solo grupos enlazados en ingredientes (orden de la receta), menos los
 *   ocultos por `excludedRecipeIngredientIds`.
 * - Receta sin ningún ingrediente con `modifierGroupId`: `[]` (no validar el catálogo global).
 * - Sin receta: solo grupos con `product_id` = este producto (no los globales `product_id` null).
 */
export async function getOrderItemRecipeModifierGroupIdsToValidate(
  prisma: PrismaLike,
  productId: string,
  excludedRecipeIngredientIds?: string[] | null,
): Promise<string[]> {
  const recipeId = await findActiveRecipeId(prisma, productId);
  if (!recipeId) {
    const productGroups = (await prisma.productModifierGroup.findMany({
      where: { productId },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    })) as Array<{ id: string }>;
    return productGroups.map((g) => g.id);
  }

  const ingredients = (await prisma.recipeIngredient.findMany({
    where: { recipeId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, modifierGroupId: true },
  })) as Array<{ id: string; modifierGroupId: string | null }>;

  const baseIds: string[] = [];
  const seen = new Set<string>();
  for (const ing of ingredients) {
    const id = ing.modifierGroupId;
    if (typeof id === 'string' && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      baseIds.push(id);
    }
  }
  if (baseIds.length === 0) {
    return [];
  }

  if (!excludedRecipeIngredientIds?.length) {
    return baseIds;
  }

  const ex = new Set(excludedRecipeIngredientIds);
  const hidden = new Set<string>();
  for (const ing of ingredients) {
    if (ex.has(ing.id) && ing.modifierGroupId) {
      hidden.add(ing.modifierGroupId);
    }
  }
  return baseIds.filter((id) => !hidden.has(id));
}
