/**
 * Grillas POCILLO / JARRITO / DOBLE / TAZÓN + 1 COOKIE (PDF carta café).
 * Cantidades en g o ml según insumo (café en g, líquidos en ml).
 *
 * **Leche por formato vs tipo de leche**
 * - Los ml de leche/espuma por preparación (Café con leche, Lágrima, etc.) están **acá**, en cada
 *   variante (`stock.TIPO_LECHE` / `LECHE_ESPUMA`): Tazón ≠ Pocillo porque cambia el producto/formato.
 * - El grupo POS «Tipo de leche» (entera / descremada / almendras) **no** repite esos ml: al cerrar
 *   la venta se toma la receta de la **preparación** elegida y solo se **cambia el insumo** según el
 *   tipo de leche (misma cantidad total).
 */

export type ClasicosIngKey =
  | 'CAFE_GRANO'
  | 'AGUA'
  /** Leche líquida en preparación (insumo dedicado; evita confusiones tipo “arroz con leche”). */
  | 'TIPO_LECHE'
  | 'LECHE'
  | 'LECHE_ESPUMA'
  | 'LECHE_DESCREMADA'
  | 'LECHE_ALMENDRAS'
  | 'SODA'
  | 'GALLETA_COOKIE';

/** Preparaciones que llevan leche: el POS muestra "Tipo de leche" debajo (regla visibilityRule). */
export const CLASICO_MILK_PREP_LABELS: readonly string[] = [
  'Cortado',
  'Café con leche',
  'Machiato',
  'Latte',
  'Lágrima',
];

export type ClasicosVariantDef = {
  label: string;
  sortOrder: number;
  stock: Partial<Record<ClasicosIngKey, number>>;
  priceDelta?: number;
};

export type ClasicosFormatDef = {
  sku: string;
  productName: string;
  recipeName: string;
  groupName: string;
  salePrice: number;
  variants: ClasicosVariantDef[];
};

/** Definición canónica (misma que seed-carta-cafe-pdf FORMATS_CLASICOS). */
export const FORMATS_CLASICOS: ClasicosFormatDef[] = [
  {
    sku: 'CARTA-POCILLO',
    productName: 'CLASICO POCILLO',
    recipeName: 'RECETA CLASICO POCILLO',
    groupName: 'Preparación — Pocillo',
    salePrice: 0,
    variants: [
      { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 12, AGUA: 60, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 12, AGUA: 40, TIPO_LECHE: 20, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 12, AGUA: 50, LECHE_ESPUMA: 10, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Ristretto', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 27, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Latte', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 40, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Lágrima', sortOrder: 6, stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 40, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Americano', sortOrder: 7, stock: { CAFE_GRANO: 12, AGUA: 60, SODA: 60, GALLETA_COOKIE: 1 } },
    ],
  },
  {
    sku: 'CARTA-JARRITO',
    productName: 'CLASICO JARRITO',
    recipeName: 'RECETA CLASICO JARRITO',
    groupName: 'Preparación — Jarrito',
    salePrice: 0,
    variants: [
      { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 12, AGUA: 100, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 12, AGUA: 70, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 50, TIPO_LECHE: 50, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 12, AGUA: 90, LECHE_ESPUMA: 10, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Latte', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 70, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Lágrima', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 80, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Americano', sortOrder: 6, stock: { CAFE_GRANO: 12, AGUA: 100, SODA: 60, GALLETA_COOKIE: 1 } },
    ],
  },
  {
    sku: 'CARTA-DOBLE',
    productName: 'CLASICO DOBLE',
    recipeName: 'RECETA CLASICO DOBLE',
    groupName: 'Preparación — Doble',
    salePrice: 0,
    variants: [
      { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 18, AGUA: 150, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 18, AGUA: 120, TIPO_LECHE: 30, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 75, TIPO_LECHE: 75, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 18, AGUA: 130, LECHE_ESPUMA: 20, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Latte', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 40, TIPO_LECHE: 110, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Lágrima', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 20, TIPO_LECHE: 130, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Americano', sortOrder: 6, stock: { CAFE_GRANO: 18, AGUA: 150, SODA: 60, GALLETA_COOKIE: 1 } },
    ],
  },
  {
    sku: 'CARTA-TAZON',
    productName: 'CLASICO TAZON',
    recipeName: 'RECETA CLASICO TAZON',
    groupName: 'Preparación — Tazón',
    salePrice: 0,
    variants: [
      { label: 'Café solo', sortOrder: 0, stock: { CAFE_GRANO: 18, AGUA: 300, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Cortado', sortOrder: 1, stock: { CAFE_GRANO: 18, AGUA: 250, TIPO_LECHE: 50, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Café con leche', sortOrder: 2, stock: { CAFE_GRANO: 12, AGUA: 130, TIPO_LECHE: 170, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Machiato', sortOrder: 3, stock: { CAFE_GRANO: 18, AGUA: 270, LECHE_ESPUMA: 30, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Latte', sortOrder: 4, stock: { CAFE_GRANO: 12, AGUA: 100, TIPO_LECHE: 200, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Lágrima', sortOrder: 5, stock: { CAFE_GRANO: 12, AGUA: 30, TIPO_LECHE: 270, SODA: 60, GALLETA_COOKIE: 1 } },
      { label: 'Americano', sortOrder: 6, stock: { CAFE_GRANO: 18, AGUA: 300, SODA: 60, GALLETA_COOKIE: 1 } },
    ],
  },
];

/** SKU canónico carta + nombre mostrado + unidad de stock en recetas/modificadores. */
export const CLASICOS_INSUMO_DEFS: Record<
  ClasicosIngKey,
  { sku: string; name: string; unit: string }
> = {
  CAFE_GRANO: { sku: 'CARTA-INS-CAFE-GRANO', name: 'Café grano (cart)', unit: 'g' },
  AGUA: { sku: 'CARTA-INS-AGUA', name: 'Agua (cart)', unit: 'ml' },
  /**
   * Leche en preparación clásica: insumo explícito «TIPO DE LECHE» (no matchea «arroz con leche»).
   * Al cobrar, el POS sustituye por leche entera/descremada/almendras según elección.
   */
  TIPO_LECHE: {
    sku: 'CARTA-INS-TIPO-LECHE',
    name: 'TIPO DE LECHE (cart)',
    unit: 'ml',
  },
  /** Leche vaca genérica (otros usos / compat). */
  LECHE: { sku: 'CARTA-INS-LECHE', name: 'Leche (cart)', unit: 'ml' },
  LECHE_ESPUMA: { sku: 'CARTA-INS-LECHE-ESPUMA', name: 'Leche espuma (cart)', unit: 'ml' },
  LECHE_DESCREMADA: {
    sku: 'CARTA-INS-LECHE-DESCREMADA',
    name: 'Leche descremada (cart)',
    unit: 'ml',
  },
  LECHE_ALMENDRAS: {
    sku: 'CARTA-INS-LECHE-ALMENDRAS',
    name: 'Leche de almendras (cart)',
    unit: 'ml',
  },
  SODA: { sku: 'CARTA-INS-SODA', name: 'Soda / agua con gas (cart)', unit: 'ml' },
  GALLETA_COOKIE: { sku: 'CARTA-INS-GALLETA-COOKIE', name: 'Galleta cookie NY (cart)', unit: 'und' },
};
