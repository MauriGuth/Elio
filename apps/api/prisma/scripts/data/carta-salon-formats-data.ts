/**
 * Formatos carta salón alineados al PDF (seed-carta-cafe-pdf) + ajustes ficha.
 * TENTACIÓN: dulce de leche 20g (PDF) → DULCE_LECHE.
 */
import type { CartaIngKey } from './carta-all-insumos';

export type SalonVariant = {
  label: string;
  sortOrder: number;
  stock: Partial<Record<CartaIngKey, number>>;
  priceDelta?: number;
};

export type SalonFormatDef = {
  sku: string;
  productName: string;
  recipeName: string;
  groupName: string;
  salePrice: number;
  variants: SalonVariant[];
};

export type SalonFormatGroupDef = {
  groupName: string;
  sortOrder: number;
  variants: SalonVariant[];
};

export const FORMAT_CAFES_ESPECIALES_SALON: SalonFormatDef = {
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
        LECHE: 130,
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
        LECHE: 150,
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
        LECHE: 130,
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
        LECHE: 130,
        SALSA_CHOCO_AVELLANAS: 34,
        CREMA: 30,
        CACAO: 3,
        SODA: 60,
        GALLETA_COOKIE: 1,
      },
    },
    /** Latte saborizado Tazón/Doble: productos aparte con 2 grupos (LATTE_SAB_*_GROUPS). */
    {
      label: 'SUBMARINO',
      sortOrder: 4,
      stock: { LECHE: 250, BAR_CHOCOLATE: 1, CACAO: 3, GALLETA_COOKIE: 1 },
    },
    {
      label: 'SUBMARINO CARAMEL',
      sortOrder: 5,
      stock: {
        LECHE: 195,
        SALSA_CHOCOLATE: 30,
        SYRUP_CARAMEL: 25,
        CACAO: 3,
        GALLETA_COOKIE: 1,
      },
    },
  ],
};

