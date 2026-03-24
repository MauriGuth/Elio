/**
 * Borra productos cuyo SKU contiene una subcadena (por defecto "CART", coincide con CARTA-*, etc.)
 * y limpia dependencias (ítems de pedido, stock, recetas, modificadores del producto, etc.).
 *
 * Uso desde apps/api:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/scripts/delete-products-by-sku-substring.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/scripts/delete-products-by-sku-substring.ts
 *
 * Variables de entorno:
 *   SKU_SUBSTRING=CART   (opcional; por defecto CART)
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run') || argv.includes('-n');
  let substring = process.env.SKU_SUBSTRING ?? 'CART';
  const subArg = argv.find((a) => a.startsWith('--substring='));
  if (subArg) substring = subArg.split('=')[1] ?? substring;
  return { dryRun, substring };
}

async function deleteProductionOrdersForRecipe(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recipeId: string,
) {
  const pos = await tx.productionOrder.findMany({
    where: { recipeId },
    select: { id: true },
  });
  for (const p of pos) {
    await tx.productionBatch.deleteMany({ where: { productionOrderId: p.id } });
    await tx.productionOrderItem.deleteMany({ where: { productionOrderId: p.id } });
  }
  await tx.productionOrder.deleteMany({ where: { recipeId } });
}

/** Post-order: hijos primero, luego padre (para FK recipe parent/child). */
async function collectRecipesPostOrderDelete(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productIds: string[],
): Promise<string[]> {
  const roots = await tx.recipe.findMany({
    where: { productId: { in: productIds } },
    select: { id: true },
  });
  const visited = new Set<string>();
  const order: string[] = [];

  async function walk(rid: string) {
    if (visited.has(rid)) return;
    visited.add(rid);
    const children = await tx.recipe.findMany({
      where: { parentId: rid },
      select: { id: true },
    });
    for (const c of children) await walk(c.id);
    order.push(rid);
  }

  for (const r of roots) await walk(r.id);
  return order;
}

async function deleteProductsBySkuSubstring(substring: string, dryRun: boolean) {
  const products = await prisma.product.findMany({
    where: {
      sku: { contains: substring, mode: 'insensitive' },
    },
    select: { id: true, sku: true, name: true },
    orderBy: { sku: 'asc' },
  });

  if (products.length === 0) {
    console.log(`No hay productos con SKU que contenga "${substring}" (sin distinguir mayúsculas).`);
    return;
  }

  console.log(`Encontrados ${products.length} producto(s) con SKU que contiene "${substring}":`);
  for (const p of products) console.log(`  - ${p.sku}  (${p.name})`);

  if (dryRun) {
    console.log('\n[--dry-run] No se borró nada. Quitá --dry-run para ejecutar el borrado.\n');
    return;
  }

  const ids = products.map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await tx.stockLevel.deleteMany({ where: { productId: { in: ids } } });
    await tx.productSupplier.deleteMany({ where: { productId: { in: ids } } });
    await tx.goodsReceiptItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.shipmentItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.wasteRecord.deleteMany({ where: { productId: { in: ids } } });
    await tx.stockReconciliationItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.purchaseOrderItem.deleteMany({ where: { productId: { in: ids } } });
    await tx.productionBatch.deleteMany({ where: { productId: { in: ids } } });
    await tx.productionOrderItem.deleteMany({ where: { productId: { in: ids } } });

    await tx.recipeIngredient.deleteMany({ where: { productId: { in: ids } } });
    await tx.supplierPriceHistory.deleteMany({ where: { productId: { in: ids } } });
    await tx.productModifierStockLine.deleteMany({ where: { productId: { in: ids } } });

    const recipeDeleteOrder = await collectRecipesPostOrderDelete(tx, ids);
    for (const rid of recipeDeleteOrder) {
      await deleteProductionOrdersForRecipe(tx, rid);
      await tx.recipe.delete({ where: { id: rid } });
    }

    await tx.product.deleteMany({ where: { id: { in: ids } } });
  });

  console.log(`\n✅ Eliminados ${products.length} producto(s) y dependencias asociadas.\n`);
}

async function main() {
  const { dryRun, substring } = parseArgs();
  console.log(
    dryRun
      ? `🔍 Simulación: productos con SKU que contiene "${substring}"\n`
      : `🗑️  Borrando productos con SKU que contiene "${substring}"...\n`,
  );
  await deleteProductsBySkuSubstring(substring, dryRun);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('❌ Error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
