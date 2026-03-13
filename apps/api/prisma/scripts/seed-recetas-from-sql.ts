/**
 * Carga recetas desde el archivo SQL recetas_gastronomia_local_2.sql
 * Parsea INSERT INTO receta_gastro2_plato y receta_gastro2_componente,
 * construye la estructura esperada y reutiliza la lógica de repair-recetas-gastronomia-local-2.
 *
 * Uso: GASTRO2_SQL_PATH=/ruta/a/recetas_gastronomia_local_2.sql npm run prisma:seed-recetas-from-sql
 */
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

type RawRecipeRow = {
  nombre_plato: string;
  hoja?: string | null;
  componentes: Array<{
    ingrediente: string;
    cantidad: number;
    unidad: string;
    tipo?: string;
    elaboracion?: string | null;
  }>;
};

type ProductCategory = 'RECETA' | 'INSUMOS';

type RecipeIngredientSeed = {
  productName: string;
  qtyPerYield: number;
  unit: string;
  notes?: string;
  category: ProductCategory;
};

type RecipeSeed = {
  name: string;
  category: string | null;
  ingredients: RecipeIngredientSeed[];
};

const SOURCE_SQL =
  process.env.GASTRO2_SQL_PATH || '/Users/mauriciohuentelaf/Downloads/recetas_gastronomia_local_2.sql';
const DRY_RUN = process.env.DRY_RUN === '1';

const RECIPE_NAME_OVERRIDES = new Map<string, string>([
  ['PLATO -DORADO', 'PLATO - DORADO'],
]);

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

/** Parsea una línea VALUES ('a', 'b', NULL, 123) respetando comas dentro de comillas. */
function parseValuesLine(line: string): (string | number | null)[] {
  const valuesMatch = line.match(/VALUES\s*\((.*)\)\s*;?\s*$/is);
  if (!valuesMatch) return [];
  const inner = valuesMatch[1];
  const result: (string | number | null)[] = [];
  let i = 0;
  while (i < inner.length) {
    const rest = inner.slice(i).replace(/^\s*/, '');
    const consumed = inner.length - i - rest.length;
    i += consumed;
    if (!rest.length) break;
    if (rest.startsWith("'")) {
      let pos = 1;
      while (pos < rest.length) {
        const nextQuote = rest.indexOf("'", pos);
        if (nextQuote === -1) break;
        if (rest[nextQuote + 1] === "'") {
          pos = nextQuote + 2;
          continue;
        }
        result.push(rest.slice(1, nextQuote).replace(/''/g, "'"));
        i += nextQuote + 1;
        const afterComma = inner.slice(i).match(/^\s*,\s*/);
        if (afterComma) i += afterComma[0].length;
        break;
      }
      continue;
    }
    if (rest.toUpperCase().startsWith('NULL')) {
      result.push(null);
      i += 4;
      const afterComma = inner.slice(i).match(/^\s*,\s*/);
      if (afterComma) i += afterComma[0].length;
      continue;
    }
    const numMatch = rest.match(/^(\d+(?:\.\d+)?)/);
    if (numMatch) {
      result.push(parseFloat(numMatch[1]));
      i += numMatch[1].length;
      const afterComma = inner.slice(i).match(/^\s*,\s*/);
      if (afterComma) i += afterComma[0].length;
      continue;
    }
    i++;
  }
  return result;
}

function parseSqlToRows(sql: string): RawRecipeRow[] {
  const lines = sql.split('\n');
  const platos = new Map<string, { nombre_plato: string; hoja: string | null }>();
  const componentesByPlato = new Map<string, RawRecipeRow['componentes']>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('INSERT INTO receta_gastro2_plato')) {
      const values = parseValuesLine(trimmed);
      const nombre = (values[0] != null ? String(values[0]) : '').trim();
      const hoja = values[1] != null ? String(values[1]).trim() : null;
      if (nombre) platos.set(nombre, { nombre_plato: nombre, hoja });
      continue;
    }
    if (trimmed.startsWith('INSERT INTO receta_gastro2_componente')) {
      const values = parseValuesLine(trimmed);
      const platoNombre = (values[0] != null ? String(values[0]) : '').trim();
      const ingrediente = (values[2] != null ? String(values[2]) : '').trim();
      const cantidad = typeof values[3] === 'number' ? values[3] : (values[3] != null ? parseFloat(String(values[3])) : 0);
      const unidad = (values[4] != null ? String(values[4]) : '').trim() || 'unidad';
      const tipo = values[5] != null ? String(values[5]).trim() : undefined;
      const elaboracion = values[6] != null ? String(values[6]).trim() : null;
      if (!platoNombre || !ingrediente) continue;
      const list = componentesByPlato.get(platoNombre) || [];
      list.push({ ingrediente, cantidad, unidad, tipo, elaboracion });
      componentesByPlato.set(platoNombre, list);
    }
  }

  const rows: RawRecipeRow[] = [];
  for (const [nombre, { hoja }] of platos) {
    const componentes = componentesByPlato.get(nombre) || [];
    rows.push({ nombre_plato: nombre, hoja: hoja || null, componentes });
  }
  return rows;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function canonicalName(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  return RECIPE_NAME_OVERRIDES.get(trimmed) ?? trimmed;
}