/** PDF: una sola lista con syrups; en POS se usa producto aparte 2 grupos (ver LATTE_SAB_*_GROUPS). Este bloque es referencia si unificás en un solo grupo. */
export const FORMAT_TRAGOS_CALIENTES: SalonFormatDef = {
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
        DULCE_LECHE: 20,
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

/** Líneas comunes PDF: +1 cookie, +1 sorbete, +1 servilleta (tragos fríos salón). */
const TRG_FRIO_SERVICIO = {
  GALLETA_COOKIE: 1,
  SORBETE: 1,
  SERVILLETA: 1,
} as const;

export const FORMAT_TRAGOS_FRIOS: SalonFormatDef = {
  sku: 'CARTA-TRG-FRIOS',
  productName: 'TRAGOS FRIOS',
  recipeName: 'RECETA TRAGOS FRIOS',
  groupName: 'Preparación — Tragos fríos',
  salePrice: 0,
  variants: [
    {
      label: 'ICE COFFEE (sin leche)',
      sortOrder: 0,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 200,
        HIELO: 120,
        DECO_FRUTAL: 2,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'ICE COFFEE con leche 100ml',
      sortOrder: 1,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 200,
        HIELO: 120,
        DECO_FRUTAL: 2,
        LECHE: 100,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'COLD BREW',
      sortOrder: 2,
      stock: { COLD_BREW: 200, HIELO: 120, ...TRG_FRIO_SERVICIO },
    },
    {
      label: 'AFFOGATO',
      sortOrder: 3,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 100,
        HELADO: 120,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'ICE CAPUCCINO',
      sortOrder: 4,
      stock: {
        COLD_BREW: 160,
        HELADO: 60,
        SALSA_CHOCOLATE: 30,
        CREMA: 30,
        CACAO: 3,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'ICE CARAMEL COFFEE',
      sortOrder: 5,
      stock: {
        COLD_BREW: 160,
        HELADO: 60,
        SYRUP_CARAMEL: 33,
        CREMA: 30,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'ESPRESSO TONIC',
      sortOrder: 6,
      stock: {
        CAFE_GRANO: 12,
        AGUA: 60,
        AGUA_TONICA: 130,
        HIELO: 120,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'SPANISH LATTE (sin leche extra)',
      sortOrder: 7,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 150,
        LECHE_CONDENSADA: 34,
        HIELO: 120,
        ...TRG_FRIO_SERVICIO,
      },
    },
    {
      label: 'SPANISH LATTE con leche 50ml',
      sortOrder: 8,
      stock: {
        CAFE_GRANO: 18,
        AGUA: 150,
        LECHE_CONDENSADA: 34,
        HIELO: 120,
        LECHE: 50,
        ...TRG_FRIO_SERVICIO,
      },
    },
  ],
};

/** PDF: tetera + taza doble + cookie acompañamiento (infusión caliente/fría). */
const TE_SERVICIO_SALON = {
  GALLETA_COOKIE: 1,
  TETERA: 1,
  TAZA_DOBLE: 1,
} as const;

export const FORMAT_TE: SalonFormatDef = {
  sku: 'CARTA-TE-HEBRAS',
  productName: 'TE EN HEBRAS',
  recipeName: 'RECETA TE EN HEBRAS',
  groupName: 'Preparación — Té en hebras',
  salePrice: 0,
  variants: [
    { label: 'BLACK ORIGINAL', sortOrder: 0, stock: { TE_BLACK_ORIGINAL: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'BLACK CHAI COCOA', sortOrder: 1, stock: { TE_BLACK_CHAI_COCOA: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'BLACK ORANGE', sortOrder: 2, stock: { TE_BLACK_ORANGE: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'BERRY RED', sortOrder: 3, stock: { TE_BERRY_RED: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'PATAGONIA BERRIES', sortOrder: 4, stock: { TE_PATAGONIA_BERRIES: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'HERBAL DELIGHT', sortOrder: 5, stock: { TE_HERBAL_DELIGHT: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
    { label: 'GREEN FRESH', sortOrder: 6, stock: { TE_GREEN_FRESH: 15, AGUA: 300, ...TE_SERVICIO_SALON } },
  ],
};

export const LATTE_SAB_TAZON_GROUPS: SalonFormatGroupDef[] = [
  {
    groupName: 'Preparación — Latte saborizado Tazón (base café y leche)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 80, LECHE: 190, SODA: 60, GALLETA_COOKIE: 1 },
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

export const LATTE_SAB_DOBLE_GROUPS: SalonFormatGroupDef[] = [
  {
    groupName: 'Preparación — Latte saborizado Doble (base)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: { CAFE_GRANO: 12, AGUA: 35, LECHE: 195, SODA: 60, GALLETA_COOKIE: 1 },
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

export const ICE_LATTE_SAB_GROUPS: SalonFormatGroupDef[] = [
  {
    groupName: 'Preparación — Ice Latte (base fría)',
    sortOrder: 10,
    variants: [
      {
        label: 'Base',
        sortOrder: 0,
        stock: {
          CAFE_GRANO: 12,
          AGUA: 40,
          LECHE: 120,
          HIELO: 80,
          GALLETA_COOKIE: 1,
          SORBETE: 1,
          SERVILLETA: 1,
        },
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

export const FORMAT_LIMONADA_COFFEE_450: SalonFormatDef = {
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

export const FORMAT_JUGO_NARANJA_COFFEE: SalonFormatDef = {
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

/** Receta fija 1L — PDF Passion 120g + 1L agua (variante por grano en operación). */
export const COLD_BREW_1L_SIMPLE = {
  sku: 'CARTA-PREP-COLD-BREW-1L',
  productName: 'PREP COLD BREW 1L',
  recipeName: 'RECETA COLD BREW 1L',
  salePrice: 0,
  lines: [
    { key: 'CAFE_GRANO' as const, qty: 120 },
    { key: 'AGUA' as const, qty: 1000 },
  ],
};
