/**
 * Carga productos_ideas.json en la base de datos.
 * - Solo agrega productos que NO existan (por nombre).
 * - Crea stock en TODOS los locales activos (precio 0).
 * - Crea categorías si no existen.
 *
 * Uso: desde apps/api
 *   PRODUCTOS_IDEAS_JSON=/ruta/a/productos_ideas.json npm run prisma:load-productos-ideas
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

interface ProductoIdea {
  descripcion: string;
  categoria: string;
  familia: string;
}

function slug(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'sin-nombre';
}

async function main() {
  const jsonPath =
    process.env.PRODUCTOS_IDEAS_JSON ||
    path.join(process.cwd(), 'prisma', 'data', 'productos_ideas.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No se encontró el archivo:', jsonPath);
    console.error('Definí PRODUCTOS_IDEAS_JSON o colocá productos_ideas.json en prisma/data/');
    process.exit(1);
  }
  const productos: ProductoIdea[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('Productos en JSON:', productos.length);

  // 1) Obtener nombres de productos existentes
  const existingProducts = await prisma.product.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existingProducts.map((p) => p.name.toUpperCase().trim()));
  console.log('Productos existentes en DB:', existingNames.size);

  // 2) Filtrar solo los nuevos
  const nuevos = productos.filter((p) => !existingNames.has(p.descripcion.toUpperCase().trim()));
  console.log('Productos nuevos a agregar:', nuevos.length);

  if (nuevos.length === 0) {
    console.log('No hay productos nuevos. Nada que hacer.');
    return;
  }

  // 3) Crear categorías (tipo) si no existen
  const categorias = new Set(nuevos.map((p) => p.categoria));
  const categoryByKey = new Map<string, string>();
  for (const valor of categorias) {
    const slugCat = `tipo-${slug(valor)}`;
    let cat = await prisma.category.findFirst({ where: { slug: slugCat } });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: `Tipo: ${valor}`, slug: slugCat, isActive: true },
      });
      console.log('  Categoría creada:', cat.name);
    }
    categoryByKey.set(valor, cat.id);
  }

  // 4) Crear categorías (familia) si no existen
  const familias = new Set(nuevos.map((p) => p.familia).filter(Boolean));
  for (const valor of familias) {
    const slugCat = `familia-${slug(valor)}`;
    let cat = await prisma.category.findFirst({ where: { slug: slugCat } });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: `Familia: ${valor}`, slug: slugCat, isActive: true },
      });
      console.log('  Categoría creada (familia):', cat.name);
    }
  }

  // 5) Obtener todos los locales activos
  const locations = await prisma.location.findMany({ where: { isActive: true } });
  console.log('Locales activos:', locations.length);

  // 6) Obtener el último SKU PROD-XXX para continuar la secuencia
  const allProducts = await prisma.product.findMany({ select: { sku: true } });
  let maxNum = 0;
  for (const p of allProducts) {
    const match = p.sku.match(/^PROD-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  console.log('Último SKU PROD-XXX:', maxNum > 0 ? `PROD-${maxNum}` : 'ninguno');

  // 7) Crear productos y stock
  let created = 0;
  let stockCreated = 0;
  const BATCH = 100;

  for (let i = 0; i < nuevos.length; i += BATCH) {
    const chunk = nuevos.slice(i, i + BATCH);
    for (const p of chunk) {
      const categoryId = categoryByKey.get(p.categoria);
      if (!categoryId) {
        console.warn('Sin categoría para', p.descripcion);
        continue;
      }

      maxNum++;
      const sku = `PROD-${String(maxNum).padStart(3, '0')}`;
      const nameTrim = p.descripcion.trim();

      const product = await prisma.product.create({
        data: {
          sku,
          name: nameTrim,
          categoryId,
          familia: p.familia?.trim() || null,
          unit: 'unidad',
          salePrice: 0,
          isSellable: true,
          isIngredient: true,
        },
      });
      created++;

      // Crear stock en todos los locales
      for (const loc of locations) {
        await prisma.stockLevel.create({
          data: {
            productId: product.id,
            locationId: loc.id,
            quantity: 0,
            minQuantity: 0,
            salePrice: 0,
          },
        });
        stockCreated++;
      }
    }
    console.log('  Procesados', Math.min(i + BATCH, nuevos.length), '/', nuevos.length);
  }

  console.log('\n✅ Productos creados:', created);
  console.log('✅ Niveles de stock creados:', stockCreated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
