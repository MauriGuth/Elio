/**
 * Carga/actualiza las recetas de bebidas (DORADO): almíbares, limonadas, mocktails, cócteles, de autor, aperitivos.
 * Crea Product + Recipe por ítem, asigna categoría, y asegura StockLevel en ubicación DORADO (0 si no existe).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { LocationType, PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Nombre del producto y slug de categoría (BEBIDAS | MOCKTAILS | COCTELES | DE AUTOR | APERITIVO). */
const BEBIDAS_DORADO: Array<{ name: string; categorySlug: string }> = [
  { name: 'ALMIBAR FRUTOS ROJOS', categorySlug: 'bebidas' },
  { name: 'ALMIBAR MARACUYA', categorySlug: 'bebidas' },
  { name: 'ALMIBAR HIERBAS HERBACEO', categorySlug: 'bebidas' },
  { name: 'ALMIBAR GINGER ALE', categorySlug: 'bebidas' },
  { name: 'JUGO DE ANANA', categorySlug: 'bebidas' },
  { name: 'ALMIBAR SIMPLE', categorySlug: 'bebidas' },
  { name: 'ALMIBAR DE ACAI', categorySlug: 'bebidas' },
  { name: 'PREMIX LIMONADA', categorySlug: 'bebidas' },
  { name: 'INFUSION PARA JULEP PATAGONIA', categorySlug: 'bebidas' },
  { name: 'INFUSION PARA ICE GREENCH', categorySlug: 'bebidas' },
  { name: 'LIMONADA BLUE BERRY', categorySlug: 'bebidas' },
  { name: 'LIMONADA MARACUYA', categorySlug: 'bebidas' },
  { name: 'LIMONADA FRUTOS ROJOS', categorySlug: 'bebidas' },
  { name: 'LIMONADA MENTA Y JENGIBRE', categorySlug: 'bebidas' },
  { name: 'POMELADA', categorySlug: 'bebidas' },
  { name: 'HIELO ESFERA CON RODAJA DE NARANJA', categorySlug: 'bebidas' },
  { name: 'MOCK. ICE GREENCH', categorySlug: 'mocktails' },
  { name: 'MOCK. SHIRLEY TEMPLE', categorySlug: 'mocktails' },
  { name: 'MOCK. EXPRESO TONNIC', categorySlug: 'mocktails' },
  { name: 'MOCK. JULEP PATAGONIA', categorySlug: 'mocktails' },
  { name: 'COCT. NEGRONI', categorySlug: 'cocteles' },
  { name: 'COCT. OLD FASHIONED', categorySlug: 'cocteles' },
  { name: 'COCT. NEW YORK SOUR', categorySlug: 'cocteles' },
  { name: 'COCT. MANHATTAN', categorySlug: 'cocteles' },
  { name: 'WHISKY SOUR', categorySlug: 'cocteles' },
  { name: 'COCT. COSMOPOLITAN', categorySlug: 'cocteles' },
  { name: 'COCT. EXPRESO MARTINI', categorySlug: 'cocteles' },
  { name: 'COCT. SEX ON THE BEACH', categorySlug: 'cocteles' },
  { name: 'COCT. MARGARITA', categorySlug: 'cocteles' },
  { name: 'COCT. GIN TEA TONIC', categorySlug: 'cocteles' },
  { name: 'COCT. GIN TONIC', categorySlug: 'cocteles' },
  { name: 'AUTOR OUT LANDER', categorySlug: 'de-autor' },
  { name: 'AUTOR CAIPIORIENTAL VINO BLANCO', categorySlug: 'de-autor' },
  { name: 'AUTOR CAIPIORIENTAL SAKE', categorySlug: 'de-autor' },
  { name: 'AUTOR BEATLE JUICE', categorySlug: 'de-autor' },
  { name: 'AUTOR BRUMA DEL BOSQUE', categorySlug: 'de-autor' },
  { name: 'AUTOR DORADO', categorySlug: 'de-autor' },
  { name: 'APER. APPEROL SPRITZ', categorySlug: 'aperitivo' },
  { name: 'APER. CYNAR JULEP', categorySlug: 'aperitivo' },
  { name: 'APER. CAMPARI ORANGE', categorySlug: 'aperitivo' },
];

