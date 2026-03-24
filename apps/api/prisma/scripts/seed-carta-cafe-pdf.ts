/**
 * Carta café (Nova): clásicos, take, limonadas take, licuados, smoothies, café especialidad,
 * desayunos, pastelería, té en hebras.
 * Cafés especiales (salón), tragos calientes y tragos fríos (salón): un producto con opciones cada uno
 * (como CLASICO POCILLO) — SKUs CARTA-CAFES-ESPECIALES-SALON, CARTA-TRG-CALIENTES, CARTA-TRG-FRIOS.
 *
 * Referencia: docs/carta/CARTA-21_3.pdf — también croissants/waffles/tostados, sandwichería, ensaladas, pokes, keto (p.9–12).
 * Insumos CARTA-INS-* + productos CARTA-* (consumeRecipeOnSale en formatos con opciones).
 * Cantidades de recetas: aproximación; ajustar según PDF / operación real.
 *
 * cd apps/api && npm run prisma:seed-carta-cafe-pdf
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

/** Insumos: clave interna → SKU fijo */
const ALL_INS = {
  CAFE_GRANO: { sku: 'CARTA-INS-CAFE-GRANO', name: 'Café grano (cart)', unit: 'g' },
  AGUA: { sku: 'CARTA-INS-AGUA', name: 'Agua (cart)', unit: 'ml' },
  LECHE: { sku: 'CARTA-INS-LECHE', name: 'Leche (cart)', unit: 'ml' },
  /** Preparación café carta / take: leche líquida (evita confusiones con otros productos con “leche” en el nombre). */
  TIPO_LECHE: { sku: 'CARTA-INS-TIPO-LECHE', name: 'TIPO DE LECHE (cart)', unit: 'ml' },
  LECHE_ESPUMA: { sku: 'CARTA-INS-LECHE-ESPUMA', name: 'Leche espuma (cart)', unit: 'ml' },
  SODA: { sku: 'CARTA-INS-SODA', name: 'Soda / agua con gas (cart)', unit: 'ml' },
  CACAO: { sku: 'CARTA-INS-CACAO', name: 'Cacao (cart)', unit: 'g' },
  CANELA: { sku: 'CARTA-INS-CANELA', name: 'Canela (cart)', unit: 'g' },
  SALSA_CHOCOLATE: { sku: 'CARTA-INS-SALSA-CHOCOLATE', name: 'Salsa chocolate (cart)', unit: 'g' },
  CREMA: { sku: 'CARTA-INS-CREMA', name: 'Crema (cart)', unit: 'g' },
  SALSA_CHOCO_AVELLANAS: { sku: 'CARTA-INS-SALSA-CHOCO-AVELLANAS', name: 'Salsa choco avellanas (cart)', unit: 'g' },
  SYRUP: { sku: 'CARTA-INS-SYRUP', name: 'Syrup (cart)', unit: 'ml' },
  LECHE_CONDENSADA: { sku: 'CARTA-INS-LECHE-CONDENSADA', name: 'Leche condensada (cart)', unit: 'g' },
  WHISKY: { sku: 'CARTA-INS-WHISKY', name: 'Whisky (cart)', unit: 'ml' },
  CREMA_MANI: { sku: 'CARTA-INS-CREMA-MANI', name: 'Crema maní (cart)', unit: 'g' },
  HIELO: { sku: 'CARTA-INS-HIELO', name: 'Hielo (cart)', unit: 'g' },
  COLD_BREW: { sku: 'CARTA-INS-COLD-BREW', name: 'Cold brew líquido (cart)', unit: 'ml' },
  HELADO: { sku: 'CARTA-INS-HELADO', name: 'Helado (cart)', unit: 'g' },
  AGUA_TONICA: { sku: 'CARTA-INS-AGUA-TONICA', name: 'Agua tónica (cart)', unit: 'ml' },
  BAR_CHOCOLATE: { sku: 'CARTA-INS-BAR-CHOCOLATE', name: 'Barrita chocolate (cart)', unit: 'und' },
  /** Genérico (otros usos); té en hebras del POS usa insumos por variedad abajo */
  HEBRAS_TE: { sku: 'CARTA-INS-HEBRAS-TE', name: 'Hebras té (cart)', unit: 'g' },
  /** Té en hebras — una opción POS = un insumo con el nombre de la variedad (stock / receta por sabor) */
  TE_BLACK_ORIGINAL: {
    sku: 'CARTA-INS-TE-BLACK-ORIGINAL',
    name: 'Té Black Original (hebras)',
    unit: 'g',
  },
  TE_BLACK_CHAI_COCOA: {
    sku: 'CARTA-INS-TE-BLACK-CHAI-COCOA',
    name: 'Té Black Chai Cocoa (hebras)',
    unit: 'g',
  },
  TE_BLACK_ORANGE: {
    sku: 'CARTA-INS-TE-BLACK-ORANGE',
    name: 'Té Black Orange (hebras)',
    unit: 'g',
  },
  TE_BERRY_RED: {
    sku: 'CARTA-INS-TE-BERRY-RED',
    name: 'Té Berry Red (hebras)',
    unit: 'g',
  },
  TE_PATAGONIA_BERRIES: {
    sku: 'CARTA-INS-TE-PATAGONIA-BERRIES',
    name: 'Té Patagonia Berries (hebras)',
    unit: 'g',
  },
  TE_HERBAL_DELIGHT: {
    sku: 'CARTA-INS-TE-HERBAL-DELIGHT',
    name: 'Té Herbal Delight (hebras)',
    unit: 'g',
  },
  TE_GREEN_FRESH: {
    sku: 'CARTA-INS-TE-GREEN-FRESH',
    name: 'Té Green Fresh (hebras)',
    unit: 'g',
  },
  DECO_FRUTAL: { sku: 'CARTA-INS-DECO-FRUTAL', name: 'Deco frutal (cart)', unit: 'g' },
  SYRUP_CARAMEL: { sku: 'CARTA-INS-SYRUP-CARAMEL', name: 'Syrup caramel (cart)', unit: 'ml' },
  /** Resto carta (limonadas, licuados, smoothies, desayunos, pastelería) */
  JUGO_LIMON: { sku: 'CARTA-INS-JUGO-LIMON', name: 'Jugo limón (cart)', unit: 'ml' },
  JUGO_NARANJA: { sku: 'CARTA-INS-JUGO-NARANJA', name: 'Jugo naranja (cart)', unit: 'ml' },
  PULPA_FRUTAS: { sku: 'CARTA-INS-PULPA-FRUTAS', name: 'Pulpa / fruta (cart)', unit: 'g' },
  YOGURT: { sku: 'CARTA-INS-YOGURT', name: 'Yogurt (cart)', unit: 'g' },
  PAN: { sku: 'CARTA-INS-PAN', name: 'Pan / tostadas / masa (cart)', unit: 'g' },
  HUEVO: { sku: 'CARTA-INS-HUEVO', name: 'Huevo (cart)', unit: 'und' },
  MANTEQUILLA: { sku: 'CARTA-INS-MANTEQUILLA', name: 'Mantequilla (cart)', unit: 'g' },
  PALTA: { sku: 'CARTA-INS-PALTA', name: 'Palta (cart)', unit: 'g' },
  MIEL: { sku: 'CARTA-INS-MIEL', name: 'Miel / maple (cart)', unit: 'g' },
  MEZCLA_TORTA: { sku: 'CARTA-INS-MEZCLA-TORTA', name: 'Mezcla porción torta (cart)', unit: 'g' },
  /** Limonadas PDF (premix / almíbares) */
  PREMIX_LIMONADA: { sku: 'CARTA-INS-PREMIX-LIMONADA', name: 'Premix limonada (cart)', unit: 'ml' },
  ALMIBAR_FRUTOS_ROJOS: { sku: 'CARTA-INS-ALMIBAR-FRUTOS-ROJOS', name: 'Almíbar frutos rojos (cart)', unit: 'ml' },
  ALMIBAR_MARACUYA: { sku: 'CARTA-INS-ALMIBAR-MARACUYA', name: 'Almíbar maracuyá (cart)', unit: 'ml' },
  PEPINO: { sku: 'CARTA-INS-PEPINO', name: 'Pepino (cart)', unit: 'g' },
  AZUCAR: { sku: 'CARTA-INS-AZUCAR', name: 'Azúcar (cart)', unit: 'g' },
  FUSION_VAINILLA: { sku: 'CARTA-INS-FUSION-VAINILLA', name: 'Carga cremera fusión vainilla (cart)', unit: 'g' },
  MEDIALUNA: { sku: 'CARTA-INS-MEDIALUNA', name: 'Medialuna (cart)', unit: 'g' },
  BUDIN_REBANADA: { sku: 'CARTA-INS-BUDIN', name: 'Budín porción (cart)', unit: 'g' },
  GALLETA_COOKIE: { sku: 'CARTA-INS-GALLETA-COOKIE', name: 'Galleta cookie NY (cart)', unit: 'und' },
  /** Limonada en Coffee / jugo naranja — presentación vaso facetado */
  SORBETE: { sku: 'CARTA-INS-SORBETE', name: 'Sorbete (cart)', unit: 'und' },
  RODAJA_LIMON: { sku: 'CARTA-INS-RODAJA-LIMON', name: 'Rodaja de limón (cart)', unit: 'und' },
  FLOR_MENTA: { sku: 'CARTA-INS-FLOR-MENTA', name: 'Flor de menta (cart)', unit: 'und' },
  RODAJA_NARANJA: { sku: 'CARTA-INS-RODAJA-NARANJA', name: 'Rodaja de naranja (cart)', unit: 'und' },
  BANANA: { sku: 'CARTA-INS-BANANA', name: 'Banana (cart)', unit: 'g' },
  MIX_FRUTA_FRESCA: { sku: 'CARTA-INS-MIX-FRUTA-FRESCA', name: 'Mix fruta fresca (cart)', unit: 'g' },
  /** Cocina / sandwichería / keto (PDF p.9–12) */
  JAMON_COCIDO: { sku: 'CARTA-INS-JAMON-COCIDO', name: 'Jamón cocido (cart)', unit: 'g' },
  JAMON_CRUDO: { sku: 'CARTA-INS-JAMON-CRUDO', name: 'Jamón crudo (cart)', unit: 'g' },
  QUESO_TYBO: { sku: 'CARTA-INS-QUESO-TYBO', name: 'Queso Tybo (cart)', unit: 'g' },
  QUESO_FUNDIDO: { sku: 'CARTA-INS-QUESO-FUNDIDO', name: 'Queso fundido / brie (cart)', unit: 'g' },
  MUZZARELLA: { sku: 'CARTA-INS-MUZZARELLA', name: 'Muzzarella (cart)', unit: 'g' },
  QUESO_AZUL: { sku: 'CARTA-INS-QUESO-AZUL', name: 'Queso azul (cart)', unit: 'g' },
  SALMON: { sku: 'CARTA-INS-SALMON', name: 'Salmón (cart)', unit: 'g' },
  POLLO: { sku: 'CARTA-INS-POLLO', name: 'Pollo (cart)', unit: 'g' },
  LOMITO_CERDO: { sku: 'CARTA-INS-LOMITO-CERDO', name: 'Lomito / pastrami (cart)', unit: 'g' },
  ATUN: { sku: 'CARTA-INS-ATUN', name: 'Atún (cart)', unit: 'g' },
  CERDO_LAQUEADO: { sku: 'CARTA-INS-CERDO-LAQUEADO', name: 'Cerdo laqueado (cart)', unit: 'g' },
  PAN_FOCACCIA: { sku: 'CARTA-INS-PAN-FOCACCIA', name: 'Focaccia (cart)', unit: 'g' },
  PAN_CHIPA: { sku: 'CARTA-INS-PAN-CHIPA', name: 'Pan chipa (cart)', unit: 'g' },
  PAN_CIABATTA: { sku: 'CARTA-INS-PAN-CIABATTA', name: 'Pan ciabatta (cart)', unit: 'g' },
  PAN_NUBE: { sku: 'CARTA-INS-PAN-NUBE', name: 'Pan nube (cart)', unit: 'g' },
  PAN_NAAN: { sku: 'CARTA-INS-PAN-NAAN', name: 'Pan chato / naan (cart)', unit: 'g' },
  ARROZ: { sku: 'CARTA-INS-ARROZ', name: 'Arroz / quinoa (cart)', unit: 'g' },
  PAPAS_CUNA: { sku: 'CARTA-INS-PAPAS-CUNA', name: 'Papas cuña (cart)', unit: 'g' },
  CHEDDAR_LIQUIDO: { sku: 'CARTA-INS-CHEDDAR-LIQUIDO', name: 'Cheddar líquido (cart)', unit: 'ml' },
  DULCE_LECHE: { sku: 'CARTA-INS-DULCE-LECHE', name: 'Dulce de leche (cart)', unit: 'g' },
  YOGURT_GRIEGO: { sku: 'CARTA-INS-YOGURT-GRIEGO', name: 'Yogurt griego (cart)', unit: 'g' },
  GRANOLA: { sku: 'CARTA-INS-GRANOLA', name: 'Granola (cart)', unit: 'g' },
  ESPINACA: { sku: 'CARTA-INS-ESPINACA', name: 'Espinaca (cart)', unit: 'g' },
  LECHUGA: { sku: 'CARTA-INS-LECHUGA', name: 'Lechuga (cart)', unit: 'g' },
  RUCULA: { sku: 'CARTA-INS-RUCULA', name: 'Rúcula (cart)', unit: 'g' },
  TOMATE: { sku: 'CARTA-INS-TOMATE', name: 'Tomate (cart)', unit: 'g' },
  HUMMUS: { sku: 'CARTA-INS-HUMMUS', name: 'Hummus (cart)', unit: 'g' },
  BURRATA: { sku: 'CARTA-INS-BURRATA', name: 'Burrata (cart)', unit: 'g' },
  TOFU: { sku: 'CARTA-INS-TOFU', name: 'Tofu (cart)', unit: 'g' },
  LANGOSTINOS: { sku: 'CARTA-INS-LANGOSTINOS', name: 'Langostinos (cart)', unit: 'g' },
  WAFFLE_MASA: { sku: 'CARTA-INS-WAFFLE-MASA', name: 'Masa waffle (cart)', unit: 'g' },
  MAYONESA: { sku: 'CARTA-INS-MAYONESA', name: 'Mayonesa (cart)', unit: 'g' },
  TORTILLA: { sku: 'CARTA-INS-TORTILLA', name: 'Tortilla / wrap (cart)', unit: 'g' },
  MASAMADRE: { sku: 'CARTA-INS-MASA-MADRE', name: 'Tostón masa madre (cart)', unit: 'g' },
  PANCETA: { sku: 'CARTA-INS-PANCETA', name: 'Panceta (cart)', unit: 'g' },
  APIO: { sku: 'CARTA-INS-APIO', name: 'Apio (cart)', unit: 'g' },
  MANZANA_VERDE: { sku: 'CARTA-INS-MANZANA-VERDE', name: 'Manzana verde (cart)', unit: 'g' },
  BROCOLI: { sku: 'CARTA-INS-BROCOLI', name: 'Brócoli (cart)', unit: 'g' },
  CROISSANT_MASA: { sku: 'CARTA-INS-CROISSANT', name: 'Croissant base (cart)', unit: 'g' },
  LECHE_ALMENDRAS: { sku: 'CARTA-INS-LECHE-ALMENDRAS', name: 'Leche almendras (cart)', unit: 'ml' },
  CRACKER_SEMILLAS: { sku: 'CARTA-INS-CRACKER-SEMILLAS', name: 'Cracker semillas (cart)', unit: 'und' },
  /** Pack desechable take (collarín/tapa/revolvedor/azúcar — PDF p.5) */
  PACK_TAKE: { sku: 'CARTA-INS-PACK-TAKE', name: 'Pack take (collar/tapa/revolvedor)', unit: 'und' },
  /** Posavasos: al cerrar venta, 1 und cada 2 unidades take (mismo ticket) — ver `applyTakeCoasterStock`. */
  POSAVASOS: { sku: 'CARTA-INS-POSAVASOS', name: 'Posavasos (cart)', unit: 'und' },
} as const;

