/**
 * Carga recetas_bebidas_barra.json en la base de datos.
 * - Agrupa ingredientes por producto para crear recetas.
 * - Busca o crea los productos/insumos necesarios.
 * - Crea las recetas y sus ingredientes.
 *
 * Uso: desde apps/api
 *   RECETAS_JSON=/ruta/a/recetas_bebidas_barra.json npm run prisma:load-recetas-bebidas
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

interface RecetaDetalle {
  producto: string;
  familia_producto: string | null;
  insumo: string;
  cantidad: number;
  unidad: string;
  familia_insumo: string | null;
}

interface RecetaAgrupada {
  nombre: string;
  familia: string | null;
  ingredientes: Array<{
    insumo: string;
    cantidad: number;
    unidad: string;
  }>;
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
    process.env.RECETAS_JSON ||
    path.join(process.cwd(), 'prisma', 'data', 'recetas_bebidas_barra.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No se encontró el archivo:', jsonPath);
    console.error('Definí RECETAS_JSON o colocá el archivo en prisma/data/');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const items: RecetaDetalle[] = rawData.recetas_detalle || rawData;
  console.log('Total ingredientes en JSON:', items.length);

  // 1) Agrupar por producto (receta)
  const recetasMap = new Map<string, RecetaAgrupada>();
  for (const item of items) {
    const key = item.producto.toUpperCase().trim();
    if (!recetasMap.has(key)) {
      recetasMap.set(key, {
        nombre: item.producto.trim(),
        familia: item.familia_producto,
        ingredientes: [],
      });
    }
    recetasMap.get(key)!.ingredientes.push({
      insumo: item.insumo.trim(),
      cantidad: item.cantidad,
      unidad: item.unidad,
    });
  }
  console.log('Recetas únicas:', recetasMap.size);

  // 2) Obtener usuario admin para createdById
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });
  if (!adminUser) {
    console.error('No se encontró un usuario admin. Creá uno primero.');
    process.exit(1);
  }
  console.log('Usuario admin:', adminUser.email);

  // 3) Obtener todos los productos existentes
  const existingProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });
  const productByName = new Map(
    existingProducts.map((p) => [p.name.toUpperCase().trim(), p.id])
  );
  console.log('Productos en DB:', productByName.size);

  // 4) Obtener categoría "Tipo: RECETA" o crearla
  let recetaCategory = await prisma.category.findFirst({
    where: { slug: 'tipo-receta' },
  });
  if (!recetaCategory) {
    recetaCategory = await prisma.category.create({
      data: { name: 'Tipo: RECETA', slug: 'tipo-receta', isActive: true },
    });
    console.log('Categoría RECETA creada');
  }

  // 5) Obtener categoría "Tipo: INSUMOS" o crearla
  let insumoCategory = await prisma.category.findFirst({
    where: { slug: 'tipo-insumos' },
  });
  if (!insumoCategory) {
    insumoCategory = await prisma.category.create({
      data: { name: 'Tipo: INSUMOS', slug: 'tipo-insumos', isActive: true },
    });
    console.log('Categoría INSUMOS creada');
  }

  // 6) Obtener último SKU para nuevos productos
  const allSkus = await prisma.product.findMany({ select: { sku: true } });
  let maxSku = 0;
  for (const p of allSkus) {
    const m = p.sku.match(/^PROD-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSku) maxSku = n;
    }
  }

  // 7) Función para obtener o crear producto
  async function getOrCreateProduct(
    name: string,
    categoryId: string,
    familia?: string | null
  ): Promise<string> {
    const key = name.toUpperCase().trim();
    let productId = productByName.get(key);
    if (!productId) {
      maxSku++;
      const sku = `PROD-${String(maxSku).padStart(3, '0')}`;
      const newProduct = await prisma.product.create({
        data: {
          sku,
          name: name.trim(),
          categoryId,
          familia: familia?.trim() || null,
          unit: 'unidad',
          salePrice: 0,
          isSellable: false,
          isIngredient: true,
        },
      });
      productId = newProduct.id;
      productByName.set(key, productId);
      console.log('  Producto creado:', sku, name);
    }
    return productId;
  }

  // 8) Procesar recetas
  let recetasCreadas = 0;
  let recetasExistentes = 0;
  let ingredientesCreados = 0;
  let productosCreados = 0;

  const initialProductCount = productByName.size;

  for (const [, receta] of recetasMap) {
    // Verificar si la receta ya existe
    const existingRecipe = await prisma.recipe.findFirst({
      where: { name: { equals: receta.nombre, mode: 'insensitive' } },
    });

    if (existingRecipe) {
      recetasExistentes++;
      continue;
    }

    // Obtener o crear el producto de la receta
    const recipeProductId = await getOrCreateProduct(
      receta.nombre,
      recetaCategory.id,
      receta.familia
    );

    // Crear la receta
    const newRecipe = await prisma.recipe.create({
      data: {
        name: receta.nombre,
        category: receta.familia || 'BEBIDAS',
        yieldQty: 1,
        yieldUnit: 'unidad',
        productId: recipeProductId,
        createdById: adminUser.id,
        isActive: true,
      },
    });
    recetasCreadas++;

    // Crear ingredientes
    for (let i = 0; i < receta.ingredientes.length; i++) {
      const ing = receta.ingredientes[i];

      // Obtener o crear el producto del insumo
      const ingredientProductId = await getOrCreateProduct(
        ing.insumo,
        insumoCategory.id,
        null
      );

      await prisma.recipeIngredient.create({
        data: {
          recipeId: newRecipe.id,
          productId: ingredientProductId,
          qtyPerYield: ing.cantidad,
          unit: normalizeUnit(ing.unidad),
          sortOrder: i,
        },
      });
      ingredientesCreados++;
    }
  }

  productosCreados = productByName.size - initialProductCount;

  console.log('\n✅ Recetas creadas:', recetasCreadas);
  console.log('✅ Recetas ya existentes (omitidas):', recetasExistentes);
  console.log('✅ Ingredientes creados:', ingredientesCreados);
  console.log('✅ Productos nuevos creados:', productosCreados);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
