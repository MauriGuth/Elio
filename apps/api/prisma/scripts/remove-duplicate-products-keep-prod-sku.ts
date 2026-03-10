/**
 * Elimina productos duplicados: deja solo los que tienen SKU en formato PROD-001, PROD-002, etc.
 * Borra todos los productos cuyo SKU no coincide con /^PROD-\d+$/ y sus datos relacionados.
 *
 * Uso: desde apps/api
 *   npm run prisma:remove-duplicate-products
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const PROD_SKU_REGEX = /^PROD-\d+$/;

async function main() {
  const all = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
  });
  const toRemove = all.filter((p) => !PROD_SKU_REGEX.test(p.sku));

  if (toRemove.length === 0) {
    console.log('No hay productos con SKU distinto de PROD-XXX. Nada que eliminar.');
    return;
  }

  const ids = toRemove.map((p) => p.id);
  console.log(`Productos a eliminar (SKU no PROD-XXX): ${toRemove.length}`);
  console.log('Ejemplos:', toRemove.slice(0, 5).map((p) => `${p.sku} (${p.name})`).join(', '));

  const steps: { name: string; fn: () => Promise<unknown> }[] = [
    { name: 'RecipeIngredient', fn: () => prisma.recipeIngredient.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'ProductionOrderItem', fn: () => prisma.productionOrderItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'ProductionBatch', fn: () => prisma.productionBatch.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'StockReconciliationItem', fn: () => prisma.stockReconciliationItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'StockLevel', fn: () => prisma.stockLevel.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'StockMovement', fn: () => prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'GoodsReceiptItem', fn: () => prisma.goodsReceiptItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'OrderItem', fn: () => prisma.orderItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'ShipmentItem', fn: () => prisma.shipmentItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'WasteRecord', fn: () => prisma.wasteRecord.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'PurchaseOrderItem', fn: () => prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'SupplierPriceHistory', fn: () => prisma.supplierPriceHistory.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'ProductSupplier', fn: () => prisma.productSupplier.deleteMany({ where: { productId: { in: ids } } }) },
    { name: 'Recipe (productId→null)', fn: () => prisma.recipe.updateMany({ where: { productId: { in: ids } }, data: { productId: null } }) },
    { name: 'Product', fn: () => prisma.product.deleteMany({ where: { id: { in: ids } } }) },
  ];

  for (const { name, fn } of steps) {
    const result = (await fn()) as { count?: number };
    const count = typeof result?.count === 'number' ? result.count : '?';
    console.log(`   ${name}: ${count}`);
  }

  console.log(`\n✅ Eliminados ${toRemove.length} productos duplicados. Quedan solo los SKU PROD-XXX.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