type IngKey = keyof typeof ALL_INS;

type VariantDef = {
  label: string;
  sortOrder: number;
  stock: Partial<Record<IngKey, number>>;
  priceDelta?: number;
};

type FormatDef = {
  sku: string;
  productName: string;
  recipeName: string;
  groupName: string;
  salePrice: number;
  variants: VariantDef[];
};

/** Varios grupos POS (ej. base + sabor syrup): un producto, varias secciones obligatorias en el modal */
type FormatGroupDef = {
  groupName: string;
  sortOrder: number;
  variants: VariantDef[];
};

type SimpleProductDef = {
  sku: string;
  productName: string;
  recipeName: string;
  salePrice: number;
  /** Receta fija (sin grupo de opciones) */
  lines: Array<{ key: IngKey; qty: number }>;
};

/**
 * Clásicos: Pocillo, Jarrito, Doble, Tazón (PDF — grilla café + soda 60ml).
 * Pocillo incluye Ristretto; Jarrito/Doble/Tazón no (según grilla PDF).
 * Título carta: «+ 1 COOKIE» → `GALLETA_COOKIE` en cada variante.
 */
const FORMATS_CLASICOS: FormatDef[] = [
  {
    sku: 'CARTA-POCILLO',
    productName: 'CLASICO POCILLO',
    recipeName: 'RECETA CLASICO POCILLO',
    groupName: 'Preparación — Pocillo',
    salePrice: 0,
    variants: [
      {
        label: 'Café solo',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 60, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Cortado',
        sortOrder: 1,
        stock: { CAFE_GRANO: 12, AGUA: 40, TIPO_LECHE: 20, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Café con leche',
        sortOrder: 2,
        stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Machiato',
        sortOrder: 3,
        stock: { CAFE_GRANO: 12, AGUA: 50, LECHE_ESPUMA: 10, SODA: 60, GALLETA_COOKIE: 1 },
      },
      /** PDF: agua 25–30ml; usamos 27ml promedio */
      {
        label: 'Ristretto',
        sortOrder: 4,
        stock: { CAFE_GRANO: 12, AGUA: 27, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Latte',
        sortOrder: 5,
        stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 40, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Lágrima',
        sortOrder: 6,
        stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 40, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Americano',
        sortOrder: 7,
        stock: { CAFE_GRANO: 12, AGUA: 60, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    sku: 'CARTA-JARRITO',
    productName: 'CLASICO JARRITO',
    recipeName: 'RECETA CLASICO JARRITO',
    groupName: 'Preparación — Jarrito',
    salePrice: 0,
    variants: [
      {
        label: 'Café solo',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 100, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Cortado',
        sortOrder: 1,
        stock: { CAFE_GRANO: 12, AGUA: 70, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Café con leche',
        sortOrder: 2,
        stock: { CAFE_GRANO: 12, AGUA: 50, TIPO_LECHE: 50, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Machiato',
        sortOrder: 3,
        stock: { CAFE_GRANO: 12, AGUA: 90, LECHE_ESPUMA: 10, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Latte',
        sortOrder: 4,
        stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 70, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Lágrima',
        sortOrder: 5,
        stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 80, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Americano',
        sortOrder: 6,
        stock: { CAFE_GRANO: 12, AGUA: 100, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    sku: 'CARTA-DOBLE',
    productName: 'CLASICO DOBLE',
    recipeName: 'RECETA CLASICO DOBLE',
    groupName: 'Preparación — Doble',
    salePrice: 0,
    variants: [
      {
        label: 'Café solo',
        sortOrder: 0,
        stock: { CAFE_GRANO: 18, AGUA: 150, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Cortado',
        sortOrder: 1,
        stock: { CAFE_GRANO: 18, AGUA: 120, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Café con leche',
        sortOrder: 2,
        stock: { CAFE_GRANO: 12, AGUA: 75, TIPO_LECHE: 75, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Machiato',
        sortOrder: 3,
        stock: { CAFE_GRANO: 18, AGUA: 130, LECHE_ESPUMA: 20, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Latte',
        sortOrder: 4,
        stock: { CAFE_GRANO: 12, AGUA: 40, TIPO_LECHE: 110, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Lágrima',
        sortOrder: 5,
        stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 130, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Americano',
        sortOrder: 6,
        stock: { CAFE_GRANO: 18, AGUA: 150, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    sku: 'CARTA-TAZON',
    productName: 'CLASICO TAZON',
    recipeName: 'RECETA CLASICO TAZON',
    groupName: 'Preparación — Tazón',
    salePrice: 0,
    variants: [
      {
        label: 'Café solo',
        sortOrder: 0,
        stock: { CAFE_GRANO: 18, AGUA: 300, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Cortado',
        sortOrder: 1,
        stock: { CAFE_GRANO: 18, AGUA: 250, TIPO_LECHE: 50, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Café con leche',
        sortOrder: 2,
        stock: { CAFE_GRANO: 12, AGUA: 130, TIPO_LECHE: 170, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Machiato',
        sortOrder: 3,
        stock: { CAFE_GRANO: 18, AGUA: 270, LECHE_ESPUMA: 30, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Latte',
        sortOrder: 4,
        stock: { CAFE_GRANO: 12, AGUA: 100, TIPO_LECHE: 200, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Lágrima',
        sortOrder: 5,
        stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 270, SODA: 60, GALLETA_COOKIE: 1 },
      },
      {
        label: 'Americano',
        sortOrder: 6,
        stock: { CAFE_GRANO: 18, AGUA: 300, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
];

/** TAKE AWAY CHICO 8oz = 240ml — ficha (café + agua/leche; sin soda en vaso take) */
const FORMATS_TAKE8: FormatDef = {
  sku: 'CARTA-TAKE-8OZ',
  productName: 'TAKE CHICO 8OZ',
  recipeName: 'RECETA TAKE CHICO 8OZ',
  groupName: 'Preparación — Take 8oz',
  salePrice: 0,
  variants: [
    { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 18, AGUA: 250, PACK_TAKE: 1 } },
    { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 18, AGUA: 200, TIPO_LECHE: 50, PACK_TAKE: 1 } },
    { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 125, TIPO_LECHE: 125, PACK_TAKE: 1 } },
    { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 18, AGUA: 230, LECHE_ESPUMA: 20, PACK_TAKE: 1 } },
    { label: 'Latte', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 50, TIPO_LECHE: 200, PACK_TAKE: 1 } },
    { label: 'Lágrima', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 230, PACK_TAKE: 1 } },
    { label: 'Americano', sortOrder: 6, stock: { CAFE_GRANO: 18, AGUA: 250, PACK_TAKE: 1 } },
  ],
};

/** TAKE AWAY GRANDE 12oz = 350ml — ficha */
const FORMATS_TAKE12: FormatDef = {
  sku: 'CARTA-TAKE-12OZ',
  productName: 'TAKE GRANDE 12OZ',
  recipeName: 'RECETA TAKE GRANDE 12OZ',
  groupName: 'Preparación — Take 12oz',
  salePrice: 0,
  variants: [
    { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 18, AGUA: 350, PACK_TAKE: 1 } },
    { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 18, AGUA: 300, TIPO_LECHE: 50, PACK_TAKE: 1 } },
    { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 175, TIPO_LECHE: 175, PACK_TAKE: 1 } },
    { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 18, AGUA: 320, LECHE_ESPUMA: 30, PACK_TAKE: 1 } },
    { label: 'Latte', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 120, TIPO_LECHE: 230, PACK_TAKE: 1 } },
    { label: 'Lágrima', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 50, TIPO_LECHE: 300, PACK_TAKE: 1 } },
    { label: 'Americano', sortOrder: 6, stock: { CAFE_GRANO: 18, AGUA: 350, PACK_TAKE: 1 } },
  ],
};

/** Té en hebras — nombres exactos PDF; 15g hebras + 300ml agua; +1 cookie fuera de combo */
const FORMAT_TE: FormatDef = {
  sku: 'CARTA-TE-HEBRAS',
  productName: 'TE EN HEBRAS',
  recipeName: 'RECETA TE EN HEBRAS',
  groupName: 'Preparación — Té en hebras',
  salePrice: 0,
  variants: [
    {
      label: 'BLACK ORIGINAL',
      sortOrder: 0,
      stock: { TE_BLACK_ORIGINAL: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'BLACK CHAI COCOA',
      sortOrder: 1,
      stock: { TE_BLACK_CHAI_COCOA: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'BLACK ORANGE',
      sortOrder: 2,
      stock: { TE_BLACK_ORANGE: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'BERRY RED',
      sortOrder: 3,
      stock: { TE_BERRY_RED: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'PATAGONIA BERRIES',
      sortOrder: 4,
      stock: { TE_PATAGONIA_BERRIES: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'HERBAL DELIGHT',
      sortOrder: 5,
      stock: { TE_HERBAL_DELIGHT: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
    {
      label: 'GREEN FRESH',
      sortOrder: 6,
      stock: { TE_GREEN_FRESH: 15, AGUA: 300, GALLETA_COOKIE: 1 },
    },
  ],
};

/**
 * Latte / Ice latte saborizado: 2 grupos en el POS (base + sabor del syrup).
 * El consumo suma ambas opciones elegidas.
 */
const LATTE_SAB_TAZON_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Latte saborizado Tazón (base café y leche)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 80, TIPO_LECHE: 190, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    groupName: 'Sabor del syrup',
    sortOrder: 20,
    variants: [
      { label: 'Avellana', sortOrder: 0, stock: { SYRUP: 33 } },
      { label: 'Caramel', sortOrder: 1, stock: { SYRUP: 33 } },
      { label: 'Vainilla', sortOrder: 2, stock: { SYRUP: 33 } },
    ],
  },
];

const LATTE_SAB_DOBLE_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Latte saborizado Doble (base)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 35, TIPO_LECHE: 195, SODA: 60, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    groupName: 'Sabor del syrup',
    sortOrder: 20,
    variants: [
      { label: 'Avellana', sortOrder: 0, stock: { SYRUP: 25 } },
      { label: 'Caramel', sortOrder: 1, stock: { SYRUP: 25 } },
      { label: 'Vainilla', sortOrder: 2, stock: { SYRUP: 25 } },
    ],
  },
];

const ICE_LATTE_SAB_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Ice Latte (base fría)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 40, TIPO_LECHE: 120, HIELO: 80, GALLETA_COOKIE: 1 },
      },
    ],
  },
  {
    groupName: 'Sabor del syrup',
    sortOrder: 20,
    variants: [
      { label: 'Avellana', sortOrder: 0, stock: { SYRUP: 33 } },
      { label: 'Caramel', sortOrder: 1, stock: { SYRUP: 33 } },
      { label: 'Vainilla', sortOrder: 2, stock: { SYRUP: 33 } },
    ],
  },
];

/** Limonadas take — volúmenes tipo 8oz */
const FORMATS_LIMONADA_TAKE8: FormatDef = {
  sku: 'CARTA-LIMONADA-TAKE-8OZ',
  productName: 'LIMONADA TAKE 8OZ',
  recipeName: 'RECETA LIMONADA TAKE 8OZ',
  groupName: 'Preparación — Limonada Take 8oz',
  salePrice: 0,
  variants: [
    { label: 'Limón clásico', sortOrder: 0, stock: { JUGO_LIMON: 40, AGUA: 180, HIELO: 70, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Limón y jengibre', sortOrder: 1, stock: { JUGO_LIMON: 35, AGUA: 170, SYRUP: 20, HIELO: 70, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Maracuyá', sortOrder: 2, stock: { PULPA_FRUTAS: 45, AGUA: 175, SYRUP: 22, HIELO: 70, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Frutos rojos', sortOrder: 3, stock: { PULPA_FRUTAS: 50, JUGO_NARANJA: 90, HIELO: 75, SODA: 60, PACK_TAKE: 1 } },
  ],
};

/** Limonadas take — volúmenes tipo 12oz */
const FORMATS_LIMONADA_TAKE12: FormatDef = {
  sku: 'CARTA-LIMONADA-TAKE-12OZ',
  productName: 'LIMONADA TAKE 12OZ',
  recipeName: 'RECETA LIMONADA TAKE 12OZ',
  groupName: 'Preparación — Limonada Take 12oz',
  salePrice: 0,
  variants: [
    { label: 'Limón clásico', sortOrder: 0, stock: { JUGO_LIMON: 55, AGUA: 250, HIELO: 95, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Limón y jengibre', sortOrder: 1, stock: { JUGO_LIMON: 48, AGUA: 235, SYRUP: 28, HIELO: 95, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Maracuyá', sortOrder: 2, stock: { PULPA_FRUTAS: 60, AGUA: 240, SYRUP: 30, HIELO: 95, SODA: 60, PACK_TAKE: 1 } },
    { label: 'Frutos rojos', sortOrder: 3, stock: { PULPA_FRUTAS: 65, JUGO_NARANJA: 130, HIELO: 100, SODA: 60, PACK_TAKE: 1 } },
  ],
};

/** Licuados (jarrito / vaso) */
const FORMAT_LICUADO: FormatDef = {
  sku: 'CARTA-LICUADO',
  productName: 'LICUADO',
  recipeName: 'RECETA LICUADO',
  groupName: 'Preparación — Licuado',
  salePrice: 0,
  variants: [
    { label: 'Banana', sortOrder: 0, stock: { PULPA_FRUTAS: 90, TIPO_LECHE: 200, YOGURT: 40, HIELO: 60 } },
    { label: 'Frutilla', sortOrder: 1, stock: { PULPA_FRUTAS: 95, TIPO_LECHE: 190, YOGURT: 40, HIELO: 60 } },
    { label: 'Durazno', sortOrder: 2, stock: { PULPA_FRUTAS: 90, TIPO_LECHE: 195, YOGURT: 35, HIELO: 60 } },
    { label: 'Mix frutas', sortOrder: 3, stock: { PULPA_FRUTAS: 100, TIPO_LECHE: 180, JUGO_NARANJA: 40, HIELO: 60 } },
  ],
};

/** Café de especialidad — variedades Coffee Store (PDF p.3) */
const FORMAT_CAFE_ESPECIALIDAD: FormatDef = {
  sku: 'CARTA-CAFE-ESP-GRANO-JARRITO',
  productName: 'CAFE ESPECIALIDAD JARRITO',
  recipeName: 'RECETA CAFE ESPECIALIDAD JARRITO',
  groupName: 'Preparación — Café especialidad (grano)',
  salePrice: 0,
  variants: [
    { label: 'Passion', sortOrder: 0, stock: { CAFE_GRANO: 15, AGUA: 100, SODA: 60 } },
    { label: 'Brasil Medium Roast', sortOrder: 1, stock: { CAFE_GRANO: 14, AGUA: 100, SODA: 60 } },
    { label: 'Colombian Dark', sortOrder: 2, stock: { CAFE_GRANO: 15, AGUA: 100, SODA: 60 } },
    { label: 'Colombian Decaff', sortOrder: 3, stock: { CAFE_GRANO: 15, AGUA: 100, SODA: 60 } },
    { label: 'Perú', sortOrder: 4, stock: { CAFE_GRANO: 14, AGUA: 100, SODA: 60 } },
    { label: 'Ethiopia', sortOrder: 5, stock: { CAFE_GRANO: 14, AGUA: 100, SODA: 60 } },
    { label: 'Ruanda', sortOrder: 6, stock: { CAFE_GRANO: 14, AGUA: 100, SODA: 60 } },
    { label: 'Honduras', sortOrder: 7, stock: { CAFE_GRANO: 15, AGUA: 100, SODA: 60 } },
    { label: 'Nicaragua', sortOrder: 8, stock: { CAFE_GRANO: 14, AGUA: 100, SODA: 60 } },
    { label: 'Brasil Santos Bourbon', sortOrder: 9, stock: { CAFE_GRANO: 15, AGUA: 100, SODA: 60 } },
  ],
};

/** Croissant jamón y queso — dulce o salado (PDF p.9) */
const FORMAT_CROISSANT_JAMON_QUESO: FormatDef = {
  sku: 'CARTA-CRO-JAMON-QUESO',
  productName: 'CROISSANT JAMON Y QUESO',
  recipeName: 'RECETA CROISSANT JQ',
  groupName: 'Preparación — Croissant jamón y queso',
  salePrice: 0,
  variants: [
    {
      label: 'Salado',
      sortOrder: 0,
      stock: { CROISSANT_MASA: 85, JAMON_COCIDO: 45, QUESO_TYBO: 40 },
    },
    {
      label: 'Dulce',
      sortOrder: 1,
      stock: { CROISSANT_MASA: 85, JAMON_COCIDO: 40, QUESO_TYBO: 30, MIEL: 15, DULCE_LECHE: 25 },
    },
  ],
};

/** Clásico medialuna — dulce o salada (PDF p.8) */
const FORMAT_CLASICO_MEDIALUNA: FormatDef = {
  sku: 'CARTA-CLAS-MEDIALUNA',
  productName: 'CLASICO MEDIALUNA',
  recipeName: 'RECETA CLASICO MEDIALUNA',
  groupName: 'Preparación — Clásico medialuna',
  salePrice: 0,
  variants: [
    {
      label: 'Salada',
      sortOrder: 0,
      stock: { CAFE_GRANO: 12, AGUA: 130, TIPO_LECHE: 170, SODA: 60, MEDIALUNA: 48, QUESO_TYBO: 12 },
    },
    {
      label: 'Dulce',
      sortOrder: 1,
      stock: { CAFE_GRANO: 12, AGUA: 130, TIPO_LECHE: 170, SODA: 60, MEDIALUNA: 48, MIEL: 12 },
    },
  ],
};

/** Medialuna sola pastelería — dulce o salada (PDF p.8, sin café) */
const FORMAT_MEDIALUNA_SOLO: FormatDef = {
  sku: 'CARTA-MEDIALUNA-SOLO',
  productName: 'MEDIALUNA',
  recipeName: 'RECETA MEDIALUNA SOLO',
  groupName: 'Preparación — Medialuna (pastelería)',
  salePrice: 0,
  variants: [
    { label: 'Salada', sortOrder: 0, stock: { MEDIALUNA: 52, QUESO_TYBO: 15 } },
    { label: 'Dulce', sortOrder: 1, stock: { MEDIALUNA: 52, MIEL: 14 } },
  ],
};

/** Croissant solo pastelería — dulce o salado (PDF p.8) */
const FORMAT_CROISSANT_SOLO: FormatDef = {
  sku: 'CARTA-CROISSANT-SOLO',
  productName: 'CROISSANT',
  recipeName: 'RECETA CROISSANT SOLO',
  groupName: 'Preparación — Croissant (pastelería)',
  salePrice: 0,
  variants: [
    { label: 'Salado', sortOrder: 0, stock: { CROISSANT_MASA: 88, QUESO_TYBO: 22 } },
    { label: 'Dulce', sortOrder: 1, stock: { CROISSANT_MASA: 88, MIEL: 16 } },
  ],
};

/** Rodaja de budín — sabores PDF p.8 */
const FORMAT_BUDIN_RODAJA: FormatDef = {
  sku: 'CARTA-BUDIN-RODAJA',
  productName: 'RODAJA DE BUDIN',
  recipeName: 'RECETA RODAJA BUDIN',
  groupName: 'Preparación — Sabor budín',
  salePrice: 0,
  variants: [
    { label: 'Limón', sortOrder: 0, stock: { BUDIN_REBANADA: 88 } },
    { label: 'Naranja', sortOrder: 1, stock: { BUDIN_REBANADA: 88 } },
    { label: 'Marmolado', sortOrder: 2, stock: { BUDIN_REBANADA: 88 } },
    { label: 'Vanilla chips', sortOrder: 3, stock: { BUDIN_REBANADA: 88 } },
    { label: 'Banana', sortOrder: 4, stock: { BUDIN_REBANADA: 88 } },
    { label: 'Carrot', sortOrder: 5, stock: { BUDIN_REBANADA: 88 } },
  ],
};

/** Cafés especiales take 8oz — cantidades PDF p.4 */
const FORMAT_CAFE_ESP_TAKE_8OZ: FormatDef = {
  sku: 'CARTA-CAFE-ESP-TAKE-8OZ',
  productName: 'CAFE ESPECIAL TAKE 8OZ',
  recipeName: 'RECETA CAFE ESP TAKE 8OZ',
  groupName: 'Preparación — Café especial Take 8oz',
  salePrice: 0,
  variants: [
    {
      label: 'MOCACCINO',
      sortOrder: 0,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 60,
        TIPO_LECHE: 140,
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
        CAFE_GRANO: 12,
        AGUA: 80,
        TIPO_LECHE: 160,
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
        CAFE_GRANO: 12,
        AGUA: 60,
        TIPO_LECHE: 130,
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
        CAFE_GRANO: 12,
        AGUA: 60,
        TIPO_LECHE: 130,
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
        CAFE_GRANO: 12,
        AGUA: 35,
        TIPO_LECHE: 180,
        SYRUP: 25,
        SODA: 60,
        PACK_TAKE: 1,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'SUBMARINO',
      sortOrder: 5,
      stock: { TIPO_LECHE: 240, BAR_CHOCOLATE: 1, CACAO: 3, PACK_TAKE: 1, GALLETA_COOKIE: 1 },
    },
    {
      label: 'SUBMARINO CARAMEL',
      sortOrder: 6,
      stock: {
        TIPO_LECHE: 185,
        SALSA_CHOCOLATE: 30,
        SYRUP_CARAMEL: 25,
        CACAO: 3,
        PACK_TAKE: 1,
        GALLETA_COOKIE: 1,
      },
    },
  ],
};

/** Cafés especiales take 12oz — cantidades PDF p.4–5 */
const FORMAT_CAFE_ESP_TAKE_12OZ: FormatDef = {
  sku: 'CARTA-CAFE-ESP-TAKE-12OZ',
  productName: 'CAFE ESPECIAL TAKE 12OZ',
  recipeName: 'RECETA CAFE ESP TAKE 12OZ',
  groupName: 'Preparación — Café especial Take 12oz',
  salePrice: 0,
  variants: [
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
      stock: { TIPO_LECHE: 350, BAR_CHOCOLATE: 1, CACAO: 3, PACK_TAKE: 1, GALLETA_COOKIE: 1 },
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
  ],
};

/**
 * Limonada en Coffee — vaso facetado grande 450ml.
 * Ficha: premix / almíbar, hielo, sorbete, rodaja limón, flor menta por variedad.
 */
const FORMAT_LIMONADA_COFFEE_450: FormatDef = {
  sku: 'CARTA-LIMONADA-SALON-450',
  productName: 'LIMONADA EN COFFEE 450ML',
  recipeName: 'RECETA LIMONADA EN COFFEE 450',
  groupName: 'Preparación — Limonada en Coffee (vaso facetado 450ml)',
  salePrice: 0,
  variants: [
    {
      label: 'MENTA Y JENGIBRE',
      sortOrder: 0,
      stock: {
        PREMIX_LIMONADA: 350,
        HIELO: 150,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'FRUTOS ROJOS',
      sortOrder: 1,
      stock: {
        ALMIBAR_FRUTOS_ROJOS: 30,
        PREMIX_LIMONADA: 320,
        HIELO: 150,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'MARACUYA Y MANGO',
      sortOrder: 2,
      stock: {
        ALMIBAR_MARACUYA: 30,
        PREMIX_LIMONADA: 320,
        HIELO: 150,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'PEPINO',
      sortOrder: 3,
      stock: {
        PEPINO: 30,
        PREMIX_LIMONADA: 320,
        HIELO: 150,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
  ],
};

/**
 * Jugo de naranja exprimido — vaso facetado Coffee.
 * Grande / Chico carta: jugo + hielo + sorbete + rodaja naranja. Chico desayuno: solo jugo + hielo (ficha).
 */
const FORMAT_JUGO_NARANJA_COFFEE: FormatDef = {
  sku: 'CARTA-JUGO-NARANJA-EXPRIMIDO',
  productName: 'JUGO DE NARANJA EXPRIMIDO',
  recipeName: 'RECETA JUGO NARANJA EXPRIMIDO',
  groupName: 'Preparación — Jugo naranja (vaso facetado Coffee)',
  salePrice: 0,
  variants: [
    {
      label: 'GRANDE',
      sortOrder: 0,
      stock: {
        JUGO_NARANJA: 350,
        HIELO: 150,
        SORBETE: 1,
        RODAJA_NARANJA: 1,
      },
    },
    {
      label: 'CHICO CARTA (VASO MAS LLENO)',
      sortOrder: 1,
      stock: {
        JUGO_NARANJA: 250,
        HIELO: 80,
        SORBETE: 1,
        RODAJA_NARANJA: 1,
      },
    },
    {
      label: 'CHICO DESAYUNO (VASO 1/3 LLENO)',
      sortOrder: 2,
      stock: { JUGO_NARANJA: 200, HIELO: 70 },
    },
  ],
};

/** Limonada / jugo take 450ml (PDF p.5) */
/** Limonada / jugo take 450ml — ficha: premix + hielo + pack + sorbete + rodaja + flor menta (naranja en jugo) */
const FORMAT_LIMONADA_TAKE_450_PDF: FormatDef = {
  sku: 'CARTA-LIMONADA-TAKE-450',
  productName: 'LIMONADA TAKE 450ML',
  recipeName: 'RECETA LIMONADA TAKE 450',
  groupName: 'Preparación — Limonada Take 450ml',
  salePrice: 0,
  variants: [
    {
      label: 'Limonada clásica',
      sortOrder: 0,
      stock: {
        PREMIX_LIMONADA: 320,
        HIELO: 142,
        PACK_TAKE: 1,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'Maracuyá',
      sortOrder: 1,
      stock: {
        PREMIX_LIMONADA: 300,
        ALMIBAR_MARACUYA: 34,
        HIELO: 142,
        PACK_TAKE: 1,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'Frutos rojos',
      sortOrder: 2,
      stock: {
        PREMIX_LIMONADA: 300,
        ALMIBAR_FRUTOS_ROJOS: 34,
        HIELO: 142,
        PACK_TAKE: 1,
        SORBETE: 1,
        RODAJA_LIMON: 1,
        FLOR_MENTA: 1,
      },
    },
    {
      label: 'JUGO DE NARANJA EXPRIMIDO',
      sortOrder: 3,
      stock: {
        JUGO_NARANJA: 320,
        HIELO: 142,
        PACK_TAKE: 1,
        SORBETE: 1,
        RODAJA_NARANJA: 1,
      },
    },
  ],
};

/**
 * Licuados 450ml — **mismo flujo que smoothie**: 1 producto salón + 1 take; 2 grupos obligatorios:
 * (tipo) multifruta / banana / 4 pulpas + (base líquida) leche/jugo/agua con ml según tipo.
 * El 2.º grupo define **9** opciones en DB (3 familias × 3 líquidos); el POS muestra solo 3 según el tipo.
 */
const LICUADO_SALON_450_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Licuado salón (tipo)',
    sortOrder: 10,
    variants: [
      {
        label: 'Multifruta',
        sortOrder: 0,
        stock: { MIX_FRUTA_FRESCA: 130, HIELO: 100, SORBETE: 1 },
      },
      {
        label: 'Banana',
        sortOrder: 1,
        stock: { BANANA: 150, HIELO: 50, AZUCAR: 16, SORBETE: 1 },
      },
      { label: 'Maracuyá', sortOrder: 2, stock: { PULPA_FRUTAS: 40, HIELO: 100, SORBETE: 1 } },
      { label: 'Frutilla', sortOrder: 3, stock: { PULPA_FRUTAS: 40, HIELO: 100, SORBETE: 1 } },
      { label: 'Durazno', sortOrder: 4, stock: { PULPA_FRUTAS: 40, HIELO: 100, SORBETE: 1 } },
      { label: 'Frutos rojos', sortOrder: 5, stock: { PULPA_FRUTAS: 40, HIELO: 100, SORBETE: 1 } },
    ],
  },
  {
    groupName: 'Preparación — Licuado salón (base líquida)',
    sortOrder: 20,
    variants: [
      { label: 'Leche', sortOrder: 0, stock: { TIPO_LECHE: 220 } },
      { label: 'Jugo de naranja', sortOrder: 1, stock: { JUGO_NARANJA: 220 } },
      { label: 'Agua', sortOrder: 2, stock: { AGUA: 220 } },
      { label: 'Leche', sortOrder: 3, stock: { TIPO_LECHE: 240 } },
      { label: 'Jugo de naranja', sortOrder: 4, stock: { JUGO_NARANJA: 240 } },
      { label: 'Agua', sortOrder: 5, stock: { AGUA: 240 } },
      { label: 'Leche', sortOrder: 6, stock: { TIPO_LECHE: 320 } },
      { label: 'Jugo de naranja', sortOrder: 7, stock: { JUGO_NARANJA: 320 } },
      { label: 'Agua', sortOrder: 8, stock: { AGUA: 320 } },
    ],
  },
];

const LICUADO_TAKE_450_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Licuado take (tipo)',
    sortOrder: 10,
    variants: [
      {
        label: 'Multifruta',
        sortOrder: 0,
        stock: {
          MIX_FRUTA_FRESCA: 45,
          HIELO: 150,
          AZUCAR: 16,
          SORBETE: 1,
          PACK_TAKE: 1,
        },
      },
      {
        label: 'Banana',
        sortOrder: 1,
        stock: {
          BANANA: 150,
          HIELO: 50,
          AZUCAR: 16,
          SORBETE: 1,
          PACK_TAKE: 1,
        },
      },
      {
        label: 'Maracuyá',
        sortOrder: 2,
        stock: { PULPA_FRUTAS: 34, HIELO: 150, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Frutilla',
        sortOrder: 3,
        stock: { PULPA_FRUTAS: 34, HIELO: 150, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Durazno',
        sortOrder: 4,
        stock: { PULPA_FRUTAS: 34, HIELO: 150, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Frutos rojos',
        sortOrder: 5,
        stock: { PULPA_FRUTAS: 34, HIELO: 150, SORBETE: 1, PACK_TAKE: 1 },
      },
    ],
  },
  {
    groupName: 'Preparación — Licuado take (base líquida)',
    sortOrder: 20,
    variants: [
      { label: 'Leche', sortOrder: 0, stock: { TIPO_LECHE: 280 } },
      { label: 'Jugo de naranja', sortOrder: 1, stock: { JUGO_NARANJA: 280 } },
      { label: 'Agua', sortOrder: 2, stock: { AGUA: 280 } },
      { label: 'Leche', sortOrder: 3, stock: { TIPO_LECHE: 240 } },
      { label: 'Jugo de naranja', sortOrder: 4, stock: { JUGO_NARANJA: 240 } },
      { label: 'Agua', sortOrder: 5, stock: { AGUA: 240 } },
      { label: 'Leche', sortOrder: 6, stock: { TIPO_LECHE: 320 } },
      { label: 'Jugo de naranja', sortOrder: 7, stock: { JUGO_NARANJA: 320 } },
      { label: 'Agua', sortOrder: 8, stock: { AGUA: 320 } },
    ],
  },
];

/** Smoothies salón/take 450ml — 2 grupos: sabor (pulpa + hielo + sorbete [+ pack take]) + base líquida 210ml */
const SMOOTHIE_SALON_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Smoothie salón (sabor)',
    sortOrder: 10,
    variants: [
      { label: 'Durazno Naranja', sortOrder: 0, stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1 } },
      { label: 'Frutos del bosque', sortOrder: 1, stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1 } },
      { label: 'Maracuyá y mango', sortOrder: 2, stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1 } },
      { label: 'Frutilla', sortOrder: 3, stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1 } },
    ],
  },
  {
    groupName: 'Preparación — Smoothie salón (base líquida)',
    sortOrder: 20,
    variants: [
      { label: 'Leche', sortOrder: 0, stock: { TIPO_LECHE: 210 } },
      { label: 'Jugo de naranja', sortOrder: 1, stock: { JUGO_NARANJA: 210 } },
      { label: 'Agua', sortOrder: 2, stock: { AGUA: 210 } },
    ],
  },
];

const SMOOTHIE_TAKE_GROUPS: FormatGroupDef[] = [
  {
    groupName: 'Preparación — Smoothie take (sabor)',
    sortOrder: 10,
    variants: [
      {
        label: 'Durazno Naranja',
        sortOrder: 0,
        stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Frutos del bosque',
        sortOrder: 1,
        stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Maracuyá y mango',
        sortOrder: 2,
        stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1, PACK_TAKE: 1 },
      },
      {
        label: 'Frutilla',
        sortOrder: 3,
        stock: { PULPA_FRUTAS: 40, HIELO: 200, SORBETE: 1, PACK_TAKE: 1 },
      },
    ],
  },
  {
    groupName: 'Preparación — Smoothie take (base líquida)',
    sortOrder: 20,
    variants: [
      { label: 'Leche', sortOrder: 0, stock: { TIPO_LECHE: 210 } },
      { label: 'Jugo de naranja', sortOrder: 1, stock: { JUGO_NARANJA: 210 } },
      { label: 'Agua', sortOrder: 2, stock: { AGUA: 210 } },
    ],
  },
];

/**
 * Cafés especiales (salón) — un solo producto POS con radios por variedad (mismo patrón que CLASICO POCILLO).
 * Receta por opción en Stock / Editar receta como el modal de variantes.
 */
const FORMAT_CAFES_ESPECIALES_SALON: FormatDef = {
  sku: 'CARTA-CAFES-ESPECIALES-SALON',
  productName: 'CAFES ESPECIALES',
  recipeName: 'RECETA CAFES ESPECIALES SALON',
  groupName: 'Preparación — Cafés especiales',
  salePrice: 0,
  variants: [
    {
      label: 'MOCACCINO',
      sortOrder: 0,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 60,
        TIPO_LECHE: 130,
        SALSA_CHOCOLATE: 34,
        CACAO: 3,
        CANELA: 3,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'CAPUCCINO',
      sortOrder: 1,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 60,
        TIPO_LECHE: 150,
        CACAO: 3,
        CANELA: 3,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'CAPUCCINO A LA ITALIANA',
      sortOrder: 2,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 50,
        TIPO_LECHE: 130,
        SALSA_CHOCOLATE: 34,
        CACAO: 3,
        CANELA: 3,
        CREMA: 30,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'CAPUCCINO HAZELNUT',
      sortOrder: 3,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 50,
        TIPO_LECHE: 130,
        SALSA_CHOCO_AVELLANAS: 34,
        CREMA: 30,
        CACAO: 3,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'SUBMARINO',
      sortOrder: 4,
      stock: { TIPO_LECHE: 250, BAR_CHOCOLATE: 1, CACAO: 3, GALLETA_COOKIE: 1 },
    },
    {
      label: 'SUBMARINO CARAMEL',
      sortOrder: 5,
      stock: {
        TIPO_LECHE: 195,
        SALSA_CHOCOLATE: 30,
        SYRUP_CARAMEL: 25,
        CACAO: 3,
        GALLETA_COOKIE: 1,
      },
    },
  ],
};

/** Tragos calientes — un producto con opciones (listado tipo CLASICO POCILLO). */
const FORMAT_TRAGOS_CALIENTES: FormatDef = {
  sku: 'CARTA-TRG-CALIENTES',
  productName: 'TRAGOS CALIENTES',
  recipeName: 'RECETA TRAGOS CALIENTES',
  groupName: 'Preparación — Tragos calientes',
  salePrice: 0,
  variants: [
    {
      label: 'CAFE BOMBON',
      sortOrder: 0,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 215,
        LECHE_ESPUMA: 10,
        LECHE_CONDENSADA: 34,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'CAFE AL CHOCOLATE',
      sortOrder: 1,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 215,
        LECHE_ESPUMA: 10,
        CACAO: 3,
        SALSA_CHOCOLATE: 34,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'TENTACION',
      sortOrder: 2,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 200,
        SALSA_CHOCOLATE: 20,
        LECHE_CONDENSADA: 20,
        CACAO: 3,
        CREMA: 30,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'CAFE IRLANDES',
      sortOrder: 3,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 190,
        WHISKY: 30,
        CREMA: 30,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'PEANUT COFFEE CREAM',
      sortOrder: 4,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 200,
        SALSA_CHOCOLATE: 20,
        CREMA_MANI: 30,
        CREMA: 30,
        CACAO: 3,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
  ],
};

/** Tragos fríos (salón) — un producto con opciones; ICE LATTE SABORIZADO sigue aparte (3 sabores). */
const FORMAT_TRAGOS_FRIOS: FormatDef = {
  sku: 'CARTA-TRG-FRIOS',
  productName: 'TRAGOS FRIOS',
  recipeName: 'RECETA TRAGOS FRIOS',
  groupName: 'Preparación — Tragos fríos',
  salePrice: 0,
  variants: [
    {
      label: 'ICE COFFEE',
      sortOrder: 0,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 200,
        HIELO: 120,
        DECO_FRUTAL: 2,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'COLD BREW',
      sortOrder: 1,
      stock: { COLD_BREW: 200, HIELO: 120, GALLETA_COOKIE: 1 },
    },
    {
      label: 'AFFOGATO',
      sortOrder: 2,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 100,
        HELADO: 120,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'ICE CAPUCCINO',
      sortOrder: 3,
      stock: {
        COLD_BREW: 160,
        HELADO: 60,
        SALSA_CHOCOLATE: 30,
        CREMA: 30,
        CACAO: 3,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'ICE CARAMEL COFFEE',
      sortOrder: 4,
      stock: {
        COLD_BREW: 160,
        HELADO: 60,
        SYRUP_CARAMEL: 33,
        CREMA: 30,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'ESPRESSO TONIC',
      sortOrder: 5,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 60,
        AGUA_TONICA: 130,
        HIELO: 120,
        GALLETA_COOKIE: 1,
      },
    },
    {
      label: 'SPANISH LATTE',
      sortOrder: 6,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 150,
        LECHE_CONDENSADA: 34,
        HIELO: 120,
        GALLETA_COOKIE: 1,
      },
    },
  ],
};

/** Café con leche + jugo chico (vaso 1/3) — base común combos DESA (PDF desayunos) */
const DESA_COMBO_CAFE_CON_LECHE_JUGO: Partial<Record<IngKey, number>> = {
  CAFE_GRANO: 12,
  AGUA: 130,
  TIPO_LECHE: 170,
  SODA: 60,
  JUGO_NARANJA: 200,
  HIELO: 70,
};

const DESA_AMERICANO_SIN_LECHE: Partial<Record<IngKey, number>> = {
  CAFE_GRANO: 12,
  AGUA: 280,
  SODA: 60,
  JUGO_NARANJA: 200,
  HIELO: 70,
};

/** Combos DESA: opciones de preparación (misma receta base; etiqueta para barra / KDS). Infusión té vs clásicos y dips x2 quedan en nota operativa hasta multi-select. */
const FORMAT_DESA_HUEVO_MAS: FormatDef = {
  sku: 'CARTA-DES-HUEVO-MAS',
  productName: 'DESA HUEVO Y MAS',
  recipeName: 'RECETA DESA HUEVO Y MAS',
  groupName: 'Preparación — Desa Huevo y más (tostadas)',
  salePrice: 0,
  variants: [
    {
      label: 'Tostadas pan blanco',
      sortOrder: 0,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, HUEVO: 2, PAN: 40 },
    },
    {
      label: 'Tostadas pan integral',
      sortOrder: 1,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, HUEVO: 2, PAN: 40 },
    },
    {
      label: 'Tostadas 1 y 1 (blanco + integral)',
      sortOrder: 2,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, HUEVO: 2, PAN: 40 },
    },
  ],
};

const FORMAT_DESA_TOSTADAS: FormatDef = {
  sku: 'CARTA-DES-TOSTADAS-COMBO',
  productName: 'DESA TOSTADAS',
  recipeName: 'RECETA DESA TOSTADAS',
  groupName: 'Preparación — Desa Tostadas (tipo de pan)',
  salePrice: 0,
  variants: [
    {
      label: 'Pan blanco (dips en nota)',
      sortOrder: 0,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, PAN: 90 },
    },
    {
      label: 'Pan integral (dips en nota)',
      sortOrder: 1,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, PAN: 90 },
    },
  ],
};

const FORMAT_DESA_MEDIALUNAS: FormatDef = {
  sku: 'CARTA-DES-MEDIALUNAS-COMBO',
  productName: 'DESA MEDIALUNAS',
  recipeName: 'RECETA DESA MEDIALUNAS',
  groupName: 'Preparación — Desa Medialunas (dulce / salado)',
  salePrice: 0,
  variants: [
    {
      label: 'Medialunas dulces (2 u.)',
      sortOrder: 0,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, MEDIALUNA: 90 },
    },
    {
      label: 'Medialunas saladas (2 u.)',
      sortOrder: 1,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, MEDIALUNA: 90 },
    },
    {
      label: 'Medialunas 1 y 1',
      sortOrder: 2,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, MEDIALUNA: 90 },
    },
  ],
};

const FORMAT_DESA_SALUDABLE: FormatDef = {
  sku: 'CARTA-DES-SALUDABLE',
  productName: 'DESA SALUDABLE',
  recipeName: 'RECETA DESA SALUDABLE',
  groupName: 'Preparación — Desa Saludable (tostadas + yogurt/fruta)',
  salePrice: 0,
  variants: [
    {
      label: 'Pan blanco',
      sortOrder: 0,
      stock: {
        ...DESA_COMBO_CAFE_CON_LECHE_JUGO,
        YOGURT: 80,
        PULPA_FRUTAS: 50,
        PAN: 90,
      },
    },
    {
      label: 'Pan integral',
      sortOrder: 1,
      stock: {
        ...DESA_COMBO_CAFE_CON_LECHE_JUGO,
        YOGURT: 80,
        PULPA_FRUTAS: 50,
        PAN: 90,
      },
    },
  ],
};

const FORMAT_DESA_AMERICANO: FormatDef = {
  sku: 'CARTA-DES-AMERICANO-COMBO',
  productName: 'DESA AMERICANO',
  recipeName: 'RECETA DESA AMERICANO',
  groupName: 'Preparación — Desa Americano (3 tostadas)',
  salePrice: 0,
  variants: [
    {
      label: '3 tostadas pan blanco',
      sortOrder: 0,
      stock: { ...DESA_AMERICANO_SIN_LECHE, PAN: 135 },
    },
    {
      label: '3 tostadas pan integral',
      sortOrder: 1,
      stock: { ...DESA_AMERICANO_SIN_LECHE, PAN: 135 },
    },
  ],
};

const FORMAT_DESA_LAMINADOS: FormatDef = {
  sku: 'CARTA-DES-LAMINADOS',
  productName: 'DESA LAMINADOS',
  recipeName: 'RECETA DESA LAMINADOS',
  groupName: 'Preparación — Desa Laminados (1 unidad)',
  salePrice: 0,
  variants: [
    {
      label: 'Croissant',
      sortOrder: 0,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, PAN: 55 },
    },
    {
      label: 'Roll de canela',
      sortOrder: 1,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, PAN: 55 },
    },
    {
      label: 'Danesa',
      sortOrder: 2,
      stock: { ...DESA_COMBO_CAFE_CON_LECHE_JUGO, PAN: 55 },
    },
  ],
};

const ALL_FORMATS: FormatDef[] = [
  ...FORMATS_CLASICOS,
  FORMATS_TAKE8,
  FORMATS_TAKE12,
  FORMAT_TE,
  FORMAT_CAFES_ESPECIALES_SALON,
  FORMAT_TRAGOS_CALIENTES,
  FORMAT_TRAGOS_FRIOS,
  FORMATS_LIMONADA_TAKE8,
  FORMATS_LIMONADA_TAKE12,
  FORMAT_LIMONADA_COFFEE_450,
  FORMAT_JUGO_NARANJA_COFFEE,
  FORMAT_LIMONADA_TAKE_450_PDF,
  FORMAT_LICUADO,
  FORMAT_DESA_HUEVO_MAS,
  FORMAT_DESA_TOSTADAS,
  FORMAT_DESA_MEDIALUNAS,
  FORMAT_DESA_SALUDABLE,
  FORMAT_DESA_AMERICANO,
  FORMAT_DESA_LAMINADOS,
  FORMAT_CAFE_ESPECIALIDAD,
  FORMAT_CROISSANT_JAMON_QUESO,
  FORMAT_CLASICO_MEDIALUNA,
  FORMAT_MEDIALUNA_SOLO,
  FORMAT_CROISSANT_SOLO,
  FORMAT_BUDIN_RODAJA,
  FORMAT_CAFE_ESP_TAKE_8OZ,
  FORMAT_CAFE_ESP_TAKE_12OZ,
];

/**
 * Cafés especiales (salón), tragos calientes y tragos fríos van como productos con opciones
 * (FORMAT_CAFES_ESPECIALES_SALON, FORMAT_TRAGOS_CALIENTES, FORMAT_TRAGOS_FRIOS) — mismo patrón que CLASICO POCILLO.
 */
const SIMPLE_PRODUCTS_CORE: SimpleProductDef[] = [
  // ── Desayunos armados (receta fija aproximada) ─────────────────────────
  {
    sku: 'CARTA-DES-TOAST-PALTA',
    productName: 'TOAST PALTA',
    recipeName: 'RECETA TOAST PALTA',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 90 },
      { key: 'PALTA', qty: 70 },
      { key: 'HUEVO', qty: 1 },
      { key: 'MANTEQUILLA', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-DES-CROISSANT',
    productName: 'CROISSANT',
    recipeName: 'RECETA CROISSANT',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 65 },
      { key: 'MANTEQUILLA', qty: 12 },
      { key: 'MIEL', qty: 8 },
    ],
  },
  {
    sku: 'CARTA-DES-WAFFLE',
    productName: 'WAFFLE CON MIEL',
    recipeName: 'RECETA WAFFLE MIEL',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 85 },
      { key: 'HUEVO', qty: 1 },
      { key: 'MIEL', qty: 28 },
      { key: 'MANTEQUILLA', qty: 10 },
    ],
  },
  // ── Pastelería por porción (mezcla genérica; podés partir por SKU después) ─
  {
    sku: 'CARTA-PAST-CHEESECAKE',
    productName: 'PORCION CHEESECAKE',
    recipeName: 'RECETA PORCION CHEESECAKE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 110 },
      { key: 'CREMA', qty: 15 },
    ],
  },
  {
    sku: 'CARTA-PAST-BROWNIE',
    productName: 'PORCION BROWNIE',
    recipeName: 'RECETA PORCION BROWNIE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 85 },
      { key: 'CACAO', qty: 8 },
      { key: 'SALSA_CHOCOLATE', qty: 15 },
    ],
  },
  {
    sku: 'CARTA-PAST-LEMON-PIE',
    productName: 'PORCION LEMON PIE',
    recipeName: 'RECETA PORCION LEMON PIE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 95 },
      { key: 'JUGO_LIMON', qty: 35 },
      { key: 'CREMA', qty: 20 },
    ],
  },
  /** Preparación cold brew 1 L (PDF p.3 — ajustar grano/origen en operación) */
  {
    sku: 'CARTA-PREP-COLD-BREW-1L',
    productName: 'PREP COLD BREW 1L',
    recipeName: 'RECETA COLD BREW 1L',
    salePrice: 0,
    lines: [
      { key: 'CAFE_GRANO', qty: 120 },
      { key: 'AGUA', qty: 1000 },
    ],
  },
  {
    sku: 'CARTA-CREMERA-FUSION-VAINILLA',
    productName: 'CARGA CREMERA FUSION VAINILLA 80G',
    recipeName: 'RECETA CARGA CREMERA VAINILLA',
    salePrice: 0,
    lines: [{ key: 'FUSION_VAINILLA', qty: 80 }],
  },
  /** Licuado salón — jugo verde (receta fija; sin opciones de base) */
  {
    sku: 'CARTA-LICUADO-SALON-JUGO-VERDE',
    productName: 'LICUADO SALON 450ML JUGO VERDE',
    recipeName: 'RECETA LICUADO SALON JUGO VERDE',
    salePrice: 0,
    lines: [
      { key: 'JUGO_LIMON', qty: 60 },
      { key: 'AGUA', qty: 200 },
      { key: 'ESPINACA', qty: 40 },
      { key: 'PEPINO', qty: 40 },
      { key: 'MANZANA_VERDE', qty: 50 },
      { key: 'APIO', qty: 25 },
    ],
  },
  // ── Clásicos con acompañamiento (PDF p.8) ───────────────────────────────
  /** CLASICO MEDIALUNA → FORMAT_CLASICO_MEDIALUNA (dulce/salada) */
  {
    sku: 'CARTA-CLAS-BUDIN',
    productName: 'CLASICO BUDIN',
    recipeName: 'RECETA CLASICO BUDIN',
    salePrice: 0,
    lines: [
      { key: 'CAFE_GRANO', qty: 12 },
      { key: 'AGUA', qty: 130 },
      { key: 'LECHE', qty: 170 },
      { key: 'SODA', qty: 60 },
      { key: 'BUDIN_REBANADA', qty: 85 },
    ],
  },
  {
    sku: 'CARTA-CLAS-COOKIE',
    productName: 'CLASICO COOKIE AMERICANA',
    recipeName: 'RECETA CLASICO COOKIE',
    salePrice: 0,
    lines: [
      { key: 'CAFE_GRANO', qty: 12 },
      { key: 'AGUA', qty: 130 },
      { key: 'LECHE', qty: 170 },
      { key: 'SODA', qty: 60 },
      { key: 'GALLETA_COOKIE', qty: 1 },
    ],
  },
  // ── Más pastelería (PDF p.8–9 — ampliar SKUs después) ───────────────────
  {
    sku: 'CARTA-PAST-TIRAMISU',
    productName: 'PORCION TIRAMISU',
    recipeName: 'RECETA TIRAMISU',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 115 },
      { key: 'CREMA', qty: 25 },
      { key: 'CACAO', qty: 5 },
    ],
  },
  {
    sku: 'CARTA-PAST-SELVA-NEGRA',
    productName: 'PORCION SELVA NEGRA',
    recipeName: 'RECETA SELVA NEGRA',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 110 },
      { key: 'SALSA_CHOCOLATE', qty: 20 },
    ],
  },
  {
    sku: 'CARTA-PAST-CHOCOTORTA',
    productName: 'PORCION CHOCOTORTA',
    recipeName: 'RECETA CHOCOTORTA',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 105 },
      { key: 'CACAO', qty: 10 },
      { key: 'SALSA_CHOCOLATE', qty: 18 },
    ],
  },
  {
    sku: 'CARTA-PAST-RED-VELVET',
    productName: 'PORCION RED VELVET',
    recipeName: 'RECETA RED VELVET',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 100 },
      { key: 'CREMA', qty: 25 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-BROWNIE-OREO',
    productName: 'CUADRADO BROWNIE OREO',
    recipeName: 'RECETA CUADRADO BROWNIE OREO',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 90 },
      { key: 'CACAO', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-PAST-ALFAJOR-PISTACHO',
    productName: 'ALFAJOR ESPECIAL PISTACHO',
    recipeName: 'RECETA ALFAJOR PISTACHO',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 75 },
      { key: 'CREMA', qty: 15 },
    ],
  },
  {
    sku: 'CARTA-PAST-ALFAJOR-CHOCO-FR',
    productName: 'ALFAJOR CHOCO Y FRUTOS ROJOS',
    recipeName: 'RECETA ALFAJOR CHOCO FR',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 72 },
      { key: 'PULPA_FRUTAS', qty: 18 },
      { key: 'SALSA_CHOCOLATE', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-PAST-ALFAJOR-NUEZ-DDL',
    productName: 'ALFAJOR NUEZ Y DDL',
    recipeName: 'RECETA ALFAJOR NUEZ DDL',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 72 },
      { key: 'DULCE_LECHE', qty: 28 },
    ],
  },
  {
    sku: 'CARTA-PAST-SIN-TACC-MAICENA',
    productName: 'ALFAJOR MAICENA SIN TACC',
    recipeName: 'RECETA ALFAJOR MAICENA SIN TACC',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 55 },
      { key: 'LECHE_CONDENSADA', qty: 25 },
    ],
  },
  /** Cuadrados 10×10 — PDF p.8 (faltantes respecto a brownie oreo) */
  {
    sku: 'CARTA-PAST-CUADRADO-BROWNIE-CLASICO',
    productName: 'CUADRADO BROWNIE CLASICO',
    recipeName: 'RECETA CUADRADO BROWNIE CLASICO',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 95 },
      { key: 'CACAO', qty: 14 },
      { key: 'SALSA_CHOCOLATE', qty: 18 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-RED-VELVET',
    productName: 'CUADRADO BROWNIE RED VELVET',
    recipeName: 'RECETA CUADRADO RED VELVET',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 92 },
      { key: 'CREMA', qty: 22 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-BROWNIE-CHEESECAKE',
    productName: 'CUADRADO BROWNIE CHEESECAKE',
    recipeName: 'RECETA CUADRADO BROWNIE CHEESECAKE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 94 },
      { key: 'CREMA', qty: 20 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-CRUMBLE-MANZANA',
    productName: 'CUADRADO CRUMBLE MANZANA',
    recipeName: 'RECETA CUADRADO CRUMBLE MANZANA',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 95 },
      { key: 'MIEL', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-LIMON',
    productName: 'CUADRADO LIMON',
    recipeName: 'RECETA CUADRADO LIMON',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 92 },
      { key: 'JUGO_LIMON', qty: 22 },
    ],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-PASTAFROLA',
    productName: 'CUADRADO PASTAFROLA',
    recipeName: 'RECETA CUADRADO PASTAFROLA',
    salePrice: 0,
    lines: [{ key: 'MEZCLA_TORTA', qty: 98 }],
  },
  {
    sku: 'CARTA-PAST-CUADRADO-COCO-DDL',
    productName: 'CUADRADO COCO Y DDL',
    recipeName: 'RECETA CUADRADO COCO DDL',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 90 },
      { key: 'DULCE_LECHE', qty: 35 },
    ],
  },
  /** Cuadrados sin TACC — PDF p.8 */
  {
    sku: 'CARTA-PAST-SINTACC-COCO-DDL',
    productName: 'CUADRADO SIN TACC COCO Y DDL',
    recipeName: 'RECETA CUADRADO ST COCO DDL',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 88 },
      { key: 'DULCE_LECHE', qty: 32 },
    ],
  },
  {
    sku: 'CARTA-PAST-SINTACC-LIMON',
    productName: 'CUADRADO SIN TACC LIMON',
    recipeName: 'RECETA CUADRADO ST LIMON',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 88 },
      { key: 'JUGO_LIMON', qty: 20 },
    ],
  },
  {
    sku: 'CARTA-PAST-SINTACC-BROWNIE',
    productName: 'CUADRADO SIN TACC BROWNIE',
    recipeName: 'RECETA CUADRADO ST BROWNIE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 88 },
      { key: 'CACAO', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-PAST-SINTACC-CRUMBLE-MANZANA',
    productName: 'CUADRADO SIN TACC CRUMBLE MANZANA',
    recipeName: 'RECETA CUADRADO ST CRUMBLE',
    salePrice: 0,
    lines: [
      { key: 'MEZCLA_TORTA', qty: 90 },
      { key: 'MIEL', qty: 10 },
    ],
  },
  // ══ PDF p.9 — Croissants / waffles / tostados ═══════════════════════════
  /** CROISSANT JAMON Y QUESO → producto con opciones (FORMAT_CROISSANT_JAMON_QUESO) */
  {
    sku: 'CARTA-CRO-MEDITERRANEO',
    productName: 'CROISSANT MEDITERRANEO',
    recipeName: 'RECETA CROISSANT MEDITERRANEO',
    salePrice: 0,
    lines: [
      { key: 'CROISSANT_MASA', qty: 85 },
      { key: 'JAMON_CRUDO', qty: 40 },
      { key: 'QUESO_TYBO', qty: 35 },
      { key: 'RUCULA', qty: 15 },
      { key: 'TOMATE', qty: 30 },
    ],
  },
  {
    sku: 'CARTA-CRO-PALTA',
    productName: 'CROISSANT DE PALTA',
    recipeName: 'RECETA CROISSANT PALTA',
    salePrice: 0,
    lines: [
      { key: 'CROISSANT_MASA', qty: 85 },
      { key: 'PALTA', qty: 70 },
      { key: 'CREMA', qty: 25 },
      { key: 'RUCULA', qty: 10 },
    ],
  },
  {
    sku: 'CARTA-CRO-SALMON',
    productName: 'CROISSANT DE SALMON',
    recipeName: 'RECETA CROISSANT SALMON',
    salePrice: 0,
    lines: [
      { key: 'CROISSANT_MASA', qty: 85 },
      { key: 'SALMON', qty: 50 },
      { key: 'CREMA', qty: 20 },
      { key: 'RUCULA', qty: 15 },
    ],
  },
  {
    sku: 'CARTA-WAFF-BANANA',
    productName: 'WAFFLE BANANA DDL',
    recipeName: 'RECETA WAFFLE BANANA',
    salePrice: 0,
    lines: [
      { key: 'WAFFLE_MASA', qty: 170 },
      { key: 'BANANA', qty: 140 },
      { key: 'DULCE_LECHE', qty: 80 },
      { key: 'CREMA', qty: 35 },
      { key: 'SALSA_CHOCOLATE', qty: 20 },
    ],
  },
  {
    sku: 'CARTA-WAFF-FRUTOS-ROJOS',
    productName: 'WAFFLE FRUTOS ROJOS',
    recipeName: 'RECETA WAFFLE FRUTOS',
    salePrice: 0,
    lines: [
      { key: 'WAFFLE_MASA', qty: 170 },
      { key: 'PULPA_FRUTAS', qty: 80 },
      { key: 'HELADO', qty: 140 },
      { key: 'MIEL', qty: 10 },
    ],
  },
  {
    sku: 'CARTA-WAFF-JAMON-QUESO',
    productName: 'WAFFLE JAMON Y QUESO',
    recipeName: 'RECETA WAFFLE JQ',
    salePrice: 0,
    lines: [
      { key: 'WAFFLE_MASA', qty: 170 },
      { key: 'JAMON_COCIDO', qty: 80 },
      { key: 'QUESO_TYBO', qty: 90 },
    ],
  },
  {
    sku: 'CARTA-TSTD-JQ-X4',
    productName: 'TOSTADO JAMON Y QUESO X4',
    recipeName: 'RECETA TOSTADO JQ X4',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 140 },
      { key: 'JAMON_COCIDO', qty: 160 },
      { key: 'QUESO_TYBO', qty: 120 },
      { key: 'MAYONESA', qty: 45 },
    ],
  },
  {
    sku: 'CARTA-TSTD-CRUDO-X4',
    productName: 'TOSTADO CRUDO Y QUESO X4',
    recipeName: 'RECETA TOSTADO CRUDO X4',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 140 },
      { key: 'JAMON_CRUDO', qty: 110 },
      { key: 'QUESO_TYBO', qty: 100 },
      { key: 'MAYONESA', qty: 35 },
    ],
  },
  {
    sku: 'CARTA-TSTD-PRIMAVERA-X4',
    productName: 'TOSTADO PRIMAVERA X4',
    recipeName: 'RECETA TOSTADO PRIMAVERA X4',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 140 },
      { key: 'JAMON_COCIDO', qty: 100 },
      { key: 'QUESO_TYBO', qty: 85 },
      { key: 'LECHUGA', qty: 45 },
      { key: 'TOMATE', qty: 55 },
    ],
  },
  {
    sku: 'CARTA-TSTD-JQ-X8',
    productName: 'TOSTADO JAMON Y QUESO X8',
    recipeName: 'RECETA TOSTADO JQ X8',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 280 },
      { key: 'JAMON_COCIDO', qty: 320 },
      { key: 'QUESO_TYBO', qty: 240 },
      { key: 'MAYONESA', qty: 90 },
    ],
  },
  {
    sku: 'CARTA-TSTD-CRUDO-X8',
    productName: 'TOSTADO CRUDO Y QUESO X8',
    recipeName: 'RECETA TOSTADO CRUDO X8',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 280 },
      { key: 'JAMON_CRUDO', qty: 220 },
      { key: 'QUESO_TYBO', qty: 200 },
      { key: 'MAYONESA', qty: 70 },
    ],
  },
  {
    sku: 'CARTA-MED-JQ-X2',
    productName: 'MEDIALUNAS JAMON Y QUESO X2',
    recipeName: 'RECETA MEDIALUNAS JQ',
    salePrice: 0,
    lines: [
      { key: 'MEDIALUNA', qty: 90 },
      { key: 'JAMON_COCIDO', qty: 70 },
      { key: 'QUESO_TYBO', qty: 55 },
    ],
  },
  // ══ PDF p.10 — Saludables / sandwiches / montados ═════════════════════
  {
    sku: 'CARTA-SALUD-OMELET',
    productName: 'OMELET',
    recipeName: 'RECETA OMELET',
    salePrice: 0,
    lines: [
      { key: 'HUEVO', qty: 3 },
      { key: 'QUESO_TYBO', qty: 45 },
      { key: 'JAMON_COCIDO', qty: 45 },
      { key: 'MASAMADRE', qty: 85 },
    ],
  },
  {
    sku: 'CARTA-SALUD-ENS-FRUTA',
    productName: 'ENSALADA DE FRUTA',
    recipeName: 'RECETA ENS FRUTA',
    salePrice: 0,
    lines: [
      { key: 'MIX_FRUTA_FRESCA', qty: 220 },
      { key: 'JUGO_NARANJA', qty: 250 },
    ],
  },
  {
    sku: 'CARTA-SALUD-BOWL',
    productName: 'BOWL SALUDABLE',
    recipeName: 'RECETA BOWL SALUDABLE',
    salePrice: 0,
    lines: [
      { key: 'YOGURT_GRIEGO', qty: 190 },
      { key: 'MIX_FRUTA_FRESCA', qty: 100 },
      { key: 'GRANOLA', qty: 90 },
      { key: 'PULPA_FRUTAS', qty: 45 },
    ],
  },
  {
    sku: 'CARTA-SALUD-BRUSCH-CAPRESE',
    productName: 'BRUSCHETA CAPRESE',
    recipeName: 'RECETA BRUSCH CAPRESE',
    salePrice: 0,
    lines: [
      { key: 'MASAMADRE', qty: 85 },
      { key: 'TOMATE', qty: 70 },
      { key: 'MUZZARELLA', qty: 85 },
      { key: 'RUCULA', qty: 25 },
      { key: 'MIEL', qty: 12 },
    ],
  },
  {
    sku: 'CARTA-SALUD-BRUSCH-MED',
    productName: 'BRUSCHETA MEDITERRANEA',
    recipeName: 'RECETA BRUSCH MED',
    salePrice: 0,
    lines: [
      { key: 'MASAMADRE', qty: 85 },
      { key: 'JAMON_CRUDO', qty: 45 },
      { key: 'TOMATE', qty: 45 },
      { key: 'RUCULA', qty: 30 },
      { key: 'MIEL', qty: 10 },
    ],
  },
  {
    sku: 'CARTA-SALUD-AVO-TOAST',
    productName: 'AVOCADO TOAST',
    recipeName: 'RECETA AVOCADO TOAST',
    salePrice: 0,
    lines: [
      { key: 'MASAMADRE', qty: 95 },
      { key: 'PALTA', qty: 75 },
      { key: 'HUEVO', qty: 1 },
      { key: 'RUCULA', qty: 18 },
      { key: 'CREMA', qty: 15 },
    ],
  },
  {
    sku: 'CARTA-SALUD-CROQUE',
    productName: 'CROQUE MADAME',
    recipeName: 'RECETA CROQUE MADAME',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 110 },
      { key: 'JAMON_COCIDO', qty: 55 },
      { key: 'QUESO_TYBO', qty: 45 },
      { key: 'MUZZARELLA', qty: 35 },
      { key: 'HUEVO', qty: 1 },
    ],
  },
  {
    sku: 'CARTA-SAND-FOC-PORK',
    productName: 'FOCACCIA PORK',
    recipeName: 'RECETA FOCACCIA PORK',
    salePrice: 0,
    lines: [
      { key: 'PAN_FOCACCIA', qty: 190 },
      { key: 'CERDO_LAQUEADO', qty: 95 },
      { key: 'RUCULA', qty: 30 },
      { key: 'TOMATE', qty: 35 },
    ],
  },
  {
    sku: 'CARTA-SAND-FOC-PASTRAMI',
    productName: 'FOCACCIA PASTRAMI',
    recipeName: 'RECETA FOCACCIA PASTRAMI',
    salePrice: 0,
    lines: [
      { key: 'PAN_FOCACCIA', qty: 190 },
      { key: 'LOMITO_CERDO', qty: 90 },
      { key: 'MUZZARELLA', qty: 55 },
      { key: 'TOMATE', qty: 45 },
      { key: 'RUCULA', qty: 25 },
    ],
  },
  {
    sku: 'CARTA-SAND-VEGGIE',
    productName: 'SANDWICH VEGGIE',
    recipeName: 'RECETA SAND VEGGIE',
    salePrice: 0,
    lines: [
      { key: 'PAN_CIABATTA', qty: 170 },
      { key: 'HUMMUS', qty: 45 },
      { key: 'PALTA', qty: 55 },
      { key: 'RUCULA', qty: 35 },
      { key: 'TOFU', qty: 45 },
      { key: 'QUESO_FUNDIDO', qty: 35 },
    ],
  },
  {
    sku: 'CARTA-SAND-MILANESA',
    productName: 'SANDWICH MILANESA',
    recipeName: 'RECETA SAND MILANESA',
    salePrice: 0,
    lines: [
      { key: 'PAN_CHIPA', qty: 210 },
      { key: 'POLLO', qty: 130 },
      { key: 'JAMON_COCIDO', qty: 35 },
      { key: 'MUZZARELLA', qty: 55 },
      { key: 'HUEVO', qty: 2 },
      { key: 'LECHUGA', qty: 35 },
      { key: 'TOMATE', qty: 35 },
      { key: 'MAYONESA', qty: 30 },
    ],
  },
  {
    sku: 'CARTA-SAND-POLLO',
    productName: 'SANDWICH POLLO',
    recipeName: 'RECETA SAND POLLO',
    salePrice: 0,
    lines: [
      { key: 'PAN_CIABATTA', qty: 170 },
      { key: 'POLLO', qty: 110 },
      { key: 'PALTA', qty: 45 },
      { key: 'RUCULA', qty: 30 },
      { key: 'TOMATE', qty: 40 },
      { key: 'MUZZARELLA', qty: 50 },
    ],
  },
  {
    sku: 'CARTA-MONT-VEGGIE',
    productName: 'MONTADO VEGGIE',
    recipeName: 'RECETA MONTADO VEGGIE',
    salePrice: 0,
    lines: [
      { key: 'PAN_NAAN', qty: 105 },
      { key: 'HUMMUS', qty: 40 },
      { key: 'RUCULA', qty: 25 },
      { key: 'TOFU', qty: 45 },
    ],
  },
  {
    sku: 'CARTA-MONT-BURRATA',
    productName: 'MONTADO BURRATA',
    recipeName: 'RECETA MONTADO BURRATA',
    salePrice: 0,
    lines: [
      { key: 'PAN_NAAN', qty: 105 },
      { key: 'BURRATA', qty: 95 },
      { key: 'HUMMUS', qty: 35 },
      { key: 'RUCULA', qty: 30 },
    ],
  },
  // ══ PDF p.11 — Wraps / hamburguesa / ensaladas / pokes ══════════════════
  {
    sku: 'CARTA-WRAP-POLLO',
    productName: 'WRAP POLLO',
    recipeName: 'RECETA WRAP POLLO',
    salePrice: 0,
    lines: [
      { key: 'TORTILLA', qty: 85 },
      { key: 'POLLO', qty: 95 },
      { key: 'PANCETA', qty: 30 },
      { key: 'MUZZARELLA', qty: 45 },
      { key: 'PALTA', qty: 40 },
      { key: 'RUCULA', qty: 22 },
    ],
  },
  {
    sku: 'CARTA-WRAP-CERDO',
    productName: 'WRAP CERDO',
    recipeName: 'RECETA WRAP CERDO',
    salePrice: 0,
    lines: [
      { key: 'TORTILLA', qty: 85 },
      { key: 'CERDO_LAQUEADO', qty: 90 },
      { key: 'QUESO_FUNDIDO', qty: 40 },
      { key: 'MAYONESA', qty: 25 },
      { key: 'RUCULA', qty: 22 },
    ],
  },
  {
    sku: 'CARTA-HAMB-CRIOLLA',
    productName: 'HAMBURGUESA CRIOLLA',
    recipeName: 'RECETA HAMB CRIOLLA',
    salePrice: 0,
    lines: [
      { key: 'PAN', qty: 125 },
      { key: 'LOMITO_CERDO', qty: 160 },
      { key: 'MUZZARELLA', qty: 45 },
      { key: 'LECHUGA', qty: 30 },
      { key: 'TOMATE', qty: 35 },
      { key: 'MAYONESA', qty: 30 },
      { key: 'PAPAS_CUNA', qty: 200 },
    ],
  },
  {
    sku: 'CARTA-PAPAS-CHEDDAR',
    productName: 'PAPAS CHEDDAR',
    recipeName: 'RECETA PAPAS CHEDDAR',
    salePrice: 0,
    lines: [
      { key: 'PAPAS_CUNA', qty: 220 },
      { key: 'CHEDDAR_LIQUIDO', qty: 85 },
      { key: 'PANCETA', qty: 40 },
    ],
  },
  {
    sku: 'CARTA-ENS-CAPONATTA',
    productName: 'ENSALADA CAPONATTA BRIE',
    recipeName: 'RECETA ENS CAPONATTA',
    salePrice: 0,
    lines: [
      { key: 'LECHUGA', qty: 70 },
      { key: 'RUCULA', qty: 45 },
      { key: 'BROCOLI', qty: 75 },
      { key: 'QUESO_FUNDIDO', qty: 60 },
      { key: 'TOMATE', qty: 50 },
    ],
  },
  {
    sku: 'CARTA-ENS-QUINOA',
    productName: 'ENSALADA QUINOA',
    recipeName: 'RECETA ENS QUINOA',
    salePrice: 0,
    lines: [
      { key: 'ARROZ', qty: 120 },
      { key: 'RUCULA', qty: 40 },
      { key: 'LECHUGA', qty: 35 },
      { key: 'TOMATE', qty: 45 },
      { key: 'QUESO_AZUL', qty: 40 },
    ],
  },
  {
    sku: 'CARTA-ENS-CAESAR',
    productName: 'ENSALADA CAESAR',
    recipeName: 'RECETA ENS CAESAR',
    salePrice: 0,
    lines: [
      { key: 'POLLO', qty: 110 },
      { key: 'LECHUGA', qty: 130 },
      { key: 'QUESO_TYBO', qty: 35 },
      { key: 'PAN', qty: 35 },
    ],
  },
  {
    sku: 'CARTA-POKE-LANGOSTINOS',
    productName: 'POKE LANGOSTINOS',
    recipeName: 'RECETA POKE LANGOSTINOS',
    salePrice: 0,
    lines: [
      { key: 'ARROZ', qty: 190 },
      { key: 'LANGOSTINOS', qty: 95 },
      { key: 'PALTA', qty: 45 },
      { key: 'HUEVO', qty: 1 },
      { key: 'PEPINO', qty: 30 },
    ],
  },
  {
    sku: 'CARTA-POKE-SALMON',
    productName: 'POKE SALMON',
    recipeName: 'RECETA POKE SALMON',
    salePrice: 0,
    lines: [
      { key: 'ARROZ', qty: 190 },
      { key: 'SALMON', qty: 90 },
      { key: 'PALTA', qty: 50 },
      { key: 'HUEVO', qty: 1 },
    ],
  },
  {
    sku: 'CARTA-POKE-TOFU',
    productName: 'POKE TOFU VEGETALES',
    recipeName: 'RECETA POKE TOFU',
    salePrice: 0,
    lines: [
      { key: 'ARROZ', qty: 190 },
      { key: 'TOFU', qty: 75 },
      { key: 'PALTA', qty: 45 },
      { key: 'TOMATE', qty: 35 },
    ],
  },
  {
    sku: 'CARTA-ENS-PERAS',
    productName: 'ENSALADA PERAS',
    recipeName: 'RECETA ENS PERAS',
    salePrice: 0,
    lines: [
      { key: 'RUCULA', qty: 55 },
      { key: 'PULPA_FRUTAS', qty: 80 },
      { key: 'QUESO_AZUL', qty: 35 },
      { key: 'MIEL', qty: 18 },
    ],
  },
  {
    sku: 'CARTA-ENS-SALMON-PALTA',
    productName: 'ENSALADA SALMON Y PALTA',
    recipeName: 'RECETA ENS SALMON PALTA',
    salePrice: 0,
    lines: [
      { key: 'SALMON', qty: 85 },
      { key: 'PALTA', qty: 65 },
      { key: 'LECHUGA', qty: 90 },
      { key: 'RUCULA', qty: 35 },
    ],
  },
  // ══ PDF p.12 — Keto / jugo verde ═══════════════════════════════════════
  {
    sku: 'CARTA-KETO-BOWL',
    productName: 'BOWL KETO',
    recipeName: 'RECETA BOWL KETO',
    salePrice: 0,
    lines: [
      { key: 'YOGURT_GRIEGO', qty: 160 },
      { key: 'PULPA_FRUTAS', qty: 55 },
      { key: 'GRANOLA', qty: 45 },
    ],
  },
  {
    sku: 'CARTA-KETO-HUEVO',
    productName: 'HUEVO KETO',
    recipeName: 'RECETA HUEVO KETO',
    salePrice: 0,
    lines: [
      { key: 'HUEVO', qty: 3 },
      { key: 'JAMON_COCIDO', qty: 45 },
      { key: 'CRACKER_SEMILLAS', qty: 2 },
      { key: 'CAFE_GRANO', qty: 12 },
      { key: 'AGUA', qty: 130 },
      { key: 'LECHE_ALMENDRAS', qty: 200 },
      { key: 'SODA', qty: 60 },
    ],
  },
  {
    sku: 'CARTA-KETO-OMELET',
    productName: 'OMELET KETO',
    recipeName: 'RECETA OMELET KETO',
    salePrice: 0,
    lines: [
      { key: 'HUEVO', qty: 3 },
      { key: 'ESPINACA', qty: 45 },
      { key: 'MUZZARELLA', qty: 45 },
      { key: 'CRACKER_SEMILLAS', qty: 2 },
    ],
  },
  {
    sku: 'CARTA-KETO-ENS',
    productName: 'ENSALADA KETO',
    recipeName: 'RECETA ENS KETO',
    salePrice: 0,
    lines: [
      { key: 'LECHUGA', qty: 110 },
      { key: 'RUCULA', qty: 45 },
      { key: 'BROCOLI', qty: 65 },
      { key: 'QUESO_AZUL', qty: 40 },
      { key: 'PULPA_FRUTAS', qty: 25 },
    ],
  },
  {
    sku: 'CARTA-KETO-SAND-ATUN',
    productName: 'SANDWICH NUBE ATUN',
    recipeName: 'RECETA SAND NUBE ATUN',
    salePrice: 0,
    lines: [
      { key: 'PAN_NUBE', qty: 85 },
      { key: 'ATUN', qty: 95 },
      { key: 'TOMATE', qty: 35 },
      { key: 'MUZZARELLA', qty: 45 },
      { key: 'LECHUGA', qty: 30 },
    ],
  },
  {
    sku: 'CARTA-KETO-SAND-CERDO',
    productName: 'SANDWICH NUBE CERDO',
    recipeName: 'RECETA SAND NUBE CERDO',
    salePrice: 0,
    lines: [
      { key: 'PAN_NUBE', qty: 85 },
      { key: 'LOMITO_CERDO', qty: 105 },
      { key: 'TOMATE', qty: 35 },
      { key: 'MUZZARELLA', qty: 45 },
      { key: 'LECHUGA', qty: 30 },
    ],
  },
  {
    sku: 'CARTA-KETO-JUGO-VERDE',
    productName: 'JUGO VERDE',
    recipeName: 'RECETA JUGO VERDE',
    salePrice: 0,
    lines: [
      { key: 'ESPINACA', qty: 45 },
      { key: 'JUGO_LIMON', qty: 25 },
      { key: 'PEPINO', qty: 45 },
      { key: 'APIO', qty: 30 },
      { key: 'MANZANA_VERDE', qty: 90 },
    ],
  },
  {
    sku: 'CARTA-KETO-SALMON',
    productName: 'SALMON KETO',
    recipeName: 'RECETA SALMON KETO',
    salePrice: 0,
    lines: [
      { key: 'SALMON', qty: 160 },
      { key: 'BROCOLI', qty: 90 },
      { key: 'PALTA', qty: 35 },
    ],
  },
];

