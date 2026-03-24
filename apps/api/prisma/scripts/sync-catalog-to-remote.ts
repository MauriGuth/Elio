/**
 * Copia el catálogo desde la base LOCAL a la base REMOTA (productos, categorías, recetas,
 * grupos/opciones/líneas de modificadores, proveedores, stock por ubicación, etc.).
 *
 * ⚠️  IGUAL que borrar catálogo en remoto: elimina ítems de pedido, movimientos de stock,
 *     órdenes de producción ligadas al catálogo, etc. en la base REMOTA.
 *     No usar en producción con ventas que quieras conservar, salvo backup previo.
 *
 * Requisitos:
 * - DATABASE_URL → origen (típicamente tu base local con productos/recetas nuevos)
 * - DATABASE_URL_REMOTE → destino (API / Postgres remoto)
 * - SYNC_CATALOG_TO_REMOTE_CONFIRM=YES (obligatorio)
 * - Debe existir al menos un usuario en REMOTO (para Recipe.createdById)
 *
 * Los productos/recetas NO van en Git; para “subirlos” al servidor hay que escribir en su BD
 * (este script, pg_dump/restore, o panel).
 *
 * cd apps/api && SYNC_CATALOG_TO_REMOTE_CONFIRM=YES npm run prisma:sync-catalog-to-remote
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma';
import { clearProductCatalog } from './delete-products-suppliers-recipes';

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.DATABASE_URL_REMOTE;

if (process.env.SYNC_CATALOG_TO_REMOTE_CONFIRM !== 'YES') {
  console.error(
    '❌ Definí SYNC_CATALOG_TO_REMOTE_CONFIRM=YES para confirmar que entendés que se BORRARÁ el catálogo en REMOTO (y datos ligados).',
  );
  process.exit(1);
}

if (!sourceUrl) {
  console.error('❌ Falta DATABASE_URL (origen: base local).');
  process.exit(1);
}
if (!targetUrl) {
  console.error('❌ Falta DATABASE_URL_REMOTE (destino: base remota).');
  process.exit(1);
}

const sourcePrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: sourceUrl }),
});
const targetPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: targetUrl }),
});

function topoByParent<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: T[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Ciclo en jerarquía parentId (id=${id})`);
    }
    const r = byId.get(id);
    if (!r) return;
    visiting.add(id);
    if (r.parentId) visit(r.parentId);
    visiting.delete(id);
    done.add(id);
    result.push(r);
  }
  for (const r of rows) visit(r.id);
  return result;
}

const CHUNK = 250;

async function createManyInChunks<T>(
  label: string,
  items: T[],
  run: (chunk: T[]) => Promise<{ count: number }>,
) {
  let total = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    if (!chunk.length) continue;
    const r = await run(chunk);
    total += r.count;
  }
  console.log(`   ${label}: ${total} registros`);
}

async function main() {
  console.log('');
  console.log('⚠️  DESTINO (REMOTO): se va a ejecutar clearProductCatalog → borra catálogo e ítems de órdenes asociados.');
  console.log('    Origen (local):', sourceUrl.replace(/:[^:@]+@/, ':****@'));
  console.log('    Destino (remoto):', targetUrl.replace(/:[^:@]+@/, ':****@'));
  console.log('');

  const fallbackRemoteUser = await targetPrisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!fallbackRemoteUser) {
    throw new Error(
      'No hay ningún usuario en la base REMOTA. Creá un usuario antes de sincronizar.',
    );
  }
  const fallbackRemoteUserId = fallbackRemoteUser.id;

  const targetLocationIds = new Set(
    (await targetPrisma.location.findMany({ select: { id: true } })).map((l) => l.id),
  );

  const userIdMap = new Map<string, string>();

  async function mapCreatedByToRemote(localUserId: string): Promise<string> {
    const cached = userIdMap.get(localUserId);
    if (cached) return cached;
    const localUser = await sourcePrisma.user.findUnique({ where: { id: localUserId } });
    let remoteId = fallbackRemoteUserId;
    if (localUser?.email) {
      const match = await targetPrisma.user.findFirst({
        where: { email: localUser.email },
      });
      if (match) remoteId = match.id;
    }
    userIdMap.set(localUserId, remoteId);
    return remoteId;
  }

  console.log('🗑️  Limpiando catálogo en REMOTO...');
  await clearProductCatalog(targetPrisma);
  console.log('');

  console.log('📤 Leyendo LOCAL e insertando en REMOTO...\n');

  const categories = await sourcePrisma.category.findMany();
  const categoriesOrdered = topoByParent(categories);
  for (const c of categoriesOrdered) {
    await targetPrisma.category.create({
      data: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        color: c.color,
        parentId: c.parentId,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      },
    });
  }
  console.log(`   Category: ${categoriesOrdered.length} registros`);

  const suppliers = await sourcePrisma.supplier.findMany();
  await createManyInChunks('Supplier', suppliers, (chunk) =>
    targetPrisma.supplier.createMany({ data: chunk }),
  );

  const priceLists = await sourcePrisma.supplierPriceList.findMany();
  await createManyInChunks('SupplierPriceList', priceLists, (chunk) =>
    targetPrisma.supplierPriceList.createMany({
      data: chunk.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        supplierId: row.supplierId,
        filePath: row.filePath,
        fileName: row.fileName,
        mimeType: row.mimeType,
        extractedData: row.extractedData as Prisma.InputJsonValue,
        extractedText: row.extractedText,
        extractedTable:
          row.extractedTable === null || row.extractedTable === undefined
            ? undefined
            : (row.extractedTable as Prisma.InputJsonValue),
      })),
    }),
  );

  const products = await sourcePrisma.product.findMany();
  await createManyInChunks(
    'Product',
    products,
    (chunk) =>
      targetPrisma.product.createMany({
        data: chunk.map((p) => ({
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          description: p.description,
          categoryId: p.categoryId,
          familia: p.familia,
          unit: p.unit,
          imageUrl: p.imageUrl,
          avgCost: p.avgCost,
          lastCost: p.lastCost,
          salePrice: p.salePrice,
          isSellable: p.isSellable,
          isIngredient: p.isIngredient,
          isProduced: p.isProduced,
          isPerishable: p.isPerishable,
          consumeRecipeOnSale: p.consumeRecipeOnSale,
          isActive: p.isActive,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      }),
  );

  const modGroups = await sourcePrisma.productModifierGroup.findMany();
  await createManyInChunks('ProductModifierGroup', modGroups, (chunk) =>
    targetPrisma.productModifierGroup.createMany({
      data: chunk.map((g) => ({
        id: g.id,
        productId: g.productId,
        name: g.name,
        sortOrder: g.sortOrder,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        visibilityRule:
          g.visibilityRule === null || g.visibilityRule === undefined
            ? undefined
            : (g.visibilityRule as Prisma.InputJsonValue),
      })),
    }),
  );

  const modOptions = await sourcePrisma.productModifierOption.findMany();
  await createManyInChunks('ProductModifierOption', modOptions, (chunk) =>
    targetPrisma.productModifierOption.createMany({ data: chunk }),
  );

  const modStock = await sourcePrisma.productModifierStockLine.findMany();
  await createManyInChunks('ProductModifierStockLine', modStock, (chunk) =>
    targetPrisma.productModifierStockLine.createMany({ data: chunk }),
  );

  const stockLevelsAll = await sourcePrisma.stockLevel.findMany();
  const stockLevels = stockLevelsAll.filter((s) => targetLocationIds.has(s.locationId));
  await createManyInChunks('StockLevel', stockLevels, (chunk) =>
    targetPrisma.stockLevel.createMany({ data: chunk }),
  );
  if (stockLevelsAll.length > stockLevels.length) {
    console.log(
      `   (omitidos ${stockLevelsAll.length - stockLevels.length} stock_levels: ubicación inexistente en remoto)`,
    );
  }

  const productSuppliers = await sourcePrisma.productSupplier.findMany();
  await createManyInChunks('ProductSupplier', productSuppliers, (chunk) =>
    targetPrisma.productSupplier.createMany({ data: chunk }),
  );

  const priceHist = await sourcePrisma.supplierPriceHistory.findMany();
  const priceHistData = priceHist.map((h) => ({
    ...h,
    sourceReceiptId: null as string | null,
  }));
  await createManyInChunks('SupplierPriceHistory', priceHistData, (chunk) =>
    targetPrisma.supplierPriceHistory.createMany({ data: chunk }),
  );

  const recipes = await sourcePrisma.recipe.findMany();
  const recipesOrdered = topoByParent(recipes);
  for (const r of recipesOrdered) {
    const createdById = await mapCreatedByToRemote(r.createdById);
    await targetPrisma.recipe.create({
      data: {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        version: r.version,
        yieldQty: r.yieldQty,
        yieldUnit: r.yieldUnit,
        productId: r.productId,
        prepTimeMin: r.prepTimeMin,
        instructions: r.instructions,
        imageUrl: r.imageUrl,
        isActive: r.isActive,
        parentId: r.parentId,
        createdById,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      },
    });
  }
  console.log(`   Recipe: ${recipesOrdered.length} registros`);

  const ingredients = await sourcePrisma.recipeIngredient.findMany();
  await createManyInChunks('RecipeIngredient', ingredients, (chunk) =>
    targetPrisma.recipeIngredient.createMany({ data: chunk }),
  );

  const rlAll = await sourcePrisma.recipeLocation.findMany();
  const rl = rlAll.filter((x) => targetLocationIds.has(x.locationId));
  await createManyInChunks('RecipeLocation', rl, (chunk) =>
    targetPrisma.recipeLocation.createMany({ data: chunk }),
  );
  if (rlAll.length > rl.length) {
    console.log(
      `   (omitidos ${rlAll.length - rl.length} recipe_locations: ubicación inexistente en remoto)`,
    );
  }

  console.log('\n✅ Catálogo copiado de local → remoto.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await sourcePrisma.$disconnect();
    await targetPrisma.$disconnect();
  });
