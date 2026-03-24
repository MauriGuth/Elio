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

/** Limpia catálogo local (productos, proveedores, recetas, categorías y dependencias). Exportado para reutilizar en sync desde remoto. */
export async function clearProductCatalog(client: typeof prisma) {
  // Orden: primero tablas que referencian a Product, Recipe o Supplier

  const steps: { name: string; fn: () => Promise<unknown> }[] = [
    { name: 'RecipeIngredient', fn: () => client.recipeIngredient.deleteMany() },
    { name: 'ProductionOrderItem', fn: () => client.productionOrderItem.deleteMany() },
    { name: 'ProductionBatch', fn: () => client.productionBatch.deleteMany() },
    { name: 'ProductionOrder', fn: () => client.productionOrder.deleteMany() },
    { name: 'StockReconciliationItem', fn: () => client.stockReconciliationItem.deleteMany() },
    { name: 'StockLevel', fn: () => client.stockLevel.deleteMany() },
    { name: 'StockMovement', fn: () => client.stockMovement.deleteMany() },
    { name: 'GoodsReceiptItem', fn: () => client.goodsReceiptItem.deleteMany() },
    { name: 'OrderItem', fn: () => client.orderItem.deleteMany() },
    { name: 'ShipmentItem', fn: () => client.shipmentItem.deleteMany() },
    { name: 'WasteRecord', fn: () => client.wasteRecord.deleteMany() },
    { name: 'PurchaseOrderItem', fn: () => client.purchaseOrderItem.deleteMany() },
    { name: 'SupplierPriceHistory', fn: () => client.supplierPriceHistory.deleteMany() },
    { name: 'ProductSupplier', fn: () => client.productSupplier.deleteMany() },
    { name: 'RecipeLocation', fn: () => client.recipeLocation.deleteMany() },
    { name: 'Recipe', fn: () => client.recipe.deleteMany() },
    { name: 'GoodsReceipt', fn: () => client.goodsReceipt.deleteMany() },
    { name: 'PaymentOrder', fn: () => client.paymentOrder.deleteMany() },
    { name: 'PurchaseOrder', fn: () => client.purchaseOrder.deleteMany() },
    { name: 'SupplierPriceList', fn: () => client.supplierPriceList.deleteMany() },
    {
      name: 'ProductModifierStockLine',
      fn: () => client.productModifierStockLine.deleteMany(),
    },
    { name: 'ProductModifierOption', fn: () => client.productModifierOption.deleteMany() },
    { name: 'ProductModifierGroup', fn: () => client.productModifierGroup.deleteMany() },
    { name: 'Product', fn: () => client.product.deleteMany() },
    { name: 'Supplier', fn: () => client.supplier.deleteMany() },
    // Categorías: primero quitamos la relación padre-hijo, luego borramos todas
    { name: 'Category (parentId→null)', fn: () => client.category.updateMany({ data: { parentId: null } }) },
    { name: 'Category', fn: () => client.category.deleteMany() },
  ];

  for (const { name, fn } of steps) {
    const result = (await fn()) as { count?: number };
    const count = typeof result?.count === 'number' ? result.count : '?';
    console.log(`   ${name}: ${count} registros eliminados`);
  }
}

async function main() {
  console.log('🗑️  Eliminando productos, proveedores, recetas y categorías (y datos relacionados)...\n');
  await clearProductCatalog(prisma);
  console.log('\n✅ Productos, proveedores, recetas y categorías eliminados. Podés cargar los nuevos datos.\n');
}

// Solo al ejecutar este archivo directamente (no al importarlo desde otros scripts).
if (require.main === module) {
  main()
    .catch((e) => {
      console.error('❌ Error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