function normalizeUnit(unit: string | null | undefined): string {
  const value = normalizeKey(unit || '');
  if (!value) return 'unidad';
  if (['UNIDAD', 'UNIDADES', 'UN', 'U'].includes(value)) return 'unidad';
  if (['KG', 'KGS', 'KILO', 'KILOS'].includes(value)) return 'kg';
  if (['GR', 'GRAMO', 'GRAMOS', 'G'].includes(value)) return 'g';
  if (['LT', 'LTS', 'LITRO', 'LITROS', 'L'].includes(value)) return 'lt';
  if (['ML', 'CC'].includes(value)) return 'ml';
  return (unit || 'unidad').trim().toLowerCase();
}

function categoryFromRaw(value: string | null | undefined): ProductCategory {
  return normalizeKey(value || '').includes('RECETA') ? 'RECETA' : 'INSUMOS';
}

function skuFromName(name: string, usedSkus: Set<string>): string {
  const base =
    normalizeKey(name)
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'RECETA';
  let candidate = base;
  let suffix = 1;
  while (usedSkus.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedSkus.add(candidate);
  return candidate;
}

function dedupeIngredients(ingredients: RecipeIngredientSeed[]): RecipeIngredientSeed[] {
  const seen = new Set<string>();
  const output: RecipeIngredientSeed[] = [];
  for (const ingredient of ingredients) {
    const key = [normalizeKey(ingredient.productName), ingredient.qtyPerYield, ingredient.unit, ingredient.category].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ingredient);
  }
  return output;
}

function buildRecipeSeeds(rows: RawRecipeRow[]): RecipeSeed[] {
  const recipes = new Map<string, RecipeSeed>();
  for (const row of rows) {
    const name = canonicalName(row.nombre_plato);
    if (!name) continue;
    const ingredients = (row.componentes || [])
      .filter((item) => (item.ingrediente || '').trim() && Number.isFinite(item.cantidad))
      .map<RecipeIngredientSeed>((item) => ({
        productName: canonicalName(item.ingrediente),
        qtyPerYield: item.cantidad,
        unit: normalizeUnit(item.unidad),
        notes: (item.elaboracion || '').trim() || undefined,
        category: categoryFromRaw(item.tipo),
      }));
    if (ingredients.length === 0) continue;
    const key = normalizeKey(name);
    const existing = recipes.get(key);
    if (existing) {
      existing.ingredients = dedupeIngredients([...existing.ingredients, ...ingredients]);
      existing.category = existing.category || row.hoja?.trim() || null;
    } else {
      recipes.set(key, { name, category: row.hoja?.trim() || null, ingredients: dedupeIngredients(ingredients) });
    }
  }
  return [...recipes.values()];
}

