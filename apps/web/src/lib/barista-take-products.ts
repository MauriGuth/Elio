/**
 * Productos BARISTA-TAKE (mismos SKUs que `BARISTA_TAKE_PRODUCT_SKUS` en el API).
 * Mantener alineado con `apps/api/src/orders/order-take-coasters.helper.ts`.
 */
export const BARISTA_TAKE_PRODUCT_SKUS = [
  "PROD-2365",
  "PROD-2366",
  "PROD-2367",
  "PROD-2368",
] as const

const SET = new Set(BARISTA_TAKE_PRODUCT_SKUS.map((s) => s.toUpperCase()))

export function isBaristaTakeProductSku(sku: string | null | undefined): boolean {
  if (!sku) return false
  return SET.has(sku.trim().toUpperCase())
}
