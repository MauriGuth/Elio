/**
 * Habilita sistema de cajas y mesas para "La Posada del Dinosaurio":
 * - Busca el local por nombre/slug (posada o dinosaurio).
 * - Marca hasTables = true.
 * - Crea una caja si no existe.
 * - Crea mesas (Mesa 1..N) si no existen.
 *
 * Uso: desde apps/api
 *   npm run prisma:setup-posada
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

async function main() {
  const loc = await prisma.location.findFirst({
    where: {
      OR: [
        { name: { contains: 'posada', mode: 'insensitive' } },
        { name: { contains: 'dinosaurio', mode: 'insensitive' } },
        { slug: { contains: 'posada', mode: 'insensitive' } },
        { slug: { contains: 'dinosaurio', mode: 'insensitive' } },
      ],
      isActive: true,
    },
  });

  if (!loc) {
    console.error('No se encontró ningún local "La Posada del Dinosaurio" (nombre o slug con "posada" o "dinosaurio").');
    console.error('Creá el local desde el dashboard o el seed y volvé a ejecutar este script.');
    process.exit(1);
  }

  console.log('Local encontrado:', loc.name, '(', loc.slug, ')');

  await prisma.location.update({
    where: { id: loc.id },
    data: { hasTables: true },
  });
  console.log('  ✓ hasTables = true');

  const existingCajas = await prisma.cashRegister.count({ where: { locationId: loc.id } });
  if (existingCajas === 0) {
    await prisma.cashRegister.create({
      data: {
        locationId: loc.id,
        name: 'Caja Principal',
        status: 'closed',
      },
    });
    console.log('  ✓ Caja Principal creada');
  } else {
    console.log('  ✓ Ya existe al menos una caja');
  }

  const existingMesas = await prisma.table.count({ where: { locationId: loc.id } });
  const numMesas = 16;
  if (existingMesas < numMesas) {
    const toCreate = numMesas - existingMesas;
    for (let i = 1; i <= toCreate; i++) {
      const n = existingMesas + i;
      await prisma.table.create({
        data: {
          locationId: loc.id,
          name: `Mesa ${n}`,
          zone: n <= 10 ? 'Salón' : 'Terraza',
          capacity: n <= 4 ? 2 : 4,
          sortOrder: n,
          positionX: ((n - 1) % 4) * 120,
          positionY: Math.floor((n - 1) / 4) * 120,
        },
      });
    }
    console.log(`  ✓ ${toCreate} mesas creadas (Mesa ${existingMesas + 1} .. Mesa ${numMesas})`);
  } else {
    console.log('  ✓ Ya existen mesas en este local');
  }

  console.log('\n✅ La Posada del Dinosaurio lista con cajas y mesas.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
