import { Prisma } from '../../generated/prisma';
import { normalizeModifierSelections } from './order-modifiers.helper';
import { findActiveRecipeId } from '../recipes/recipes-pos.helper';

/** Insumo pack take (seed `CARTA-INS-PACK-TAKE`) — si la venta lo consume, cuenta para la regla de posavasos. */
export const PACK_TAKE_SKU = 'CARTA-INS-PACK-TAKE';
/** Insumo posavasos (seed `CARTA-INS-POSAVASOS`). */
export const POSAVASOS_SKU = 'CARTA-INS-POSAVASOS';

const EPS = 1e-6;

const PROD_SKU_RE = /^PROD-\d+$/i;

/**
 * Productos POS (familia BARISTA-TAKE) que siempre cuentan para «2 take → 1 posavaso».
 * SKUs reales en catálogo `PROD-XXXX` (Take away + Cafés especiales chico/grande).
 */
export const BARISTA_TAKE_PRODUCT_SKUS = [
  'PROD-2365', // TAKE AWAY CHICO
  'PROD-2366', // TAKE AWAY GRANDE
  'PROD-2367', // TAKE CAFES ESPECIALES CHICO
  'PROD-2368', // TAKE CAFES ESPECIALES GRANDE
] as const;

const BARISTA_TAKE_SKU_SET = new Set(
  BARISTA_TAKE_PRODUCT_SKUS.map((s) => s.toUpperCase()),
);

export function isBaristaTakeFormatSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  return BARISTA_TAKE_SKU_SET.has(sku.trim().toUpperCase());
}

/**
 * Línea de receta o modificador cuyo producto es el **insumo pack take** (SKU canónico, env o nombre).
 * En bases con `PROD-XXX`, el pack suele ser otro `PROD-YYY` con nombre tipo «Pack take…».
 */
export function matchesPackTakeProduct(p: { sku: string; name: string }): boolean {
  if (p.sku === PACK_TAKE_SKU) return true;
  const envSku = process.env.PACK_TAKE_PRODUCT_SKU?.trim();
  if (envSku && p.sku === envSku) return true;
  const n = p.name.toUpperCase().replace(/\s+/g, ' ').trim();
  return n.includes('PACK TAKE');
}

/**
 * Insumo posavasos: `CARTA-INS-POSAVASOS`, `POSAVASOS_PRODUCT_SKU` o nombre que contenga «posavaso».
 */
