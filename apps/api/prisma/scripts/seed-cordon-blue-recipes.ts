/**
 * Corrige/agrega la jerarquía de recetas Cordon Blue según planilla:
 * - CORDON (subreceta): PECHUGA, QUESO TYBO, JAMON COCIDO FETA → yield 0,45 kg / 1 porción
 * - EMPANADO DE CORDON (subreceta): HUEVO, HARINA, PANKO → 1 porción
 * - CORDON BLUE (plato): CORDON 0,3 kg + PURE DE PAPAS 0,15 kg + PURE DE ZAPALLO 0,151 kg
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

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

async function main() {
  const [recipeCat, insumosCat, users, products] = await Promise.all([
    prisma.category.findFirst({ where: { slug: 'tipo-receta' }, select: { id: true } }),
    prisma.category.findFirst({ where: { slug: 'tipo-insumos' }, select: { id: true } }),
    prisma.user.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 }),
    prisma.product.findMany({
      select: { id: true, name: true, sku: true, unit: true, categoryId: true },
    }),
  ]);

  if (!recipeCat || !insumosCat) {
    throw new Error('Faltan categorías tipo-receta o tipo-insumos.');
  }
  if (!users.length) {
    throw new Error('No hay usuarios.');
  }

  const recipeCategoryId = recipeCat.id;
  const insumosCategoryId = insumosCat.id;
  const userId = users[0].id;
  const productByKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const usedSkus = new Set(products.map((p) => p.sku));

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

  async function ensureProduct(name: string, isRecipe: boolean, unit: string) {
    const key = normalizeKey(name);
    let p = productByKey.get(key);
    if (p) return p;
    p = await prisma.product.create({
      data: {
        name,
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
    productByKey.set(key, p);
    return p;
  }

  async function upsertRecipe(
    name: string,
    yieldQty: number,
    yieldUnit: string,
    ingredients: Array<{ productName: string; qty: number; unit: string; isRecipe?: boolean }>,
  ) {
    const recipeProduct = await ensureProduct(name, true, yieldUnit === 'kg' ? 'kg' : 'unidad');
    const existing = await prisma.recipe.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
      select: { id: true, createdById: true },
    });

    const ingredientRows: Array<{ productId: string; qtyPerYield: number; unit: string; sortOrder: number }> = [];
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      const product = await ensureProduct(ing.productName, ing.isRecipe ?? false, ing.unit);
      ingredientRows.push({
        productId: product.id,
        qtyPerYield: ing.qty,
        unit: ing.unit,
        sortOrder: i,
      });
    }

    const baseData = {
      name,
      description: 'Cordon Blue – según planilla (subrecetas CORDON y EMPANADO DE CORDON).',
      category: 'CORDON BLUE',
      yieldQty,
      yieldUnit,
      productId: recipeProduct.id,
      isActive: true,
      createdById: existing?.createdById ?? userId,
    };

    if (existing) {
      await prisma.recipe.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          ingredients: { deleteMany: {}, create: ingredientRows },
        },
      });
      console.log('Actualizada receta:', name);
    } else {
      await prisma.recipe.create({
        data: {
          ...baseData,
          createdById: userId,
          ingredients: { create: ingredientRows },
        },
      });
      console.log('Creada receta:', name);
    }
  }

  // 1) CORDON: 1 porción = 0,45 kg. Insumos: PECHUGA 0,25 kg, QUESO TYBO 0,04 kg, JAMON COCIDO FETA 0,028 kg
  await upsertRecipe('CORDON', 0.45, 'kg', [
    { productName: 'PECHUGA', qty: 0.25, unit: 'kg', isRecipe: false },
    { productName: 'QUESO TYBO', qty: 0.04, unit: 'kg', isRecipe: false },
    { productName: 'JAMON COCIDO FETA', qty: 0.028, unit: 'kg', isRecipe: false },
  ]);

  // 2) EMPANADO DE CORDON: 1 porción. Insumos: HUEVO 0,05 kg, HARINA 0,05 kg, PANKO 0,05 kg
  await upsertRecipe('EMPANADO DE CORDON', 1, 'unidad', [
    { productName: 'HUEVO', qty: 0.05, unit: 'kg', isRecipe: false },
    { productName: 'HARINA', qty: 0.05, unit: 'kg', isRecipe: false },
    { productName: 'PANKO', qty: 0.05, unit: 'kg', isRecipe: false },
  ]);

  // 3) CORDON BLUE: CORDON 0,3 kg + PURE DE PAPAS 0,15 kg + PURE DE ZAPALLO 0,151 kg
  await upsertRecipe('CORDON BLUE', 1, 'unidad', [
    { productName: 'CORDON', qty: 0.3, unit: 'kg', isRecipe: true },
    { productName: 'PURE DE PAPAS', qty: 0.15, unit: 'kg', isRecipe: true },
    { productName: 'PURE DE ZAPALLO', qty: 0.151, unit: 'kg', isRecipe: true },
  ]);

  console.log('Listo: CORDON, EMPANADO DE CORDON y CORDON BLUE corregidas/agregadas.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