/** Porciones torta (1/8) y tarta (1/6) — nombres PDF p.8–9 */
const TORTA_PORCION_SKUS: ReadonlyArray<[string, string]> = [
  ['CHAJA', 'CHAJÁ'],
  ['MATILDA', 'MATILDA'],
  ['SELVA-NEGRA', 'SELVA NEGRA'],
  ['MARQUISE-FR', 'MARQUISE FRUTOS ROJOS'],
  ['BROWNIE-OREO', 'BROWNIE OREO'],
  ['AVA', 'AVA'],
  ['CARROT', 'CARROT CAKE'],
  ['RED-VELVET', 'RED VELVET'],
  ['CHOCOTORTA', 'CHOCOTORTA'],
  ['SOUFFLE-NUEZ', 'SOUFFLÉ DE NUEZ'],
  ['MARQUIS-LIMON', 'MARQUIS DE LIMÓN'],
  ['CHEESECAKE-FR', 'CHEESECAKE FRUTOS ROJOS'],
  ['CHEESECAKE-PISTACH', 'CHEESECAKE PISTACHO'],
  ['TORTA-PISTACHO', 'TORTA PISTACHO'],
  ['CHEESECAKE-LIMON', 'CHEESECAKE LIMÓN'],
  ['BROWNIE-FRANUI', 'BROWNIE FRANUI'],
  ['CHEESECAKE-CHOCO', 'CHEESECAKE CHOCO'],
  ['TRIPLE-MOUSSE', 'TRIPLE MOUSSE'],
  ['MOKA', 'MOKA'],
  ['BROWNIE-ALMEND-COCO', 'BROWNIE ALMENDRAS Y COCO'],
  ['BROWNIE-PISTACHO', 'BROWNIE PISTACHO'],
  ['BROWNIE-BLACK', 'BROWNIE BLACK'],
];

