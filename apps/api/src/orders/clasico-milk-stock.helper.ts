import { Prisma } from '../../generated/prisma';
import { findActiveRecipeId } from '../recipes/recipes-pos.helper';

const CLASICO_SKUS = new Set([
  'CARTA-POCILLO',
  'CARTA-JARRITO',
  'CARTA-DOBLE',
  'CARTA-TAZON',
]);

const EPS = 1e-6;

type ProductMini = { id: string; sku: string | null; name: string | null };

/**
 * Líneas de preparación que representan “componente leche” (vaca, espuma, almendra, descremada, etc.).
 * No depende de un solo SKU: si en la receta cargaste ALM-MANI, también se reemplaza al cambiar tipo en el POS.
 */
function isMilkComponentProduct(p: ProductMini): boolean {
  const sku = (p.sku ?? '').toUpperCase();
  const name = (p.name ?? '').toLowerCase();
  if (sku.includes('TIPO-LECHE') || sku.includes('TIPO_LECHE')) return true;
  if (sku.includes('CARTA-INS-LECHE')) return true;
  if (sku.includes('ALM-MANI') || sku.includes('ALMEND')) return true;
  if (/arroz/i.test(name)) return false;
  if (/(^|[^a-z])leche|almendra|descrem|alm-mani|espuma|tipo de leche/i.test(name)) {
    if (/cookie|galleta|condensada|nieve|dulce de leche/i.test(name)) return false;
    return true;
  }
  return false;
}

function isCoffeeComponentProduct(p: ProductMini): boolean {
  const sku = (p.sku ?? '').toUpperCase();
  const name = (p.name ?? '').trim().toLowerCase();
  /** Carta / seed canónico */
  if (sku.includes('CARTA-INS-CAFE-GRANO') || sku.includes('CAFE_GRANO')) return true;
  /**
   * Planilla / DB antigua: el primer match de CAFE_GRANO suele ser insumo literal «CAFE» o «CAFÉ»
   * (sin “grano” en el nombre). Sin esto nunca se sustituye por el origen elegido.
   */
  if (name === 'cafe' || name === 'café') return true;
  if (/cafe/.test(name) && /(grano|molido|espresso|especialidad|blend|bean|tostad)/.test(name)) {
    return true;
  }
  /** Nombre tipo «CAFE (cart)» */
  if (/^caf[eé]\b/.test(name) && !/leche|latte|capucc|cappuc|machiato|moka|irish|irland/i.test(name)) {
    return true;
  }
  return false;
}

type CoffeeTypeTarget = { labelRx: RegExp; skus: string[]; nameHints: string[] };
const COFFEE_TYPE_TARGETS: CoffeeTypeTarget[] = [
  { labelRx: /passion/i, skus: ['CARTA-INS-CAFE-PASSION'], nameHints: ['CAFE PASSION', 'PASSION'] },
  {
    labelRx: /brasil\s+medium/i,
    skus: ['CARTA-INS-CAFE-BRASIL-MEDIUM'],
    nameHints: ['CAFE BRASIL MEDIUM', 'BRASIL MEDIUM'],
  },
  {
    labelRx: /colombian\s+dark/i,
    skus: ['CARTA-INS-CAFE-COLOMBIAN-DARK'],
    nameHints: ['CAFE COLOMBIAN DARK', 'COLOMBIAN DARK'],
  },
  {
    labelRx: /colombian\s+deca?f+/i,
    skus: ['CARTA-INS-CAFE-COLOMBIAN-DECAFF'],
    nameHints: ['CAFE COLOMBIAN DECAFF', 'COLOMBIAN DECAFF', 'COLOMBIAN DECAF'],
  },
  { labelRx: /\bperu\b/i, skus: ['CARTA-INS-CAFE-PERU'], nameHints: ['CAFE PERU', 'PERU'] },
  { labelRx: /ethiopia/i, skus: ['CARTA-INS-CAFE-ETHIOPIA'], nameHints: ['CAFE ETHIOPIA', 'ETHIOPIA'] },
  { labelRx: /ruanda|rwanda/i, skus: ['CARTA-INS-CAFE-RUANDA'], nameHints: ['CAFE RUANDA', 'RUANDA', 'RWANDA'] },
  { labelRx: /honduras/i, skus: ['CARTA-INS-CAFE-HONDURAS'], nameHints: ['CAFE HONDURAS', 'HONDURAS'] },
  { labelRx: /nicaragua/i, skus: ['CARTA-INS-CAFE-NICARAGUA'], nameHints: ['CAFE NICARAGUA', 'NICARAGUA'] },
  {
    labelRx: /santos|bourbon/i,
    skus: ['CARTA-INS-CAFE-BRASIL-SANTOS-BOURBON'],
    nameHints: ['CAFE BRASIL SANTOS BOURBON', 'BRASIL SANTOS BOURBON', 'CAFE SANTOS'],
  },
];