async function main() {
  const [locations, categories, users, products, recipes, stockLevels] = await Promise.all([
    prisma.location.findMany({ select: { id: true, name: true, slug: true }, where: { isActive: true } }),
    prisma.category.findMany({ select: { id: true, slug: true, name: true }, where: { isActive: true } }),
    prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 }),
    prisma.product.findMany({ select: { id: true, name: true, sku: true }, where: { isActive: true } }),
    prisma.recipe.findMany({ where: { isActive: true }, select: { id: true, name: true, productId: true } }),
    prisma.stockLevel.findMany({ select: { productId: true, locationId: true } }),
  ]);

  let dorado = locations.find((l) => normalizeKey(l.name) === 'DORADO' || l.slug === 'dorado');
  if (!dorado) {
    dorado = await prisma.location.create({
      data: {
        name: 'Dorado',
        slug: 'dorado',
        type: LocationType.RESTAURANT,
        isActive: true,
        hasTables: true,
      },
    });
    console.log('  Ubicación creada: Dorado (dorado)');
  }

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const slugsNeeded = ['bebidas', 'mocktails', 'cocteles', 'de-autor', 'aperitivo'];
  const categoryIdBySlug = new Map<string, string>();
  for (const slug of slugsNeeded) {
    let cat = categoryBySlug.get(slug);
    if (!cat) {
      const name = slug === 'de-autor' ? 'De Autor' : slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
      cat = await prisma.category.create({
        data: { name, slug, sortOrder: categories.length + slugsNeeded.indexOf(slug) },
      });
      console.log(`  Categoría creada: ${name} (${slug})`);
    }
    categoryIdBySlug.set(slug, cat.id);
  }

  const defaultCategoryId = categoryIdBySlug.get('bebidas')!;
  const userId = users[0]?.id;
  if (!userId) throw new Error('No hay usuarios en la base.');

  const productByKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const recipeByKey = new Map(recipes.map((r) => [normalizeKey(r.name), r]));
  const stockSet = new Set(stockLevels.map((s) => `${s.productId}:${s.locationId}`));
  const usedSkus = new Set(products.map((p) => p.sku));

  function nextSku(prefix: string): string {
    let candidate = prefix;
    let n = 1;
    while (usedSkus.has(candidate)) { candidate = `${prefix}-${n}`; n++; }
    usedSkus.add(candidate);
    return candidate;
  }

  let productsCreated = 0;
  let recipesCreated = 0;
  let stockCreated = 0;

  for (const row of BEBIDAS_DORADO) {
    const key = normalizeKey(row.name);
    const categoryId = categoryIdBySlug.get(row.categorySlug) ?? defaultCategoryId;

    let product = productByKey.get(key);
    if (!product) {
      const baseSku = key.replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'BEB';
      product = await prisma.product.create({
        data: {
          name: row.name.trim(),
          sku: nextSku(`DOR-${baseSku}`),
          categoryId,
          unit: 'unidad',
          isSellable: true,
          isIngredient: true,
          isProduced: true,
          isActive: true,
          avgCost: 0,
          lastCost: 0,
          salePrice: 0,
        },
      });
      productByKey.set(key, product);
      productsCreated++;
      console.log(`  Producto creado: ${row.name}`);
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { categoryId, isSellable: true, isProduced: true },
      });
    }

    let recipe = recipeByKey.get(key);
    if (!recipe) {
      recipe = await prisma.recipe.create({
        data: {
          name: row.name,
          description: 'Receta DORADO (bebida).',
          yieldQty: 1,
          yieldUnit: 'unidad',
          productId: product.id,
          isActive: true,
          createdById: userId,
        },
      });
      recipeByKey.set(key, recipe);
      recipesCreated++;
      console.log(`  Receta creada: ${row.name}`);
    } else if (!recipe.productId) {
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { productId: product.id },
      });
    }

    const stockKey = `${product.id}:${dorado.id}`;
    if (!stockSet.has(stockKey)) {
      await prisma.stockLevel.create({
        data: {
          productId: product.id,
          locationId: dorado.id,
          quantity: 0,
          minQuantity: 0,
        },
      });
      stockSet.add(stockKey);
      stockCreated++;
      console.log(`  Stock DORADO creado: ${row.name}`);
    }
  }

  console.log('---');
  console.log('Productos creados:', productsCreated);
  console.log('Recetas creadas:', recipesCreated);
  console.log('Registros de stock en DORADO creados:', stockCreated);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