const TARTA_PORCION_SKUS: ReadonlyArray<[string, string]> = [
  ['MARACUYA', 'MARACUYÁ'],
  ['MARROC', 'MARROC'],
  ['CHOCO-BL-FRAMB', 'CHOCO BLANCO Y FRAMBUESA'],
  ['LEMON-PIE', 'LEMON PIE'],
  ['QUEEN', 'QUEEN'],
  ['AMARULA-NUT', 'AMARULA Y NUT'],
  ['FRANUI', 'FRANUI'],
  ['PISTACHO-FRAMB', 'PISTACHO Y FRAMBUESA'],
  ['FRUTILLA-GELATINA', 'FRUTILLA Y GELATINA'],
  ['LIMA', 'LIMA'],
  ['MANDARINA', 'MANDARINA'],
  ['TOFFEE', 'TOFFEE'],
  ['TOFFEE-WHITE', 'TOFFEE WHITE'],
  ['MAR-PLATA', 'MAR DEL PLATA'],
  ['LEMON-FRAMB', 'LEMON CON FRAMBUESA'],
  ['TIRAMISU', 'TIRAMISÚ'],
  ['ROSA-PISTACHERA', 'ROSA PISTACHERA'],
];

const PORCIONES_TORTA_TARTA: SimpleProductDef[] = [
  ...TORTA_PORCION_SKUS.map(([key, label]) => ({
    sku: `CARTA-TORTA-${key}`,
    productName: `PORCION TORTA ${label}`,
    recipeName: `RECETA TORTA ${label}`,
    salePrice: 0,
    lines: [{ key: 'MEZCLA_TORTA' as IngKey, qty: 110 }],
  })),
  ...TARTA_PORCION_SKUS.map(([key, label]) => ({
    sku: `CARTA-TARTA-${key}`,
    productName: `PORCION TARTA ${label}`,
    recipeName: `RECETA TARTA ${label}`,
    salePrice: 0,
    lines: [{ key: 'MEZCLA_TORTA' as IngKey, qty: 115 }],
  })),
];

