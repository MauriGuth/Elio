/**
 * Corrige unidades de ingredientes en recetas según las planillas.
 * Por ejemplo: TOMATES SECOS → AGUA y ACEITE en lt (no unidad/ml).
 * También actualiza Product.unit para productos líquidos (AGUA, ACEITE, etc.) a 'lt'.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

type IngDef = { productName: string; unit: string };
type RecipeDef = { name: string; ingredients: IngDef[] };

const RECIPES: RecipeDef[] = [
  { name: 'CORDON', ingredients: [
    { productName: 'PECHUGA', unit: 'kg' }, { productName: 'QUESO TYBO', unit: 'kg' }, { productName: 'JAMON COCIDO FETA', unit: 'kg' },
  ]},
  { name: 'EMPANADO DE CORDON', ingredients: [
    { productName: 'HUEVO', unit: 'kg' }, { productName: 'HARINA', unit: 'kg' }, { productName: 'PANKO', unit: 'kg' },
  ]},
  { name: 'CORDON BLUE', ingredients: [
    { productName: 'CORDON', unit: 'kg' }, { productName: 'PURE DE PAPAS', unit: 'kg' }, { productName: 'PURE DE ZAPALLO', unit: 'kg' },
  ]},
  { name: 'TOMATES SECOS', ingredients: [
    { productName: 'TOMATES SECOS', unit: 'kg' }, { productName: 'AGUA', unit: 'lt' }, { productName: 'AJO', unit: 'kg' }, { productName: 'ACEITE', unit: 'lt' },
  ]},
  { name: 'BRUS STRACCIATELLA', ingredients: [
    { productName: 'PAN MASA MADRE*TOSTON', unit: 'unidad' }, { productName: 'BURRATA', unit: 'unidad' }, { productName: 'TOMATES SECOS', unit: 'kg' },
    { productName: 'TOMATES CHERRY CONFITADOS', unit: 'kg' }, { productName: 'ALBAHACA', unit: 'kg' }, { productName: 'ACEITE OLIVA', unit: 'lt' }, { productName: 'FLOR -DECO', unit: 'unidad' },
  ]},
  { name: 'BRUS SALMON', ingredients: [
    { productName: 'PAN MASA MADRE*TOSTON', unit: 'unidad' }, { productName: 'CREMA ACIDA', unit: 'kg' }, { productName: 'SALMON AHUMADO', unit: 'kg' },
    { productName: 'ENCURTIDO CEBOLLA', unit: 'kg' }, { productName: 'ALCAPARRAS', unit: 'kg' }, { productName: 'ENCURTIDO REMOLACHA', unit: 'kg' },
  ]},
  { name: 'AVOCADO TOAST', ingredients: [
    { productName: 'PAN MASA MADRE*TOSTON', unit: 'unidad' }, { productName: 'CREMA ACIDA', unit: 'kg' }, { productName: 'PALTA', unit: 'kg' },
    { productName: 'HUEVO BAJA TEMPERATURA', unit: 'kg' }, { productName: 'BROTES', unit: 'kg' }, { productName: 'SEMILLAS', unit: 'kg' },
  ]},
  { name: 'BRUS CAPRESE', ingredients: [
    { productName: 'PAN MASA MADRE*TOSTON', unit: 'unidad' }, { productName: 'ADEREZO AJO Y MIEL', unit: 'kg' }, { productName: 'BOCONCCINOS', unit: 'kg' },
    { productName: 'TOMATES ASADOS', unit: 'kg' }, { productName: 'PESTO', unit: 'kg' }, { productName: 'PASTA DE ACEITUNAS', unit: 'kg' },
  ]},
  { name: 'BRUS MEDITERRANEA', ingredients: [
    { productName: 'PAN MASA MADRE*TOSTON', unit: 'unidad' }, { productName: 'ADEREZO AJO Y MIEL', unit: 'kg' }, { productName: 'JAMON CRUDO', unit: 'kg' },
    { productName: 'TOMATES HIDRATADOS', unit: 'kg' }, { productName: 'RUCULA', unit: 'kg' },
  ]},
  { name: 'LOMO', ingredients: [
    { productName: 'LOMO', unit: 'kg' }, { productName: 'PANCETA', unit: 'kg' }, { productName: 'SAL', unit: 'kg' }, { productName: 'PIMIENTA', unit: 'kg' },
    { productName: 'ROTULOS ADHERENTE', unit: 'unidad' }, { productName: 'BOLSA VACIO 170X200/100 P-0,600 KG', unit: 'unidad' },
  ]},
  { name: 'PETIT BEEF', ingredients: [
    { productName: 'LOMO', unit: 'kg' }, { productName: 'PURE DE PAPAS', unit: 'kg' }, { productName: 'HONGOS CONFITADOS', unit: 'kg' },
    { productName: 'SALSA DE SOJA', unit: 'kg' }, { productName: 'HUMO LIQUIDO', unit: 'kg' }, { productName: 'CREMA BASE', unit: 'kg' },
  ]},
  { name: 'GYOZA CERDO ELABORACION', ingredients: [
    { productName: 'TAPA EMPANADAS COPETIN', unit: 'unidad' }, { productName: 'CEBOLLA BLANCA', unit: 'kg' }, { productName: 'REPOLLO', unit: 'kg' },
    { productName: 'CERDO BRASEADO', unit: 'kg' }, { productName: 'VERDEO', unit: 'kg' }, { productName: 'SALSA SOJA', unit: 'lt' }, { productName: 'SALSA DE OSTRAS', unit: 'lt' },
    { productName: 'JENGIBRE', unit: 'kg' }, { productName: 'SAL', unit: 'kg' }, { productName: 'PIMIENTA', unit: 'kg' }, { productName: 'BOLSA TCS CRISTAL CHICA', unit: 'unidad' },
  ]},
  { name: 'GYOZA HONGO ELABORACION', ingredients: [
    { productName: 'TAPA EMPANADAS COPETIN', unit: 'unidad' }, { productName: 'CEBOLLA BLANCA', unit: 'kg' }, { productName: 'REPOLLO', unit: 'kg' },
    { productName: 'HONGOS', unit: 'kg' }, { productName: 'VERDEO', unit: 'kg' }, { productName: 'SALSA SOJA', unit: 'lt' }, { productName: 'SALSA DE OSTRAS', unit: 'lt' },
    { productName: 'JENGIBRE', unit: 'kg' }, { productName: 'SAL', unit: 'kg' }, { productName: 'PIMIENTA', unit: 'kg' }, { productName: 'BOLSA TCS CRISTAL CHICA', unit: 'unidad' },
  ]},
  { name: 'GYOZA CERDO', ingredients: [
    { productName: 'GYOZA CERDO ELABORACION', unit: 'unidad' }, { productName: 'SALSA PONZU', unit: 'kg' }, { productName: 'BROTES', unit: 'kg' },
  ]},
  { name: 'GYOZA HONGO', ingredients: [
    { productName: 'GYOZA HONGO ELABORACION', unit: 'unidad' }, { productName: 'SALSA PONZU', unit: 'kg' }, { productName: 'BROTES', unit: 'kg' },
  ]},
  // —— Nuevas recetas (Salmon Keto, Escabeche, Waffles, Sand, Menu Infantil, etc.)
  { name: 'SALSA PETIT BEEF', ingredients: [
    { productName: 'HONGOS CONFITADOS', unit: 'kg' }, { productName: 'SALSA DE SOJA', unit: 'lt' }, { productName: 'HUMO LIQUIDO', unit: 'kg' }, { productName: 'CREMA BASE', unit: 'kg' },
  ]},
  { name: 'SALMON GRILLADO', ingredients: [
    { productName: 'SALMON', unit: 'kg' }, { productName: 'ACEITE OLIVA', unit: 'lt' }, { productName: 'RODAJA LIMON', unit: 'kg' }, { productName: 'SAL', unit: 'kg' }, { productName: 'PIMIENTA', unit: 'kg' },
  ]},
  { name: 'CHERRY CONFITADOS', ingredients: [
    { productName: 'CHERRY', unit: 'kg' }, { productName: 'ACEITE', unit: 'lt' },
  ]},
  { name: 'SALSA CITRICA', ingredients: [
    { productName: 'VINO BLANCO TORO', unit: 'lt' }, { productName: 'LIMON EXPRIMIDO', unit: 'lt' }, { productName: 'ALCAPARRAS', unit: 'kg' }, { productName: 'MANTECA', unit: 'kg' },
  ]},
  { name: 'ESCABECHE DE POLLO', ingredients: [
    { productName: 'ACEITE GIRASOL', unit: 'lt' }, { productName: 'AGUA', unit: 'lt' }, { productName: 'VINAGRE MANZANA', unit: 'lt' }, { productName: 'VINO BLANCO', unit: 'lt' },
  ]},
  { name: 'ESCABECHE DE VEGETALES', ingredients: [
    { productName: 'ACEITE GIRASOL', unit: 'lt' }, { productName: 'AGUA', unit: 'lt' }, { productName: 'VINAGRE MANZANA', unit: 'lt' }, { productName: 'VINO BLANCO', unit: 'lt' },
  ]},
  { name: 'WAFFLE', ingredients: [
    { productName: 'LECHE', unit: 'lt' }, { productName: 'FUCCION VAINILLA', unit: 'lt' }, { productName: 'FUCCION CARAMELO', unit: 'lt' },
  ]},
  { name: 'TOMATES CONFITADOS', ingredients: [
    { productName: 'TOMATES CHERRY', unit: 'kg' }, { productName: 'ACEITE', unit: 'lt' },
  ]},
  { name: 'NUGETS', ingredients: [
    { productName: 'SALSA SOJA', unit: 'lt' },
  ]},
  { name: 'PAPAS FRITAS', ingredients: [
    { productName: 'ACEITE', unit: 'lt' },
  ]},
  { name: 'CINTAS', ingredients: [
    { productName: 'VINO', unit: 'lt' },
  ]},
  // —— Lista RECETA/OXP (Arroz, Ensalada, Arroz con leche)
  { name: 'ARROZ BLANCO', ingredients: [
    { productName: 'ARROZ', unit: 'kg' }, { productName: 'AGUA', unit: 'lt' }, { productName: 'SAL', unit: 'kg' },
  ]},
  { name: 'ENSALADA DE FRUTAS', ingredients: [
    { productName: 'NARANJA', unit: 'unidad' }, { productName: 'MANZANA', unit: 'unidad' }, { productName: 'BANANA', unit: 'unidad' }, { productName: 'FRUTILLA', unit: 'unidad' }, { productName: 'AZUCAR', unit: 'kg' }, { productName: 'AGUA', unit: 'lt' },
  ]},
  { name: 'ARROZ CON LECHE', ingredients: [
    { productName: 'ARROZ', unit: 'kg' }, { productName: 'LECHE', unit: 'lt' }, { productName: 'AZUCAR', unit: 'kg' },
  ]},
  { name: 'TOMATE ASADO', ingredients: [
    { productName: 'ACEITE', unit: 'lt' },
  ]},
  { name: 'FOCACCIA', ingredients: [
    { productName: 'AGUA', unit: 'lt' }, { productName: 'ACEITE OLIVA', unit: 'lt' },
  ]},
  { name: 'SALSA DE HONGOS', ingredients: [
    { productName: 'VINO TINTO REDUCIDO', unit: 'lt' },
  ]},
  { name: 'HONGOS CONFITADOS', ingredients: [
    { productName: 'VINO TINTO', unit: 'lt' },
  ]},
  { name: 'BECHAMEL', ingredients: [
    { productName: 'LECHE TIBIA', unit: 'lt' },
  ]},
  { name: 'RELLENO RAVIOLON TERNERA', ingredients: [
    { productName: 'FONDO VINO TINTO', unit: 'lt' },
  ]},
  { name: 'MIRE POIX', ingredients: [
    { productName: 'ACEITE', unit: 'lt' },
  ]},
];

const PRODUCTS_LIQUID_UNIT_LT = [
  'AGUA', 'ACEITE', 'ACEITE OLIVA', 'ACEITE DE OLIVA', 'ACEITE GIRASOL', 'VINO BLANCO', 'VINO BLANCO TORO', 'VINO TINTO', 'VINO TINTO REDUCIDO', 'VINAGRE MANZANA', 'LECHE', 'LECHE TIBIA', 'CREMA DE LECHE', 'SALSA SOJA', 'SALSA DE SOJA', 'SALSA DE OSTRAS',
  'VINO', 'FONDO VINO TINTO', 'LIMON EXPRIMIDO', 'MIEL', 'CREMA', 'DULCE DE LECHE', 'FUCCION VAINILLA', 'FUCCION CARAMELO',
  'SALSA ROJA', 'SOPA', 'SOPA CREMA',
];

async function main() {
  const recipes = await prisma.recipe.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const recipeByName = new Map(recipes.map((r) => [normalizeKey(r.name), r]));

  const ingredients = await prisma.recipeIngredient.findMany({
    include: { recipe: true, product: true },
  });

  let updatedCount = 0;
  for (const def of RECIPES) {
    const recipe = recipeByName.get(normalizeKey(def.name));
    if (!recipe) continue;
    const byProductKey = new Map(def.ingredients.map((i) => [normalizeKey(i.productName), i.unit]));
    for (const ri of ingredients) {
      if (ri.recipeId !== recipe.id) continue;
      const productKey = normalizeKey(ri.product.name);
      const correctUnit = byProductKey.get(productKey);
      if (!correctUnit || ri.unit === correctUnit) continue;
      await prisma.recipeIngredient.update({
        where: { id: ri.id },
        data: { unit: correctUnit },
      });
      updatedCount++;
      console.log(`  ${def.name} / ${ri.product.name}: ${ri.unit} → ${correctUnit}`);
    }
  }

  const allProducts = await prisma.product.findMany({ select: { id: true, name: true, unit: true } });
  const liquidKeys = new Set(PRODUCTS_LIQUID_UNIT_LT.map(normalizeKey));
  const productsToLt = allProducts.filter((p) => liquidKeys.has(normalizeKey(p.name)) && p.unit !== 'lt');
  for (const p of productsToLt) {
    await prisma.product.update({ where: { id: p.id }, data: { unit: 'lt' } });
    console.log(`  Producto ${p.name}: ${p.unit} → lt`);
    updatedCount++;
  }

  console.log('---');
  console.log('Unidades corregidas (ingredientes + productos):', updatedCount);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
