/**
 * Carga recetas_cocina.json en la base de datos.
 * Estructura: platos con componentes y sub-recetas anidadas.
 *
 * Uso: desde apps/api
 *   RECETAS_COCINA_JSON=/ruta/a/recetas_cocina.json npm run prisma:load-recetas-cocina
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

interface Ingrediente {
  insumo: string;
  cantidad: number;
  unidad: string;
  area_elaboracion?: string;
}

interface SubReceta {
  nombre: string;
  ingredientes: Ingrediente[];
}

interface ComponentePlato {
  ingrediente: string;
  cantidad: number;
  unidad: string;
  es_receta: boolean;
}

interface Plato {
  nombre_plato: string;
  precios?: Record<string, number>;
  componentes_plato: ComponentePlato[];
  sub_recetas: SubReceta[];
}

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

async function main() {
  const jsonPath =
    process.env.RECETAS_COCINA_JSON ||
    path.join(process.cwd(), 'prisma', 'data', 'recetas_cocina.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No se encontró el archivo:', jsonPath);
    process.exit(1);
  }

  const platos: Plato[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('Total platos:', platos.length);

  // Obtener usuario admin
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    console.error('No se encontró un usuario admin.');
    process.exit(1);
  }

  // Obtener productos existentes
  const existingProducts = await prisma.product.findMany({ select: { id: true, name: true } });
  const productByName = new Map(existingProducts.map((p) => [p.name.toUpperCase().trim(), p.id]));

  // Obtener categorías
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

  // Obtener último SKU
  const allSkus = await prisma.product.findMany({ select: { sku: true } });
  let maxSku = 0;
  for (const p of allSkus) {
    const m = p.sku.match(/^PROD-(\d+)$/);
    if (m) maxSku = Math.max(maxSku, parseInt(m[1], 10));
  }

  // Obtener locales activos para crear stock
  const locations = await prisma.location.findMany({ where: { isActive: true } });

  // Función para obtener o crear producto
  async function getOrCreateProduct(name: string, isRecipe: boolean): Promise<string> {
    const key = name.toUpperCase().trim();
    let productId = productByName.get(key);
    if (!productId) {
      maxSku++;
      const sku = `PROD-${String(maxSku).padStart(3, '0')}`;
      const newProduct = await prisma.product.create({
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
      productId = newProduct.id;
      productByName.set(key, productId);
      // Crear stock en todos los locales
      for (const loc of locations) {
        await prisma.stockLevel.create({
          data: { productId, locationId: loc.id, quantity: 0, minQuantity: 0, salePrice: 0 },
        });
      }
      console.log('  Producto creado:', sku, name);
    }
    return productId;
  }

  // Función para obtener o crear receta
  async function getOrCreateRecipe(name: string, category: string): Promise<string> {
    let recipe = await prisma.recipe.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (!recipe) {
      const productId = await getOrCreateProduct(name, true);
      recipe = await prisma.recipe.create({
        data: {
          name: name.trim(),
          category,
          yieldQty: 1,
          yieldUnit: 'unidad',
          productId,
          createdById: adminUser!.id,
          isActive: true,
        },
      });
      console.log('  Receta creada:', name);
    }
    return recipe.id;
  }

  let recetasCreadas = 0;
  let ingredientesCreados = 0;

  for (const plato of platos) {
    console.log('\n=== Procesando plato:', plato.nombre_plato, '===');

    // 1) Crear sub-recetas primero
    for (const subReceta of plato.sub_recetas || []) {
      const recipeId = await getOrCreateRecipe(subReceta.nombre, 'COCINA');

      // Verificar si ya tiene ingredientes
      const existingIngredients = await prisma.recipeIngredient.count({ where: { recipeId } });
      if (existingIngredients > 0) {
        console.log('    Sub-receta ya tiene ingredientes:', subReceta.nombre);
        continue;
      }

      // Agregar ingredientes
      for (let i = 0; i < (subReceta.ingredientes || []).length; i++) {
        const ing = subReceta.ingredientes[i];
        const productId = await getOrCreateProduct(ing.insumo, false);
        await prisma.recipeIngredient.create({
          data: {
            recipeId,
            productId,
            qtyPerYield: ing.cantidad,
            unit: normalizeUnit(ing.unidad),
            sortOrder: i,
          },
        });
        ingredientesCreados++;
      }
      recetasCreadas++;
    }

    // 2) Crear receta del plato principal
    const platoRecipeId = await getOrCreateRecipe(plato.nombre_plato, 'PLATO');

    // Verificar si ya tiene ingredientes
    const existingPlatoIngredients = await prisma.recipeIngredient.count({
      where: { recipeId: platoRecipeId },
    });
    if (existingPlatoIngredients > 0) {
      console.log('  Plato ya tiene ingredientes');
      continue;
    }

    // Agregar componentes del plato
    for (let i = 0; i < (plato.componentes_plato || []).length; i++) {
      const comp = plato.componentes_plato[i];
      if (!comp.ingrediente) continue;
      const productId = await getOrCreateProduct(comp.ingrediente, comp.es_receta);
      await prisma.recipeIngredient.create({
        data: {
          recipeId: platoRecipeId,
          productId,
          qtyPerYield: comp.cantidad ?? 0,
          unit: normalizeUnit(comp.unidad),
          sortOrder: i,
        },
      });
      ingredientesCreados++;
    }
    recetasCreadas++;
  }

  console.log('\n✅ Recetas creadas/actualizadas:', recetasCreadas);
  console.log('✅ Ingredientes creados:', ingredientesCreados);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