const SIMPLE_PRODUCTS: SimpleProductDef[] = [...SIMPLE_PRODUCTS_CORE, ...PORCIONES_TORTA_TARTA];

/**
 * Categorías para pestañas del POS (agrupa como el PDF: clásicos, especiales, tragos, té, take, etc.).
 * `sortOrder` define el orden de las pestañas cuando el front ordena por categoría.
 */
const CARTA_POS_CATEGORY_DEFS: ReadonlyArray<{ slug: string; name: string; sortOrder: number }> = [
  { slug: 'carta-clasicos', name: 'Café clásico', sortOrder: 10 },
  { slug: 'carta-take-cafe', name: 'Take café', sortOrder: 20 },
  { slug: 'carta-cafes-especiales', name: 'Cafés especiales', sortOrder: 30 },
  { slug: 'carta-cafes-especiales-take', name: 'Cafés especiales take', sortOrder: 40 },
  { slug: 'carta-cafe-especialidad-grano', name: 'Café especialidad (grano)', sortOrder: 50 },
  { slug: 'carta-tragos-calientes', name: 'Tragos calientes', sortOrder: 60 },
  { slug: 'carta-tragos-frios', name: 'Tragos fríos', sortOrder: 70 },
  { slug: 'carta-te-hebras', name: 'Té en hebras', sortOrder: 80 },
  { slug: 'carta-limonadas-jugos-salon', name: 'Limonadas y jugos (salón)', sortOrder: 90 },
  { slug: 'carta-take-bebidas', name: 'Take bebidas', sortOrder: 100 },
  { slug: 'carta-licuados-smoothies-salon', name: 'Licuados y smoothies (salón)', sortOrder: 110 },
  { slug: 'carta-prep-servicio', name: 'Prep. y servicio', sortOrder: 120 },
  { slug: 'carta-desayunos', name: 'Desayunos', sortOrder: 130 },
  { slug: 'carta-pasteleria', name: 'Pastelería', sortOrder: 140 },
  { slug: 'carta-cocina', name: 'Cocina', sortOrder: 150 },
  { slug: 'carta-saludables', name: 'Saludables', sortOrder: 160 },
  { slug: 'carta-sandwiches', name: 'Sandwiches y montados', sortOrder: 170 },
  { slug: 'carta-wraps-burger-ensaladas', name: 'Wraps, burgers y ensaladas', sortOrder: 180 },
  { slug: 'carta-keto', name: 'Keto', sortOrder: 190 },
];

