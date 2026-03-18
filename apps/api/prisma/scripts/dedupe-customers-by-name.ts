/**
 * Desactiva clientes duplicados por nombre exacto (trim). Deja activo uno por nombre.
 * Cuando hay varios con el mismo nombre, se mantiene el que está en un local que NO es depósito
 * (para que siga visible en Cuentas corrientes).
 *
 * Uso: npm run prisma:dedupe-customers
 *      DRY_RUN=1 para solo mostrar qué se desactivaría.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const DRY_RUN = process.env.DRY_RUN === '1';

function isDepositoLocation(name: string): boolean {
  const lower = (name ?? '').toLowerCase().normalize('NFD').replace(/\u0301/g, '');
  return lower.includes('deposito');
}

async function main() {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const nonDepositoIds = new Set(locations.filter((l) => !isDepositoLocation(l.name)).map((l) => l.id));

  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, name: true, locationId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byName = new Map<string, typeof customers>();
  for (const c of customers) {
    const key = (c.name ?? '').trim();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(c);
  }

  let deactivated = 0;
  for (const [name, group] of byName) {
    if (group.length <= 1) continue;
    const preferred = group.find((c) => nonDepositoIds.has(c.locationId));
    const keep = preferred ?? group[0];
    const duplicates = group.filter((c) => c.id !== keep.id);
    for (const dup of duplicates) {
      if (!DRY_RUN) {
        await prisma.customer.update({
          where: { id: dup.id },
          data: { isActive: false },
        });
      }
      deactivated++;
      if (deactivated <= 10) {
        console.log(DRY_RUN ? 'Desactivaría:' : 'Desactivado:', dup.id, name.slice(0, 50), '(local:', dup.locationId, ')');
      }
    }
  }

  console.log('---');
  console.log('Nombres con duplicados:', [...byName.entries()].filter(([, g]) => g.length > 1).length);
  console.log('Registros a desactivar (duplicados):', deactivated);
  if (DRY_RUN) console.log('(DRY_RUN: no se modificó la base)');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
