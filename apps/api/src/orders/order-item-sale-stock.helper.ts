import { Prisma } from '../../generated/prisma';
import { normalizeModifierSelections } from './order-modifiers.helper';

const EPS = 1e-6;

/**
 * Aplica descuentos de stock al cerrar un ítem de pedido:
 * - Siempre descuenta el **producto de carta vendido** (terminado). Los insumos de la receta
 *   se descuentan en **producción** al elaborar ese producto, no otra vez en la venta.
 * - Suma líneas de modificadores (`product_modifier_stock_line`) por opción elegida en el POS
 *   (cantidad puede ser negativa = menos consumo de un insumo extra).
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
    };
  },
): Promise<void> {
  const { locationId, orderId, userId, item } = params;
  const consumption = new Map<string, number>();

  consumption.set(
    item.productId,
    (consumption.get(item.productId) ?? 0) + item.quantity,
  );

  let norm: Record<string, string[]> | null = null;
  try {
    norm =
      item.modifierSelections != null
        ? normalizeModifierSelections(item.modifierSelections)
        : null;
  } catch {
    norm = null;
  }
  if (norm && Object.keys(norm).length > 0) {
    const optionIds = [...new Set(Object.values(norm).flat())];
    if (optionIds.length > 0) {
      const lines = await tx.productModifierStockLine.findMany({
        where: { optionId: { in: optionIds } },
        select: { productId: true, quantity: true },
      });
      for (const line of lines) {
        const delta = line.quantity * item.quantity;
        if (Math.abs(delta) < EPS) continue;
        consumption.set(
          line.productId,
          (consumption.get(line.productId) ?? 0) + delta,
        );
      }
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