async function main() {
  if (!fs.existsSync(SOURCE_SQL)) {
    throw new Error(`No existe el archivo SQL: ${SOURCE_SQL}`);
  }

  const sql = fs.readFileSync(SOURCE_SQL, 'utf-8');
  const rows = parseSqlToRows(sql);
  const recipes = buildRecipeSeeds(rows);

  const [recipeCategory, ingredientCategory, users, existingProducts, existingRecipes] = await Promise.all([
    prisma.category.findFirst({ where: { slug: 'tipo-receta' }, select: { id: true } }),
    prisma.category.findFirst({ where: { slug: 'tipo-insumos' }, select: { id: true } }),
    prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 }),
    prisma.product.findMany({
      select: { id: true, name: true, sku: true, unit: true, categoryId: true, isSellable: true, isIngredient: true, isProduced: true },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true, isActive: true, createdById: true, _count: { select: { ingredients: true } } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  if (!recipeCategory || !ingredientCategory) {
    throw new Error('Faltan categorías `tipo-receta` o `tipo-insumos`. Ejecutá el seed principal primero.');
  }
  if (users.length === 0) {
    throw new Error('No hay usuarios. Ejecutá el seed principal primero.');
  }

  const systemUserId = users[0].id;
  const usedSkus = new Set(existingProducts.map((p) => p.sku));
  const productByKey = new Map(existingProducts.map((p) => [normalizeKey(p.name), p]));
  const recipesByKey = new Map(existingRecipes.map((r) => [normalizeKey(r.name), r]));

  const ensureProduct = async (name: string, category: ProductCategory, unit: string) => {
    const key = normalizeKey(name);
    const existing = productByKey.get(key);
    const desiredCategoryId = category === 'RECETA' ? recipeCategory.id : ingredientCategory.id;
    const desiredFlags =
      category === 'RECETA'
        ? { isSellable: true, isIngredient: true, isProduced: true }
        : { isSellable: false, isIngredient: true, isProduced: false };

    if (existing) {
      if (category === 'RECETA' && (existing.categoryId !== desiredCategoryId || !existing.isSellable || !existing.isProduced)) {
        if (!DRY_RUN) {
          await prisma.product.update({
            where: { id: existing.id },
            data: { categoryId: desiredCategoryId, unit: existing.unit || unit, ...desiredFlags },
          });
        }
      }
      return existing;
    }

    const payload = {
      sku: skuFromName(name, usedSkus),
      name,
      categoryId: desiredCategoryId,
      unit,
      ...desiredFlags,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: 0,
    };

    if (DRY_RUN) {
      const created = { id: `dry-${usedSkus.size}`, ...payload } as any;
      productByKey.set(key, created);
      return created;
    }
    const created = await prisma.product.create({ data: payload });
    productByKey.set(key, created);
    return created;
  };

  let createdRecipes = 0;
  let createdProductsCount = 0;

  const ensureProductWithCount = async (name: string, category: ProductCategory, unit: string) => {
    const key = normalizeKey(name);
    const existing = productByKey.get(key);
    const product = await ensureProduct(name, category, unit);
    if (!existing) createdProductsCount += 1;
    return product;
  };

  for (const recipeSeed of recipes) {
    const recipeProduct = await ensureProductWithCount(recipeSeed.name, 'RECETA', 'unidad');

    const ingredients: Array<{ productId: string; qtyPerYield: number; unit: string; notes?: string; sortOrder: number }> = [];
    for (let i = 0; i < recipeSeed.ingredients.length; i++) {
      const ing = recipeSeed.ingredients[i];
      const product = await ensureProductWithCount(ing.productName, ing.category, ing.unit);
      ingredients.push({
        productId: product.id,
        qtyPerYield: ing.qtyPerYield,
        unit: ing.unit,
        notes: ing.notes,
        sortOrder: i,
      });
    }

    const existingRecipe = recipesByKey.get(normalizeKey(recipeSeed.name));
    const baseData = {
      name: recipeSeed.name,
      description: 'Cargada desde recetas_gastronomia_local_2.sql',
      category: recipeSeed.category,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: recipeProduct.id,
      isActive: true,
    };

    if (existingRecipe) {
      if (!DRY_RUN) {
        await prisma.recipe.update({
          where: { id: existingRecipe.id },
          data: {
            ...baseData,
            createdById: existingRecipe.createdById || systemUserId,
            ingredients: { deleteMany: {}, create: ingredients },
          },
        });
      }
      continue;
    }

    createdRecipes += 1;
    if (!DRY_RUN) {
      const created = await prisma.recipe.create({
        data: {
          ...baseData,
          createdById: systemUserId,
          ingredients: { create: ingredients },
        },
        select: { id: true, name: true },
      });
      recipesByKey.set(normalizeKey(recipeSeed.name), created as any);
    }
  }

  console.log('Modo:', DRY_RUN ? 'DRY RUN' : 'EJECUCIÓN REAL');
  console.log('Archivo SQL:', SOURCE_SQL);
  console.log('Platos parseados:', rows.length);
  console.log('Recetas a crear/actualizar:', recipes.length);
  console.log('Recetas nuevas:', createdRecipes);
  console.log('Productos nuevos referenciados:', createdProductsCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
