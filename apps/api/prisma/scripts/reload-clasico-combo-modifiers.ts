/**
 * Recarga las grillas de combo café + cookie (POCILLO / JARRITO / DOBLE / TAZÓN + 1 COOKIE)
 * usando **productos insumo ya existentes** en la base.
 *
 * Si **no existen** los productos POS `CARTA-POCILLO`, `CARTA-JARRITO`, etc. (p. ej. tras sync remoto),
 * los **crea** con receta + grupo de preparación + stock en locales activos.
 *
 * Resolución por insumo:
 *  1) SKU canónico (CARTA-INS-*)
 *  2) Nombre existente (CAFE, AGUA, …)
 *  3) Si no hay match: crea insumo canónico en `tipo-insumos`
 *
 * cd apps/api && npm run prisma:reload-clasico-combo
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import {
  CLASICOS_INSUMO_DEFS,
  CLASICO_MILK_PREP_LABELS,
  FORMATS_CLASICOS,
  type ClasicosFormatDef,
  type ClasicosIngKey,
} from './data/carta-clasicos-formats';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

/** Pistas de búsqueda por nombre (insumos típicos planilla / carta). */
const NAME_HINTS: Record<ClasicosIngKey, string[]> = {
  CAFE_GRANO: ['CAFE', 'CAFÉ', 'GRANO', 'MOLIDO', 'MOIDO', 'ESPRESSO'],
  AGUA: ['AGUA'],
  /** `LECHE` se resuelve en `resolveLecheBaseProductId` (evita matchear ALM-MANI / descremada). */
  LECHE: [],
  TIPO_LECHE: ['TIPO DE LECHE', 'TIPO LECHE'],
  LECHE_ESPUMA: ['LECHE ESPUMA', 'ESPUMA', 'EMULSION'],
  LECHE_DESCREMADA: ['DESCREM', 'DESCREMADA', '0%'],
  LECHE_ALMENDRAS: ['ALMENDRA', 'ALM-MANI', 'LECHE ALM', 'ALMENDRAS'],
  SODA: ['SODA', 'SODIN', 'CON GAS', 'AGUA CON GAS'],
  GALLETA_COOKIE: ['COOKIE', 'GALLETA', 'COOKIES'],
};

/** Fragmentos en nombre: si aparece, NO es leche “base” (vaca) para preparación carta. */
const LECHE_BASE_NAME_EXCLUDE = [
  'ALMEND',
  'ALM-MANI',
  'DESCREM',
  'ESPUM',
  'AVENA',
  'SOJA',
  'CONDENS',
  'DULCE',
  'NUT',
  'COCO',
] as const;

type CoffeeTypeDef = {
  label: string;
  sku: string;
  names: string[];
};

const COFFEE_TYPE_DEFS: CoffeeTypeDef[] = [
  { label: 'Passion', sku: 'CARTA-INS-CAFE-PASSION', names: ['CAFE PASSION', 'PASSION'] },
  {
    label: 'Brasil Medium Roast',
    sku: 'CARTA-INS-CAFE-BRASIL-MEDIUM',
    names: ['CAFE BRASIL MEDIUM', 'BRASIL MEDIUM ROAST', 'BRASIL MEDIUM'],
  },
  {
    label: 'Colombian Dark',
    sku: 'CARTA-INS-CAFE-COLOMBIAN-DARK',
    names: ['CAFE COLOMBIAN DARK', 'COLOMBIAN DARK', 'COLOMBIAN DARK CAFE'],
  },
  {
    label: 'Colombian Decaff',
    sku: 'CARTA-INS-CAFE-COLOMBIAN-DECAFF',
    names: ['CAFE COLOMBIAN DECAFF', 'COLOMBIAN DECAFF', 'COLOMBIAN DECAF'],
  },
  { label: 'Peru', sku: 'CARTA-INS-CAFE-PERU', names: ['CAFE PERU', 'PERU'] },
  { label: 'Ethiopia', sku: 'CARTA-INS-CAFE-ETHIOPIA', names: ['CAFE ETHIOPIA', 'ETHIOPIA'] },
  { label: 'Ruanda', sku: 'CARTA-INS-CAFE-RUANDA', names: ['CAFE RUANDA', 'RUANDA', 'RWANDA'] },
  { label: 'Honduras', sku: 'CARTA-INS-CAFE-HONDURAS', names: ['CAFE HONDURAS', 'HONDURAS'] },
  { label: 'Nicaragua', sku: 'CARTA-INS-CAFE-NICARAGUA', names: ['CAFE NICARAGUA', 'NICARAGUA'] },
  {
    label: 'Brasil Santos Bourbon',
    sku: 'CARTA-INS-CAFE-BRASIL-SANTOS-BOURBON',
    names: ['CAFE BRASIL SANTOS BOURBON', 'BRASIL SANTOS BOURBON', 'CAFE SANTOS'],
  },
];

