/**
 * Recarga grillas carta salón (cafés especiales, tragos calientes/fríos, té, lattes 2 grupos,
 * limonada 450, jugo naranja, prep cold brew 1L) usando insumos existentes; solo crea insumos
 * si no hay match por SKU/nombre (misma lógica que reload-clasico-combo).
 *
 * cd apps/api && npm run prisma:reload-carta-salon
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import { ALL_INS, type CartaIngKey } from './data/carta-all-insumos';
import {
  COLD_BREW_1L_SIMPLE,
  FORMAT_CAFES_ESPECIALES_SALON,
  FORMAT_JUGO_NARANJA_COFFEE,
  FORMAT_LIMONADA_COFFEE_450,
  FORMAT_TE,
  FORMAT_TRAGOS_CALIENTES,
  FORMAT_TRAGOS_FRIOS,
  ICE_LATTE_SAB_GROUPS,
  LATTE_SAB_DOBLE_GROUPS,
  LATTE_SAB_TAZON_GROUPS,
  type SalonFormatDef,
  type SalonFormatGroupDef,
} from './data/carta-salon-formats-data';
import {
  buildCartaInsumoMap,
  collectKeysFromStock,
} from './lib/resolve-carta-insumo';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

const CATEGORY_DEFS: ReadonlyArray<{ slug: string; name: string; sortOrder: number }> = [
  { slug: 'carta-cafes-especiales', name: 'Cafés especiales', sortOrder: 30 },
  { slug: 'carta-tragos-calientes', name: 'Tragos calientes', sortOrder: 60 },
  { slug: 'carta-tragos-frios', name: 'Tragos fríos', sortOrder: 70 },
  { slug: 'carta-te-hebras', name: 'Té en hebras', sortOrder: 80 },
  { slug: 'carta-limonadas-jugos-salon', name: 'Limonadas y jugos (salón)', sortOrder: 90 },
  { slug: 'carta-prep-servicio', name: 'Prep. y servicio', sortOrder: 120 },
];

function slugForSku(sku: string): string {
  if (sku === 'CARTA-CAFES-ESPECIALES-SALON' || sku.startsWith('CARTA-ESP-LATTE')) {
    return 'carta-cafes-especiales';
  }
  if (sku === 'CARTA-TRG-CALIENTES') return 'carta-tragos-calientes';
  if (sku === 'CARTA-TRG-FRIOS' || sku.startsWith('CARTA-TRG-FRIO-')) return 'carta-tragos-frios';
  if (sku === 'CARTA-TE-HEBRAS') return 'carta-te-hebras';
  if (sku === 'CARTA-LIMONADA-SALON-450' || sku === 'CARTA-JUGO-NARANJA-EXPRIMIDO') {
    return 'carta-limonadas-jugos-salon';
  }
  if (sku.startsWith('CARTA-PREP-')) return 'carta-prep-servicio';
  return 'carta-cafes-especiales';
}

async function ensureCategories(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const def of CATEGORY_DEFS) {
    const row = await prisma.category.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      update: { name: def.name, isActive: true },
    });
    map.set(def.slug, row.id);
  }
  return map;
}

type Ctx = {
  userId: string;
  locations: { id: string }[];
  categoryBySlug: Map<string, string>;
  cafePlaceholderId: string;
  teaPlaceholderId: string;
};

function collectAllSalonKeys(): CartaIngKey[] {
  const s = new Set<CartaIngKey>();
  const addFmt = (f: SalonFormatDef) => {
    for (const v of f.variants) {
      for (const k of collectKeysFromStock(v.stock)) s.add(k);
    }
  };
  const addGroups = (groups: SalonFormatGroupDef[]) => {
    for (const g of groups) {
      for (const v of g.variants) {
        for (const k of collectKeysFromStock(v.stock)) s.add(k);
      }
    }
  };
  addFmt(FORMAT_CAFES_ESPECIALES_SALON);
  addFmt(FORMAT_TRAGOS_CALIENTES);
  addFmt(FORMAT_TRAGOS_FRIOS);
  addFmt(FORMAT_TE);
  addFmt(FORMAT_LIMONADA_COFFEE_450);
  addFmt(FORMAT_JUGO_NARANJA_COFFEE);
  addGroups(LATTE_SAB_TAZON_GROUPS);
  addGroups(LATTE_SAB_DOBLE_GROUPS);
  addGroups(ICE_LATTE_SAB_GROUPS);
  for (const line of COLD_BREW_1L_SIMPLE.lines) s.add(line.key);
  return [...s];
}

async function fillGroupOptions(
  groupId: string,
  variants: SalonFormatDef['variants'],
  ingMap: Map<CartaIngKey, string>,
) {
  await prisma.productModifierOption.deleteMany({ where: { groupId } });
  for (const v of variants) {
    const opt = await prisma.productModifierOption.create({
      data: {
        groupId,
        label: v.label,
        sortOrder: v.sortOrder,
        priceDelta: v.priceDelta ?? 0,
      },
    });
    for (const [key, qty] of Object.entries(v.stock) as [CartaIngKey, number][]) {
      if (qty == null || qty <= 0) continue;
      const pid = ingMap.get(key);
      if (!pid) continue;
      await prisma.productModifierStockLine.create({
        data: { optionId: opt.id, productId: pid, quantity: qty },
      });
    }
  }
}

async function ensureSingleGroupShell(
  fmt: SalonFormatDef,
  ctx: Ctx,
  placeholderId: string,
): Promise<{ groupId: string }> {
  const catId = ctx.categoryBySlug.get(slugForSku(fmt.sku))!;
  const product = await prisma.product.create({
    data: {
      sku: fmt.sku,
      name: fmt.productName,
      categoryId: catId,
      unit: 'unidad',
      isSellable: true,
      isIngredient: false,
      consumeRecipeOnSale: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: fmt.salePrice,
      description: 'Carta café — reload-carta-salon-bundles',
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
      productId: placeholderId,
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
  console.log(`   📦 Creado ${fmt.sku} + receta + grupo`);
  return { groupId: group.id };
}

async function reloadSingleGroup(fmt: SalonFormatDef, ingMap: Map<CartaIngKey, string>, ctx: Ctx) {
  const isTea = fmt.sku === 'CARTA-TE-HEBRAS';
  const placeholderId = isTea ? ctx.teaPlaceholderId : ctx.cafePlaceholderId;
  const catId = ctx.categoryBySlug.get(slugForSku(fmt.sku))!;

  let product = await prisma.product.findFirst({
    where: {
      OR: [{ sku: fmt.sku }, { name: { equals: fmt.productName, mode: 'insensitive' } }],
    },
  });

  let groupId: string;

  if (!product) {
    const shell = await ensureSingleGroupShell(fmt, ctx, placeholderId);
    groupId = shell.groupId;
  } else {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        consumeRecipeOnSale: true,
        sku: fmt.sku,
        name: fmt.productName,
        categoryId: catId,
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
          productId: placeholderId,
          qtyPerYield: 0,
          unit: 'g',
          sortOrder: 0,
          modifierGroupId: group.id,
          notes: 'Consumo por opción',
        },
      });
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
          productId: placeholderId,
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
    } else {
      console.log(`\n⚠️  No se pudo resolver grupo: ${fmt.productName}`);
      return;
    }
  }

  await prisma.productModifierGroup.update({
    where: { id: groupId },
    data: {
      name: fmt.groupName,
      required: true,
      minSelect: 1,
      maxSelect: 1,
    },
  });

  await fillGroupOptions(groupId, fmt.variants, ingMap);
  console.log(`\n✓ ${fmt.productName} — ${fmt.variants.length} opciones`);
}

async function ensureMultiGroupShell(
  sku: string,
  productName: string,
  recipeName: string,
  salePrice: number,
  groups: SalonFormatGroupDef[],
  categoryId: string,
  ctx: Ctx,
  placeholderId: string,
) {
  const product = await prisma.product.create({
    data: {
      sku,
      name: productName,
      categoryId,
      unit: 'unidad',
      isSellable: true,
      isIngredient: false,
      consumeRecipeOnSale: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice,
      description: 'Carta café — reload-carta-salon-bundles',
    },
  });
  const recipe = await prisma.recipe.create({
    data: {
      name: recipeName,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: product.id,
      createdById: ctx.userId,
      isActive: true,
      parentId: null,
    },
  });
  const groupIds: string[] = [];
  for (const fg of groups) {
    const g = await prisma.productModifierGroup.create({
      data: {
        productId: null,
        name: fg.groupName,
        sortOrder: fg.sortOrder,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
    groupIds.push(g.id);
  }
  for (let i = 0; i < groupIds.length; i++) {
    await prisma.recipeIngredient.create({
      data: {
        recipeId: recipe.id,
        productId: placeholderId,
        qtyPerYield: 0,
        unit: 'g',
        sortOrder: i,
        modifierGroupId: groupIds[i],
        notes: 'Consumo por opción',
      },
    });
  }
  for (const loc of ctx.locations) {
    await prisma.stockLevel.upsert({
      where: { productId_locationId: { productId: product.id, locationId: loc.id } },
      create: {
        productId: product.id,
        locationId: loc.id,
        quantity: 0,
        minQuantity: 0,
        salePrice,
      },
      update: {},
    });
  }
  console.log(`   📦 Creado ${sku} (${groups.length} grupos)`);
  return { productId: product.id, groupIds };
}

async function reloadMultiGroup(
  sku: string,
  productName: string,
  recipeName: string,
  salePrice: number,
  groups: SalonFormatGroupDef[],
  ingMap: Map<CartaIngKey, string>,
  ctx: Ctx,
) {
  const catId = ctx.categoryBySlug.get(slugForSku(sku))!;

  let product = await prisma.product.findFirst({
    where: {
      OR: [{ sku }, { name: { equals: productName, mode: 'insensitive' } }],
    },
  });

  if (!product) {
    await ensureMultiGroupShell(sku, productName, recipeName, salePrice, groups, catId, ctx, ctx.cafePlaceholderId);
    product = await prisma.product.findUniqueOrThrow({ where: { sku } });
  } else {
    await prisma.product.update({
      where: { id: product.id },
      data: { name: productName, sku, categoryId: catId, consumeRecipeOnSale: true },
    });
  }

  let recipe = await prisma.recipe.findFirst({
    where: { productId: product.id, name: recipeName },
  });
  if (!recipe) {
    recipe = await prisma.recipe.findFirst({
      where: { productId: product.id },
      orderBy: { updatedAt: 'desc' },
    });
  }
  if (!recipe) {
    console.log(`\n⚠️  Sin receta ${recipeName} para ${sku}`);
    return;
  }

  const ris = await prisma.recipeIngredient.findMany({
    where: { recipeId: recipe.id, modifierGroupId: { not: null } },
    orderBy: { sortOrder: 'asc' },
  });

  if (ris.length !== groups.length) {
    console.log(
      `\n⚠️  ${sku}: grupos en BD (${ris.length}) ≠ esperados (${groups.length}). Ejecutá seed carta o revisá manualmente.`,
    );
    return;
  }

  for (let i = 0; i < groups.length; i++) {
    const groupId = ris[i].modifierGroupId!;
    const fg = groups[i];
    await prisma.productModifierGroup.update({
      where: { id: groupId },
      data: {
        name: fg.groupName,
        sortOrder: fg.sortOrder,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
    await fillGroupOptions(groupId, fg.variants, ingMap);
  }
  console.log(`\n✓ ${productName} — ${groups.length} grupos preparación`);
}

async function reloadColdBrew1L(ingMap: Map<CartaIngKey, string>, ctx: Ctx) {
  const def = COLD_BREW_1L_SIMPLE;
  const catId = ctx.categoryBySlug.get(slugForSku(def.sku))!;

  let product = await prisma.product.findFirst({
    where: {
      OR: [{ sku: def.sku }, { name: { equals: def.productName, mode: 'insensitive' } }],
    },
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        sku: def.sku,
        name: def.productName,
        categoryId: catId,
        unit: 'unidad',
        isSellable: true,
        isIngredient: false,
        consumeRecipeOnSale: false,
        isProduced: true,
        isActive: true,
        avgCost: 0,
        lastCost: 0,
        salePrice: def.salePrice,
        description: 'Prep cold brew 1L — reload-carta-salon',
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
          salePrice: def.salePrice,
        },
        update: {},
      });
    }
  }

  let recipe = await prisma.recipe.findFirst({ where: { productId: product.id, name: def.recipeName } });
  if (!recipe) {
    recipe = await prisma.recipe.findFirst({ where: { productId: product.id } });
  }
  if (!recipe) {
    recipe = await prisma.recipe.create({
      data: {
        name: def.recipeName,
        yieldQty: 1,
        yieldUnit: 'unidad',
        productId: product.id,
        createdById: ctx.userId,
        isActive: true,
        parentId: null,
      },
    });
  }

  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
  for (let i = 0; i < def.lines.length; i++) {
    const line = def.lines[i];
    const pid = ingMap.get(line.key);
    if (!pid) continue;
    await prisma.recipeIngredient.create({
      data: {
        recipeId: recipe.id,
        productId: pid,
        qtyPerYield: line.qty,
        unit: ALL_INS[line.key].unit,
        sortOrder: i,
      },
    });
  }
  console.log(`\n✓ ${def.productName} — receta fija 1L`);
}

async function main() {
  console.log('🔁 Recarga carta salón (cafés especiales, tragos, té, lattes, limonada, jugo, cold brew 1L)\n');

  const insumosCat = await prisma.category.findFirst({ where: { slug: 'tipo-insumos' } });
  if (!insumosCat) throw new Error('Falta categoría "tipo-insumos".');

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No hay usuarios.');

  const categoryBySlug = await ensureCategories();
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    take: 40,
    select: { id: true },
  });

  const keys = collectAllSalonKeys();
  console.log(`   Resolviendo ${keys.length} tipos de insumo…`);
  const ingMap = await buildCartaInsumoMap(prisma, keys, insumosCat.id);

  const cafePlaceholderId = ingMap.get('CAFE_GRANO')!;
  const teaPlaceholderId = ingMap.get('TE_BLACK_ORIGINAL')!;

  const ctx: Ctx = {
    userId: user.id,
    locations,
    categoryBySlug,
    cafePlaceholderId,
    teaPlaceholderId,
  };

  await reloadSingleGroup(FORMAT_CAFES_ESPECIALES_SALON, ingMap, ctx);
  await reloadSingleGroup(FORMAT_TRAGOS_CALIENTES, ingMap, ctx);
  await reloadSingleGroup(FORMAT_TRAGOS_FRIOS, ingMap, ctx);
  await reloadSingleGroup(FORMAT_TE, ingMap, ctx);

  await reloadMultiGroup(
    'CARTA-ESP-LATTE-SAB-TAZON',
    'LATTE SABORIZADO TAZON',
    'RECETA LATTE SABORIZADO TAZON',
    0,
    LATTE_SAB_TAZON_GROUPS,
    ingMap,
    ctx,
  );
  await reloadMultiGroup(
    'CARTA-ESP-LATTE-SAB-DOBLE',
    'LATTE SABORIZADO DOBLE',
    'RECETA LATTE SABORIZADO DOBLE',
    0,
    LATTE_SAB_DOBLE_GROUPS,
    ingMap,
    ctx,
  );
  await reloadMultiGroup(
    'CARTA-TRG-FRIO-ICE-LATTE-SAB',
    'ICE LATTE SABORIZADO',
    'RECETA ICE LATTE SABORIZADO',
    0,
    ICE_LATTE_SAB_GROUPS,
    ingMap,
    ctx,
  );

  await reloadSingleGroup(FORMAT_LIMONADA_COFFEE_450, ingMap, ctx);
  await reloadSingleGroup(FORMAT_JUGO_NARANJA_COFFEE, ingMap, ctx);
  await reloadColdBrew1L(ingMap, ctx);

  console.log('\n✅ Listo. Revisá POS y precios en Stock.\n');
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
