/**
 * Carga productos_dorado.json en la base de datos.
 * - Solo agrega productos que NO existan (por nombre).
 * - Asegura stock en Dorado para TODOS los productos del archivo.
 * - Si etiqueta = "CARTACAFE", también asegura stock en todos los Cafés.
 * - Mantiene stock existente en otros locales (no borra).
 *
 * Uso: desde apps/api
 *   PRODUCTOS_DORADO_JSON=/ruta/a/productos_dorado.json npm run prisma:load-productos-dorado
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

interface ProductoDorado {
  descripcion: string;
  familia: string;
  categoria: string;
  etiqueta: string | null;
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
    process.env.PRODUCTOS_DORADO_JSON ||
    path.join(process.cwd(), 'prisma', 'data', 'productos_dorado.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No se encontró el archivo:', jsonPath);
    console.error('Definí PRODUCTOS_DORADO_JSON o colocá el archivo en prisma/data/');
    process.exit(1);
  }
  const productos: ProductoDorado[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('Productos en JSON:', productos.length);

  // 1) Obtener productos existentes
  const existingProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });
  const existingByName = new Map(existingProducts.map((p) => [p.name.toUpperCase().trim(), p.id]));
  console.log('Productos existentes en DB:', existingByName.size);

  // 2) Obtener locales
  const allLocations = await prisma.location.findMany({ where: { isActive: true } });
  
  const dorado = allLocations.find(
    (l) =>
      l.name.toLowerCase().includes('dorado') || l.slug?.toLowerCase().includes('dorado')
  );
  if (!dorado) {
    console.error('No se encontró el local Dorado. Crealo primero.');
    process.exit(1);
  }
  console.log('Local Dorado:', dorado.name);

  const cafes = allLocations.filter((l) => l.type === 'CAFE');
  console.log('Cafés encontrados:', cafes.length, cafes.map((c) => c.name).join(', '));

  // 3) Crear categorías (tipo) si no existen
  const categorias = new Set(productos.map((p) => p.categoria));
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
  const familias = new Set(productos.map((p) => p.familia).filter(Boolean));
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

  // 5) Obtener el último SKU PROD-XXX para continuar la secuencia
  const allProductsDb = await prisma.product.findMany({ select: { sku: true } });
  let maxNum = 0;
  for (const p of allProductsDb) {
    const match = p.sku.match(/^PROD-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  console.log('Último SKU PROD-XXX:', maxNum > 0 ? `PROD-${maxNum}` : 'ninguno');

  // 6) Procesar productos
  let created = 0;
  let stockCreated = 0;
  let stockUpdated = 0;

  for (const p of productos) {
    const nameTrim = p.descripcion.trim();
    const nameKey = nameTrim.toUpperCase();
    let productId = existingByName.get(nameKey);

    // Si no existe, crear el producto
    if (!productId) {
      const categoryId = categoryByKey.get(p.categoria);
      if (!categoryId) {
        console.warn('Sin categoría para', nameTrim);
        continue;
      }

      maxNum++;
      const sku = `PROD-${String(maxNum).padStart(3, '0')}`;

      const newProduct = await prisma.product.create({
        data: {
          sku,
          name: nameTrim,
          categoryId,
          familia: p.familia?.trim() || null,
          unit: 'unidad',
          salePrice: 0,
          isSellable: true,
          isIngredient: false,
        },
      });
      productId = newProduct.id;
      existingByName.set(nameKey, productId);
      created++;
    }

    // Determinar en qué locales debe tener stock
    const targetLocations: { id: string; name: string }[] = [];

    // Siempre Dorado
    targetLocations.push({ id: dorado.id, name: dorado.name });

    // Si es CARTACAFE, también todos los cafés
    if (p.etiqueta === 'CARTACAFE') {
      for (const cafe of cafes) {
        if (!targetLocations.find((t) => t.id === cafe.id)) {
          targetLocations.push({ id: cafe.id, name: cafe.name });
        }
      }
    }

    // Crear/actualizar stock en los locales objetivo
    for (const loc of targetLocations) {
      const existing = await prisma.stockLevel.findUnique({
        where: { productId_locationId: { productId, locationId: loc.id } },
      });
      if (!existing) {
        await prisma.stockLevel.create({
          data: {
            productId,
            locationId: loc.id,
            quantity: 0,
            minQuantity: 0,
            salePrice: 0,
          },
        });
        stockCreated++;
      } else {
        stockUpdated++;
      }
    }
  }

  console.log('\n✅ Productos nuevos creados:', created);
  console.log('✅ Niveles de stock creados:', stockCreated);
  console.log('✅ Niveles de stock ya existentes:', stockUpdated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
