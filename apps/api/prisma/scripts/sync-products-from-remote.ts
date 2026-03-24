/**
 * Borra el catálogo local (productos, proveedores, recetas, categorías, modificadores, etc.)
 * y lo reemplaza copiando desde DATABASE_URL_REMOTE.
 *
 * Requisitos:
 * - DATABASE_URL → base local (destino)
 * - DATABASE_URL_REMOTE → base remota (origen, solo lectura)
 * - Debe existir al menos un usuario en local (para Recipe.createdById si el autor remoto no coincide por email)
 *
 * Las ubicaciones (Location) no se copian: StockLevel y RecipeLocation solo se insertan si
 * el locationId existe en la base local.
 *
 * Ejecutar desde apps/api:
 *   DATABASE_URL_REMOTE="postgresql://..." npm run prisma:sync-products-from-remote
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma';
import { clearProductCatalog } from './delete-products-suppliers-recipes';

const localUrl = process.env.DATABASE_URL;
const remoteUrl = process.env.DATABASE_URL_REMOTE;

if (!localUrl) {
  console.error('❌ Falta DATABASE_URL (base local).');
  process.exit(1);
}
if (!remoteUrl) {
  console.error('❌ Falta DATABASE_URL_REMOTE (origen del catálogo).');
  process.exit(1);
}

const localPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: localUrl }),
});
const remotePrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: remoteUrl }),
});

/** Orden topológico: padres antes que hijos (parentId → id). Detecta ciclos. */
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

