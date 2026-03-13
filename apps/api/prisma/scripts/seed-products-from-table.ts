/**
 * Crea/actualiza productos según la tabla de catálogo (export).
 * Verifica y corrige unidades: líquidos en lt (ACEITE, AGUA, etc.), sólidos en kg, contables en unidad.
 * ACEITE debe quedar en lt (no ml); AGUA en lt (no unidad); Tomates Secos y sólidos en kg.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Productos de la tabla: nombre y unidad correcta (lt para líquidos, kg para sólidos, unidad para contables). LTS→lt, GRAMOS→kg, UNIDAD/PAQUETE→unidad. */
const PRODUCTS_TABLE: Array<{ name: string; unit: string }> = [
  // —— Tabla anterior
  { name: 'PAPA FRITA', unit: 'kg' },
  { name: 'BURGER', unit: 'unidad' },
  { name: 'LECHUGA', unit: 'kg' },
  { name: 'Tomates Cherry', unit: 'kg' },
  { name: 'PAPA AL PLOMO', unit: 'kg' },
  { name: 'MILANESA', unit: 'kg' },
  { name: 'SALSA ROJA', unit: 'lt' },
  { name: 'PAN', unit: 'unidad' },
  { name: 'QUESO CREMA', unit: 'kg' },
  { name: 'TOMATE FRESCO', unit: 'kg' },
  { name: 'ALBAHACA', unit: 'kg' },
  { name: 'PALTA', unit: 'kg' },
  { name: 'QUESO PARMESANO', unit: 'kg' },
  { name: 'ACEITE DE OLIVA', unit: 'lt' },
  { name: 'SALMÓN ROSADO', unit: 'kg' },
  { name: 'PEPINO', unit: 'kg' },
  { name: 'VERDURAS VARIAS', unit: 'kg' },
  { name: 'SOPA', unit: 'lt' },
  { name: 'SOPA CREMA', unit: 'lt' },
  { name: 'AGUA', unit: 'lt' },
  { name: 'ACEITE', unit: 'lt' },
  { name: 'Tomates Secos', unit: 'kg' },
  // —— Planilla CA714 / SUJ RECETA / N.A. RECETA (productos e insumos)
  { name: 'CHAMPIÑON CAPELLO', unit: 'kg' },
  { name: 'ZANAHORIA SURGELADA', unit: 'kg' },
  { name: 'PAN MOLDE BLANCO', unit: 'unidad' },
  { name: 'POLLO', unit: 'kg' },
  { name: 'SALMON AHUMADO', unit: 'kg' },
  { name: 'PETIT BEEF', unit: 'unidad' },
  { name: 'CORDON', unit: 'kg' },
  { name: 'EMPANADO DE CORDON', unit: 'unidad' },
  { name: 'WAFFLE SALADO Y QUESO', unit: 'unidad' },
  { name: 'BRUS STRACCIATELLA', unit: 'unidad' },
  { name: 'GYOZA CERDO', unit: 'unidad' },
  { name: 'ARROZ JAZMIN', unit: 'kg' },
  { name: 'MANTECA', unit: 'kg' },
  { name: 'ACEITE GIRASOL', unit: 'lt' },
  { name: 'HARINA 0000', unit: 'kg' },
  { name: 'SAL', unit: 'kg' },
  { name: 'AZUCAR', unit: 'kg' },
  { name: 'HUEVOS', unit: 'kg' },
  { name: 'CEBOLLA', unit: 'kg' },
  { name: 'AJO', unit: 'kg' },
  { name: 'LECHE', unit: 'lt' },
  { name: 'CREMA DE LECHE', unit: 'lt' },
  { name: 'JAMON', unit: 'kg' },
  { name: 'QUESO MUZZARELLA', unit: 'kg' },
  { name: 'HONGOS', unit: 'kg' },
  { name: 'VINO TINTO', unit: 'lt' },
  // —— Lista RECETA/OXP (Arroz blanco, Ensalada de frutas, Arroz con leche)
  { name: 'ARROZ', unit: 'kg' },
  { name: 'NARANJA', unit: 'unidad' },
  { name: 'MANZANA', unit: 'unidad' },
  { name: 'BANANA', unit: 'kg' },
  { name: 'FRUTILLA', unit: 'kg' },
  { name: 'ARROZ BLANCO', unit: 'unidad' },
  { name: 'ENSALADA DE FRUTAS', unit: 'unidad' },
  { name: 'ARROZ CON LECHE', unit: 'unidad' },
];

/** Nombres que deben ser lt (por si la tabla los trae en ml/cc/unidad/LTS). */
const LIQUID_NAMES = new Set([
  'ACEITE', 'AGUA', 'ACEITE DE OLIVA', 'ACEITE OLIVA', 'ACEITE GIRASOL', 'VINO BLANCO', 'VINO TINTO', 'LECHE', 'CREMA DE LECHE',
  'SALSA ROJA', 'SOPA', 'SOPA CREMA', 'SALSA SOJA', 'SALSA DE SOJA', 'VINAGRE', 'VINO', 'LIMON EXPRIMIDO', 'CREMA', 'DULCE DE LECHE',
]);

async function main() {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true }, where: { isActive: true } });
  const defaultCategoryId = categories.find((c) => c.slug === 'ingredientes-base')?.id ?? categories[0]?.id;
  if (!defaultCategoryId) throw new Error('No hay categorías en la base.');

  const products = await prisma.product.findMany({ select: { id: true, name: true, unit: true, sku: true }, where: { isActive: true } });
  const byKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const usedSkus = new Set(products.map((p) => p.sku));

  function nextSku(prefix: string): string {
    let candidate = prefix;
    let n = 1;
    while (usedSkus.has(candidate)) { candidate = `${prefix}-${n}`; n++; }
    usedSkus.add(candidate);
    return candidate;
  }

  let created = 0;
  let updated = 0;

  for (const row of PRODUCTS_TABLE) {
    const key = normalizeKey(row.name);
    const correctUnit = row.unit;
    const existing = byKey.get(key);

    if (existing) {
      if (existing.unit !== correctUnit) {
        await prisma.product.update({ where: { id: existing.id }, data: { unit: correctUnit } });
        console.log(`  Actualizado: ${existing.name}  unidad ${existing.unit} → ${correctUnit}`);
        updated++;
      }
      continue;
    }

    const baseSku = key.replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'PROD';
    await prisma.product.create({
      data: {
        name: row.name.trim(),
        sku: nextSku(`TAB-${baseSku}`),
        categoryId: defaultCategoryId,
        unit: correctUnit,
        isSellable: false,
        isIngredient: true,
        isProduced: false,
        isActive: true,
        avgCost: 0,
        lastCost: 0,
        salePrice: 0,
      },
    });
    console.log(`  Creado: ${row.name} (${correctUnit})`);
    created++;
  }

  // Pasar adicional: cualquier producto cuyo nombre sea líquido debe tener unit = lt
  const liquidKeys = new Set([...LIQUID_NAMES].map(normalizeKey));
  for (const p of products) {
    if (p.unit === 'lt') continue;
    const key = normalizeKey(p.name);
    if (liquidKeys.has(key)) {
      await prisma.product.update({ where: { id: p.id }, data: { unit: 'lt' } });
      console.log(`  Unidad corregida (líquido): ${p.name}  ${p.unit} → lt`);
      updated++;
    }
  }

  console.log('---');
  console.log('Productos creados:', created, '| Unidades actualizadas:', updated);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
