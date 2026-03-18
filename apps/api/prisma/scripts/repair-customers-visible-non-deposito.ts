/**
 * Repara clientes que quedaron activos en local "depósito" tras el dedupe.
 * Para cada nombre cuyo cliente activo está en depósito, si existe un duplicado
 * inactivo en un local que NO es depósito, lo reactiva y desactiva el del depósito.
 *
 * Uso: npm run prisma:repair-customers-visible
 *      DRY_RUN=1 para solo mostrar cambios.
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

  console.log('Locales depósito:', depositoIds.size, '| no depósito:', nonDepositoIds.size);
  if (depositoIds.size === 0) {
    console.log('No hay locales depósito.');
  }

  const activeInDeposito = await prisma.customer.findMany({
    where: { isActive: true, locationId: { in: [...depositoIds] } },
    select: { id: true, name: true, locationId: true },
  });

  const inactiveAll = await prisma.customer.findMany({
    where: { isActive: false },
    select: { id: true, name: true, locationId: true, creditLimit: true },
  });

  const inactiveByKey = new Map<string, typeof inactiveAll>();
  for (const c of inactiveAll) {
    const key = (c.name ?? '').trim();
    if (!key) continue;
    if (!inactiveByKey.has(key)) inactiveByKey.set(key, []);
    inactiveByKey.get(key)!.push(c);
  }
  console.log('Activos en depósito:', activeInDeposito.length, '| Inactivos total:', inactiveAll.length);

  const activeInNonDeposito = await prisma.customer.findMany({
    where: { isActive: true, locationId: { in: [...nonDepositoIds] } },
    select: { name: true },
  });
  const activeNamesNonDeposito = new Set(activeInNonDeposito.map((c) => (c.name ?? '').trim()).filter(Boolean));

  let repaired = 0;

  for (const active of activeInDeposito) {
    const key = (active.name ?? '').trim();
    if (!key) continue;
    const candidates = inactiveByKey.get(key)?.filter((c) => nonDepositoIds.has(c.locationId)) ?? [];
    if (candidates.length === 0) continue;

    const toActivate = candidates[0];
    if (!DRY_RUN) {
      await prisma.customer.update({ where: { id: toActivate.id }, data: { isActive: true } });
      await prisma.customer.update({ where: { id: active.id }, data: { isActive: false } });
    }
    repaired++;
    if (repaired <= 15) console.log((DRY_RUN ? 'Repararía:' : 'Reparado:'), key.slice(0, 50), '→ activo en local no depósito');
  }

  for (const [nameKey, inactives] of inactiveByKey) {
    if (activeNamesNonDeposito.has(nameKey)) continue;
    const inNonDeposito = inactives.filter((c) => nonDepositoIds.has(c.locationId));
    if (inNonDeposito.length === 0) continue;
    const withLimit = inNonDeposito.filter((c) => (c as any).creditLimit != null && (c as any).creditLimit > 0);
    const toActivate = (withLimit.length > 0 ? withLimit : inNonDeposito)[0];
    if (!DRY_RUN) {
      await prisma.customer.update({ where: { id: toActivate.id }, data: { isActive: true } });
    }
    repaired++;
    activeNamesNonDeposito.add(nameKey);
    if (repaired <= 20) console.log((DRY_RUN ? 'Reactivaría:' : 'Reactivado:'), nameKey.slice(0, 50));
  }

  console.log('---');
  console.log('Clientes reparados / reactivados (visibles en Cuentas corrientes):', repaired);
  if (DRY_RUN) console.log('(DRY_RUN: no se modificó la base)');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
