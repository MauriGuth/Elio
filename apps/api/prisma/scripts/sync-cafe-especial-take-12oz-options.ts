/**
 * Repuebla el grupo «Preparación — Café especial Take 12oz» con las mismas 7 variantes
 * que el Take 8oz (MOCACCINO … SUBMARINO CARAMEL), usando cantidades 12oz del PDF
 * (alineado con `FORMAT_CAFE_ESP_TAKE_12OZ` en seed-carta-cafe-pdf.ts).
 *
 * Resuelve insumos por SKU canónico, nombre existente o creación en `tipo-insumos`
 * (igual que otros scripts de carta).
 *
 * cd apps/api && npm run prisma:sync-cafe-especial-take-12oz
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import type { CartaIngKey } from './data/carta-all-insumos';
import { buildCartaInsumoMap } from './lib/resolve-carta-insumo';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const PRODUCT_SKU_12 = 'CARTA-CAFE-ESP-TAKE-12OZ';

const VARIANTS_12OZ: Array<{
  label: string;
  sortOrder: number;
  priceDelta?: number;
  stock: Partial<Record<CartaIngKey, number>>;
}> = [
  {
    label: 'MOCACCINO',
    sortOrder: 0,
    stock: {
      CAFE_GRANO: 18,
      AGUA: 130,
      TIPO_LECHE: 180,
      SALSA_CHOCOLATE: 44,
      CACAO: 3,
      CANELA: 3,
      SODA: 60,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'CAPUCCINO',
    sortOrder: 1,
    stock: {
      CAFE_GRANO: 18,
      AGUA: 130,
      TIPO_LECHE: 220,
      CACAO: 3,
      CANELA: 3,
      SODA: 60,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'CAPUCCINO A LA ITALIANA',
    sortOrder: 2,
    stock: {
      CAFE_GRANO: 18,
      AGUA: 80,
      TIPO_LECHE: 200,
      SALSA_CHOCOLATE: 44,
      CACAO: 3,
      CANELA: 3,
      CREMA: 30,
      SODA: 60,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'CAPUCCINO HAZELNUT',
    sortOrder: 3,
    stock: {
      CAFE_GRANO: 18,
      AGUA: 80,
      TIPO_LECHE: 200,
      SALSA_CHOCO_AVELLANAS: 44,
      CREMA: 30,
      CACAO: 3,
      SODA: 60,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'LATTE SABORIZADO',
    sortOrder: 4,
    stock: {
      CAFE_GRANO: 18,
      AGUA: 80,
      TIPO_LECHE: 240,
      SYRUP: 33,
      SODA: 60,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'SUBMARINO',
    sortOrder: 5,
    stock: {
      TIPO_LECHE: 350,
      BAR_CHOCOLATE: 1,
      CACAO: 3,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
  {
    label: 'SUBMARINO CARAMEL',
    sortOrder: 6,
    stock: {
      TIPO_LECHE: 280,
      SALSA_CHOCOLATE: 40,
      SYRUP_CARAMEL: 33,
      CACAO: 3,
      PACK_TAKE: 1,
      GALLETA_COOKIE: 1,
    },
  },
];

function collectKeysFromVariants(
  variants: Array<{ stock: Partial<Record<CartaIngKey, number>> }>,
): CartaIngKey[] {
  const s = new Set<CartaIngKey>();
  for (const v of variants) {
    for (const k of Object.keys(v.stock) as CartaIngKey[]) {
      if ((v.stock[k] ?? 0) > 0) s.add(k);
    }
  }
  return [...s];
}

async function resolveGroupIdForTake12oz(): Promise<{ groupId: string; via: string }> {
  const product = await prisma.product.findUnique({ where: { sku: PRODUCT_SKU_12 } });
  if (product) {
    const recipe = await prisma.recipe.findFirst({
      where: { productId: product.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (recipe) {
      const ri = await prisma.recipeIngredient.findFirst({
        where: { recipeId: recipe.id, modifierGroupId: { not: null } },
      });
      if (ri?.modifierGroupId) {
        return { groupId: ri.modifierGroupId, via: `receta de ${PRODUCT_SKU_12}` };
      }
    }
  }

  const nameCandidates = [
    'Preparación — Café especial Take 12oz',
    'Preparación — Cafe especial Take 12oz',
  ];
  for (const name of nameCandidates) {
    const g = await prisma.productModifierGroup.findFirst({ where: { name } });
    if (g) return { groupId: g.id, via: `nombre exacto: ${name}` };
  }

  const fuzzy = await prisma.productModifierGroup.findFirst({
    where: {
      AND: [
        { name: { contains: '12oz', mode: 'insensitive' } },
        { name: { contains: 'especial', mode: 'insensitive' } },
        { name: { contains: 'Take', mode: 'insensitive' } },
      ],
    },
  });
  if (fuzzy) return { groupId: fuzzy.id, via: `búsqueda por nombre (${fuzzy.name})` };

  throw new Error(
    `No se encontró grupo Take 12oz: producto ${PRODUCT_SKU_12} sin recipeIngredient con modifierGroupId, ni grupo por nombre.`,
  );
}

async function main() {
  const insumosCat = await prisma.category.findFirst({ where: { slug: 'tipo-insumos' } });
  if (!insumosCat) throw new Error('Falta categoría "tipo-insumos".');

  const { groupId, via } = await resolveGroupIdForTake12oz();
  const group = await prisma.productModifierGroup.findUnique({ where: { id: groupId } });
  console.log(`Grupo: ${group?.name ?? groupId} (${via})`);

  const keys = collectKeysFromVariants(VARIANTS_12OZ);
  console.log('Resolviendo insumos…');
  const ingMap = await buildCartaInsumoMap(prisma, keys, insumosCat.id);

  const deleted = await prisma.productModifierOption.deleteMany({ where: { groupId } });
  console.log(`Opciones eliminadas en el grupo: ${deleted.count}`);

  for (const v of VARIANTS_12OZ) {
    const opt = await prisma.productModifierOption.create({
      data: {
        groupId,
        label: v.label,
        sortOrder: v.sortOrder,
        priceDelta: v.priceDelta ?? 0,
      },
    });
    for (const k of Object.keys(v.stock) as CartaIngKey[]) {
      const qty = v.stock[k];
      if (qty == null || qty <= 0) continue;
      const productId = ingMap.get(k);
      if (!productId) continue;
      await prisma.productModifierStockLine.create({
        data: { optionId: opt.id, productId, quantity: qty },
      });
    }
    console.log(`  + ${v.label}`);
  }

  console.log(`Listo: ${VARIANTS_12OZ.length} opciones Take 12oz con líneas de stock.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
