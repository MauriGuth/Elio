/**
 * Repara recetas de gastronomía usando uno o más JSON fuente.
 * - Crea recetas faltantes
 * - Agrega productos faltantes
 * - Sincroniza ingredientes según la mejor definición encontrada
 * - Elimina autorreferencias y duplicados
 *
 * Uso:
 *   RECETAS_GASTRO_JSONS=/ruta/a/a.json,/ruta/a/b.json npm run prisma:repair-recetas-gastro
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

type RawIngredient = {
  insumo?: string | null;
  ingrediente?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  tipo?: string | null;
  es_receta?: boolean | null;
};

type RawSubRecipe = {
  nombre?: string | null;
  ingredientes?: RawIngredient[];
};

type RawDish = {
  nombre_plato?: string | null;
  componentes?: RawIngredient[];
  sub_recetas?: RawSubRecipe[];
};

type CanonicalIngredient = {
  name: string;
  qty: number;
  unit: string;
  isRecipe: boolean;
};

type CandidateRecipe = {
  name: string;
  ingredients: CanonicalIngredient[];
  sourcePriority: number;
};

function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return 'unidad';
  const u = unit.toUpperCase().trim();
  if (u === 'LT' || u === 'L' || u === 'LITRO' || u === 'LITROS') return 'litro';
  if (u === 'KG' || u === 'KILO' || u === 'KILOS' || u === 'KILOGRAMO') return 'kg';
  if (u === 'GR' || u === 'G' || u === 'GRAMO' || u === 'GRAMOS') return 'gramo';
  if (u === 'ML' || u === 'MILILITRO' || u === 'MILILITROS') return 'ml';
  if (u === 'UN' || u === 'UNIDAD' || u === 'UNIDADES' || u === 'U') return 'unidad';
  return 'unidad';
}

function normalizeKey(value: string): string {
  return value.trim().toUpperCase();
}

function extractRecipeName(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(' - ').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : raw;
}

function isInvalidRecipeName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (/^[0-9.,\s]+(KG|LT|ML|GR)?$/i.test(trimmed)) return true;

  const invalidExact = new Set([
    'LISTADO RECETAS',
    'PLATO',
    'VASO',
    'SIN COCCION',
    'PRESENTACION PLATO',
  ]);

  return invalidExact.has(trimmed.toUpperCase());
}

function sanitizeIngredients(recipeName: string, ingredients: RawIngredient[] | undefined): CanonicalIngredient[] {
  const recipeKey = normalizeKey(recipeName);
  const seen = new Set<string>();
  const result: CanonicalIngredient[] = [];

  for (const ingredient of ingredients ?? []) {
    const rawName = (ingredient.insumo ?? ingredient.ingrediente ?? '').trim();
    if (!rawName) continue;
    if (isInvalidRecipeName(rawName)) continue;

    const ingredientKey = normalizeKey(rawName);
    if (ingredientKey === recipeKey) continue;
    if (seen.has(ingredientKey)) continue;
    seen.add(ingredientKey);

    result.push({
      name: rawName,
      qty: ingredient.cantidad ?? 0,
      unit: normalizeUnit(ingredient.unidad),
      isRecipe: (ingredient.tipo ?? '').toUpperCase() === 'RECETA' || ingredient.es_receta === true,
    });
  }

  return result;
}

function chooseBetterCandidate(current: CandidateRecipe | undefined, next: CandidateRecipe): CandidateRecipe {
  if (!current) return next;
  if (next.ingredients.length > current.ingredients.length) return next;
  if (next.ingredients.length === current.ingredients.length && next.sourcePriority >= current.sourcePriority) {
    return next;
  }
  return current;
}

async function main() {
  const rawPaths =
    process.env.RECETAS_GASTRO_JSONS ||
    [
      path.join(process.cwd(), 'prisma', 'data', 'recetas_gastronomia_local.json'),
      path.join(process.cwd(), 'prisma', 'data', 'recetas_gastronomia_local_1.json'),
      path.join(process.cwd(), 'prisma', 'data', 'recetas_gastronomia_local_2.json'),
    ].join(',');

  const jsonPaths = rawPaths
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((filePath) => fs.existsSync(filePath));

  if (jsonPaths.length === 0) {
    console.error('No se encontraron JSON para reparar recetas de gastronomía.');
    process.exit(1);
  }

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    console.error('No se encontró un usuario admin.');
    process.exit(1);
  }

  let recetaCategory = await prisma.category.findFirst({ where: { slug: 'tipo-receta' } });
  if (!recetaCategory) {
    recetaCategory = await prisma.category.create({
      data: { name: 'Tipo: RECETA', slug: 'tipo-receta', isActive: true },
    });
  }

  let insumoCategory = await prisma.category.findFirst({ where: { slug: 'tipo-insumos' } });
  if (!insumoCategory) {
    insumoCategory = await prisma.category.create({
      data: { name: 'Tipo: INSUMOS', slug: 'tipo-insumos', isActive: true },
    });
  }

  const locations = await prisma.location.findMany({ where: { isActive: true } });

  const existingProducts = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
  const productByName = new Map(existingProducts.map((product) => [normalizeKey(product.name), product.id]));

  const allSkus = await prisma.product.findMany({ select: { sku: true } });
  let maxSku = 0;
  for (const product of allSkus) {
    const match = product.sku.match(/^PROD-(\d+)$/);
    if (match) maxSku = Math.max(maxSku, parseInt(match[1], 10));
  }

  async function getOrCreateProduct(name: string, isRecipe: boolean): Promise<string> {
    const key = normalizeKey(name);
    let productId = productByName.get(key);

    if (!productId) {
      maxSku++;
      const sku = `PROD-${String(maxSku).padStart(3, '0')}`;
      const created = await prisma.product.create({
        data: {
          sku,
          name: name.trim(),
          categoryId: isRecipe ? recetaCategory!.id : insumoCategory!.id,
          unit: 'unidad',
          salePrice: 0,
          isSellable: isRecipe,
          isIngredient: !isRecipe,
        },
      });

      productId = created.id;
      productByName.set(key, productId);

      for (const location of locations) {
        await prisma.stockLevel.create({
          data: {
            productId,
            locationId: location.id,
            quantity: 0,
            minQuantity: 0,
            salePrice: 0,
          },
        });
      }
    }

    return productId;
  }

  const expectedRecipes = new Map<string, CandidateRecipe>();

  jsonPaths.forEach((jsonPath, index) => {
    const dishes: RawDish[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const sourcePriority = index;

    for (const dish of dishes) {
      const dishName = extractRecipeName(dish.nombre_plato);
      const components = dish.componentes ?? [];
      const subRecipes = dish.sub_recetas ?? [];

      if (!isInvalidRecipeName(dishName) && components.length > 0) {
        const candidate: CandidateRecipe = {
          name: dishName,
          ingredients: sanitizeIngredients(dishName, components),
          sourcePriority,
        };
        if (candidate.ingredients.length > 0) {
          expectedRecipes.set(
            normalizeKey(dishName),
            chooseBetterCandidate(expectedRecipes.get(normalizeKey(dishName)), candidate)
          );
        }
      }

      const elaborationIngredients = subRecipes
        .filter((subRecipe) => (subRecipe.nombre ?? '').toUpperCase().includes('ELABORACION'))
        .flatMap((subRecipe) => subRecipe.ingredientes ?? []);

      if (!isInvalidRecipeName(dishName) && components.length === 0 && elaborationIngredients.length > 0) {
        const candidate: CandidateRecipe = {
          name: dishName,
          ingredients: sanitizeIngredients(dishName, elaborationIngredients),
          sourcePriority,
        };
        if (candidate.ingredients.length > 0) {
          expectedRecipes.set(
            normalizeKey(dishName),
            chooseBetterCandidate(expectedRecipes.get(normalizeKey(dishName)), candidate)
          );
        }
      }

      for (const subRecipe of subRecipes) {
        const recipeName = extractRecipeName(subRecipe.nombre);
        if (isInvalidRecipeName(recipeName)) continue;

        const candidate: CandidateRecipe = {
          name: recipeName,
          ingredients: sanitizeIngredients(recipeName, subRecipe.ingredientes),
          sourcePriority,
        };

        if (candidate.ingredients.length === 0) continue;

        expectedRecipes.set(
          normalizeKey(recipeName),
          chooseBetterCandidate(expectedRecipes.get(normalizeKey(recipeName)), candidate)
        );
      }
    }
  });

  let recipesCreated = 0;
  let recipesUpdated = 0;
  let ingredientsCreated = 0;
  let ingredientsUpdated = 0;
  let ingredientsDeleted = 0;

  for (const [, expectedRecipe] of expectedRecipes) {
    let recipe = await prisma.recipe.findFirst({
      where: { name: { equals: expectedRecipe.name, mode: 'insensitive' } },
      include: {
        ingredients: {
          include: { product: { select: { id: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!recipe) {
      const recipeProductId = await getOrCreateProduct(expectedRecipe.name, true);
      recipe = await prisma.recipe.create({
        data: {
          name: expectedRecipe.name,
          category: 'GASTRONOMIA',
          yieldQty: 1,
          yieldUnit: 'unidad',
          productId: recipeProductId,
          createdById: adminUser.id,
          isActive: true,
        },
        include: { ingredients: { include: { product: true } } },
      });
      recipesCreated++;
    }

    const expectedByName = new Map(expectedRecipe.ingredients.map((ingredient) => [normalizeKey(ingredient.name), ingredient]));
    const keptByIngredientName = new Set<string>();

    for (const ingredient of recipe.ingredients) {
      const ingredientName = ingredient.product?.name ?? '';
      const ingredientKey = normalizeKey(ingredientName);
      const expected = expectedByName.get(ingredientKey);

      if (!expected || keptByIngredientName.has(ingredientKey)) {
        await prisma.recipeIngredient.delete({ where: { id: ingredient.id } });
        ingredientsDeleted++;
        continue;
      }

      keptByIngredientName.add(ingredientKey);
    }

    const refreshedIngredients = await prisma.recipeIngredient.findMany({
      where: { recipeId: recipe.id },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const currentByName = new Map(refreshedIngredients.map((ingredient) => [normalizeKey(ingredient.product.name), ingredient]));

    let touchedRecipe = false;

    for (let i = 0; i < expectedRecipe.ingredients.length; i++) {
      const expected = expectedRecipe.ingredients[i];
      const expectedKey = normalizeKey(expected.name);
      const current = currentByName.get(expectedKey);

      if (!current) {
        const productId = await getOrCreateProduct(expected.name, expected.isRecipe);
        await prisma.recipeIngredient.create({
          data: {
            recipeId: recipe.id,
            productId,
            qtyPerYield: expected.qty,
            unit: expected.unit,
            sortOrder: i,
          },
        });
        ingredientsCreated++;
        touchedRecipe = true;
        continue;
      }

      if (
        current.qtyPerYield !== expected.qty ||
        current.unit !== expected.unit ||
        current.sortOrder !== i
      ) {
        await prisma.recipeIngredient.update({
          where: { id: current.id },
          data: {
            qtyPerYield: expected.qty,
            unit: expected.unit,
            sortOrder: i,
          },
        });
        ingredientsUpdated++;
        touchedRecipe = true;
      }
    }

    if (touchedRecipe || refreshedIngredients.length !== expectedRecipe.ingredients.length) {
      recipesUpdated++;
    }
  }

  console.log('JSON procesados:', jsonPaths.length);
  console.log('Recetas esperadas:', expectedRecipes.size);
  console.log('✅ Recetas creadas:', recipesCreated);
  console.log('✅ Recetas corregidas:', recipesUpdated);
  console.log('✅ Ingredientes creados:', ingredientsCreated);
  console.log('✅ Ingredientes actualizados:', ingredientsUpdated);
  console.log('✅ Ingredientes eliminados:', ingredientsDeleted);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
