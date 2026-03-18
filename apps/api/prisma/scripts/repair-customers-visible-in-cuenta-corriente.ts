/**
 * Repara clientes que quedaron "ocultos" en Cuentas corrientes porque al desduplicar
 * se mantuvo el registro en un local depósito. Reactiva uno en un local que no sea
 * depósito y desactiva el que está en depósito.
 *
 * Uso: npm run prisma:repair-customers-visible
 *      DRY_RUN=1 para solo mostrar qué se haría.
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
  const depositoIds = new Set(locations.filter((l) => isDepositoLocation(l.name)).map((l) => l.id));
  const nonDepositoIds = new Set(locations.filter((l) => !isDepositoLocation(l.name)).map((l) => l.id));

  const activeInDeposito = await prisma.customer.findMany({
    where: {
      isActive: true,
      locationId: { in: [...depositoIds] },
      creditLimit: { not: null, gt: 0 },
    },
    select: { id: true, name: true, locationId: true },
  });

  let repaired = 0;
  for (const active of activeInDeposito) {
    const nameKey = (active.name ?? '').trim();
    if (!nameKey) continue;

    const inactiveInNonDeposito = await prisma.customer.findMany({
      where: {
        name: nameKey,
        isActive: false,
        locationId: { in: [...nonDepositoIds] },
      },
      select: { id: true, name: true, locationId: true },
      take: 1,
    });

    if (inactiveInNonDeposito.length === 0) continue;

    const toReactivate = inactiveInNonDeposito[0];
    if (!DRY_RUN) {
      await prisma.customer.update({
        where: { id: toReactivate.id },
        data: { isActive: true },
      });
      await prisma.customer.update({
        where: { id: active.id },
        data: { isActive: false },
      });
    }
    repaired++;
    if (repaired <= 15) {
      console.log(DRY_RUN ? 'Repararía:' : 'Reparado:', nameKey.slice(0, 50), '→ reactivar en local no depósito, desactivar en depósito');
    }
  }

  console.log('---');
  console.log('Clientes reparados (visibles de nuevo en Cuentas corrientes):', repaired);
  if (DRY_RUN) console.log('(DRY_RUN: no se modificó la base)');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
