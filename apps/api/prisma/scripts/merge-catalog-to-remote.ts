/**
 * Inserta en la base REMOTA solo productos, recetas, modificadores y datos de catálogo
 * que existen en LOCAL pero aún no están en REMOTO (por id). No borra ni modifica filas remotas.
 *
 * Útil para subir lo cargado en unos días en local sin resetear producción.
 *
 * Reglas:
 * - Producto: se inserta si su `id` no está en remoto y su `sku` no está en uso en remoto.
 * - Categoría, proveedor, grupos/opciones/líneas de modificadores, recetas, ingredientes, etc.:
 *   mismo criterio por `id`.
 * - StockLevel / RecipeLocation: solo si el par (producto+local) o (receta+local) no existe en remoto
 *   y el producto/receta y la ubicación existen en remoto.
 * - SupplierPriceHistory: `sourceReceiptId` se fuerza a null al insertar (evita FK a remitos que no existen).
 *
 * No copia: órdenes, movimientos de stock históricos, usuarios, mesas (no son catálogo).
 *
 * Requisitos:
 * - DATABASE_URL → local (origen)
 * - DATABASE_URL_REMOTE → remoto (destino)
 * - MERGE_CATALOG_TO_REMOTE_CONFIRM=YES
 *
 * cd apps/api && MERGE_CATALOG_TO_REMOTE_CONFIRM=YES npm run prisma:merge-catalog-to-remote
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma';

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.DATABASE_URL_REMOTE;

if (process.env.MERGE_CATALOG_TO_REMOTE_CONFIRM !== 'YES') {
  console.error(
    '❌ Definí MERGE_CATALOG_TO_REMOTE_CONFIRM=YES para ejecutar el merge local → remoto.',
  );
  process.exit(1);
}

if (!sourceUrl) {
  console.error('❌ Falta DATABASE_URL (origen: local).');
  process.exit(1);
}
if (!targetUrl) {
  console.error('❌ Falta DATABASE_URL_REMOTE (PostgreSQL del servidor remoto).');
  console.error('   Opción 1 — en apps/api/.env:');
  console.error('   DATABASE_URL_REMOTE="postgresql://usuario:clave@host:5432/base"');
  console.error('   Opción 2 — en la misma línea del comando:');
  console.error(
    '   DATABASE_URL_REMOTE="postgresql://..." MERGE_CATALOG_TO_REMOTE_CONFIRM=YES npm run prisma:merge-catalog-to-remote',
  );
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

const CHUNK = 200;

async function createManySkipErrors(
  label: string,
  rows: Record<string, unknown>[],
  run: (data: Record<string, unknown>[]) => Promise<{ count: number }>,
): Promise<number> {
  let ok = 0;
  let err = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (!chunk.length) continue;
    try {
      const r = await run(chunk as never);
      ok += r.count;
    } catch (e) {
      for (const row of chunk) {
        try {
          await run([row] as never);
          ok += 1;
        } catch (e2) {
          err += 1;
          console.warn(`   ⚠️  ${label} omitido (${(row as { id?: string }).id ?? '?'}):`, (e2 as Error).message);
        }
      }
    }
  }
  if (err) console.log(`   ${label}: +${ok} insertados, ${err} omitidos por error`);
  else console.log(`   ${label}: +${ok} insertados`);
  return ok;
}

async function main() {
  console.log('\n📎 Merge catálogo: LOCAL → REMOTO (solo altas, sin borrar)\n');

  const [
    remoteCategoryIds,
    remoteSupplierIds,
    remotePriceListIds,
    remoteProductIds,
    remoteSkus,
    remoteModGroupIds,
    remoteModOptionIds,
    remoteModLineIds,
    remoteStockLevelKeys,
    remotePsIds,
    remotePhIds,
    remoteRecipeIds,
    remoteRiIds,
    remoteRlKeys,
    remoteLocationIds,
  ] = await Promise.all([
    targetPrisma.category.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.supplier.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.supplierPriceList.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.product.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.product.findMany({ select: { sku: true } }).then((r) => new Set(r.map((x) => x.sku))),
    targetPrisma.productModifierGroup
      .findMany({ select: { id: true } })
      .then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.productModifierOption
      .findMany({ select: { id: true } })
      .then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.productModifierStockLine
      .findMany({ select: { id: true } })
      .then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.stockLevel
      .findMany({ select: { productId: true, locationId: true } })
      .then((r) => new Set(r.map((x) => `${x.productId}\t${x.locationId}`))),
    targetPrisma.productSupplier.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.supplierPriceHistory.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.recipe.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.recipeIngredient.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    targetPrisma.recipeLocation
      .findMany({ select: { recipeId: true, locationId: true } })
      .then((r) => new Set(r.map((x) => `${x.recipeId}\t${x.locationId}`))),
    targetPrisma.location.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
  ]);

  let nCat = 0;
  const categories = await sourcePrisma.category.findMany();
  const categoriesOrdered = topoByParent(categories);
  for (const c of categoriesOrdered) {
    if (remoteCategoryIds.has(c.id)) continue;
    try {
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
      remoteCategoryIds.add(c.id);
      nCat++;
    } catch (e) {
      console.warn(`   ⚠️  Category ${c.id}:`, (e as Error).message);
    }
  }
  console.log(`   Category: +${nCat} nuevas`);

  const suppliers = (await sourcePrisma.supplier.findMany()).filter((s) => !remoteSupplierIds.has(s.id));
  await createManySkipErrors(
    'Supplier',
    suppliers as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.supplier.createMany({ data: chunk as never }),
  );

  const priceLists = (await sourcePrisma.supplierPriceList.findMany()).filter(
    (x) => !remotePriceListIds.has(x.id),
  );
  await createManySkipErrors(
    'SupplierPriceList',
    priceLists.map((row) => ({
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
    })) as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.supplierPriceList.createMany({ data: chunk as never }),
  );

  const productsAll = await sourcePrisma.product.findMany();
  const productsToAdd = productsAll.filter((p) => !remoteProductIds.has(p.id));
  let nProd = 0;
  let nProdSkuSkip = 0;
  for (const p of productsToAdd) {
    if (remoteSkus.has(p.sku)) {
      nProdSkuSkip++;
      console.warn(`   ⚠️  Producto local ${p.id} (${p.sku}): SKU ya existe en remoto, no se inserta por id.`);
      continue;
    }
    try {
      await targetPrisma.product.create({
        data: {
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
        },
      });
      remoteProductIds.add(p.id);
      remoteSkus.add(p.sku);
      nProd++;
    } catch (e) {
      console.warn(`   ⚠️  Product ${p.id}:`, (e as Error).message);
    }
  }
  if (nProdSkuSkip) console.log(`   (omitidos ${nProdSkuSkip} productos por SKU duplicado en remoto)`);
  console.log(`   Product: +${nProd} nuevos`);

  const modGroups = (await sourcePrisma.productModifierGroup.findMany()).filter(
    (g) => !remoteModGroupIds.has(g.id),
  );
  await createManySkipErrors(
    'ProductModifierGroup',
    modGroups.map((g) => ({
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
    })) as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.productModifierGroup.createMany({ data: chunk as never }),
  );

  const modOptions = (await sourcePrisma.productModifierOption.findMany()).filter(
    (o) => !remoteModOptionIds.has(o.id),
  );
  await createManySkipErrors(
    'ProductModifierOption',
    modOptions as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.productModifierOption.createMany({ data: chunk as never }),
  );

  const modStock = (await sourcePrisma.productModifierStockLine.findMany()).filter(
    (l) => !remoteModLineIds.has(l.id),
  );
  await createManySkipErrors(
    'ProductModifierStockLine',
    modStock as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.productModifierStockLine.createMany({ data: chunk as never }),
  );

  const stockLevels = (await sourcePrisma.stockLevel.findMany()).filter((s) => {
    const k = `${s.productId}\t${s.locationId}`;
    if (remoteStockLevelKeys.has(k)) return false;
    if (!remoteProductIds.has(s.productId)) return false;
    if (!remoteLocationIds.has(s.locationId)) return false;
    return true;
  });
  await createManySkipErrors(
    'StockLevel',
    stockLevels as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.stockLevel.createMany({ data: chunk as never }),
  );

  const pss = (await sourcePrisma.productSupplier.findMany()).filter((x) => !remotePsIds.has(x.id));
  await createManySkipErrors(
    'ProductSupplier',
    pss as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.productSupplier.createMany({ data: chunk as never }),
  );

  const priceHist = (await sourcePrisma.supplierPriceHistory.findMany()).filter(
    (x) => !remotePhIds.has(x.id),
  );
  await createManySkipErrors(
    'SupplierPriceHistory',
    priceHist.map((h) => ({ ...h, sourceReceiptId: null })) as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.supplierPriceHistory.createMany({ data: chunk as never }),
  );

  const recipesAll = await sourcePrisma.recipe.findMany();
  const recipesNew = recipesAll.filter((r) => !remoteRecipeIds.has(r.id));
  const recipesOrdered = topoByParent(recipesNew);
  let nRec = 0;

  const fallbackRemoteUser = await targetPrisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!fallbackRemoteUser) {
    throw new Error('No hay usuarios en REMOTO (hace falta para Recipe.createdById).');
  }
  const fallbackRemoteUserId = fallbackRemoteUser.id;
  const userMap = new Map<string, string>();

  async function mapUser(localUserId: string): Promise<string> {
    const c = userMap.get(localUserId);
    if (c) return c;
    const lu = await sourcePrisma.user.findUnique({ where: { id: localUserId } });
    let rid = fallbackRemoteUserId;
    if (lu?.email) {
      const m = await targetPrisma.user.findFirst({ where: { email: lu.email } });
      if (m) rid = m.id;
    }
    userMap.set(localUserId, rid);
    return rid;
  }

  for (const r of recipesOrdered) {
    try {
      const createdById = await mapUser(r.createdById);
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
      remoteRecipeIds.add(r.id);
      nRec++;
    } catch (e) {
      console.warn(`   ⚠️  Recipe ${r.id}:`, (e as Error).message);
    }
  }
  console.log(`   Recipe: +${nRec} nuevas`);

  const ings = (await sourcePrisma.recipeIngredient.findMany()).filter((i) => !remoteRiIds.has(i.id));
  await createManySkipErrors(
    'RecipeIngredient',
    ings as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.recipeIngredient.createMany({ data: chunk as never }),
  );

  const rls = (await sourcePrisma.recipeLocation.findMany()).filter((x) => {
    const k = `${x.recipeId}\t${x.locationId}`;
    if (remoteRlKeys.has(k)) return false;
    if (!remoteRecipeIds.has(x.recipeId)) return false;
    if (!remoteLocationIds.has(x.locationId)) return false;
    return true;
  });
  await createManySkipErrors(
    'RecipeLocation',
    rls as unknown as Record<string, unknown>[],
    (chunk) => targetPrisma.recipeLocation.createMany({ data: chunk as never }),
  );

  console.log('\n✅ Merge finalizado (solo inserciones; remoto no se borró).\n');
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
