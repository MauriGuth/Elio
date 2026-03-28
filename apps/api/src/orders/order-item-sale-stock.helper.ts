import { Prisma } from '../../generated/prisma';
import { normalizeModifierSelections } from './order-modifiers.helper';
import { findActiveRecipeId } from '../recipes/recipes-pos.helper';
import { applyClasicoTypeSubstitutions } from './clasico-milk-stock.helper';
import { applySyrupFlavorSubstitution } from './modifier-syrup-stock.helper';

const EPS = 1e-6;

function asStringArray(json: Prisma.JsonValue | null | undefined): string[] {
  if (json == null) return [];
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Aplica descuentos de stock al cerrar un ítem de pedido:
 * - Por defecto: descuenta el **producto de carta vendido** (terminado) + líneas de modificadores.
 * - Si `consumeRecipeOnSale` en el producto: **no** descuenta el terminado; descuenta insumos de la
 *   receta activa (filas sin `modifierGroupId`) escalados por cantidad/rendimiento, más líneas de
 *   stock por opciones elegidas (`product_modifier_stock_line`).
 * - Ingredientes con `modifierGroupId` en la receta no suman cantidad base; el consumo va por opción.
 * - Si hay grupo «Sabor del syrup» con insumo real (vainilla, etc.) y también figura el insumo genérico
 *   «Sabor del syrup» en otra línea (p. ej. preparación), se elimina el consumo del genérico.
 */
export async function applyOrderItemSaleStock(
  tx: Prisma.TransactionClient,
  params: {
    locationId: string;
    orderId: string;
    userId: string;
    item: {
      productId: string;
      quantity: number;
      unitPrice: number;
      modifierSelections: unknown;
      excludedRecipeIngredientIds?: Prisma.JsonValue | null;
      excludedModifierStockLineIds?: Prisma.JsonValue | null;
    };
  },
): Promise<void> {
  const { locationId, orderId, userId, item } = params;
  const consumption = new Map<string, number>();

  const product = await tx.product.findUnique({
    where: { id: item.productId },
    select: { id: true, consumeRecipeOnSale: true, sku: true },
  });
  if (!product) return;

  const consumeRecipe = product.consumeRecipeOnSale === true;
  const excluded = new Set(asStringArray(item.excludedRecipeIngredientIds));
  const excludedModLines = new Set(asStringArray(item.excludedModifierStockLineIds));

  let norm: Record<string, string[]> | null = null;
  try {
    norm =
      item.modifierSelections != null
        ? normalizeModifierSelections(item.modifierSelections)
        : null;
  } catch {
    norm = null;
  }

  if (!consumeRecipe) {
    consumption.set(
      item.productId,
      (consumption.get(item.productId) ?? 0) + item.quantity,
    );
  } else {
    const recipeId = await findActiveRecipeId(tx, item.productId);
    if (recipeId) {
      const recipe = await tx.recipe.findUnique({
        where: { id: recipeId },
        select: { yieldQty: true },
      });
      const ingredients = await tx.recipeIngredient.findMany({
        where: { recipeId },
        select: {
          id: true,
          productId: true,
          qtyPerYield: true,
          modifierGroupId: true,
        },
      });

      const yieldQty =
        recipe && recipe.yieldQty > 0 ? recipe.yieldQty : 1;
      const scale = item.quantity / yieldQty;

      for (const ing of ingredients) {
        if (excluded.has(ing.id)) continue;
        if (ing.modifierGroupId) continue;
        const delta = ing.qtyPerYield * scale;
        if (Math.abs(delta) < EPS) continue;
        consumption.set(
          ing.productId,
          (consumption.get(ing.productId) ?? 0) + delta,
        );
      }
    }
  }

  if (norm && Object.keys(norm).length > 0) {
    const optionIds = [...new Set(Object.values(norm).flat())];
    if (optionIds.length > 0) {
      const lines = await tx.productModifierStockLine.findMany({
        where: { optionId: { in: optionIds } },
        select: { id: true, productId: true, quantity: true },
      });
      for (const line of lines) {
        if (excludedModLines.has(line.id)) continue;
        const delta = line.quantity * item.quantity;
        if (Math.abs(delta) < EPS) continue;
        consumption.set(
          line.productId,
          (consumption.get(line.productId) ?? 0) + delta,
        );
      }
    }
  }

  if (norm && Object.keys(norm).length > 0) {
    await applySyrupFlavorSubstitution(tx, norm, consumption);
  }

  if (norm && Object.keys(norm).length > 0) {
    await applyClasicoTypeSubstitutions(
      tx,
      product.sku,
      product.id,
      norm,
      item.quantity,
      consumption,
    );
  }

  /** Receta sin consumo positivo (sin receta activa, solo filas de modificador, etc.) → descontar terminado. */
  if (consumeRecipe) {
    let positive = 0;
    for (const [, v] of consumption) {
      if (v > EPS) {
        positive += v;
      }
    }
    if (positive < EPS) {
      consumption.set(
        item.productId,
        (consumption.get(item.productId) ?? 0) + item.quantity,
      );
    }
  }

  for (const [productId, net] of consumption.entries()) {
    if (Math.abs(net) < EPS) continue;

    /**
     * Upsert: sin fila en stock_levels, se crea y se descuenta (evita ventas que no movían stock).
     */
    if (net > 0) {
      await tx.stockLevel.upsert({
        where: {
          productId_locationId: { productId, locationId },
        },
        create: {
          productId,
          locationId,
          quantity: -net,
          minQuantity: 0,
        },
        update: {
          quantity: { decrement: net },
        },
      });
      await tx.stockMovement.create({
        data: {
          productId,
          locationId,
          type: 'sale',
          quantity: -net,
          unitCost: productId === item.productId ? item.unitPrice : 0,
          referenceType: 'order',
          referenceId: orderId,
          userId,
        },
      });
    } else {
      const back = -net;
      await tx.stockLevel.upsert({
        where: {
          productId_locationId: { productId, locationId },
        },
        create: {
          productId,
          locationId,
          quantity: back,
          minQuantity: 0,
        },
        update: {
          quantity: { increment: back },
        },
      });
      await tx.stockMovement.create({
        data: {
          productId,
          locationId,
          type: 'adjustment',
          quantity: back,
          unitCost: 0,
          referenceType: 'order',
          referenceId: orderId,
          userId,
          notes: 'Venta: menor consumo (modificador)',
        },
      });
    }
  }
}
