/**
 * Renombra solo los productos/recetas de la carta clásica (sin borrar datos).
 * Útil si ya cargaste el seed con nombres viejos.
 *
 * cd apps/api && npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/scripts/rename-clasico-carta-products.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const MAP: Array<{ sku: string; productName: string; recipeName: string }> = [
  { sku: 'CARTA-POCILLO', productName: 'CLASICO POCILLO', recipeName: 'RECETA CLASICO POCILLO' },
  { sku: 'CARTA-JARRITO', productName: 'CLASICO JARRITO', recipeName: 'RECETA CLASICO JARRITO' },
  { sku: 'CARTA-DOBLE', productName: 'CLASICO DOBLE', recipeName: 'RECETA CLASICO DOBLE' },
  { sku: 'CARTA-TAZON', productName: 'CLASICO TAZON', recipeName: 'RECETA CLASICO TAZON' },
];

async function main() {
  for (const row of MAP) {
    const r = await prisma.product.updateMany({
      where: { sku: row.sku },
      data: { name: row.productName, description: 'Carta café — elegí preparación en el POS.' },
    });
    if (r.count === 0) {
      console.log(`(omitido) No existe producto ${row.sku}`);
      continue;
    }
    const p = await prisma.product.findUnique({ where: { sku: row.sku } });
    if (p) {
      await prisma.recipe.updateMany({
        where: { productId: p.id },
        data: { name: row.recipeName },
      });
    }
    console.log(`✓ ${row.sku} → "${row.productName}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
