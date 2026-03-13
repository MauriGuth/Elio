/**
 * Carga/actualiza recetas desde recetas_extraidas_con_precios.json.
 * Parsea líneas de contenido (componentes tipo "NAME QTY UNIT RECETA/INSUMO" y subrecetas "QTY UNIT SUBRECETA INSUMO INGREDIENT").
 */
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

type IngredientRow = {
  recipeName: string;
  productName: string;
  qty: number;
  unit: string;
  isRecipe: boolean;
};

const SOURCE_JSON =
  process.env.RECETAS_JSON_PATH || '/Users/mauriciohuentelaf/Downloads/recetas_extraidas_con_precios.json';
const DRY_RUN = process.env.DRY_RUN === '1';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeUnit(u: string): string {
  const x = normalizeKey(u);
  if (!x) return 'unidad';
  if (['UNIDAD', 'UNIDADES', 'UN', 'U', 'UNI'].includes(x)) return 'unidad';
  if (['KG', 'KGS', 'KILO', 'KILOS'].includes(x)) return 'kg';
  if (['GR', 'GRAMO', 'GRAMOS'].includes(x)) return 'g';
  if (['LT', 'LTS', 'LITRO', 'LITROS', 'L'].includes(x)) return 'lt';
  if (['ML', 'CC'].includes(x)) return 'ml';
  if (['CM'].includes(x)) return 'unidad';
  return u.trim().toLowerCase();
}

// Línea tipo "NAME QTY UNIT RECETA" o "NAME QTY UNIT INSUMO"
const MAIN_COMPONENT = /^([A-Za-z0-9][A-Za-z0-9\s\-\.\*\/]+?)\s+([\d,\.]+)\s*(KG|LT|LITROS?|UNIDAD|UNIDADES?|GRAMOS?|GR|ML|CM|UNI)\s+(RECETA|INSUMO)/i;
// Línea tipo "0,250 KG CORDON INSUMO PECHUGA ELABORACION DEPOSITO"
const SUBRECIPE_COMPONENT = /^([\d,\.]+)\s*(KG|LT|LITROS?|UNIDAD|UNIDADES?|GRAMOS?|GR|ML|CM|UNI)\s+([A-Za-z0-9\s]+?)\s+INSUMO[S]?\s+([A-Za-z0-9\s\.\-]+?)(?:\s+ELABORACION|\s+SALON|\s+DEPOSITO|\s+VERDULERIA|\s+CONGELADOS|\s+QUESO|$)/i;
// "RECETA CORDON X 0,450 KG 1 PORCION" o "RECETA NUGETS X 1 KG 1 PORCION"
const RECETA_HEADER = /^RECETA\s+([A-Za-z0-9\s]+?)(?:\s+X\s+[\d,\.]+\s*(?:KG|LT)?\s*(?:\d+\s*PORCION)?|\s+ENVASADO|\s+UNA\s+VEZ|$)/i;
// "X FAMILIA ELABORACION" o "X FAMILIA PRODUCTO" -> nombre receta X
const RECIPE_NAME_FAMILIA = /^(.+?)\s+FAMILIA\s+(ELABORACION|PRODUCTO)/i;
// "FORMULA X" en VERDURAS
const RECIPE_NAME_FORMULA = /^FORMULA\s+(.+)$/i;

function parseRecetasFromJson(json: { recetas?: Array<{ hoja: string; contenido: string[] }> }): {
  rows: IngredientRow[];
  displayNameByKey: Map<string, string>;
} {
  const rows: IngredientRow[] = [];
  const displayNameByKey = new Map<string, string>();
  const recetas = json.recetas || [];
  for (const { hoja, contenido } of recetas) {
    if (normalizeKey(hoja) === 'LISTADO') continue;
    let currentRecipe = hoja.trim();
    let currentSubRecipe: string | null = null;
    for (const line of contenido) {
      const t = line.trim();
      if (!t) continue;
      const fam = t.match(RECIPE_NAME_FAMILIA);
      if (fam) {
        currentSubRecipe = null;
        currentRecipe = fam[1].trim();
        continue;
      }
      const form = t.match(RECIPE_NAME_FORMULA);
      if (form) {
        currentSubRecipe = null;
        currentRecipe = form[1].trim();
        continue;
      }
      const recH = t.match(RECETA_HEADER);
      if (recH) {
        currentSubRecipe = recH[1].trim();
        continue;
      }
      const sub = t.match(SUBRECIPE_COMPONENT);
      if (sub) {
        const [, qtyStr, unit, subName, ingName] = sub;
        const recipe = (currentSubRecipe || subName).trim();
        const name = ingName.trim();
        if (recipe && name) {
          displayNameByKey.set(normalizeKey(recipe), recipe);
          rows.push({
            recipeName: recipe,
            productName: name,
            qty: parseNum(qtyStr),
            unit: normalizeUnit(unit),
            isRecipe: false,
          });
        }
        continue;
      }
      const main = t.match(MAIN_COMPONENT);
      if (main) {
        const [, name, qtyStr, unit, type] = main;
        const isRecipe = /RECETA/i.test(type);
        if (name.trim()) {
          displayNameByKey.set(normalizeKey(currentRecipe), currentRecipe);
          rows.push({
            recipeName: currentRecipe,
            productName: name.trim(),
            qty: parseNum(qtyStr),
            unit: normalizeUnit(unit),
            isRecipe,
          });
        }
        currentSubRecipe = null;
        continue;
      }
      // "PLATO FAMILIA" después de precio: no cambiamos nombre
      // Líneas con $: ignorar para componentes
    }
  }
  return { rows, displayNameByKey };
}

