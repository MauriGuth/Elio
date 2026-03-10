/**
 * Elimina todos los productos, proveedores, recetas y categorías de la base de datos,
 * junto con todos los registros que dependen de ellos (stock, movimientos,
 * ítems de órdenes, ingresos, etc.). Útil antes de una carga masiva nueva.
 *
 * NO borra: usuarios, ubicaciones, mesas, órdenes (quedan sin ítems),
 * cajas, clientes, alertas, etc.
 *
 * Ejecutar desde apps/api: npm run prisma:clear-products
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

async function main() {
  console.log('🗑️  Eliminando productos, proveedores, recetas y categorías (y datos relacionados)...\n');

  // Orden: primero tablas que referencian a Product, Recipe o Supplier

  const steps: { name: string; fn: () => Promise<unknown> }[] = [
    { name: 'RecipeIngredient', fn: () => prisma.recipeIngredient.deleteMany() },
    { name: 'ProductionOrderItem', fn: () => prisma.productionOrderItem.deleteMany() },
    { name: 'ProductionBatch', fn: () => prisma.productionBatch.deleteMany() },
    { name: 'ProductionOrder', fn: () => prisma.productionOrder.deleteMany() },
    { name: 'StockReconciliationItem', fn: () => prisma.stockReconciliationItem.deleteMany() },
    { name: 'StockLevel', fn: () => prisma.stockLevel.deleteMany() },
    { name: 'StockMovement', fn: () => prisma.stockMovement.deleteMany() },
    { name: 'GoodsReceiptItem', fn: () => prisma.goodsReceiptItem.deleteMany() },
    { name: 'OrderItem', fn: () => prisma.orderItem.deleteMany() },
    { name: 'ShipmentItem', fn: () => prisma.shipmentItem.deleteMany() },
    { name: 'WasteRecord', fn: () => prisma.wasteRecord.deleteMany() },
    { name: 'PurchaseOrderItem', fn: () => prisma.purchaseOrderItem.deleteMany() },
    { name: 'SupplierPriceHistory', fn: () => prisma.supplierPriceHistory.deleteMany() },
    { name: 'ProductSupplier', fn: () => prisma.productSupplier.deleteMany() },
    { name: 'Recipe', fn: () => prisma.recipe.deleteMany() },
    { name: 'GoodsReceipt', fn: () => prisma.goodsReceipt.deleteMany() },
    { name: 'PaymentOrder', fn: () => prisma.paymentOrder.deleteMany() },
    { name: 'PurchaseOrder', fn: () => prisma.purchaseOrder.deleteMany() },
    { name: 'SupplierPriceList', fn: () => prisma.supplierPriceList.deleteMany() },
    { name: 'Product', fn: () => prisma.product.deleteMany() },
    { name: 'Supplier', fn: () => prisma.supplier.deleteMany() },
    // Categorías: primero quitamos la relación padre-hijo, luego borramos todas
    { name: 'Category (parentId→null)', fn: () => prisma.category.updateMany({ data: { parentId: null } }) },
    { name: 'Category', fn: () => prisma.category.deleteMany() },
  ];

  for (const { name, fn } of steps) {
    const result = await fn() as { count?: number };
    const count = typeof result?.count === 'number' ? result.count : '?';
    console.log(`   ${name}: ${count} registros eliminados`);
  }

  console.log('\n✅ Productos, proveedores, recetas y categorías eliminados. Podés cargar los nuevos datos.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
