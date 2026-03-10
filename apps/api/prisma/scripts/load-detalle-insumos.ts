/**
 * Carga detalle_insumos_productos_recetas.json en la base de datos.
 * - Solo agrega productos que NO existan (por nombre).
 * - Crea stock en TODOS los locales activos (precio 0).
 * - Crea proveedores si tienen CUIT y los vincula a los productos.
 *
 * Uso: desde apps/api
 *   DETALLE_INSUMOS_JSON=/ruta/a/detalle_insumos_productos_recetas.json npm run prisma:load-detalle-insumos
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

interface DetalleInsumo {
  descripcion: string;
  categoria: string;
  familia: string;
  agrupar_carta_digital: string | null;
  proveedor: string | null;
  cuit: string | number | null;
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
    process.env.DETALLE_INSUMOS_JSON ||
    path.join(process.cwd(), 'prisma', 'data', 'detalle_insumos_productos_recetas.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('No se encontró el archivo:', jsonPath);
    console.error('Definí DETALLE_INSUMOS_JSON o colocá el archivo en prisma/data/');
    process.exit(1);
  }
  const productos: DetalleInsumo[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log('Productos en JSON:', productos.length);

  // 1) Obtener nombres de productos existentes
  const existingProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });
  const existingByName = new Map(existingProducts.map((p) => [p.name.toUpperCase().trim(), p.id]));
  console.log('Productos existentes en DB:', existingByName.size);

  // 2) Filtrar solo los nuevos
  const nuevos = productos.filter((p) => !existingByName.has(p.descripcion.toUpperCase().trim()));
  console.log('Productos nuevos a agregar:', nuevos.length);

  // 3) Crear/obtener proveedores con CUIT
  const proveedoresConCuit = productos.filter(
    (p) => p.cuit && p.cuit.toString().trim() && p.proveedor && p.proveedor.trim()
  );
  const proveedoresUnicos = new Map<string, { name: string; cuit: string }>();
  for (const p of proveedoresConCuit) {
    const cuit = p.cuit!.toString().trim();
    if (!proveedoresUnicos.has(cuit)) {
      proveedoresUnicos.set(cuit, { name: p.proveedor!.trim(), cuit });
    }
  }
  console.log('Proveedores únicos con CUIT:', proveedoresUnicos.size);

  const supplierByCuit = new Map<string, string>(); // cuit -> supplierId
  for (const [cuit, { name }] of proveedoresUnicos) {
    let supplier = await prisma.supplier.findFirst({ where: { taxId: cuit } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name,
          taxId: cuit,
          address: null,
          paymentMethod: 'TRANSFER',
          isActive: true,
        },
      });
      console.log('  Proveedor creado:', name, '- CUIT:', cuit);
    } else {
      console.log('  Proveedor existente:', supplier.name, '- CUIT:', cuit);
    }
    supplierByCuit.set(cuit, supplier.id);
  }

  if (nuevos.length === 0) {
    console.log('No hay productos nuevos. Verificando vínculos con proveedores...');
    // Vincular productos existentes con proveedores si corresponde
    let linked = 0;
    for (const p of proveedoresConCuit) {
      const productId = existingByName.get(p.descripcion.toUpperCase().trim());
      if (!productId) continue;
      const cuit = p.cuit!.toString().trim();
      const supplierId = supplierByCuit.get(cuit);
      if (!supplierId) continue;
      const existing = await prisma.productSupplier.findFirst({
        where: { productId, supplierId },
      });
      if (!existing) {
        await prisma.productSupplier.create({
          data: { productId, supplierId },
        });
        linked++;
      }
    }
    console.log('Vínculos producto-proveedor creados:', linked);
    return;
  }

  // 4) Crear categorías (tipo) si no existen
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

  // 5) Crear categorías (familia) si no existen
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

  // 6) Obtener todos los locales activos
  const locations = await prisma.location.findMany({ where: { isActive: true } });
  console.log('Locales activos:', locations.length);

  // 7) Obtener el último SKU PROD-XXX para continuar la secuencia
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

  // 8) Crear productos y stock
  let created = 0;
  let stockCreated = 0;
  let supplierLinked = 0;
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

      // Vincular con proveedor si tiene CUIT
      if (p.cuit && p.cuit.toString().trim()) {
        const cuit = p.cuit.toString().trim();
        const supplierId = supplierByCuit.get(cuit);
        if (supplierId) {
          await prisma.productSupplier.create({
            data: { productId: product.id, supplierId },
          });
          supplierLinked++;
        }
      }
    }
    console.log('  Procesados', Math.min(i + BATCH, nuevos.length), '/', nuevos.length);
  }

  // 9) Vincular productos existentes con proveedores si corresponde
  let existingLinked = 0;
  for (const p of proveedoresConCuit) {
    const productId = existingByName.get(p.descripcion.toUpperCase().trim());
    if (!productId) continue;
    const cuit = p.cuit!.toString().trim();
    const supplierId = supplierByCuit.get(cuit);
    if (!supplierId) continue;
    const existing = await prisma.productSupplier.findFirst({
      where: { productId, supplierId },
    });
    if (!existing) {
      await prisma.productSupplier.create({
        data: { productId, supplierId },
      });
      existingLinked++;
    }
  }

  console.log('\n✅ Productos creados:', created);
  console.log('✅ Niveles de stock creados:', stockCreated);
  console.log('✅ Vínculos producto-proveedor (nuevos):', supplierLinked);
  console.log('✅ Vínculos producto-proveedor (existentes):', existingLinked);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