/** Insumo «TIPO DE LECHE» de la preparación: no es el destino al elegir leche entera / descremada / almendras. */
function isTipoLechePlaceholderProduct(p: ProductMini | null | undefined): boolean {
  if (!p) return true;
  const sku = (p.sku ?? '').toUpperCase();
  if (sku === 'CARTA-INS-TIPO-LECHE' || sku.includes('TIPO-LECHE') || sku.includes('TIPO_LECHE')) {
    return true;
  }
  const n = (p.name ?? '').toLowerCase();
  if (/\btipo\s+de\s+leche\b/.test(n)) return true;
  return false;
}

/** Excluye placeholder y productos que no son leche líquida real. */
const notTipoLechePlaceholderWhere = {
  NOT: {
    OR: [
      { sku: 'CARTA-INS-TIPO-LECHE' },
      { name: { contains: 'tipo de leche', mode: Prisma.QueryMode.insensitive } },
    ],
  },
};

async function resolveClasicoLecheEnteraId(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const base = { isIngredient: true, ...notTipoLechePlaceholderWhere };
  const tries = [
    { ...base, sku: 'CARTA-INS-LECHE' },
    { ...base, name: { contains: 'LECHE ENTERA', mode: Prisma.QueryMode.insensitive } },
    {
      ...base,
      AND: [
        { name: { contains: 'entera', mode: Prisma.QueryMode.insensitive } },
        { name: { contains: 'leche', mode: Prisma.QueryMode.insensitive } },
        { NOT: { name: { contains: 'descrem', mode: Prisma.QueryMode.insensitive } } },
        { NOT: { name: { contains: 'almendra', mode: Prisma.QueryMode.insensitive } } },
        { NOT: { name: { contains: 'espuma', mode: Prisma.QueryMode.insensitive } } },
      ],
    },
  ];
  for (const where of tries) {
    const row = await tx.product.findFirst({
      where,
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (row) return row.id;
  }
  return null;
}

async function resolveClasicoLecheDescremadaId(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const base = { isIngredient: true, ...notTipoLechePlaceholderWhere };
  const tries = [
    { ...base, sku: 'CARTA-INS-LECHE-DESCREMADA' },
    { ...base, name: { contains: 'LECHE DESCREM', mode: Prisma.QueryMode.insensitive } },
    {
      ...base,
      AND: [
        { name: { contains: 'descrem', mode: Prisma.QueryMode.insensitive } },
        { name: { contains: 'leche', mode: Prisma.QueryMode.insensitive } },
      ],
    },
  ];
  for (const where of tries) {
    const row = await tx.product.findFirst({
      where,
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (row) return row.id;
  }
  return null;
}

async function resolveClasicoLecheAlmendrasId(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const base = { isIngredient: true, ...notTipoLechePlaceholderWhere };
  const tries = [
    { ...base, sku: 'CARTA-INS-LECHE-ALMENDRAS' },
    {
      ...base,
      OR: [
        { name: { contains: 'almendra', mode: Prisma.QueryMode.insensitive } },
        { name: { contains: 'ALM-MANI', mode: Prisma.QueryMode.insensitive } },
      ],
    },
  ];
  for (const where of tries) {
    const row = await tx.product.findFirst({
      where,
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (row) return row.id;
  }
  return null;
}

function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/**
 * Grupo modificador de elección de leche en el POS (cualquier producto/receta que lo use).
 * No hace falta listar SKUs ni etiquetas de visibilidad: basta con el nombre del grupo en BD.
 */
function modifierGroupNameIsMilkType(name: string | null | undefined): boolean {
  const n = normName(name);
  if (n.includes('tipo de leche')) return true;
  if (/\btipo leche\b/.test(n)) return true;
  /** Títulos POS tipo «LECHE *» sin la palabra «tipo». */
  if (/^leche\b/.test(n)) return true;
  return false;
}

/** Grupo de origen de café en POS: títulos legacy o «GRANO» (no confundir con «granola»: /^grano\\b/). */
function modifierGroupNameIsCoffeeBeanChoice(name: string | null | undefined): boolean {
  const n = normName(name);
  if (n.includes('cafe de especialidad')) return true;
  if (n.includes('tipo de cafe')) return true;
  if (/^grano\b/.test(n)) return true;
  return false;
}

/** Grupo «Preparación — Pocillo|Jarrito|Doble|Tazón» (formatos clásicos), sin depender del SKU del producto. */
function preparationGroupIsClasicoFormat(groupName: string | null | undefined): boolean {
  const n = normName(groupName);
  if (!n.includes('preparacion')) return false;
  return (
    n.includes('pocillo') ||
    n.includes('jarrito') ||
    n.includes('doble') ||
    n.includes('tazon')
  );
}

/**
 * Café clásico por formato: SKU canónico `CARTA-POCILLO` / `JARRITO` / … **o** receta con grupo
 * «Preparación — …» de esos formatos (ej. producto `TAZON` con SKU distinto).
 * Así el cierre descuenta insumos + sustitución leche/café aunque el vendible no sea `CARTA-*`.
 */
export async function isClasicoFormatProduct(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
  productSku: string | null | undefined,
): Promise<boolean> {
  if (productSku && CLASICO_SKUS.has(productSku)) return true;
  const recipeId = await findActiveRecipeId(tx, sellableProductId);
  if (!recipeId) return false;
  const ris = await tx.recipeIngredient.findMany({
    where: { recipeId, modifierGroupId: { not: null } },
    include: { modifierGroup: { select: { name: true } } },
  });
  return ris.some((r) => preparationGroupIsClasicoFormat(r.modifierGroup?.name ?? null));
}

/**
 * Grupo elegido en POS (café solo / con leche / jarrito…): por nombre o por formato clásico.
 * Si todos los grupos tienen `visibilityRule`, el fallback «sin regla» quedaba vacío y no había
 * sustitución leche/grano (stock en TIPO DE LECHE / CAFE genérico).
 */
function groupNameSuggestsPreparationChoice(name: string | null | undefined): boolean {
  const n = normName(name);
  if (n.includes('preparacion') || n.includes('preparation')) return true;
  if (preparationGroupIsClasicoFormat(name)) return true;
  if (
    n.includes('pocillo') ||
    n.includes('jarrito') ||
    n.includes('tazon') ||
    n.includes('doble')
  ) {
    return true;
  }
  return false;
}

function pickPreparationModifierGroup(
  groups: Array<{
    id: string;
    name: string | null;
    sortOrder: number | null;
    visibilityRule: Prisma.JsonValue | null;
  }>,
): (typeof groups)[0] | undefined {
  if (groups.length === 0) return undefined;
  const sorted = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const byPrepHint = sorted.filter((g) => groupNameSuggestsPreparationChoice(g.name));
  if (byPrepHint.length > 0) return byPrepHint[0];
  const noRule = sorted.filter((g) => g.visibilityRule == null);
  if (noRule.length > 0) return noRule[0];
  const notMilkNotBean = sorted.filter(
    (g) =>
      !modifierGroupNameIsMilkType(g.name) &&
      !modifierGroupNameIsCoffeeBeanChoice(g.name),
  );
  if (notMilkNotBean.length > 0) return notMilkNotBean[0];
  return sorted[0];
}

/** Receta activa con ingrediente que enlaza el grupo «Tipo de leche» (salón, take, tragos, etc.). */
async function recipeHasMilkTypeModifierGroup(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
): Promise<boolean> {
  const recipeId = await findActiveRecipeId(tx, sellableProductId);
  if (!recipeId) return false;
  const ris = await tx.recipeIngredient.findMany({
    where: { recipeId, modifierGroupId: { not: null } },
    include: { modifierGroup: { select: { name: true } } },
  });
  return ris.some((r) => modifierGroupNameIsMilkType(r.modifierGroup?.name ?? null));
}

/** Grupos de modificadores del producto (y globales): en remoto a veces no hay `modifierGroupId` en la receta. */
async function productHasMilkTypeModifierGroup(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
): Promise<boolean> {
  const groups = await tx.productModifierGroup.findMany({
    where: { OR: [{ productId: sellableProductId }, { productId: null }] },
    select: { name: true },
  });
  return groups.some((g) => modifierGroupNameIsMilkType(g.name));
}

async function recipeHasCoffeeBeanModifierGroup(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
): Promise<boolean> {
  const recipeId = await findActiveRecipeId(tx, sellableProductId);
  if (!recipeId) return false;
  const ris = await tx.recipeIngredient.findMany({
    where: { recipeId, modifierGroupId: { not: null } },
    include: { modifierGroup: { select: { name: true } } },
  });
  return ris.some((r) =>
    modifierGroupNameIsCoffeeBeanChoice(r.modifierGroup?.name ?? null),
  );
}

async function productHasCoffeeBeanModifierGroup(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
): Promise<boolean> {
  const groups = await tx.productModifierGroup.findMany({
    where: { OR: [{ productId: sellableProductId }, { productId: null }] },
    select: { name: true },
  });
  return groups.some((g) => modifierGroupNameIsCoffeeBeanChoice(g.name));
}

/**
 * Si «tipo de leche» no está entre las opciones cargadas por IDs en norm (p. ej. se guardó sin esa clave),
 * resolvemos el grupo vía receta y la selección en norm o la primera opción del grupo.
 */
async function resolveMilkPickedForClasico(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
  norm: Record<string, string[]>,
): Promise<{ id: string; label: string } | null> {
  const recipeId = await findActiveRecipeId(tx, sellableProductId);
  if (!recipeId) return null;

  const ris = await tx.recipeIngredient.findMany({
    where: { recipeId, modifierGroupId: { not: null } },
    include: { modifierGroup: { select: { id: true, name: true } } },
  });
  const milkRi = ris.find(
    (r) => r.modifierGroup && modifierGroupNameIsMilkType(r.modifierGroup.name),
  );
  const milkGid = milkRi?.modifierGroupId;
  if (!milkGid) return null;

  const optIdFromNorm = norm[milkGid]?.[0];
  if (optIdFromNorm) {
    const opt = await tx.productModifierOption.findUnique({
      where: { id: optIdFromNorm },
      select: { id: true, label: true },
    });
    if (opt) return { id: opt.id, label: opt.label };
  }

  const first = await tx.productModifierOption.findFirst({
    where: { groupId: milkGid },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, label: true },
  });
  return first ? { id: first.id, label: first.label } : null;
}

/** Receta sin `modifierGroupId` para leche: el grupo igual está en catálogo global / producto. */
async function resolveMilkPickedFromProductCatalog(
  tx: Prisma.TransactionClient,
  sellableProductId: string,
  norm: Record<string, string[]>,
): Promise<{ id: string; label: string } | null> {
  const groups = await tx.productModifierGroup.findMany({
    where: { OR: [{ productId: sellableProductId }, { productId: null }] },
    select: { id: true, name: true },
  });
  const milkG = groups.find((g) => modifierGroupNameIsMilkType(g.name));
  if (!milkG) return null;
  const optIdFromNorm = norm[milkG.id]?.[0];
  if (!optIdFromNorm) return null;
  const opt = await tx.productModifierOption.findUnique({
    where: { id: optIdFromNorm },
    select: { id: true, label: true },
  });
  return opt ? { id: opt.id, label: opt.label } : null;
}

async function resolveBySkuOrName(
  tx: Prisma.TransactionClient,
  skus: string[],
  nameHints: string[],
): Promise<{ id: string } | null> {
  for (const sku of skus) {
    const bySku = await tx.product.findFirst({ where: { sku }, select: { id: true } });
    if (bySku) return bySku;
  }
  for (const nm of nameHints) {
    const exact = await tx.product.findFirst({
      where: {
        isIngredient: true,
        name: { equals: nm, mode: Prisma.QueryMode.insensitive },
      },
      select: { id: true },
    });
    if (exact) return exact;
  }
  for (const nm of nameHints) {
    const contains = await tx.product.findFirst({
      where: {
        isIngredient: true,
        name: { contains: nm, mode: Prisma.QueryMode.insensitive },
      },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    if (contains) return contains;
  }
  return null;
}

/**
 * Tras sumar líneas de modificadores: la preparación cargó insumos de leche (cualquier SKU).
 * Según “Tipo de leche” en el POS, se revierte ese consumo y se aplica el insumo objetivo con el mismo volumen total.
 */
export async function applyClasicoMilkTypeSubstitution(
  tx: Prisma.TransactionClient,
  productSku: string | null | undefined,
  sellableProductId: string,
  norm: Record<string, string[]> | null,
  itemQuantity: number,
  consumption: Map<string, number>,
  /**
   * `true` si aplica sustitución de leche: formato clásico **o** receta que enlaza un grupo «Tipo de leche».
   * Cubre take, cafés especiales, jarrito/doble con visibilidad condicional, tragos, etc., sin listar productos.
   */
  milkSubstitutionContextOk?: boolean,
): Promise<void> {
  const ok =
    milkSubstitutionContextOk !== undefined
      ? milkSubstitutionContextOk
      : await isClasicoFormatProduct(tx, sellableProductId, productSku);
  if (!norm || !ok) return;

  const optionIds = [...new Set(Object.values(norm).flat())];
  if (optionIds.length === 0) return;

  const options = await tx.productModifierOption.findMany({
    where: { id: { in: optionIds } },
    select: {
      id: true,
      label: true,
      group: {
        /** `name` hace falta para detectar «Tipo de leche» (sin esto `name` venía undefined). */
        select: { id: true, name: true, sortOrder: true, visibilityRule: true },
      },
    },
  });

  const milkOptFull = options.find((o) =>
    modifierGroupNameIsMilkType(o.group?.name ?? null),
  );

  let milkPicked: { id: string; label: string } | null = milkOptFull
    ? { id: milkOptFull.id, label: milkOptFull.label }
    : null;

  if (!milkPicked) {
    milkPicked = await resolveMilkPickedForClasico(tx, sellableProductId, norm);
  }
  if (!milkPicked) {
    milkPicked = await resolveMilkPickedFromProductCatalog(
      tx,
      sellableProductId,
      norm,
    );
  }
  if (!milkPicked) return;

  const label = String(milkPicked.label || '').toLowerCase();

  const groupIds = Object.keys(norm);
  const groups = await tx.productModifierGroup.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true, sortOrder: true, visibilityRule: true },
  });
  const prepG = pickPreparationModifierGroup(groups);
  if (!prepG) return;

  const prepOptionId = norm[prepG.id]?.[0];
  if (!prepOptionId) return;

  const prepLines = await tx.productModifierStockLine.findMany({
    where: { optionId: prepOptionId },
    include: {
      product: { select: { id: true, sku: true, name: true } },
    },
  });

  const milkLines = prepLines.filter((l) =>
    isMilkComponentProduct(l.product as ProductMini),
  );
  const totalMilk = milkLines.reduce((s, l) => s + l.quantity, 0);
  if (totalMilk < EPS) return;

  const q = itemQuantity;

  /**
   * Líneas de stock en la opción elegida (panel admin: LECHE ENTERA, GRANO 1 KG …).
   * Si cargaste insumo ahí, ese producto es el que debe moverse (no solo SKU carta CARTA-INS-*).
   */
  const milkOptLines = await tx.productModifierStockLine.findMany({
    where: { optionId: milkPicked.id },
    include: { product: { select: { id: true, sku: true, name: true } } },
  });
  /** Si en el panel quedó mapeado «TIPO DE LECHE», no sirve: hay que sustituir por leche real. */
  const mappedMilk = milkOptLines.filter(
    (l) => l.productId && !isTipoLechePlaceholderProduct(l.product as ProductMini),
  );
  const sumMilkExplicit = mappedMilk.reduce(
    (s, l) => s + (l.quantity > EPS ? l.quantity : 0),
    0,
  );

  type MilkApply = { productId: string; perUnit: number }[];
  let applyMilk: MilkApply = [];

  if (mappedMilk.length > 0) {
    if (sumMilkExplicit > EPS) {
      const rows = mappedMilk
        .filter((l) => l.quantity > EPS)
        .map((l) => ({ productId: l.productId, perUnit: l.quantity }));
      applyMilk =
        rows.length > 0
          ? rows
          : [{ productId: mappedMilk[0]!.productId, perUnit: totalMilk }];
    } else {
      const pid = mappedMilk[0]!.productId;
      applyMilk = [{ productId: pid, perUnit: totalMilk }];
    }
  } else {
    let targetId: string | null = null;
    if (
      (/entera/.test(label) && !/descrem/.test(label)) ||
      /leche de vaca/.test(label)
    ) {
      targetId = await resolveClasicoLecheEnteraId(tx);
    } else if (/descrem/.test(label)) {
      targetId = await resolveClasicoLecheDescremadaId(tx);
    } else if (/almendra/.test(label)) {
      targetId = await resolveClasicoLecheAlmendrasId(tx);
    }
    if (!targetId) return;
    applyMilk = [{ productId: targetId, perUnit: totalMilk }];
  }

  if (applyMilk.length === 0) return;

  /** Deshacer lo que ya sumó el loop principal por líneas de la opción «tipo de leche» */
  for (const sl of milkOptLines) {
    const contrib = sl.quantity * q;
    consumption.set(
      sl.productId,
      (consumption.get(sl.productId) ?? 0) - contrib,
    );
  }

  /** Quitar leche de la preparación (TIPO_LECHE, espuma, etc.) */
  for (const line of milkLines) {
    const pid = line.productId;
    const contrib = line.quantity * q;
    consumption.set(pid, (consumption.get(pid) ?? 0) - contrib);
  }

  for (const row of applyMilk) {
    consumption.set(
      row.productId,
      (consumption.get(row.productId) ?? 0) + row.perUnit * q,
    );
  }
}

/**
 * Reemplaza consumo base de preparación por el tipo elegido:
 * - Leche: cambia entre entera / descremada / almendras.
 * - Café: cambia CAFE_GRANO por el origen elegido (grupo «Café de especialidad», «Tipo de café» o «GRANO»).
 */
export async function applyClasicoTypeSubstitutions(
  tx: Prisma.TransactionClient,
  productSku: string | null | undefined,
  sellableProductId: string,
  norm: Record<string, string[]> | null,
  itemQuantity: number,
  consumption: Map<string, number>,
): Promise<void> {
  const okClasico = await isClasicoFormatProduct(tx, sellableProductId, productSku);
  const okMilkSwap =
    okClasico ||
    (await recipeHasMilkTypeModifierGroup(tx, sellableProductId)) ||
    (await productHasMilkTypeModifierGroup(tx, sellableProductId));
  await applyClasicoMilkTypeSubstitution(
    tx,
    productSku,
    sellableProductId,
    norm,
    itemQuantity,
    consumption,
    okMilkSwap,
  );

  const okCoffeeSwap =
    okClasico ||
    (await recipeHasCoffeeBeanModifierGroup(tx, sellableProductId)) ||
    (await productHasCoffeeBeanModifierGroup(tx, sellableProductId));
  if (!okCoffeeSwap || !norm) return;

  const optionIds = [...new Set(Object.values(norm).flat())];
  if (optionIds.length === 0) return;

  const options = await tx.productModifierOption.findMany({
    where: { id: { in: optionIds } },
    select: {
      id: true,
      label: true,
      group: { select: { id: true, name: true } },
    },
  });
  const coffeePicked = options.find((o) =>
    modifierGroupNameIsCoffeeBeanChoice(o.group?.name ?? null),
  );
  if (!coffeePicked) return;

  const groupIds = Object.keys(norm);
  const groups = await tx.productModifierGroup.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true, sortOrder: true, visibilityRule: true },
  });
  const prepG = pickPreparationModifierGroup(groups);
  if (!prepG) return;
  const prepOptionId = norm[prepG.id]?.[0];
  if (!prepOptionId) return;

  const prepLines = await tx.productModifierStockLine.findMany({
    where: { optionId: prepOptionId },
    include: { product: { select: { id: true, sku: true, name: true } } },
  });
  const coffeeLines = prepLines.filter((l) =>
    isCoffeeComponentProduct(l.product as ProductMini),
  );
  const totalCoffee = coffeeLines.reduce((s, l) => s + l.quantity, 0);
  if (totalCoffee < EPS) return;

  const q = itemQuantity;

  /** Insumo(s) definidos en el panel en cada opción (ej. GRANO 1 KG PASSION). */
  const coffeeOptLines = await tx.productModifierStockLine.findMany({
    where: { optionId: coffeePicked.id },
    select: { productId: true, quantity: true },
  });
  const mappedCoffee = coffeeOptLines.filter((l) => l.productId);
  const sumCoffeeExplicit = mappedCoffee.reduce(
    (s, l) => s + (l.quantity > EPS ? l.quantity : 0),
    0,
  );

  type CoffeeApply = { productId: string; perUnit: number }[];
  let applyCoffee: CoffeeApply | null = null;

  if (mappedCoffee.length > 0) {
    if (sumCoffeeExplicit > EPS) {
      const rows = mappedCoffee
        .filter((l) => l.quantity > EPS)
        .map((l) => ({ productId: l.productId, perUnit: l.quantity }));
      applyCoffee =
        rows.length > 0
          ? rows
          : [{ productId: mappedCoffee[0]!.productId, perUnit: totalCoffee }];
    } else {
      const pid = mappedCoffee[0]!.productId;
      applyCoffee = [{ productId: pid, perUnit: totalCoffee }];
    }
  } else {
    const pickedLabel = String(coffeePicked.label || '');
    const targetDef = COFFEE_TYPE_TARGETS.find((x) => x.labelRx.test(pickedLabel));
    if (!targetDef) return;
    const target = await resolveBySkuOrName(tx, targetDef.skus, targetDef.nameHints);
    if (!target) return;
    applyCoffee = [{ productId: target.id, perUnit: totalCoffee }];
  }

  /** Deshacer líneas ya sumadas del loop principal para la opción de café elegida */
  for (const sl of coffeeOptLines) {
    const contrib = sl.quantity * q;
    consumption.set(
      sl.productId,
      (consumption.get(sl.productId) ?? 0) - contrib,
    );
  }

  for (const line of coffeeLines) {
    const contrib = line.quantity * q;
    consumption.set(
      line.productId,
      (consumption.get(line.productId) ?? 0) - contrib,
    );
  }

  for (const row of applyCoffee) {
    consumption.set(
      row.productId,
      (consumption.get(row.productId) ?? 0) + row.perUnit * q,
    );
  }
}