/** Lee productos desde remoto sin usar el modelo Prisma (evita P2022 si la BD remota va migraciones atrasadas). */
async function fetchRemoteProductsRaw(
  client: PrismaClient,
): Promise<Prisma.ProductCreateManyInput[]> {
  const rows = await client.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "products"
  `;
  return rows.map(mapProductRowFromPg);
}

function mapProductRowFromPg(row: Record<string, unknown>): Prisma.ProductCreateManyInput {
  const g = (k: string) => row[k];
  return {
    id: String(g('id')),
    sku: String(g('sku')),
    barcode: g('barcode') != null && g('barcode') !== undefined ? String(g('barcode')) : null,
    name: String(g('name')),
    description:
      g('description') != null && g('description') !== undefined ? String(g('description')) : null,
    categoryId: String(g('category_id')),
    familia:
      g('familia') !== undefined && g('familia') !== null ? String(g('familia')) : null,
    unit: String(g('unit')),
    imageUrl:
      g('image_url') !== undefined && g('image_url') !== null ? String(g('image_url')) : null,
    avgCost: Number(g('avg_cost') ?? 0),
    lastCost: Number(g('last_cost') ?? 0),
    salePrice: Number(g('sale_price') ?? 0),
    isSellable: Boolean(g('is_sellable')),
    isIngredient: Boolean(g('is_ingredient')),
    isProduced: Boolean(g('is_produced')),
    isPerishable: Boolean(g('is_perishable')),
    consumeRecipeOnSale:
      g('consume_recipe_on_sale') !== undefined && g('consume_recipe_on_sale') !== null
        ? Boolean(g('consume_recipe_on_sale'))
        : false,
    isActive: Boolean(g('is_active')),
    createdAt: g('created_at') as Date,
    updatedAt: g('updated_at') as Date,
  };
}

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
  console.log('🔄 Sincronizando catálogo desde remoto → local\n');

  const fallbackUser = await localPrisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!fallbackUser) {
    throw new Error(
      'No hay ningún usuario en la base local. Creá un usuario antes de sincronizar.',
    );
  }
  const fallbackUserId = fallbackUser.id;

  const localLocationIds = new Set(
    (await localPrisma.location.findMany({ select: { id: true } })).map((l) => l.id),
  );

  const userIdMap = new Map<string, string>();

  async function mapCreatedBy(remoteUserId: string): Promise<string> {
    const cached = userIdMap.get(remoteUserId);
    if (cached) return cached;
    const remoteUser = await remotePrisma.user.findUnique({ where: { id: remoteUserId } });
    let localId = fallbackUserId;
    if (remoteUser) {
      const match = await localPrisma.user.findFirst({
        where: { email: remoteUser.email },
      });
      if (match) localId = match.id;
    }
    userIdMap.set(remoteUserId, localId);
    return localId;
  }

  console.log('🗑️  Limpiando catálogo local...');
  await clearProductCatalog(localPrisma);
  console.log('');

  console.log('📥 Leyendo remoto e insertando en local...\n');

  const categories = await remotePrisma.category.findMany();
  const categoriesOrdered = topoByParent(categories);
  for (const c of categoriesOrdered) {
    await localPrisma.category.create({
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

  const suppliers = await remotePrisma.supplier.findMany();
  await createManyInChunks('Supplier', suppliers, (chunk) =>
    localPrisma.supplier.createMany({ data: chunk }),
  );

  const priceLists = await remotePrisma.supplierPriceList.findMany();
  await createManyInChunks('SupplierPriceList', priceLists, (chunk) =>
    localPrisma.supplierPriceList.createMany({
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

  const products = await fetchRemoteProductsRaw(remotePrisma);
  await createManyInChunks('Product', products, (chunk) =>
    localPrisma.product.createMany({ data: chunk }),
  );

  const modGroups = await remotePrisma.productModifierGroup.findMany();
  await createManyInChunks('ProductModifierGroup', modGroups, (chunk) =>
    localPrisma.productModifierGroup.createMany({ data: chunk }),
  );

  const modOptions = await remotePrisma.productModifierOption.findMany();
  await createManyInChunks('ProductModifierOption', modOptions, (chunk) =>
    localPrisma.productModifierOption.createMany({ data: chunk }),
  );

  const modStock = await remotePrisma.productModifierStockLine.findMany();
  await createManyInChunks('ProductModifierStockLine', modStock, (chunk) =>
    localPrisma.productModifierStockLine.createMany({ data: chunk }),
  );

  const stockLevelsAll = await remotePrisma.stockLevel.findMany();
  const stockLevels = stockLevelsAll.filter((s) => localLocationIds.has(s.locationId));
  await createManyInChunks('StockLevel', stockLevels, (chunk) =>
    localPrisma.stockLevel.createMany({ data: chunk }),
  );
  if (stockLevelsAll.length > stockLevels.length) {
    console.log(
      `   (omitidos ${stockLevelsAll.length - stockLevels.length} stock_levels: ubicación inexistente en local)`,
    );
  }

  const productSuppliers = await remotePrisma.productSupplier.findMany();
  await createManyInChunks('ProductSupplier', productSuppliers, (chunk) =>
    localPrisma.productSupplier.createMany({ data: chunk }),
  );

  const priceHist = await remotePrisma.supplierPriceHistory.findMany();
  const priceHistData = priceHist.map((h) => ({
    ...h,
    sourceReceiptId: null as string | null,
  }));
  await createManyInChunks('SupplierPriceHistory', priceHistData, (chunk) =>
    localPrisma.supplierPriceHistory.createMany({ data: chunk }),
  );

  const recipes = await remotePrisma.recipe.findMany();
  const recipesOrdered = topoByParent(recipes);
  for (const r of recipesOrdered) {
    const createdById = await mapCreatedBy(r.createdById);
    await localPrisma.recipe.create({
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

  const ingredients = await remotePrisma.recipeIngredient.findMany();
  await createManyInChunks('RecipeIngredient', ingredients, (chunk) =>
    localPrisma.recipeIngredient.createMany({ data: chunk }),
  );

  const rlAll = await remotePrisma.recipeLocation.findMany();
  const rl = rlAll.filter((x) => localLocationIds.has(x.locationId));
  await createManyInChunks('RecipeLocation', rl, (chunk) =>
    localPrisma.recipeLocation.createMany({ data: chunk }),
  );
  if (rlAll.length > rl.length) {
    console.log(
      `   (omitidos ${rlAll.length - rl.length} recipe_locations: ubicación inexistente en local)`,
    );
  }

  console.log('\n✅ Catálogo sincronizado desde remoto.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await localPrisma.$disconnect();
    await remotePrisma.$disconnect();
  });