/** Mapea cada SKU CARTA-* vendible a slug de categoría POS (debe existir en CARTA_POS_CATEGORY_DEFS). */
function getCartaPosCategorySlug(sku: string): string {
  // ── Pastelería (porciones, alfajores, tortas/tartas, medialuna/croissant/budín solo) ──
  if (
    sku === 'CARTA-MEDIALUNA-SOLO' ||
    sku === 'CARTA-CROISSANT-SOLO' ||
    sku === 'CARTA-BUDIN-RODAJA' ||
    sku.startsWith('CARTA-PAST-') ||
    sku.startsWith('CARTA-TORTA-') ||
    sku.startsWith('CARTA-TARTA-')
  ) {
    return 'carta-pasteleria';
  }

  // ── Café clásico (formatos + clásicos con budín/cookie/medialuna en tazón) ──
  if (
    sku === 'CARTA-POCILLO' ||
    sku === 'CARTA-JARRITO' ||
    sku === 'CARTA-DOBLE' ||
    sku === 'CARTA-TAZON' ||
    sku === 'CARTA-CLAS-BUDIN' ||
    sku === 'CARTA-CLAS-COOKIE' ||
    sku === 'CARTA-CLAS-MEDIALUNA'
  ) {
    return 'carta-clasicos';
  }

  if (sku === 'CARTA-TAKE-8OZ' || sku === 'CARTA-TAKE-12OZ') return 'carta-take-cafe';

  /** Un producto con radios (mismo patrón que pocillo) */
  if (sku === 'CARTA-CAFES-ESPECIALES-SALON') return 'carta-cafes-especiales';
  if (sku === 'CARTA-TRG-CALIENTES') return 'carta-tragos-calientes';
  if (sku === 'CARTA-TRG-FRIOS') return 'carta-tragos-frios';

  // Lattes saborizados tazón/doble (SKUs CARTA-ESP-LATTE-SAB-*)
  if (sku.startsWith('CARTA-ESP-')) return 'carta-cafes-especiales';

  if (sku === 'CARTA-CAFE-ESP-TAKE-8OZ' || sku === 'CARTA-CAFE-ESP-TAKE-12OZ') {
    return 'carta-cafes-especiales-take';
  }

  if (sku === 'CARTA-CAFE-ESP-GRANO-JARRITO') return 'carta-cafe-especialidad-grano';

  if (sku.startsWith('CARTA-TRG-FRIO-')) return 'carta-tragos-frios';

  if (sku === 'CARTA-TE-HEBRAS') return 'carta-te-hebras';

  if (sku === 'CARTA-LIMONADA-SALON-450' || sku === 'CARTA-JUGO-NARANJA-EXPRIMIDO') {
    return 'carta-limonadas-jugos-salon';
  }

  if (
    sku === 'CARTA-LIMONADA-TAKE-8OZ' ||
    sku === 'CARTA-LIMONADA-TAKE-12OZ' ||
    sku === 'CARTA-LIMONADA-TAKE-450' ||
    sku === 'CARTA-LICUADO-TAKE-450' ||
    sku === 'CARTA-SMOOTHIE-TAKE-450'
  ) {
    return 'carta-take-bebidas';
  }

  if (
    sku === 'CARTA-LICUADO' ||
    sku === 'CARTA-SMOOTHIE' ||
    sku === 'CARTA-LICUADO-SALON-450' ||
    sku === 'CARTA-LICUADO-SALON-JUGO-VERDE'
  ) {
    return 'carta-licuados-smoothies-salon';
  }

  if (sku.startsWith('CARTA-PREP-') || sku.startsWith('CARTA-CREMERA-')) return 'carta-prep-servicio';

  if (sku.startsWith('CARTA-DES-')) return 'carta-desayunos';

  // Cocina: croissant jamón y queso (formato), rellenos, waffles, tostados, medialunas JQ
  if (
    sku === 'CARTA-CRO-JAMON-QUESO' ||
    sku.startsWith('CARTA-CRO-MEDITERRANEO') ||
    sku.startsWith('CARTA-CRO-PALTA') ||
    sku.startsWith('CARTA-CRO-SALMON') ||
    sku.startsWith('CARTA-WAFF-') ||
    sku.startsWith('CARTA-TSTD-') ||
    sku.startsWith('CARTA-MED-JQ')
  ) {
    return 'carta-cocina';
  }

  if (sku.startsWith('CARTA-SALUD-')) return 'carta-saludables';

  if (sku.startsWith('CARTA-SAND-') || sku.startsWith('CARTA-MONT-')) return 'carta-sandwiches';

  if (
    sku.startsWith('CARTA-WRAP-') ||
    sku.startsWith('CARTA-HAMB-') ||
    sku.startsWith('CARTA-PAPAS-') ||
    sku.startsWith('CARTA-ENS-') ||
    sku.startsWith('CARTA-POKE-')
  ) {
    return 'carta-wraps-burger-ensaladas';
  }

  if (sku.startsWith('CARTA-KETO-')) return 'carta-keto';

  throw new Error(
    `[seed carta PDF] SKU sin categoría POS: ${sku}. Agregalo a getCartaPosCategorySlug() y/o CARTA_POS_CATEGORY_DEFS.`,
  );
}