async function resolveLecheBaseProductId(
  insumosCategoryId: string,
): Promise<{ id: string; source: 'sku' | 'name' | 'created' }> {
  const def = CLASICOS_INSUMO_DEFS.LECHE;

  const bySku = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (bySku) return { id: bySku.id, source: 'sku' };

  const exactTry = [def.name, 'LECHE', 'Leche'];
  for (const nm of exactTry) {
    const row = await prisma.product.findFirst({
      where: { isIngredient: true, name: { equals: nm, mode: 'insensitive' } },
    });
    if (!row) continue;
    const u = row.name.toUpperCase();
    if (LECHE_BASE_NAME_EXCLUDE.some((f) => u.includes(f))) continue;
    return { id: row.id, source: 'name' };
  }

  /** Prisma no acepta `mode` dentro de `not.contains`; filtramos en memoria. */
  const candidates = await prisma.product.findMany({
    where: {
      isIngredient: true,
      name: { contains: 'LECHE', mode: 'insensitive' },
    },
    orderBy: { name: 'asc' },
    take: 120,
  });
  const pick = candidates.find((p) => {
    const u = p.name.toUpperCase();
    return !LECHE_BASE_NAME_EXCLUDE.some((f) => u.includes(f));
  });
  if (pick) return { id: pick.id, source: 'name' };

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
  console.log(`   ⚠️  Insumo creado (no existía match): ${def.sku} — ${def.name}`);
  return { id: created.id, source: 'created' };
}

async function ensureCartaClasicosCategory(): Promise<string> {
  const row = await prisma.category.upsert({
    where: { slug: 'carta-clasicos' },
    create: {
      slug: 'carta-clasicos',
      name: 'Café clásico',
      sortOrder: 10,
      isActive: true,
    },
    update: { isActive: true, name: 'Café clásico' },
  });
  return row.id;
}

