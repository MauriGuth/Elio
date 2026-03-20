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

  const modifierGroupIds: string[] = [
    ...new Set(
      ingredientsRows
        .map((r) => r.modifierGroupId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

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
 * IDs de grupos de modificadores que el POS debe validar para este ítem:
 * los ligados a la receta activa, menos los vinculados a ingredientes excluidos
 * (ej. sin pan → no exigir "Tipo de pan").
 * `undefined` = no filtrar por receta (validar todos los grupos del producto).
 */
export async function getOrderItemRecipeModifierGroupIdsToValidate(
  prisma: PrismaLike,
  productId: string,
  excludedRecipeIngredientIds?: string[] | null,
): Promise<string[] | undefined> {
  const recipeId = await findActiveRecipeId(prisma, productId);
  if (!recipeId) {
    return undefined;
  }

  const ingredients = (await prisma.recipeIngredient.findMany({
    where: { recipeId },
    select: { id: true, modifierGroupId: true },
  })) as Array<{ id: string; modifierGroupId: string | null }>;

  const baseIds = [
    ...new Set(
      ingredients
        .map((r) => r.modifierGroupId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (baseIds.length === 0) {
    return undefined;
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