export async function resolvePosavasosProductId(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const envSku = process.env.POSAVASOS_PRODUCT_SKU?.trim();
  if (envSku) {
    const byEnv = await tx.product.findUnique({
      where: { sku: envSku },
      select: { id: true },
    });
    if (byEnv) return byEnv.id;
  }
  const byCanon = await tx.product.findUnique({
    where: { sku: POSAVASOS_SKU },
    select: { id: true },
  });
  if (byCanon) return byCanon.id;
  const byName = await tx.product.findFirst({
    where: {
      isIngredient: true,
      name: { contains: 'posavaso', mode: 'insensitive' },
    },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  return byName?.id ?? null;
}

/**
 * Productos carta «take» (SKU) — si no hay `modifierSelections` y no se detectó PACK_TAKE
 * en receta fija, igual cuenta 1 take por unidad vendida (misma regla operativa: 2 take → 1 posavaso).
 */
export function isCartaTakeProductSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  const u = sku.toUpperCase();
  return u.startsWith('CARTA-') && u.includes('TAKE');
}

/**
 * Producto vendido formato take con SKU `PROD-XXX` (sync remoto): el nombre suele incluir «TAKE» (ej. CAFE ESPECIAL TAKE 8OZ).
 */
export function isTakeFormatProduct(p: { sku: string; name: string }): boolean {
  if (isBaristaTakeFormatSku(p.sku)) return true;
  if (isCartaTakeProductSku(p.sku)) return true;
  if (!PROD_SKU_RE.test(p.sku)) return false;
  return p.name.toUpperCase().includes('TAKE');
}

function asStringArray(json: Prisma.JsonValue | null | undefined): string[] {
  if (json == null) return [];
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Cantidad de unidades "take" (líneas que consumen pack take) para un ítem.
 * - Formatos POS: `product_modifier_stock_line` de la opción elegida hacia PACK_TAKE.
 * - Receta fija: `recipe_ingredient` sin grupo hacia PACK_TAKE (respeta exclusiones POS).
 */
export async function countTakeUnitsForOrderItem(
  tx: Prisma.TransactionClient,
  item: {
    productId: string;
    quantity: number;
    modifierSelections: unknown;
    excludedRecipeIngredientIds?: Prisma.JsonValue | null;
    excludedModifierStockLineIds?: Prisma.JsonValue | null;
  },
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: item.productId },
    select: { consumeRecipeOnSale: true, sku: true, name: true },
  });
  if (!product) return 0;
  const baristaTake = isBaristaTakeFormatSku(product.sku);
  if (!baristaTake && product.consumeRecipeOnSale !== true) return 0;

  let norm: Record<string, string[]> | null = null;
  try {
    norm =
      item.modifierSelections != null
        ? normalizeModifierSelections(item.modifierSelections)
        : null;
  } catch {
    norm = null;
  }
  const optionIds = norm ? [...new Set(Object.values(norm).flat())] : [];
  const excludedModLines = new Set(asStringArray(item.excludedModifierStockLineIds));

  if (optionIds.length > 0) {
    const lines = await tx.productModifierStockLine.findMany({
      where: { optionId: { in: optionIds } },
      include: { product: { select: { sku: true, name: true } } },
    });
    let packQty = 0;
    for (const line of lines) {
      if (excludedModLines.has(line.id)) continue;
      if (matchesPackTakeProduct(line.product)) {
        packQty += line.quantity;
      }
    }
    if (packQty > EPS) {
      return item.quantity * packQty;
    }
  }

  const recipeId = await findActiveRecipeId(tx, item.productId);
  if (!recipeId) {
    if (baristaTake) return item.quantity;
    return 0;
  }

  const excluded = new Set(asStringArray(item.excludedRecipeIngredientIds));
  const ings = await tx.recipeIngredient.findMany({
    where: { recipeId },
    select: {
      id: true,
      modifierGroupId: true,
      qtyPerYield: true,
      product: { select: { sku: true, name: true } },
    },
  });

  let packFromRecipe = 0;
  for (const ing of ings) {
    if (ing.modifierGroupId) continue;
    if (excluded.has(ing.id)) continue;
    if (matchesPackTakeProduct(ing.product)) {
      packFromRecipe += ing.qtyPerYield;
    }
  }
  if (packFromRecipe > EPS) {
    return item.quantity * packFromRecipe;
  }

  /** Sin líneas de modificación en el payload: último recurso por producto take (CARTA-* o PROD-XXX + nombre). */
  if (optionIds.length === 0 && isTakeFormatProduct(product)) {
    return item.quantity;
  }

  /** BARISTA-TAKE: aunque no se detecte pack en líneas/receta (nombres PROD distintos), 1 take por unidad. */
  if (baristaTake) {
    return item.quantity;
  }

  return 0;
}

/**
 * Al cerrar el pedido: por cada 2 unidades take del mismo ticket, descuenta 1 posavaso.
 * No hace nada si el producto `CARTA-INS-POSAVASOS` no existe en la BD.
 */
export async function applyTakeCoasterStock(
  tx: Prisma.TransactionClient,
  params: {
    locationId: string;
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      quantity: number;
      modifierSelections: unknown;
      excludedRecipeIngredientIds?: Prisma.JsonValue | null;
      excludedModifierStockLineIds?: Prisma.JsonValue | null;
    }>;
  },
): Promise<void> {
  const { locationId, orderId, userId, items } = params;

  let takeUnits = 0;
  for (const item of items) {
    takeUnits += await countTakeUnitsForOrderItem(tx, item);
  }

  const coasters = Math.floor(takeUnits / 2);
  if (coasters < 1) return;

  const posavasosId = await resolvePosavasosProductId(tx);
  if (!posavasosId) {
    const hint =
      process.env.POSAVASOS_PRODUCT_SKU?.trim() ||
      POSAVASOS_SKU ||
      'nombre que contenga «posavaso»';
    console.warn(
      `[posavasos] Omitido: no se encontró insumo posavasos (${hint}). Definí POSAVASOS_PRODUCT_SKU=PROD-XXX en .env o creá el producto.`,
    );
    return;
  }

  await tx.stockLevel.upsert({
    where: {
      productId_locationId: { productId: posavasosId, locationId },
    },
    create: {
      productId: posavasosId,
      locationId,
      quantity: -coasters,
      minQuantity: 0,
    },
    update: {
      quantity: { decrement: coasters },
    },
  });

  await tx.stockMovement.create({
    data: {
      productId: posavasosId,
      locationId,
      type: 'sale',
      quantity: -coasters,
      unitCost: 0,
      referenceType: 'order',
      referenceId: orderId,
      userId,
      notes: `Posavasos: ${takeUnits} u. take → ${coasters} posavasos (1 cada 2 take)`,
    },
  });
}