async function ensureCartaPosCategories(): Promise<Map<string, string>> {
  const bySlug = new Map<string, string>();
  for (const def of CARTA_POS_CATEGORY_DEFS) {
    const row = await prisma.category.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      update: {
        name: def.name,
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
    bySlug.set(def.slug, row.id);
  }
  return bySlug;
}

async function ensureIngredients() {
  const cat = await prisma.category.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!cat) throw new Error('No hay categorías en la base.');

  const map = new Map<string, string>();
  for (const def of Object.values(ALL_INS)) {
    const p = await prisma.product.upsert({
      where: { sku: def.sku },
      create: {
        sku: def.sku,
        name: def.name,
        categoryId: cat.id,
        unit: def.unit,
        isSellable: false,
        isIngredient: true,
        isActive: true,
        avgCost: 0,
        lastCost: 0,
        salePrice: 0,
      },
      update: { name: def.name, unit: def.unit, isIngredient: true },
    });
    map.set(def.sku, p.id);
  }
  return map;
}

/**
 * SKUs reemplazados por productos con opciones (CAFES ESPECIALES, TRAGOS CALIENTES/FRIOS).
 * Se desactivan para que no dupliquen tarjetas en el POS ni confundan con ventas viejas.
 */
const OBSOLETE_MERGED_CARTA_SKUS: ReadonlyArray<string> = [
  'CARTA-ESP-MOCACCINO',
  'CARTA-ESP-CAPUCCINO',
  'CARTA-ESP-CAPUCCINO-ITALIANA',
  'CARTA-ESP-CAPUCCINO-HAZELNUT',
  'CARTA-ESP-SUBMARINO',
  'CARTA-ESP-SUBMARINO-CARAMEL',
  'CARTA-TRG-CAL-BOMBON',
  'CARTA-TRG-CAL-CHOCOLATE',
  'CARTA-TRG-CAL-TENTACION',
  'CARTA-TRG-CAL-IRLANDES',
  'CARTA-TRG-CAL-PEANUT',
  'CARTA-TRG-FRIO-ICE-COFFEE',
  'CARTA-TRG-FRIO-COLD-BREW',
  'CARTA-TRG-FRIO-AFFOGATO',
  'CARTA-TRG-FRIO-ICE-CAPUCCINO',
  'CARTA-TRG-FRIO-ICE-CARAMEL',
  'CARTA-TRG-FRIO-ESPRESSO-TONIC',
  'CARTA-TRG-FRIO-SPANISH-LATTE',
  /** Reemplazados por licuados 450ml unificados (2 grupos como smoothie) */
  'CARTA-LICUADO-SALON-450',
  'CARTA-LICUADO-TAKE-450',
  'CARTA-LICUADO-SALON-450-MF',
  'CARTA-LICUADO-SALON-450-BANANA',
  'CARTA-LICUADO-SALON-450-PULPA',
  'CARTA-LICUADO-TAKE-450-MF',
  'CARTA-LICUADO-TAKE-450-BANANA',
  'CARTA-LICUADO-TAKE-450-PULPA',
];

