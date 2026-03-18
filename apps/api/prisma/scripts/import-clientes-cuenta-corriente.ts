/**
 * Importa clientes desde clientes.sql y los da de alta en cuenta corriente (Customer con creditLimit).
 * razon_social del SQL se mapea al nombre del cliente. Cada cliente se crea en TODOS los locales
 * excepto los cuyo nombre contiene "deposito".
 *
 * Uso: CLIENTES_SQL_PATH=/ruta/a/clientes.sql npm run prisma:import-clientes
 * Opcional: LOCATION_ID=id para importar solo en ese local (comportamiento anterior).
 */
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const CLIENTES_SQL_PATH =
  process.env.CLIENTES_SQL_PATH ||
  '/Users/mauriciohuentelaf/Downloads/clientes.sql';
const LOCATION_ID = process.env.LOCATION_ID;
const DRY_RUN = process.env.DRY_RUN === '1';

type ParsedRow = {
  razon_social: string;
  domicilio: string | null;
  condicion_iva: string | null;
  cuit: string | null;
  limite_credito: number;
  email: string | null;
  telefono: string | null;
  tipo_cliente: string | null;
};

/** Parsea una fila tipo ('a', 'b', NULL, 1.0) a array de valores. */
function parseRow(rowStr: string): (string | number | null)[] {
  const result: (string | number | null)[] = [];
  let i = 0;
  const s = rowStr.trim();
  while (i < s.length) {
    const rest = s.slice(i).replace(/^\s*,\s*/, '').replace(/^\s*/, '');
    i = s.length - rest.length;
    if (!rest.length) break;
    if (rest.startsWith("'")) {
      let pos = 1;
      while (pos < rest.length) {
        const nextQuote = rest.indexOf("'", pos);
        if (nextQuote === -1) break;
        if (rest[nextQuote + 1] === "'") {
          pos = nextQuote + 2;
          continue;
        }
        result.push(rest.slice(1, nextQuote).replace(/''/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))));
        i += nextQuote + 1;
        break;
      }
      continue;
    }
    if (rest.toUpperCase().startsWith('NULL')) {
      result.push(null);
      i += 4;
      continue;
    }
    const numMatch = rest.match(/^(\d+(?:\.\d+)?)/);
    if (numMatch) {
      result.push(parseFloat(numMatch[1]));
      i += numMatch[1].length;
      continue;
    }
    i++;
  }
  return result;
}

function parseSqlToClientes(content: string): ParsedRow[] {
  const idx = content.indexOf('VALUES');
  if (idx === -1) return [];
  const block = content.slice(idx + 6).replace(/^\s+/, '').replace(/\s*\);?\s*$/, '').trim();
  const rows: ParsedRow[] = [];
  // Cada fila está en una línea:   ('a', 'b', ...),
  const lines = block.split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith('('));
  for (const line of lines) {
    const raw = line.replace(/,\s*$/, '').replace(/^\s*\(\s*/, '').replace(/\s*\)\s*;?\s*$/, '').trim();
    if (!raw) continue;
    const vals = parseRow(raw);
    if (vals.length < 8) continue;
    rows.push({
      razon_social: String(vals[0] ?? '').trim(),
      domicilio: vals[1] != null ? String(vals[1]).trim() || null : null,
      condicion_iva: vals[2] != null ? String(vals[2]).trim() || null : null,
      cuit: vals[3] != null ? String(vals[3]).trim().replace(/\D/g, '') || null : null,
      limite_credito: typeof vals[4] === 'number' ? vals[4] : 0,
      email: vals[5] != null ? String(vals[5]).trim() || null : null,
      telefono: vals[6] != null ? String(vals[6]).trim() || null : null,
      tipo_cliente: vals[7] != null ? String(vals[7]).trim() || null : null,
    });
  }
  return rows;
}

function isDepositoLocation(name: string): boolean {
  const lower = (name ?? '').toLowerCase().normalize('NFD').replace(/\u0301/g, '');
  return lower.includes('deposito');
}

async function main() {
  if (!fs.existsSync(CLIENTES_SQL_PATH)) {
    console.error('No se encontró el archivo:', CLIENTES_SQL_PATH);
    process.exit(1);
  }
  const content = fs.readFileSync(CLIENTES_SQL_PATH, 'utf-8');
  const clientes = parseSqlToClientes(content);
  console.log('Registros parseados:', clientes.length);

  let locationIds: string[];
  if (LOCATION_ID) {
    locationIds = [LOCATION_ID];
    console.log('Usando solo ubicación indicada:', LOCATION_ID);
  } else {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    locationIds = locations.filter((l) => !isDepositoLocation(l.name)).map((l) => l.id);
    if (locationIds.length === 0) {
      console.error('No hay ubicaciones activas (o todas son depósito). Pasa LOCATION_ID=... o crea locales.');
      process.exit(1);
    }
    console.log('Usando', locationIds.length, 'ubicación(es) (todas excepto depósito)');
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let sinCuitCounter = 0;

  for (const c of clientes) {
    const name = (c.razon_social || '').trim() || 'Sin nombre';
    const hasValidCuit = c.cuit && c.cuit.replace(/\D/g, '').length >= 10;
    const cuitNorm = hasValidCuit ? c.cuit!.replace(/\D/g, '') : null;
    const cuitDisplay = cuitNorm
      ? (cuitNorm.length === 11 ? `${cuitNorm.slice(0, 2)}-${cuitNorm.slice(2, 10)}-${cuitNorm.slice(10)}` : cuitNorm)
      : null;

    let cuitToUse: string;
    if (cuitDisplay) {
      cuitToUse = cuitDisplay;
    } else {
      sinCuitCounter++;
      const pad = String(sinCuitCounter).padStart(8, '0');
      cuitToUse = `00-${pad}-0`;
    }

    const creditLimit = c.limite_credito > 0 ? c.limite_credito : 1;
    const data = {
      name: name.slice(0, 200),
      legalName: name.length > 200 ? name : undefined,
      cuit: cuitToUse,
      taxCondition: c.condicion_iva?.slice(0, 50) ?? undefined,
      address: c.domicilio?.slice(0, 500) ?? undefined,
      email: c.email?.slice(0, 200) ?? undefined,
      phone: c.telefono?.slice(0, 50) ?? undefined,
      creditLimit,
    };

    for (const locationId of locationIds) {
      try {
        const existing = await prisma.customer.findFirst({
          where: {
            locationId,
            OR: [
              { cuit: cuitToUse },
              ...(cuitNorm ? [{ cuit: cuitNorm }, { cuit: cuitDisplay! }] : []),
            ],
          },
        });
        if (existing) {
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          await prisma.customer.create({
            data: {
              locationId,
              ...data,
            },
          });
        }
        created++;
        if (created % 100 === 0) console.log('Registros creados:', created);
      } catch (e: any) {
        errors++;
        if (errors <= 5) console.error('Error en', name, cuitToUse, locationId, e?.message);
      }
    }
  }

  console.log('---');
  console.log('Registros creados (cliente x local):', created);
  if (sinCuitCounter > 0) console.log('Clientes con CUIT sintético (sin CUIT en origen):', sinCuitCounter);
  console.log('Omitidos (ya existentes en ese local):', skipped);
  console.log('Errores:', errors);
  if (DRY_RUN) console.log('(DRY_RUN: no se escribió en la base)');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