function buildRecipeMap(rows: IngredientRow[]): Map<string, { productName: string; qty: number; unit: string; isRecipe: boolean }[]> {
  const byRecipe = new Map<string, { productName: string; qty: number; unit: string; isRecipe: boolean }[]>();
  for (const r of rows) {
    const key = normalizeKey(r.recipeName);
    const name = r.productName.trim();
    if (!key || !name || r.qty <= 0) continue;
    const list = byRecipe.get(key) || [];
    const existing = list.find((x) => normalizeKey(x.productName) === normalizeKey(name) && x.unit === r.unit);
    if (existing) {
      existing.qty = Math.max(existing.qty, r.qty);
    } else {
      list.push({ productName: r.productName.trim(), qty: r.qty, unit: r.unit, isRecipe: r.isRecipe });
    }
    byRecipe.set(key, list);
  }
  return byRecipe;
}

async function main() {
  if (!fs.existsSync(SOURCE_JSON)) {
    throw new Error(`No existe el archivo: ${SOURCE_JSON}`);
  }
  const json = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf-8'));
  const { rows, displayNameByKey } = parseRecetasFromJson(json);
  const recipeMap = buildRecipeMap(rows);

  const [recipeCat, insumosCat, users, products, existingRecipes] = await Promise.all([
    prisma.category.findFirst({ where: { slug: 'tipo-receta' }, select: { id: true } }),
    prisma.category.findFirst({ where: { slug: 'tipo-insumos' }, select: { id: true } }),
    prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 }),
    prisma.product.findMany({
      select: { id: true, name: true, sku: true, unit: true, categoryId: true, isSellable: true, isIngredient: true, isProduced: true },
    }),
    prisma.recipe.findMany({
      select: { id: true, name: true, isActive: true, createdById: true },
      where: { isActive: true },
    }),
  ]);

  if (!recipeCat || !insumosCat) throw new Error('Faltan categorías tipo-receta o tipo-insumos.');
  if (!users.length) throw new Error('No hay usuarios.');

  const recipeCategoryId = recipeCat.id;
  const insumosCategoryId = insumosCat.id;
  const userId = users[0].id;
  const productByKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const usedSkus = new Set(products.map((p) => p.sku));
  const recipesByKey = new Map(existingRecipes.map((r) => [normalizeKey(r.name), r]));

  function sku(name: string): string {
    const base = normalizeKey(name).replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'RECETA';
    let candidate = base;
    let n = 1;
    while (usedSkus.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    usedSkus.add(candidate);
    return candidate;
  }

  async function ensureProduct(name: string, isRecipe: boolean, unit: string): Promise<{ id: string; name: string; sku: string; unit: string; categoryId: string }> {
    const key = normalizeKey(name);
    const existing = productByKey.get(key);
    if (existing) return existing;
    if (DRY_RUN) {
      const dryProduct = { id: `dry-${usedSkus.size}`, name: name.trim(), sku: sku(name), unit, categoryId: isRecipe ? recipeCategoryId : insumosCategoryId } as any;
      productByKey.set(key, dryProduct);
      return dryProduct;
    }
    const created = await prisma.product.create({
      data: {
        name: name.trim(),
        sku: sku(name),
        categoryId: isRecipe ? recipeCategoryId : insumosCategoryId,
        unit,
        isSellable: isRecipe,
        isIngredient: true,
        isProduced: isRecipe,
        isActive: true,
        avgCost: 0,
        lastCost: 0,
        salePrice: 0,
      },
    });
    productByKey.set(key, created);
    return created;
  }

  let created = 0;
  let updated = 0;
  const sortedNames = [...recipeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [normName, ingredients] of sortedNames) {
    if (ingredients.length === 0) continue;
    const displayName = displayNameByKey.get(normName) || (() => {
      const e = json.recetas?.find((r: any) => normalizeKey(r.hoja) === normName);
      return e?.hoja?.trim() || normName;
    })();

    const recipeProduct = await ensureProduct(displayName, true, 'unidad');
    if (!recipeProduct) continue;
    const ingredientRows: Array<{ productId: string; qtyPerYield: number; unit: string; sortOrder: number }> = [];
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      const product = await ensureProduct(ing.productName, ing.isRecipe, ing.unit);
      if (!product) continue;
      ingredientRows.push({
        productId: product.id,
        qtyPerYield: ing.qty,
        unit: ing.unit,
        sortOrder: i,
      });
    }

    const existing = recipesByKey.get(normName);
    const baseData = {
      name: displayName,
      description: 'Cargada desde recetas_extraidas_con_precios.json',
      category: null as string | null,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: recipeProduct.id,
      isActive: true,
      createdById: existing?.createdById ?? userId,
    };

    if (existing) {
      if (!DRY_RUN) {
        await prisma.recipe.update({
          where: { id: existing.id },
          data: { ...baseData, ingredients: { deleteMany: {}, create: ingredientRows } },
        });
      }
      updated++;
    } else {
      if (!DRY_RUN) {
        await prisma.recipe.create({
          data: { ...baseData, createdById: userId, ingredients: { create: ingredientRows } },
        });
      }
      created++;
    }
  }

  console.log('Modo:', DRY_RUN ? 'DRY RUN' : 'EJECUCIÓN REAL');
  console.log('Archivo:', SOURCE_JSON);
  console.log('Recetas con ingredientes:', recipeMap.size);
  console.log('Recetas nuevas:', created);
  console.log('Recetas actualizadas:', updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