/** Quita recetas y grupos PDF para volver a crear (no borra productos: pueden tener ventas). */
async function wipeCartaPdf() {
  await prisma.product.updateMany({
    where: { sku: { in: [...OBSOLETE_MERGED_CARTA_SKUS] } },
    data: { isActive: false, isSellable: false },
  });

  const cartProducts = await prisma.product.findMany({
    where: {
      AND: [{ sku: { startsWith: 'CARTA-' } }, { NOT: { sku: { startsWith: 'CARTA-INS-' } } }],
    },
    select: { id: true },
  });
  const ids = cartProducts.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.recipe.deleteMany({ where: { productId: { in: ids } } });
  }
  await prisma.productModifierGroup.deleteMany({
    where: {
      OR: [
        { name: { startsWith: 'Preparación PDF' } },
        { name: { startsWith: 'Preparación —' } },
        { name: { startsWith: 'PDF —' } },
      ],
    },
  });
}

/** Producto con varios grupos de modificadores (receta con un ingrediente placeholder por grupo). */
async function createFormatProductMultiGroup(
  sku: string,
  productName: string,
  recipeName: string,
  salePrice: number,
  groups: FormatGroupDef[],
  catId: string,
  userId: string,
  placeholderProductId: string,
  placeholderUnit: string,
  ingIds: Map<string, string>,
  locations: { id: string }[],
) {
  const product = await prisma.product.upsert({
    where: { sku },
    create: {
      sku,
      name: productName,
      categoryId: catId,
      unit: 'unidad',
      isSellable: true,
      isIngredient: false,
      consumeRecipeOnSale: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice,
      description: 'Carta café — opciones en el POS.',
    },
    update: {
      name: productName,
      categoryId: catId,
      isSellable: true,
      consumeRecipeOnSale: true,
      salePrice,
      description: 'Carta café — opciones en el POS.',
    },
  });

  const createdGroupIds: string[] = [];
  for (const fg of groups) {
    const group = await prisma.productModifierGroup.create({
      data: {
        productId: null,
        name: fg.groupName,
        sortOrder: fg.sortOrder,
        required: true,
        minSelect: 1,
        maxSelect: 1,
      },
    });
    createdGroupIds.push(group.id);

    for (const v of fg.variants) {
      const opt = await prisma.productModifierOption.create({
        data: {
          groupId: group.id,
          label: v.label,
          sortOrder: v.sortOrder,
          priceDelta: v.priceDelta ?? 0,
        },
      });
      for (const [key, qty] of Object.entries(v.stock) as [IngKey, number][]) {
        if (qty == null || qty <= 0) continue;
        const ins = ALL_INS[key];
        const pid = ingIds.get(ins.sku);
        if (!pid) continue;
        await prisma.productModifierStockLine.create({
          data: { optionId: opt.id, productId: pid, quantity: qty },
        });
      }
    }
  }

  const recipe = await prisma.recipe.create({
    data: {
      name: recipeName,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: product.id,
      createdById: userId,
      isActive: true,
      parentId: null,
    },
  });

  for (let i = 0; i < createdGroupIds.length; i++) {
    await prisma.recipeIngredient.create({
      data: {
        recipeId: recipe.id,
        productId: placeholderProductId,
        qtyPerYield: 0,
        unit: placeholderUnit,
        sortOrder: i,
        modifierGroupId: createdGroupIds[i],
        notes: 'Consumo por opción',
      },
    });
  }

  for (const loc of locations) {
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

  const totalOpts = groups.reduce((s, g) => s + g.variants.length, 0);
  console.log(`✓ ${productName} (${groups.length} grupos, ${totalOpts} opciones total) — multi-grupo`);
}

async function createFormatProduct(
  fmt: FormatDef,
  catId: string,
  userId: string,
  placeholderProductId: string,
  placeholderUnit: string,
  ingIds: Map<string, string>,
  locations: { id: string }[],
) {
  const product = await prisma.product.upsert({
    where: { sku: fmt.sku },
    create: {
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
      description: 'Carta café — opciones en el POS.',
    },
    update: {
      name: fmt.productName,
      categoryId: catId,
      isSellable: true,
      consumeRecipeOnSale: true,
      salePrice: fmt.salePrice,
      description: 'Carta café — opciones en el POS.',
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

  for (const v of fmt.variants) {
    const opt = await prisma.productModifierOption.create({
      data: {
        groupId: group.id,
        label: v.label,
        sortOrder: v.sortOrder,
        priceDelta: v.priceDelta ?? 0,
      },
    });
    for (const [key, qty] of Object.entries(v.stock) as [IngKey, number][]) {
      if (qty == null || qty <= 0) continue;
      const sku = ALL_INS[key].sku;
      const pid = ingIds.get(sku);
      if (!pid) continue;
      await prisma.productModifierStockLine.create({
        data: { optionId: opt.id, productId: pid, quantity: qty },
      });
    }
  }

  const recipe = await prisma.recipe.create({
    data: {
      name: fmt.recipeName,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: product.id,
      createdById: userId,
      isActive: true,
      parentId: null,
    },
  });

  await prisma.recipeIngredient.create({
    data: {
      recipeId: recipe.id,
      productId: placeholderProductId,
      qtyPerYield: 0,
      unit: placeholderUnit,
      sortOrder: 0,
      modifierGroupId: group.id,
      notes: 'Consumo por opción',
    },
  });

  for (const loc of locations) {
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

  console.log(`✓ ${fmt.productName} (${fmt.variants.length} opciones) — ${fmt.groupName}`);
}

async function createSimpleProduct(
  def: SimpleProductDef,
  catId: string,
  userId: string,
  ingIds: Map<string, string>,
  locations: { id: string }[],
) {
  const existing = await prisma.product.findUnique({ where: { sku: def.sku } });
  if (existing) {
    await prisma.recipe.deleteMany({ where: { productId: existing.id } });
  }

  const product = await prisma.product.upsert({
    where: { sku: def.sku },
    create: {
      sku: def.sku,
      name: def.productName,
      categoryId: catId,
      unit: 'unidad',
      isSellable: true,
      isIngredient: false,
      consumeRecipeOnSale: true,
      isActive: true,
      avgCost: 0,
      lastCost: 0,
      salePrice: def.salePrice,
      description: 'Carta café — receta fija.',
    },
    update: {
      name: def.productName,
      categoryId: catId,
      isSellable: true,
      consumeRecipeOnSale: true,
      salePrice: def.salePrice,
      description: 'Carta café — receta fija.',
    },
  });

  const recipe = await prisma.recipe.create({
    data: {
      name: def.recipeName,
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: product.id,
      createdById: userId,
      isActive: true,
      parentId: null,
    },
  });

  for (let i = 0; i < def.lines.length; i++) {
    const line = def.lines[i];
    const ing = ALL_INS[line.key];
    const pid = ingIds.get(ing.sku);
    if (!pid) continue;
    await prisma.recipeIngredient.create({
      data: {
        recipeId: recipe.id,
        productId: pid,
        qtyPerYield: line.qty,
        unit: ing.unit,
        sortOrder: i,
      },
    });
  }

  for (const loc of locations) {
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

  console.log(`✓ ${def.productName} (receta fija)`);
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No hay usuarios. Creá un usuario antes.');

  console.log('Limpiando productos CARTA-* (excepto insumos), recetas y grupos Preparación…');
  await wipeCartaPdf();

  const ingIds = await ensureIngredients();
  const cafeProductId = ingIds.get(ALL_INS.CAFE_GRANO.sku)!;

  const cartaPosCategoryIds = await ensureCartaPosCategories();
  const categoryIdForCartaSku = (sku: string) => {
    const slug = getCartaPosCategorySlug(sku);
    const id = cartaPosCategoryIds.get(slug);
    if (!id) throw new Error(`Categoría carta no resuelta: ${slug}`);
    return id;
  };

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    take: 20,
    select: { id: true },
  });

  /** Placeholder receta té: misma familia que la 1ª opción (consumo real por líneas de opción) */
  const teaPlaceholderId = ingIds.get(ALL_INS.TE_BLACK_ORIGINAL.sku)!;

  console.log('\n--- Formatos con opciones (POS) ---\n');
  for (const fmt of ALL_FORMATS) {
    const isTea = fmt.sku === 'CARTA-TE-HEBRAS';
    await createFormatProduct(
      fmt,
      categoryIdForCartaSku(fmt.sku),
      user.id,
      isTea ? teaPlaceholderId : cafeProductId,
      isTea ? 'g' : 'g',
      ingIds,
      locations,
    );
  }

  console.log('\n--- Lattes saborizados (2 grupos: base + syrup) ---\n');
  await createFormatProductMultiGroup(
    'CARTA-ESP-LATTE-SAB-TAZON',
    'LATTE SABORIZADO TAZON',
    'RECETA LATTE SABORIZADO TAZON',
    0,
    LATTE_SAB_TAZON_GROUPS,
    categoryIdForCartaSku('CARTA-ESP-LATTE-SAB-TAZON'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );
  await createFormatProductMultiGroup(
    'CARTA-ESP-LATTE-SAB-DOBLE',
    'LATTE SABORIZADO DOBLE',
    'RECETA LATTE SABORIZADO DOBLE',
    0,
    LATTE_SAB_DOBLE_GROUPS,
    categoryIdForCartaSku('CARTA-ESP-LATTE-SAB-DOBLE'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );
  await createFormatProductMultiGroup(
    'CARTA-TRG-FRIO-ICE-LATTE-SAB',
    'ICE LATTE SABORIZADO',
    'RECETA ICE LATTE SABORIZADO',
    0,
    ICE_LATTE_SAB_GROUPS,
    categoryIdForCartaSku('CARTA-TRG-FRIO-ICE-LATTE-SAB'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );

  console.log('\n--- Smoothies 450ml (2 grupos: sabor + base líquida) ---\n');
  await createFormatProductMultiGroup(
    'CARTA-SMOOTHIE',
    'SMOOTHIE SALON 450ML',
    'RECETA SMOOTHIE SALON',
    0,
    SMOOTHIE_SALON_GROUPS,
    categoryIdForCartaSku('CARTA-SMOOTHIE'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );
  await createFormatProductMultiGroup(
    'CARTA-SMOOTHIE-TAKE-450',
    'SMOOTHIE TAKE 450ML',
    'RECETA SMOOTHIE TAKE 450',
    0,
    SMOOTHIE_TAKE_GROUPS,
    categoryIdForCartaSku('CARTA-SMOOTHIE-TAKE-450'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );

  console.log('\n--- Licuados 450ml (2 grupos como smoothie: tipo + base líquida) ---\n');
  await createFormatProductMultiGroup(
    'CARTA-LICUADO-SALON-450',
    'LICUADO SALON 450ML',
    'RECETA LICUADO SALON 450',
    0,
    LICUADO_SALON_450_GROUPS,
    categoryIdForCartaSku('CARTA-LICUADO-SALON-450'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );
  await createFormatProductMultiGroup(
    'CARTA-LICUADO-TAKE-450',
    'LICUADO TAKE 450ML',
    'RECETA LICUADO TAKE 450',
    0,
    LICUADO_TAKE_450_GROUPS,
    categoryIdForCartaSku('CARTA-LICUADO-TAKE-450'),
    user.id,
    cafeProductId,
    'g',
    ingIds,
    locations,
  );

  console.log('\n--- Cafés especiales y tragos (receta fija) ---\n');
  for (const sp of SIMPLE_PRODUCTS) {
    await createSimpleProduct(sp, categoryIdForCartaSku(sp.sku), user.id, ingIds, locations);
  }

  const formatosConOpciones = ALL_FORMATS.length + 7;
  console.log(
    `\nListo: ${formatosConOpciones} productos con opciones + ${SIMPLE_PRODUCTS.length} con receta fija.`,
  );
  console.log('Marcá precios en Stock. POS: formatos con grupo piden preparación antes de cargar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
