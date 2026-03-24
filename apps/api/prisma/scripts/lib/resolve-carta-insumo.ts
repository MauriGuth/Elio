import type { PrismaClient } from '../../../generated/prisma';
import { ALL_INS, type CartaIngKey } from '../data/carta-all-insumos';

/** Pistas extra por clave (además del nombre canónico sin «(cart)»). */
const EXTRA_HINTS: Partial<Record<CartaIngKey, string[]>> = {
  CAFE_GRANO: ['CAFE', 'CAFÉ', 'GRANO', 'MOLIDO', 'MOIDO'],
  AGUA: ['AGUA'],
  LECHE: ['LECHE'],
  TIPO_LECHE: ['TIPO DE LECHE', 'TIPO LECHE'],
  PACK_TAKE: ['PACK TAKE', 'PACK', 'COLLAR', 'DESECHABLE'],
  LECHE_ESPUMA: ['LECHE ESPUMA', 'ESPUMA'],
  SODA: ['SODA', 'SODIN', 'CON GAS', 'AGUA CON GAS'],
  SALSA_CHOCOLATE: ['SALSA', 'CHOCOLATE', 'CHOCO'],
  SALSA_CHOCO_AVELLANAS: ['AVELLANA', 'CHOCO'],
  SYRUP: ['SYRUP', 'AVELLANA', 'CARAMEL', 'VAINILLA'],
  SYRUP_CARAMEL: ['CARAMEL', 'SYRUP'],
  LECHE_CONDENSADA: ['CONDENSADA', 'LECHE CONDENSADA'],
  DULCE_LECHE: ['DULCE', 'DULCE DE LECHE'],
  COLD_BREW: ['COLD', 'BREW'],
  BAR_CHOCOLATE: ['BAR', 'CHOCOLATE', 'BARRITA'],
  DECO_FRUTAL: ['DECO', 'FRUTAL'],
  PREMIX_LIMONADA: ['PREMIX', 'LIMONADA'],
  TE_BLACK_ORIGINAL: ['BLACK ORIGINAL', 'TE BLACK'],
  TE_BLACK_CHAI_COCOA: ['CHAI', 'COCOA'],
  TE_BLACK_ORANGE: ['ORANGE', 'NARANJA'],
  TE_BERRY_RED: ['BERRY', 'RED'],
  TE_PATAGONIA_BERRIES: ['PATAGONIA', 'BERRIES'],
  TE_HERBAL_DELIGHT: ['HERBAL', 'DELIGHT'],
  TE_GREEN_FRESH: ['GREEN', 'FRESH'],
  GALLETA_COOKIE: ['COOKIE', 'GALLETA'],
  SERVILLETA: ['SERVILLETA', 'SERVILLETAS', 'PAPEL'],
  TETERA: ['TETERA', 'TÉ', 'TE '],
  TAZA_DOBLE: ['TAZA', 'DOBLE', 'TAZAS'],
};

function hintsFor(key: CartaIngKey): string[] {
  const def = ALL_INS[key];
  const base = def.name.replace(/\s*\(cart\)\s*$/i, '').trim();
  const extra = EXTRA_HINTS[key] ?? [];
  return [...new Set([base, ...base.split(/[\s\/]+/), ...extra])].filter(Boolean);
}

/**
 * Resuelve un insumo carta: SKU canónico → nombre existente → creación mínima.
 */
export async function resolveCartaInsumo(
  prisma: PrismaClient,
  key: CartaIngKey,
  insumosCategoryId: string,
): Promise<{ id: string; created: boolean }> {
  const def = ALL_INS[key];

  const bySku = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (bySku) return { id: bySku.id, created: false };

  for (const hint of hintsFor(key)) {
    const exact = await prisma.product.findFirst({
      where: { isIngredient: true, name: { equals: hint, mode: 'insensitive' } },
    });
    if (exact) return { id: exact.id, created: false };
  }

  for (const hint of hintsFor(key)) {
    const starts = await prisma.product.findFirst({
      where: { isIngredient: true, name: { startsWith: hint, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    });
    if (starts) return { id: starts.id, created: false };
  }

  for (const hint of hintsFor(key)) {
    if (hint.length < 3) continue;
    const contains = await prisma.product.findFirst({
      where: { isIngredient: true, name: { contains: hint, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    });
    if (contains) return { id: contains.id, created: false };
  }

  const created = await prisma.product.create({
    data: {
      sku: def.sku,
      name: def.name,
      categoryId: insumosCategoryId,
      unit: def.unit,
      isSellable: false,
      isIngredient: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: 0,
    },
  });
  return { id: created.id, created: true };
}

export async function buildCartaInsumoMap(
  prisma: PrismaClient,
  keys: Iterable<CartaIngKey>,
  insumosCategoryId: string,
): Promise<Map<CartaIngKey, string>> {
  const map = new Map<CartaIngKey, string>();
  let created = 0;
  for (const key of keys) {
    const r = await resolveCartaInsumo(prisma, key, insumosCategoryId);
    map.set(key, r.id);
    if (r.created) {
      created++;
      console.log(`   ⚠️  Insumo nuevo: ${ALL_INS[key].sku} — ${ALL_INS[key].name}`);
    }
  }
  if (created > 0) console.log(`   (Insumos creados: ${created}; el resto reutiliza existentes.)`);
  return map;
}

export function collectKeysFromStock(stock: Partial<Record<CartaIngKey, number>>): CartaIngKey[] {
  return Object.keys(stock).filter((k) => (stock as Record<string, number>)[k] > 0) as CartaIngKey[];
}