async function resolveTipoLecheProductId(
  insumosCategoryId: string,
): Promise<{ id: string; source: 'sku' | 'name' | 'created' }> {
  const def = CLASICOS_INSUMO_DEFS.TIPO_LECHE;

  const bySku = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (bySku) return { id: bySku.id, source: 'sku' };

  const exactTry = [def.name, 'TIPO DE LECHE', 'Tipo de leche', 'Tipo De Leche'];
  for (const nm of exactTry) {
    const row = await prisma.product.findFirst({
      where: { isIngredient: true, name: { equals: nm, mode: 'insensitive' } },
    });
    if (row) return { id: row.id, source: 'name' };
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
  console.log(`   ⚠️  Insumo creado (no existía match): ${def.sku} — ${def.name}`);
  return { id: created.id, source: 'created' };
}

async function resolveInsumoProductId(
  key: ClasicosIngKey,
  insumosCategoryId: string,
): Promise<{ id: string; source: 'sku' | 'name' | 'created' }> {
  if (key === 'TIPO_LECHE') {
    return resolveTipoLecheProductId(insumosCategoryId);
  }
  if (key === 'LECHE') {
    return resolveLecheBaseProductId(insumosCategoryId);
  }

  const def = CLASICOS_INSUMO_DEFS[key];

  const bySku = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (bySku) return { id: bySku.id, source: 'sku' };

  for (const hint of NAME_HINTS[key]) {
    const exact = await prisma.product.findFirst({
      where: {
        isIngredient: true,
        name: { equals: hint, mode: 'insensitive' },
      },
    });
    if (exact) return { id: exact.id, source: 'name' };
  }

  for (const hint of NAME_HINTS[key]) {
    const starts = await prisma.product.findFirst({
      where: {
        isIngredient: true,
        name: { startsWith: hint, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
    });
    if (starts) return { id: starts.id, source: 'name' };
  }

  for (const hint of NAME_HINTS[key]) {
    const contains = await prisma.product.findFirst({
      where: {
        isIngredient: true,
        name: { contains: hint, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
    });
    if (contains) return { id: contains.id, source: 'name' };
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
  console.log(`   ⚠️  Insumo creado (no existía match): ${def.sku} — ${def.name}`);
  return { id: created.id, source: 'created' };
}

async function buildInsumoMap(insumosCategoryId: string): Promise<Map<ClasicosIngKey, string>> {
  const keys = Object.keys(CLASICOS_INSUMO_DEFS) as ClasicosIngKey[];
  const map = new Map<ClasicosIngKey, string>();
  const stats = { sku: 0, name: 0, created: 0 };

  for (const key of keys) {
    const r = await resolveInsumoProductId(key, insumosCategoryId);
    map.set(key, r.id);
    stats[r.source]++;
  }

  console.log(
    `   Insumos resueltos: ${stats.sku} por SKU canónico, ${stats.name} por nombre existente, ${stats.created} creados.`,
  );
  return map;
}

async function resolveCoffeeTypeProductId(
  def: CoffeeTypeDef,
  insumosCategoryId: string,
): Promise<{ id: string; source: 'sku' | 'name' | 'created' }> {
  const bySku = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (bySku) return { id: bySku.id, source: 'sku' };

  for (const nm of def.names) {
    const exact = await prisma.product.findFirst({
      where: { isIngredient: true, name: { equals: nm, mode: 'insensitive' } },
    });
    if (exact) return { id: exact.id, source: 'name' };
  }
  for (const nm of def.names) {
    const contains = await prisma.product.findFirst({
      where: { isIngredient: true, name: { contains: nm, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
    });
    if (contains) return { id: contains.id, source: 'name' };
  }

  const created = await prisma.product.create({
    data: {
      sku: def.sku,
      name: def.names[0] ?? def.label,
      categoryId: insumosCategoryId,
      unit: 'g',
      isSellable: false,
      isIngredient: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: 0,
    },
  });
  console.log(`   ⚠️  Insumo café creado (no existía match): ${def.sku} — ${created.name}`);
  return { id: created.id, source: 'created' };
}

async function buildCoffeeTypeProductMap(insumosCategoryId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const def of COFFEE_TYPE_DEFS) {
    const r = await resolveCoffeeTypeProductId(def, insumosCategoryId);
    out.set(def.label, r.id);
  }
  return out;
}

type Ctx = {
  userId: string;
  cartaCategoryId: string;
  locations: { id: string }[];
  cafePlaceholderId: string;
  coffeeTypeProducts: Map<string, string>;
};

/** Crea producto vendible + receta + grupo modificador + placeholder + stock locales. */
async function ensureFormatShell(fmt: ClasicosFormatDef, ctx: Ctx): Promise<{ productId: string; groupId: string }> {
  const product = await prisma.product.create({
    data: {
      sku: fmt.sku,
      name: fmt.productName,
      categoryId: ctx.cartaCategoryId,
      unit: 'unidad',
      isSellable: true,
      isIngredient: false,
      consumeRecipeOnSale: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: fmt.salePrice,
      description: 'Carta café — combo + cookie (reload-clasico-combo).',
    },
  });

  const group = await prisma.productModifierGroup.create({
    data: {
      productId: null,
      name: fmt.groupName,
      sortOrder: 0,
      required: true,
      minSelect: 1,
      maxSelect: 1,
    },
  });

  const recipe = await prisma.recipe.create({
    data: {
      name: fmt.recipeName,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: product.id,
      createdById: ctx.userId,
      isActive: true,
      parentId: null,
    },
  });

  await prisma.recipeIngredient.create({
    data: {
      recipeId: recipe.id,
      productId: ctx.cafePlaceholderId,
      qtyPerYield: 0,
      unit: 'g',
      sortOrder: 0,
      modifierGroupId: group.id,
      notes: 'Consumo por opción',
    },
  });

  for (const loc of ctx.locations) {
    await prisma.stockLevel.upsert({
      where: { productId_locationId: { productId: product.id, locationId: loc.id } },
      create: {
        productId: product.id,
        locationId: loc.id,
        quantity: 0,
        minQuantity: 0,
        salePrice: fmt.salePrice,
      },
      update: {},
    });
  }

  console.log(`   📦 Creado ${fmt.sku} (${fmt.productName}) + receta + grupo preparación`);
  return { productId: product.id, groupId: group.id };
}

async function reloadOneFormat(fmt: ClasicosFormatDef, ingIds: Map<ClasicosIngKey, string>, ctx: Ctx) {
  let product = await prisma.product.findFirst({
    where: {
      OR: [{ sku: fmt.sku }, { name: { equals: fmt.productName, mode: 'insensitive' } }],
    },
  });

  let groupId: string;

  if (!product) {
    const shell = await ensureFormatShell(fmt, ctx);
    groupId = shell.groupId;
    product = await prisma.product.findUniqueOrThrow({ where: { id: shell.productId } });
  } else {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        consumeRecipeOnSale: true,
        sku: fmt.sku,
        name: fmt.productName,
        categoryId: ctx.cartaCategoryId,
      },
    });

    let recipe = await prisma.recipe.findFirst({
      where: { productId: product.id, name: fmt.recipeName },
    });
    if (!recipe) {
      recipe = await prisma.recipe.findFirst({
        where: { productId: product.id },
        orderBy: { updatedAt: 'desc' },
      });
    }

    const ri = recipe
      ? await prisma.recipeIngredient.findFirst({
          where: { recipeId: recipe.id, modifierGroupId: { not: null } },
        })
      : null;

    if (recipe && ri?.modifierGroupId) {
      groupId = ri.modifierGroupId;
    } else if (recipe && !ri?.modifierGroupId) {
      const group = await prisma.productModifierGroup.create({
        data: {
          productId: null,
          name: fmt.groupName,
          sortOrder: 0,
          required: true,
          minSelect: 1,
          maxSelect: 1,
        },
      });
      groupId = group.id;
      await prisma.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          productId: ctx.cafePlaceholderId,
          qtyPerYield: 0,
          unit: 'g',
          sortOrder: 0,
          modifierGroupId: group.id,
          notes: 'Consumo por opción',
        },
      });
      console.log(`   🔧 Añadido grupo de preparación a receta existente: ${fmt.productName}`);
    } else if (!recipe) {
      const group = await prisma.productModifierGroup.create({
        data: {
          productId: null,
          name: fmt.groupName,
          sortOrder: 0,
          required: true,
          minSelect: 1,
          maxSelect: 1,
        },
      });
      groupId = group.id;
      const newRecipe = await prisma.recipe.create({
        data: {
          name: fmt.recipeName,
          yieldQty: 1,
          yieldUnit: 'unidad',
          productId: product.id,
          createdById: ctx.userId,
          isActive: true,
          parentId: null,
        },
      });
      await prisma.recipeIngredient.create({
        data: {
          recipeId: newRecipe.id,
          productId: ctx.cafePlaceholderId,
          qtyPerYield: 0,
          unit: 'g',
          sortOrder: 0,
          modifierGroupId: group.id,
          notes: 'Consumo por opción',
        },
      });
      for (const loc of ctx.locations) {
        await prisma.stockLevel.upsert({
          where: { productId_locationId: { productId: product.id, locationId: loc.id } },
          create: {
            productId: product.id,
            locationId: loc.id,
            quantity: 0,
            minQuantity: 0,
            salePrice: fmt.salePrice,
          },
          update: {},
        });
      }
      console.log(`   🔧 Creada receta + grupo para producto existente: ${fmt.productName}`);
    } else {
      console.log(`\n⚠️  No se pudo resolver grupo para ${fmt.productName}`);
      return;
    }
  }

  await prisma.productModifierGroup.update({
    where: { id: groupId },
    data: {
      name: fmt.groupName,
      sortOrder: 0,
      required: true,
      minSelect: 1,
      maxSelect: 1,
    },
  });

  await prisma.productModifierOption.deleteMany({ where: { groupId } });

  for (const v of fmt.variants) {
    const opt = await prisma.productModifierOption.create({
      data: {
        groupId,
        label: v.label,
        sortOrder: v.sortOrder,
        priceDelta: v.priceDelta ?? 0,
      },
    });

    for (const [key, qty] of Object.entries(v.stock) as [ClasicosIngKey, number][]) {
      if (qty == null || qty <= 0) continue;
      const pid = ingIds.get(key);
      if (!pid) continue;
      await prisma.productModifierStockLine.create({
        data: { optionId: opt.id, productId: pid, quantity: qty },
      });
    }
  }

  const recipeRow = await prisma.recipe.findFirst({
    where: { productId: product.id },
    orderBy: { updatedAt: 'desc' },
  });
  if (recipeRow) {
    await ensureCoffeeModifierGroup(fmt, recipeRow.id, groupId, ctx);
    await ensureMilkModifierGroup(fmt, product.id, recipeRow.id, groupId, ctx);
  }

  console.log(
    `\n✓ ${fmt.productName} — ${fmt.variants.length} opciones (${fmt.groupName}) + café de especialidad + tipo de leche`,
  );
}

const MILK_VISIBILITY_RULE = {
  whenPriorGroupSortOrder: 0,
  whenSelectedOptionLabels: [...CLASICO_MILK_PREP_LABELS],
};

async function ensureMilkModifierGroup(
  fmt: ClasicosFormatDef,
  productId: string,
  recipeId: string,
  prepGroupId: string,
  ctx: Ctx,
) {
  const milkName = `Tipo de leche — ${fmt.productName}`;

  const ris = await prisma.recipeIngredient.findMany({
    where: { recipeId },
    include: { modifierGroup: true },
    orderBy: { sortOrder: 'asc' },
  });
  const milkRi = ris.find(
    (r) =>
      r.modifierGroupId &&
      r.modifierGroupId !== prepGroupId &&
      r.modifierGroup &&
      (r.modifierGroup.sortOrder === 2 ||
        r.modifierGroup.name.toLowerCase().includes('tipo de leche')),
  );

  let milkGroupId: string | null = milkRi?.modifierGroupId ?? null;

  if (!milkGroupId) {
    const created = await prisma.productModifierGroup.create({
      data: {
        productId: null,
        name: milkName,
        sortOrder: 2,
        required: true,
        minSelect: 1,
        maxSelect: 1,
        visibilityRule: MILK_VISIBILITY_RULE,
      },
    });
    milkGroupId = created.id;
    await prisma.recipeIngredient.create({
      data: {
        recipeId,
        productId: ctx.cafePlaceholderId,
        qtyPerYield: 0,
        unit: 'g',
        sortOrder: 2,
        modifierGroupId: milkGroupId,
        notes: 'Tipo de leche (visible solo con preparación con leche)',
      },
    });
  } else {
    await prisma.productModifierGroup.update({
      where: { id: milkGroupId },
      data: {
        name: milkName,
        sortOrder: 2,
        required: true,
        minSelect: 1,
        maxSelect: 1,
        visibilityRule: MILK_VISIBILITY_RULE,
      },
    });
  }

  await prisma.productModifierOption.deleteMany({ where: { groupId: milkGroupId } });

  /** Mismas etiquetas en todos los formatos: cantidad en ml viene de la opción de Preparación. */
  const milkOpts = [
    { label: 'Leche Entera', sortOrder: 0 },
    { label: 'Leche Descremada', sortOrder: 1 },
    { label: 'Leche de almendras', sortOrder: 2 },
  ];
  for (const o of milkOpts) {
    await prisma.productModifierOption.create({
      data: {
        groupId: milkGroupId,
        label: o.label,
        sortOrder: o.sortOrder,
        priceDelta: 0,
      },
    });
  }
}

async function ensureCoffeeModifierGroup(
  fmt: ClasicosFormatDef,
  recipeId: string,
  prepGroupId: string,
  ctx: Ctx,
) {
  const coffeeName = `Café de especialidad — ${fmt.productName}`;
  const ris = await prisma.recipeIngredient.findMany({
    where: { recipeId },
    include: { modifierGroup: true },
    orderBy: { sortOrder: 'asc' },
  });

  const coffeeRi = ris.find(
    (r) =>
      r.modifierGroupId &&
      r.modifierGroupId !== prepGroupId &&
      r.modifierGroup &&
      (r.modifierGroup.name.toLowerCase().includes('café de especialidad') ||
        r.modifierGroup.name.toLowerCase().includes('cafe de especialidad') ||
        r.modifierGroup.name.toLowerCase().includes('tipo de café') ||
        r.modifierGroup.name.toLowerCase().includes('tipo de cafe')),
  );

  let coffeeGroupId: string | null = coffeeRi?.modifierGroupId ?? null;
  if (!coffeeGroupId) {
    const created = await prisma.productModifierGroup.create({
      data: {
        productId: null,
        name: coffeeName,
        sortOrder: 1,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
    coffeeGroupId = created.id;
    await prisma.recipeIngredient.create({
      data: {
        recipeId,
        productId: ctx.cafePlaceholderId,
        qtyPerYield: 0,
        unit: 'g',
        sortOrder: 1,
        modifierGroupId: coffeeGroupId,
        notes: 'Café de especialidad (sustituye consumo base de CAFE_GRANO)',
      },
    });
  } else {
    await prisma.productModifierGroup.update({
      where: { id: coffeeGroupId },
      data: {
        name: coffeeName,
        sortOrder: 1,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
  }

  await prisma.productModifierOption.deleteMany({ where: { groupId: coffeeGroupId } });
  for (let i = 0; i < COFFEE_TYPE_DEFS.length; i++) {
    const def = COFFEE_TYPE_DEFS[i];
    const opt = await prisma.productModifierOption.create({
      data: {
        groupId: coffeeGroupId,
        label: def.label,
        sortOrder: i,
        priceDelta: 0,
      },
    });
    const pid = ctx.coffeeTypeProducts.get(def.label);
    if (!pid) continue;
    await prisma.productModifierStockLine.create({
      data: {
        optionId: opt.id,
        productId: pid,
        quantity: 0,
      },
    });
  }
}

async function main() {
  console.log('🔁 Recarga grillas CLASICO + cookie (insumos existentes)\n');

  const insumosCat = await prisma.category.findFirst({ where: { slug: 'tipo-insumos' } });
  if (!insumosCat) {
    throw new Error('Falta categoría slug "tipo-insumos".');
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No hay usuarios en la base. Creá al menos uno.');

  const cartaCategoryId = await ensureCartaClasicosCategory();
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    take: 40,
    select: { id: true },
  });

  const ingMap = await buildInsumoMap(insumosCat.id);
  const coffeeTypeProducts = await buildCoffeeTypeProductMap(insumosCat.id);
  const cafeId = ingMap.get('CAFE_GRANO');
  if (!cafeId) throw new Error('No se resolvió CAFE_GRANO');

  const ctx: Ctx = {
    userId: user.id,
    cartaCategoryId,
    locations,
    cafePlaceholderId: cafeId,
    coffeeTypeProducts,
  };

  for (const fmt of FORMATS_CLASICOS) {
    await reloadOneFormat(fmt, ingMap, ctx);
  }

  console.log('\n✅ Listo. Revisá precios en Stock y el POS (café clásico).\n');
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
