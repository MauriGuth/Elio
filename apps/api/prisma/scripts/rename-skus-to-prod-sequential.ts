/**
 * Renombra todos los SKU de productos al formato PROD-001, PROD-002, etc.
 * Orden: por nombre del producto (A–Z).
 * Requiere dos pasadas para no violar la restricción unique de sku.
 *
 * Uso: desde apps/api
 *   npm run prisma:rename-skus
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function padNum(n: number, minDigits = 3): string {
  return String(n).padStart(minDigits, '0');
}

async function main() {
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, sku: true },
  });

  console.log('Productos a actualizar:', products.length);
  if (products.length === 0) {
    console.log('No hay productos.');
    return;
  }

  // 1) Asignar SKU temporales para evitar colisiones con PROD-xxx
  const tmpPrefix = 'PROD-TMP-';
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const tmpSku = tmpPrefix + padNum(i + 1, 6);
    await prisma.product.update({
      where: { id: p.id },
      data: { sku: tmpSku },
    });
  }
  console.log('Paso 1: SKU temporales asignados.');

  // 2) Asignar SKU definitivos PROD-001, PROD-002, ...
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const newSku = 'PROD-' + padNum(i + 1);
    await prisma.product.update({
      where: { id: p.id },
      data: { sku: newSku },
    });
  }
  console.log('Paso 2: SKU definitivos asignados (PROD-001, PROD-002, ...).');
  console.log('\n✅ Listo. Ejemplos:', products.slice(0, 3).map((p, i) => `PROD-${padNum(i + 1)} (${p.name})`).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
