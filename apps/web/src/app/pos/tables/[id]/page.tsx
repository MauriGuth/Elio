"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { tablesApi } from "@/lib/api/tables"
import { ordersApi } from "@/lib/api/orders"
import { productsApi } from "@/lib/api/products"
import { recipesApi } from "@/lib/api/recipes"
import { customersApi } from "@/lib/api/customers"
import { runningAccountsApi } from "@/lib/api/running-accounts"
import { authApi } from "@/lib/api/auth"
import { cashRegistersApi } from "@/lib/api/cash-registers"
import { getLocationKey, posStationSuffix } from "@/lib/api"
import { isBaristaTakeProductSku } from "@/lib/barista-take-products"
import { aiEventsApi } from "@/lib/api/ai-events"
import { speakShort } from "@/lib/speech"
import { sileo } from "sileo"
import { cn, formatCurrency, isProductAvailableAtLocation } from "@/lib/utils"
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Pencil,
  Send,
  Receipt,
  Loader2,
  Search,
  ChevronDown,
  X,
  MessageSquare,
  Users,
  CreditCard,
  Banknote,
  QrCode,
  ArrowRightLeft,
  AlertCircle,
  ChefHat,
  Coffee,
  Wine,
  Croissant,
  Check,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  SplitSquareVertical,
  FileCheck,
} from "lucide-react"

/**
 * Impresión térmica ~80 mm: @page + ancho útil 72 mm, tipografía compacta.
 * Chrome/Edge suelen respetar `size: 80mm auto`; si no, el ancho en mm del bloque ayuda igual.
 */
const THERMAL_RECEIPT_PRINT_CSS = `
@media print {
  @page { size: 80mm auto; margin: 2mm; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body * { visibility: hidden !important; }
  .pre-cierre-print-content, .pre-cierre-print-content *,
  .cierre-receipt-print-content, .cierre-receipt-print-content * {
    visibility: visible !important;
  }
  .pre-cierre-print-content,
  .cierre-receipt-print-content {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 72mm !important;
    max-width: 72mm !important;
    margin: 0 !important;
    padding: 1mm 2mm 3mm !important;
    background: #fff !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-size: 10pt !important;
    line-height: 1.2 !important;
    color: #000 !important;
  }
  .thermal-print-title { font-size: 11pt !important; font-weight: 700 !important; margin: 0 0 2px !important; }
  .thermal-print-meta { font-size: 8.5pt !important; color: #222 !important; margin: 0 0 2px !important; }
  .thermal-print-lead { font-size: 9pt !important; margin: 0 0 6px !important; }
  .thermal-print-table { width: 100% !important; border-collapse: collapse !important; font-size: 8.5pt !important; }
  .thermal-print-table th, .thermal-print-table td {
    padding: 1px 0 !important;
    vertical-align: top !important;
    word-break: break-word !important;
    hyphens: auto !important;
  }
  .thermal-print-table thead th { border-bottom: 1px solid #000 !important; font-weight: 600 !important; }
  .thermal-print-table tbody tr { border-bottom: 1px solid #ddd !important; }
  .thermal-print-col-qty { width: 7mm !important; text-align: center !important; white-space: nowrap !important; }
  .thermal-print-col-pu { width: 15mm !important; text-align: right !important; font-variant-numeric: tabular-nums !important; }
  .thermal-print-col-total { width: 18mm !important; text-align: right !important; font-variant-numeric: tabular-nums !important; }
  .thermal-print-discount { font-size: 8.5pt !important; margin: 4px 0 0 !important; }
  .thermal-print-total { font-size: 10.5pt !important; font-weight: 700 !important; margin: 6px 0 0 !important; }
  .thermal-print-pay { font-size: 9pt !important; margin: 2px 0 0 !important; }
  .thermal-print-foot { font-size: 7.5pt !important; color: #333 !important; margin: 8px 0 0 !important; }
  .no-print { display: none !important; }
}
`.trim()

/* ── Types ── */
interface PendingItem {
  tempId: string
  productId: string
  /** Para leyendas POS (ej. posavasos BARISTA-TAKE). */
  productSku?: string
  productName: string
  quantity: number
  unitPrice: number
  sector: "kitchen" | "bar" | "coffee" | "bakery" | "delivery"
  notes: string
  /** Claves = id de grupo Prisma; valor = optionId o lista (multi). */
  modifierSelections?: Record<string, string | string[]>
  /** Texto corto para comanda / lista (ej. "Integral · Dip hummus"). */
  modifierSummary?: string
  /** IDs de filas de `recipe_ingredients` que el cliente quitó del plato (POS). */
  excludedRecipeIngredientIds?: string[]
  /** IDs de `product_modifier_stock_line` quitadas (insumos de la preparación elegida). */
  excludedModifierStockLineIds?: string[]
}

function modifierSelectionsKey(s?: Record<string, string | string[]>): string {
  if (!s || Object.keys(s).length === 0) return "{}"
  const keys = Object.keys(s).sort()
  const norm: Record<string, string[]> = {}
  for (const k of keys) {
    const v = s[k]
    norm[k] = (Array.isArray(v) ? v : [v]).filter(Boolean).sort()
  }
  return JSON.stringify(norm)
}

function excludedIngredientKey(ids?: string[]): string {
  if (!ids?.length) return "[]"
  return JSON.stringify([...new Set(ids)].sort())
}

function excludedModStockLinesKey(ids?: string[]): string {
  if (!ids?.length) return "[]"
  return JSON.stringify([...new Set(ids)].sort())
}

function pendingLineMatchKey(
  i: Pick<
    PendingItem,
    | "modifierSelections"
    | "excludedRecipeIngredientIds"
    | "excludedModifierStockLineIds"
  >
): string {
  return `${modifierSelectionsKey(i.modifierSelections)}|${excludedIngredientKey(i.excludedRecipeIngredientIds)}|${excludedModStockLinesKey(i.excludedModifierStockLineIds)}`
}

/**
 * Solo grupos ligados a la receta activa del producto (ingredientes con `modifierGroupId`).
 * Si la receta no usa ningún grupo, no mostrar el catálogo global completo en el POS.
 */
function filterModifierGroupsByRecipe(
  groups: any[],
  modifierGroupIds: string[]
): any[] {
  if (!modifierGroupIds?.length) return []
  const byId = new Map((groups || []).map((g) => [g.id, g]))
  return modifierGroupIds
    .map((id) => byId.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
}

/** Grupos de modificadores ligados a un ingrediente de receta que el cliente quitó → no se muestran (ej. tipo de pan si no va pan). */
function hiddenModifierGroupIdsFromExcludedIngredients(
  recipeIngredients: { id: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[]
): Set<string> {
  const ex = new Set(excludedIngredientIds)
  const hidden = new Set<string>()
  for (const ing of recipeIngredients || []) {
    if (ex.has(ing.id) && ing.modifierGroupId) {
      hidden.add(ing.modifierGroupId)
    }
  }
  return hidden
}

/** Ingredientes base de receta en el modal POS: siempre los que devuelve el contexto (sin filtrar por producto). */
function recipeIngredientsForPosModal(
  ingredientsFromApi: Array<{
    id: string
    productId: string
    name: string
    modifierGroupId?: string | null
  }>
): Array<{
  id: string
  productId: string
  name: string
  modifierGroupId?: string | null
}> {
  return ingredientsFromApi ?? []
}

/** Sub-receta «Incluye» por opción: configurable en Recetas (mostrar en mesa/comanda). */
function optionShowsSubRecipeBreakdownInPos(opt: any): boolean {
  if (opt == null) return true
  return opt.showSubRecipeInPos !== false
}

function visibleModifierGroupsForPosModal(
  groups: any[],
  recipeIngredients: { id: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[]
): any[] {
  const hidden = hiddenModifierGroupIdsFromExcludedIngredients(
    recipeIngredients,
    excludedIngredientIds
  )
  return (groups || []).filter((g) => !hidden.has(g.id))
}

function normalizeModifierLabelPos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/** Grupo «Preparación — …» (insumos por opción en `stockLines`). */
function isPreparationModifierGroupPos(g: { name?: string }): boolean {
  return normalizeModifierLabelPos(g.name || "").includes("preparacion")
}

function getPrepOptionStockLinesForChecklist(opt: any): Array<{ id: string; label: string }> {
  if (!optionShowsSubRecipeBreakdownInPos(opt)) return []
  const lines = opt?.stockLines || []
  const out: Array<{ id: string; label: string }> = []
  for (const sl of lines) {
    if (!sl?.id) continue
    const name = (sl.product?.name as string) || "Insumo"
    out.push({ id: sl.id as string, label: name })
  }
  return out
}

function collectModifierStockLineIdsFromSelections(
  groups: any[],
  selections: Record<string, string | string[]>
): Set<string> {
  const ids = new Set<string>()
  for (const g of groups || []) {
    const sel = selections[g.id]
    const optId = Array.isArray(sel) ? sel[0] : sel
    if (!optId) continue
    const opt = (g.options || []).find((o: any) => o.id === optId)
    if (!optionShowsSubRecipeBreakdownInPos(opt)) continue
    for (const sl of opt?.stockLines || []) {
      if (sl?.id) ids.add(sl.id as string)
    }
  }
  return ids
}

function sanitizeExcludedModifierStockLineIds(
  groups: any[],
  selections: Record<string, string | string[]>,
  excluded: string[]
): string[] {
  const valid = collectModifierStockLineIdsFromSelections(groups, selections)
  return excluded.filter((id) => valid.has(id))
}

/** Texto «Sin: …» para líneas de insumo por opción desmarcadas (cualquier grupo con stockLines). */
function summaryExcludedModifierStockLines(
  groups: any[],
  selections: Record<string, string | string[]>,
  excludedLineIds: string[]
): string {
  if (!excludedLineIds.length) return ""
  const nameByLineId = new Map<string, string>()
  for (const g of groups || []) {
    const sel = selections[g.id]
    const optId = Array.isArray(sel) ? sel[0] : sel
    if (!optId) continue
    const opt = (g.options || []).find((o: any) => o.id === optId)
    if (!optionShowsSubRecipeBreakdownInPos(opt)) continue
    for (const sl of opt?.stockLines || []) {
      if (sl?.id && sl?.product?.name) nameByLineId.set(sl.id as string, String(sl.product.name))
    }
  }
  const names = excludedLineIds
    .map((id) => nameByLineId.get(id))
    .filter((n): n is string => Boolean(n))
  if (!names.length) return ""
  return `Sin: ${names.join(", ")}`
}

function sortModifierOptionsPos(opts: any[]): any[] {
  return [...(opts || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )
}

/**
 * Grupos de variedad de café en carta/POS: default Brasil Santos Bourbon
 * (no el primer sortOrder). Incluye títulos legacy y el grupo «GRANO».
 */
function isSpecialtyCoffeeModifierGroupPos(g: { name?: string }): boolean {
  const n = normalizeModifierLabelPos(g.name || "")
  return (
    n.includes("cafe de especialidad") ||
    n.includes("tipo de cafe") ||
    /^grano\b/.test(n)
  )
}

/** Variedad que más se vende — selección inicial en POS (no cambia el orden visual de la lista). */
const DEFAULT_SPECIALTY_COFFEE_OPTION_NORM = normalizeModifierLabelPos(
  "Brasil Santos Bourbon"
)

function pickDefaultOptionIdForGroupPos(
  g: any,
  rawOpts: any[]
): string | undefined {
  const opts = sortModifierOptionsPos(rawOpts)
  if (opts.length === 0) return undefined
  if (isSpecialtyCoffeeModifierGroupPos(g)) {
    const preferred = opts.find(
      (o) =>
        normalizeModifierLabelPos(String(o.label ?? "")) ===
        DEFAULT_SPECIALTY_COFFEE_OPTION_NORM
    )
    if (preferred?.id) return preferred.id as string
  }
  return opts[0].id as string
}

/**
 * Grupos visibles según `visibilityRule` (ej. tipo de leche solo si la preparación lleva leche).
 * Debe coincidir con `computeVisibleModifierGroupIds` en el API.
 */
function computeVisibleModifierGroupIdsForPos(
  groups: any[],
  selections: Record<string, string | string[]>
): string[] {
  const sel: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(selections)) {
    sel[k] = Array.isArray(v) ? v : v ? [v as string] : []
  }
  const sortedForRule = [...(groups || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )
  const visible: string[] = []
  for (const g of groups || []) {
    if (g.visibilityRule == null) {
      visible.push(g.id)
      continue
    }
    const rule = g.visibilityRule as {
      whenPriorGroupSortOrder: number
      whenSelectedOptionLabels: string[]
      whenPriorGroupId?: string
      whenPriorGroupIds?: string[]
    }
    if (
      typeof rule.whenPriorGroupSortOrder !== "number" ||
      !Array.isArray(rule.whenSelectedOptionLabels)
    ) {
      visible.push(g.id)
      continue
    }
    const priorIds = Array.isArray(rule.whenPriorGroupIds)
      ? rule.whenPriorGroupIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      : []
    const priors =
      priorIds.length > 0
        ? priorIds
            .map((id) => sortedForRule.find((x) => x.id === id))
            .filter((x): x is any => Boolean(x))
        : [
            typeof rule.whenPriorGroupId === "string" && rule.whenPriorGroupId
              ? sortedForRule.find((x) => x.id === rule.whenPriorGroupId) ??
                sortedForRule.find((x) => x.sortOrder === rule.whenPriorGroupSortOrder)
              : sortedForRule.find((x) => x.sortOrder === rule.whenPriorGroupSortOrder),
          ].filter((x): x is any => Boolean(x))
    // Coincide con `computeVisibleModifierGroupIds` en el API: sin prior resoluble → no visible.
    if (priors.length === 0) {
      continue
    }
    let ok = false
    for (const prior of priors) {
      const picked = sel[prior.id]?.[0]
      if (!picked) continue
      const opt = (prior.options || []).find((o: any) => o.id === picked)
      const label = opt?.label ?? ""
      const labelNorm = normalizeModifierLabelPos(label)
      if (
        rule.whenSelectedOptionLabels.some(
          (allowed: string) => normalizeModifierLabelPos(allowed) === labelNorm
        )
      ) {
        ok = true
        break
      }
    }
    if (ok) {
      visible.push(g.id)
    }
  }
  return visible
}

/** Licuado 450: 6 tipos + 9 líquidos en DB; el POS muestra 3 radios según el tipo (como smoothie). */
const LICUADO_450_SKUS = new Set(["CARTA-LICUADO-SALON-450", "CARTA-LICUADO-TAKE-450"])

function applyLicuado450LiquidOptionFilter(
  productSku: string | undefined,
  visibleGroups: any[],
  selections: Record<string, string | string[]>
): any[] {
  if (!productSku || !LICUADO_450_SKUS.has(productSku)) return visibleGroups
  const orderIds = visibleGroups.map((g) => g.id)
  const sorted = [...visibleGroups].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )
  if (sorted.length < 2) return visibleGroups
  const [gTipo, gLiq] = sorted
  const oTipo = gTipo.options || []
  const oLiq = gLiq.options || []
  if (oTipo.length !== 6 || oLiq.length !== 9) return visibleGroups

  const selT = selections[gTipo.id]
  const idT = Array.isArray(selT) ? selT[0] : selT
  let tipoIdx = oTipo.findIndex((o: any) => o.id === idT)
  if (tipoIdx < 0) tipoIdx = 0

  let start = 0
  let end = 3
  if (tipoIdx === 0) {
    start = 0
    end = 3
  } else if (tipoIdx === 1) {
    start = 3
    end = 6
  } else {
    start = 6
    end = 9
  }

  const liquidSlice = oLiq.slice(start, end)
  const patched = sorted.map((g) =>
    g.id === gLiq.id ? { ...g, options: liquidSlice } : g
  )
  const byId = new Map(patched.map((g) => [g.id, g]))
  return orderIds.map((id) => byId.get(id)).filter((g): g is any => Boolean(g))
}

function effectiveModifierGroupsForPosModal(
  product: { sku?: string },
  groups: any[],
  recipeIngredients: { id: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[],
  selections: Record<string, string | string[]>
): any[] {
  const vis = visibleModifierGroupsForPosModal(
    groups,
    recipeIngredients,
    excludedIngredientIds
  )
  const visibleIdList = computeVisibleModifierGroupIdsForPos(vis, selections)
  const visIdSet = new Set(visibleIdList)
  let afterRule = vis.filter((g) => visIdSet.has(g.id))
  /**
   * Si todas las reglas `visibilityRule` dejan la lista vacía (cadena rota o prior mal resuelto),
   * el modal quedaba en blanco. Mostramos primero grupos sin regla; si no hay, todos los de la receta.
   */
  if (afterRule.length === 0 && vis.length > 0) {
    const noRule = vis.filter((g) => g.visibilityRule == null)
    afterRule = noRule.length > 0 ? noRule : vis
  }
  return applyLicuado450LiquidOptionFilter(product?.sku, afterRule, selections)
}

function fullPosModifierSummary(
  groups: any[],
  selections: Record<string, string | string[]>,
  recipeIngredients: { id: string; name: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[]
): string {
  const opt = summaryFromSelections(groups, selections)
  const excludedNames = recipeIngredients
    .filter((r) => !r.modifierGroupId && excludedIngredientIds.includes(r.id))
    .map((r) => r.name)
  const sin =
    excludedNames.length > 0 ? `Sin: ${excludedNames.join(", ")}` : ""
  return [opt, sin].filter(Boolean).join(" · ")
}

/** Primera opción en preparación; el grupo "tipo de leche" se rellena al elegir prep. con leche. */
function buildInitialModifierSelections(
  product: { sku?: string },
  groups: any[],
  recipeIngredients: { id: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[]
): Record<string, string | string[]> {
  const ordered = groups || []
  const sel: Record<string, string | string[]> = {}
  for (const g of ordered) {
    if (g.visibilityRule != null) continue
    const opts = g.options || []
    if (!g.required || opts.length === 0) continue
    const defId = pickDefaultOptionIdForGroupPos(g, opts)
    if (!defId) continue
    const maxSel = g.maxSelect ?? 1
    if (maxSel === 1) sel[g.id] = defId
    else sel[g.id] = [defId]
  }
  const eff = effectiveModifierGroupsForPosModal(
    product,
    groups,
    recipeIngredients,
    excludedIngredientIds,
    sel
  )
  const next = { ...sel }
  for (const g of eff) {
    const opts = g.options || []
    if (!g.required || opts.length === 0) continue
    if (next[g.id] != null) continue
    const defId = pickDefaultOptionIdForGroupPos(g, opts)
    if (!defId) continue
    const maxSel = g.maxSelect ?? 1
    if (maxSel === 1) next[g.id] = defId
    else next[g.id] = [defId]
  }
  return next
}

function reconcileModifierSelectionsAfterChange(
  product: { sku?: string },
  groups: any[],
  recipeIngredients: { id: string; modifierGroupId?: string | null }[],
  excludedIngredientIds: string[],
  prev: Record<string, string | string[]>,
  changedGroupId: string,
  newOptionId: string
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {
    ...prev,
    [changedGroupId]: newOptionId,
  }
  const vis = visibleModifierGroupsForPosModal(
    groups,
    recipeIngredients,
    excludedIngredientIds
  )
  const effIds = new Set(computeVisibleModifierGroupIdsForPos(vis, next))
  const cleaned: Record<string, string | string[]> = {}
  for (const k of Object.keys(next)) {
    if (effIds.has(k)) cleaned[k] = next[k]!
  }
  const eff = effectiveModifierGroupsForPosModal(
    product,
    groups,
    recipeIngredients,
    excludedIngredientIds,
    cleaned
  )
  for (const g of eff) {
    const opts = g.options || []
    if (!g.required || opts.length === 0) continue
    if (cleaned[g.id] != null) continue
    const defId = pickDefaultOptionIdForGroupPos(g, opts)
    if (!defId) continue
    const maxSel = g.maxSelect ?? 1
    if (maxSel === 1) cleaned[g.id] = defId
    else cleaned[g.id] = [defId]
  }
  return cleaned
}

function extraPriceFromSelections(
  groups: any[],
  selections: Record<string, string | string[]>
): number {
  const deltaByOption = new Map<string, number>()
  for (const g of groups || []) {
    for (const o of g.options || []) {
      deltaByOption.set(o.id, Number(o.priceDelta) || 0)
    }
  }
  let extra = 0
  for (const v of Object.values(selections)) {
    const ids = Array.isArray(v) ? v : [v]
    for (const id of ids) extra += deltaByOption.get(id) || 0
  }
  return Math.round(extra * 100) / 100
}

function summaryFromSelections(
  groups: any[],
  selections: Record<string, string | string[]>
): string {
  const parts: string[] = []
  for (const g of groups || []) {
    const sel = selections[g.id]
    if (sel == null) continue
    const ids = Array.isArray(sel) ? sel : [sel]
    if (ids.length === 0) continue
    const labelById = new Map((g.options || []).map((o: any) => [o.id, o.label]))
    const labels = ids.map((id) => labelById.get(id)).filter(Boolean)
    if (labels.length) parts.push(labels.join(" + "))
  }
  return parts.join(" · ")
}

/* ── Constants ── */
const SECTORS: {
  value: PendingItem["sector"]
  label: string
  icon: any
  color: string
}[] = [
  {
    value: "kitchen",
    label: "Cocina",
    icon: ChefHat,
    color: "bg-sky-100 text-sky-800",
  },
  {
    value: "bar",
    label: "Bar",
    icon: Wine,
    color: "bg-purple-100 text-purple-700",
  },
  {
    value: "coffee",
    label: "Café",
    icon: Coffee,
    color: "bg-blue-100 text-blue-700",
  },
  {
    value: "bakery",
    label: "Panadería",
    icon: Croissant,
    color: "bg-yellow-100 text-yellow-700",
  },
]

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "qr", label: "QR", icon: QrCode },
  { value: "transfer", label: "Transferencia", icon: ArrowRightLeft },
]

/** Formatea solo dígitos a CUIT XX-XXXXXXXX-X (máx. 11 dígitos). */
function formatCuitDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

/** Texto categoría+nombre sin acentos para matchear rubros (café, cóctel, tazón, etc.). */
function foldSectorHay(product: any): string {
  const raw = `${product.category?.name || ""} ${product.name || ""}`
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** Inferencia por categoría y nombre (si no hay `preparationSector` en el producto). */
function inferSectorFromCategory(product: any): PendingItem["sector"] {
  const hay = foldSectorHay(product)
  // Café: bebidas de café + formatos de taza (pocillo, jarrito, doble, tazón, etc.)
  if (
    hay.includes("cafe") ||
    hay.includes("coffee") ||
    hay.includes("bebida caliente") ||
    hay.includes("infusi") ||
    hay.includes("latte") ||
    hay.includes("espresso") ||
    hay.includes("capucc") ||
    hay.includes("machiato") ||
    hay.includes("machiatto") ||
    hay.includes("macchiato") ||
    hay.includes("moka") ||
    hay.includes("pocillo") ||
    hay.includes("jarrito") ||
    hay.includes("tazon") ||
    /\bdoble\b/.test(hay)
  ) {
    return "coffee"
  }
  // Bar / bebidas frías / alcohol
  if (
    hay.includes("bebida") ||
    hay.includes("trago") ||
    hay.includes("cerveza") ||
    hay.includes("vino") ||
    hay.includes("cocktail") ||
    hay.includes("coctel") ||
    hay.includes("gaseosa") ||
    hay.includes("jugo") ||
    hay.includes("agua") ||
    hay.includes("refresco")
  ) {
    return "bar"
  }
  // Panadería / pastelería / postres (\bpan\b evita «empanada» → panadería)
  if (
    hay.includes("medialuna") ||
    hay.includes("factura") ||
    hay.includes("croissant") ||
    /\bpan\b/.test(hay) ||
    hay.includes("panader") ||
    hay.includes("pastel") ||
    hay.includes("postre") ||
    hay.includes("dulce") ||
    hay.includes("torta") ||
    hay.includes("brownie") ||
    hay.includes("galletita") ||
    hay.includes("reposteria") ||
    hay.includes("panaderia")
  ) {
    return "bakery"
  }
  return "kitchen"
}

/** Sector de comanda: explícito en producto o inferido (cafetería POS = coffee|bar|bakery). */
function resolvePreparationSector(product: any): PendingItem["sector"] {
  const s = product?.preparationSector
  if (s === "kitchen" || s === "bar" || s === "coffee" || s === "bakery") {
    return s
  }
  return inferSectorFromCategory(product)
}

const ITEM_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-sky-100 text-sky-700",
  ready: "bg-emerald-100 text-emerald-700",
  served: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600 line-through",
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "Preparando",
  ready: "Listo",
  served: "Servido",
  cancelled: "Cancelado",
}

/* ── Voice helpers ── */
const SPANISH_NUMBERS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, medio: 1, media: 1,
}

/** Corrige errores frecuentes de transcripción (Whisper) */
function normalizeTranscript(raw: string): string {
  return raw
    .trim()
    .replace(/\bcortao(s)?\b/gi, "cortado$1")
    .replace(/\bsuawe\b/gi, "suave")
    .replace(/\bsuabe\b/gi, "suave")
    .replace(/\bexpreso(s)?\b/gi, "espresso$1")
    .replace(/\bcapuchino(s)?\b/gi, "cappuccino$1")
    .replace(/\bcappuchino\b/gi, "cappuccino")
    .replace(/\bcapuccino\b/gi, "cappuccino")
    .replace(/\blatte(s)?\b/gi, "latte$1")
    .replace(/\bjarrito(s)?\b/gi, "jarrito$1")
    .replace(/\bcafe(s)?\b/gi, "café$1")
    .replace(/\bmedialuna(s)?\b/gi, "medialuna$1")
    .replace(/\bmedialunas\b/gi, "medialunas")
    .replace(/\btostado(s)?\b/gi, "tostado$1")
    .replace(/\bamericano(s)?\b/gi, "americano$1")
    .replace(/\bmachiato(s)?\b/gi, "macchiato$1")
    .replace(/\bmakiato\b/gi, "macchiato")
    .replace(/\bcrema\s*batida\b/gi, "crema batida")
    .replace(/\bleche\s*de\s*almendra(s)?\b/gi, "leche de almendra$1")
    .replace(/\bleche\s*de\s*soja\b/gi, "leche de soja")
    .replace(/\bleche\s*de\s*avena\b/gi, "leche de avena")
    .replace(/\bazucar\b/gi, "azúcar")
    .replace(/\bmas\b/gi, "más")
    .replace(/\bcalient(e|es)\b/gi, "caliente")
}

/** Palabras/frases que son notas cuando van al final del pedido (minúsculas) */
const TRAILING_NOTE_WORDS = new Set([
  "suave", "fuerte", "caliente", "frio", "frío", "tibio", "liviano", "cargado",
  "dulce", "amargo", "bien dulce", "bien cargado", "bien suave", "bien fuerte", "bien caliente",
  "sin azucar", "sin azúcar", "con azúcar", "con leche", "con hielo", "grande", "chico", "mediano",
  "al punto", "jugoso", "seco", "extra", "doble", "light", "descremado", "entero",
  "al tiempo", "templado", "helado", "en jarrito", "para llevar", "en vaso", "en taza",
  "poco dulce", "poco azúcar", "más suave", "más fuerte", "sin lactosa", "con crema",
  "bien hecho", "vuelta y vuelta", "crudo", "a punto", "bien cocido",
  "con leche de almendras", "con leche de soja", "con leche de avena", "con leche de coco",
  "leche de almendras", "leche de soja", "leche de avena",
])

/** Separa "producto" y "notas" (ej. "latte con leche de almendras" → producto + nota; "cortado jarrito suave" → producto + "suave") */
function splitProductAndNotes(productText: string): { productPart: string; notesPart: string } {
  const lower = productText.trim().toLowerCase()
  const noteMarkers = [
    /\s+con\s+/i,
    /\s+sin\s+/i,
    /\s+que\s+sea\s+/i,
    /\s+que\s+tenga\s+/i,
    /\s+en\s+/i,
    /\s+al\s+/i,
    /\s+bien\s+/i,
    /\s+extra\s+/i,
    /\s+doble\s+/i,
  ]
  for (const re of noteMarkers) {
    const idx = lower.search(re)
    if (idx > 0) {
      const before = productText.slice(0, idx).trim()
      const after = productText.slice(idx).trim()
      if (before.length >= 2) {
        return { productPart: before, notesPart: after }
      }
    }
  }
  // Nota al final: "cortado jarrito suave" → producto "cortado jarrito", nota "suave"
  const words = lower.split(/\s+/).filter(Boolean)
  for (const n of [4, 3, 2, 1]) {
    if (words.length < n) continue
    const tail = words.slice(-n).join(" ")
    if (TRAILING_NOTE_WORDS.has(tail)) {
      const productPart = words.slice(0, -n).join(" ")
      if (productPart.length >= 2) return { productPart, notesPart: tail }
    }
  }
  return { productPart: productText.trim(), notesPart: "" }
}

/** Búsqueda en POS: minúsculas + sin tildes para acertar "cafe" / "Café" / categorías */
function foldForPosSearch(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

function parseVoiceCommand(
  transcript: string,
  products: any[]
): { product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[] {
  const results: { product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[] = []
  const text = transcript.toLowerCase().trim()

  // Split by "y", commas, or "más"
  const parts = text.split(/(?:\s+y\s+|,\s*|\s+más\s+)/).filter(Boolean)

  const normalize = (s: string) =>
    (s || "")
      .replace(/[áàä]/g, "a")
      .replace(/[éèë]/g, "e")
      .replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o")
      .replace(/[úùü]/g, "u")
      .replace(/[ñ]/g, "n")
      .toLowerCase()
      .trim()

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    let quantity = 1
    let productText = trimmed

    const numMatch = trimmed.match(/^(\d+)\s+(.+)/)
    if (numMatch) {
      quantity = parseInt(numMatch[1], 10)
      productText = numMatch[2]
    } else {
      const words = trimmed.split(/\s+/)
      if (words.length > 1 && SPANISH_NUMBERS[words[0]] !== undefined) {
        quantity = SPANISH_NUMBERS[words[0]]
        productText = words.slice(1).join(" ")
      }
    }

    const normalizedFull = normalize(productText)
    if (normalizedFull.length < 2) continue

    let bestMatch: any = null
    let bestScore = 0
    let notes = ""

    const scoreProduct = (search: string, pName: string) => {
      if (pName === search) return 100
      if (search.startsWith(pName)) return 95
      if (pName.startsWith(search)) return Math.min(search.length, pName.length) / Math.max(search.length, pName.length) * 90
      if (pName.includes(search) || search.includes(pName)) return Math.min(search.length, pName.length) / Math.max(search.length, pName.length) * 90
      const searchWords = search.split(/\s+/).filter(Boolean)
      const productWords = pName.split(/\s+/).filter(Boolean)
      const matchingWords = searchWords.filter((w) => productWords.some((pw) => pw.includes(w) || w.includes(pw)))
      return (matchingWords.length / Math.max(searchWords.length, 1)) * 80
    }

    // Intentar primero coincidir con la frase completa
    for (const p of products) {
      const pName = normalize(p.name || "")
      const s = scoreProduct(normalizedFull, pName)
      if (s > bestScore) {
        bestScore = s
        bestMatch = p
        notes = ""
      }
    }
    if (bestMatch && bestScore < 40) bestMatch = null
    if (!bestMatch && !normalizedFull.startsWith("cafe") && !normalizedFull.startsWith("café")) {
      for (const p of products) {
        const pName = normalize(p.name || "")
        const s = scoreProduct("cafe " + normalizedFull, pName)
        if (s > bestScore) {
          bestScore = s
          bestMatch = p
          notes = ""
        }
      }
    }
    if (bestMatch && bestScore >= 40) {
      const sector = resolvePreparationSector(bestMatch)
      const trailingNote = splitProductAndNotes(productText).notesPart
      results.push({ product: bestMatch, quantity, sector, notes: trailingNote })
      continue
    }

    // Si no coincide, separar posible nota al final (ej. "cortado jarrito suave" → nota "suave") o por "con/sin"
    const { productPart, notesPart } = splitProductAndNotes(productText)
    const normalizedSearch = normalize(productPart)
    if (normalizedSearch.length < 2) continue

    bestMatch = null
    bestScore = 0
    for (const p of products) {
      const pName = normalize(p.name || "")
      const s = scoreProduct(normalizedSearch, pName)
      if (s > bestScore) {
        bestScore = s
        bestMatch = p
      }
    }

    if (bestMatch && bestScore >= 40) {
      const sector = resolvePreparationSector(bestMatch)
      results.push({ product: bestMatch, quantity, sector, notes: notesPart })
      continue
    }

    // Segunda pasada: probar con prefijo "café" (ej. "cortado" → "café cortado" para matchear "Café cortado jarrito")
    const withCafe = normalizedSearch.startsWith("cafe") || normalizedSearch.startsWith("café")
      ? normalizedSearch
      : "cafe " + normalizedSearch
    for (const p of products) {
      const pName = normalize(p.name || "")
      const s = scoreProduct(withCafe, pName)
      if (s > bestScore) {
        bestScore = s
        bestMatch = p
      }
    }
    if (bestMatch && bestScore >= 40) {
      const sector = resolvePreparationSector(bestMatch)
      results.push({ product: bestMatch, quantity, sector, notes: notesPart })
    }
  }

  return results
}

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
export default function TableOrderPage() {
  const params = useParams()
  const router = useRouter()
  const tableId = params.id as string

  /* ── core data ── */
  const [table, setTable] = useState<any>(null)
  const [order, setOrder] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [locationId, setLocationId] = useState("")

  const user = authApi.getStoredUser()
  const canCloseAccount = useMemo(
    () => user && ["cashier", "CASHIER", "admin", "ADMIN"].includes(user.role),
    [user?.role]
  )

  /* ── turno abierto (sin turno no se puede cargar la mesa) ── */
  const [openRegister, setOpenRegister] = useState<any | null>(null)
  const [loadingOpenRegister, setLoadingOpenRegister] = useState(true)

  /* ── pending (local) items ── */
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  /** Tras voz: platos pendientes de completar en el mismo modal (uno tras otro). */
  const voiceModifierQueueRef = useRef<
    Array<{
      product: any
      quantity: number
      sector: PendingItem["sector"]
      notes: string
      groups: any[]
      recipeIngredients: {
        id: string
        productId: string
        name: string
        modifierGroupId?: string | null
      }[]
    }>
  >([])
  /** Modal de opciones al tocar un plato con modificadores configurados */
  const [modifierModal, setModifierModal] = useState<{
    product: any
    groups: any[]
    selections: Record<string, string | string[]>
    recipeIngredients: {
      id: string
      productId: string
      name: string
      modifierGroupId?: string | null
    }[]
    excludedIngredientIds: string[]
    /** Líneas `product_modifier_stock_line` de la preparación que el cliente quitó. */
    excludedModifierStockLineIds: string[]
    /** Si viene de comando de voz: cantidad, sector y notas del match. */
    voiceMeta?: {
      quantity: number
      sector: PendingItem["sector"]
      notes: string
    }
  } | null>(null)
  const [modifierModalLoading, setModifierModalLoading] = useState(false)

  /* ── UI ── */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [customerCount, setCustomerCount] = useState(1)
  const [splitMode, setSplitMode] = useState(false)
  /** Por ítem: comensal (1-based) → cantidad. Valor puede ser number (todo a ese comensal) o Record<number, number>. */
  const [itemPayer, setItemPayer] = useState<Record<string, number | Record<number, number>>>({})

  /* ── payment modal ── */
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("")
  /** Cuando la cuenta está dividida: método de pago por comensal (1-based) */
  const [paymentByDiner, setPaymentByDiner] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState(0)
  const [paymentNotes, setPaymentNotes] = useState("")
  /* ── cambio de mesa (solo cajero/admin) ── */
  const [showChangeTableModal, setShowChangeTableModal] = useState(false)
  const [changeTableMode, setChangeTableMode] = useState<"full" | "items">("full")
  const [tablesForChange, setTablesForChange] = useState<any[]>([])
  const [newTableIdForChange, setNewTableIdForChange] = useState("")
  const [selectedItemIdsForMove, setSelectedItemIdsForMove] = useState<string[]>([])
  const [changingTable, setChangingTable] = useState(false)
  const [changeTableError, setChangeTableError] = useState<string | null>(null)
  const [invoiceType, setInvoiceType] = useState<"consumidor" | "eventual" | "cuenta_corriente" | "factura_a">("consumidor")
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [cuitSearchResult, setCuitSearchResult] = useState<any>(null)
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
  const [customerSearchEmpty, setCustomerSearchEmpty] = useState(false)
  const [cuitSearching, setCuitSearching] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerCuit, setNewCustomerCuit] = useState("")
  const [addingCustomer, setAddingCustomer] = useState(false)
  /** Clientes con cuenta corriente (para cerrar mesa a cuenta) */
  const [runningAccountCustomers, setRunningAccountCustomers] = useState<any[]>([])
  const [loadingRunningCustomers, setLoadingRunningCustomers] = useState(false)
  const [runningAccountCustomerSearch, setRunningAccountCustomerSearch] = useState("")
  const [runningAccountDropdownOpen, setRunningAccountDropdownOpen] = useState(false)

  useEffect(() => {
    if (invoiceType !== "cuenta_corriente") return
    setLoadingRunningCustomers(true)
    runningAccountsApi.getClients().then((res) => {
      const list = Array.isArray(res) ? res : (res as any)?.data
      setRunningAccountCustomers(Array.isArray(list) ? list : [])
    }).catch(() => setRunningAccountCustomers([])).finally(() => setLoadingRunningCustomers(false))
  }, [invoiceType])

  const filteredRunningAccountCustomers = useMemo(() => {
    const q = (runningAccountCustomerSearch ?? "").trim().toLowerCase().normalize("NFD").replace(/\u0301/g, "")
    if (!q) return runningAccountCustomers
    return runningAccountCustomers.filter((c: any) => {
      const name = (c.name ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
      const legalName = (c.legalName ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
      const cuit = (c.cuit ?? "").replace(/\D/g, "")
      const cuitQ = q.replace(/\D/g, "")
      return name.includes(q) || legalName.includes(q) || (cuitQ.length >= 2 && cuit.includes(cuitQ))
    })
  }, [runningAccountCustomers, runningAccountCustomerSearch])

  /** Después de "Pre cierre de control" (impresión), se muestra Cerrar Cuenta para esta orden. */
  const [preCierreOrderId, setPreCierreOrderId] = useState<string | null>(null)
  /** Modal con el comprobante de pre cierre para imprimir en la misma página. */
  const [showPreCierreModal, setShowPreCierreModal] = useState(false)
  /** Tras cerrar la cuenta: modal con comprobante para imprimir antes de volver a mesas. */
  const [showCierreReceiptModal, setShowCierreReceiptModal] = useState(false)
  const [closedOrderSnapshot, setClosedOrderSnapshot] = useState<{
    orderNumber: string
    tableName: string
    items: any[]
    total: number
    paymentMethod: string
    discount: number
  } | null>(null)

  /* ── notes modal ── */
  const [notesTarget, setNotesTarget] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState("")

  /* ── edit order item modal ── */
  const [editingOrderItem, setEditingOrderItem] = useState<{
    id: string
    productName: string
    quantity: number
    notes: string
  } | null>(null)
  const [updatingItem, setUpdatingItem] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)

  /* ── sector selector ── */
  const [sectorTarget, setSectorTarget] = useState<string | null>(null)

  /* ── voice commanding (OpenAI Whisper) ── */
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState("")
  const [voiceMatches, setVoiceMatches] = useState<{ product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[]>([])
  const [voiceConfirming, setVoiceConfirming] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startVoice = useCallback(async () => {
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { noiseSuppression: true },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }

      // Pick a supported mimeType (webm for Chrome/Firefox, mp4 for Safari)
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "",
      ]
      let mimeType = ""
      for (const t of preferredTypes) {
        if (!t || MediaRecorder.isTypeSupported(t)) {
          mimeType = t
          break
        }
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const mediaRecorder = new MediaRecorder(stream, options)
      const actualMime = mediaRecorder.mimeType || "audio/webm"
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())

        if (audioChunksRef.current.length === 0) {
          setVoiceTranscript("No se grabó audio. Intentá de nuevo.")
          return
        }

        setVoiceProcessing(true)
        setVoiceTranscript("Procesando con IA...")

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMime })

          // Convert to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              const b64 = result.split(",")[1]
              if (b64) resolve(b64)
              else reject(new Error("Failed to encode audio"))
            }
            reader.onerror = () => reject(new Error("FileReader error"))
            reader.readAsDataURL(audioBlob)
          })

          // Determine file extension for Whisper
          const ext = actualMime.includes("mp4") ? "mp4"
            : actualMime.includes("ogg") ? "ogg"
            : "webm"

          const shortPrompt = "café cortado jarrito latte suave fuerte caliente espresso cappuccino."
          const response = await aiEventsApi.transcribeAudio(base64, "es", ext, shortPrompt)
          let transcript = response.transcript?.trim() || ""

          if (!transcript) {
            setVoiceTranscript("No se detectó audio. Intentá de nuevo.")
            setVoiceProcessing(false)
            return
          }

          transcript = normalizeTranscript(transcript)

          const minLength = 6
          const wordCount = transcript.split(/\s+/).filter(Boolean).length
          if (transcript.length < minLength || wordCount < 2) {
            setVoiceTranscript("No se entendió una orden clara. Hablá más cerca del micrófono y repetí (ej: \"Un latte con leche de almendras\").")
            setVoiceProcessing(false)
            return
          }

          setVoiceTranscript(transcript)
          const matches = parseVoiceCommand(transcript, products)
          setVoiceMatches(matches)
          if (matches.length > 0) setVoiceConfirming(true)
        } catch (err) {
          console.error("Voice transcription error:", err)
          setVoiceTranscript("Error al transcribir. Intentá de nuevo.")
        } finally {
          setVoiceProcessing(false)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(250) // Collect data every 250ms for reliability
      setVoiceActive(true)
      setVoiceTranscript("Grabando...")
      setVoiceMatches([])
      setVoiceConfirming(false)
    } catch (err) {
      console.error("Microphone access error:", err)
      setError("No se pudo acceder al micrófono. Verificá los permisos del navegador.")
    }
  }, [products])

  const stopVoice = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    setVoiceActive(false)
  }, [])

  const applyTranscriptAsVoice = useCallback(() => {
    const text = voiceTranscript.trim()
    if (!text || text.length < 3) return
    const corrected = normalizeTranscript(text)
    const matches = parseVoiceCommand(corrected, products)
    setVoiceMatches(matches)
    if (matches.length > 0) {
      setVoiceConfirming(true)
    } else {
      setVoiceTranscript(corrected)
    }
  }, [voiceTranscript, products])

  const confirmVoiceItems = useCallback(async () => {
    type Queued = (typeof voiceModifierQueueRef.current)[number]
    const modalQueue: Queued[] = []
    const directLabels: string[] = []

    for (const match of voiceMatches) {
      let groups: any[] = []
      try {
        const raw = await productsApi.getModifiers(match.product.id, true)
        groups = Array.isArray(raw) ? raw : []
      } catch {
        groups = []
      }
      const posCtx = await recipesApi.getPosContext(match.product.id).catch(() => ({
        modifierGroupIds: [] as string[],
        ingredients: [] as {
          id: string
          productId: string
          name: string
          modifierGroupId?: string | null
        }[],
      }))
      const groupsFiltered = filterModifierGroupsByRecipe(
        groups,
        posCtx.modifierGroupIds ?? []
      )
      const recipeIngs = recipeIngredientsForPosModal(posCtx.ingredients ?? [])
      const needsModifierModal =
        groupsFiltered.length > 0 || recipeIngs.length > 0

      if (needsModifierModal) {
        modalQueue.push({
          product: match.product,
          quantity: match.quantity,
          sector: match.sector,
          notes: match.notes || "",
          groups: groupsFiltered,
          recipeIngredients: recipeIngs,
        })
        continue
      }

      const unitPrice = Number(match.product.salePrice) || 0
      const emptyKey = pendingLineMatchKey({})
      const existing = !match.notes
        ? pendingItems.find(
            (i) =>
              i.productId === match.product.id && pendingLineMatchKey(i) === emptyKey
          )
        : null
      if (existing) {
        setPendingItems((prev) =>
          prev.map((i) =>
            i.tempId === existing.tempId
              ? { ...i, quantity: i.quantity + match.quantity }
              : i
          )
        )
      } else {
        setPendingItems((prev) => [
          ...prev,
          {
            tempId: crypto.randomUUID(),
            productId: match.product.id,
            productSku: match.product.sku ?? undefined,
            productName: match.product.name,
            quantity: match.quantity,
            unitPrice,
            sector: match.sector,
            notes: match.notes || "",
          },
        ])
      }
      const base = `${match.quantity} ${match.product.name}`
      directLabels.push(match.notes ? `${base} (${match.notes})` : base)
    }

    if (modalQueue.length > 0) {
      voiceModifierQueueRef.current = modalQueue.slice(1)
      const first = modalQueue[0]!
      setModifierModal({
        product: first.product,
        groups: first.groups,
        selections: buildInitialModifierSelections(
          first.product,
          first.groups,
          first.recipeIngredients,
          []
        ),
        recipeIngredients: first.recipeIngredients,
        excludedIngredientIds: [],
        excludedModifierStockLineIds: [],
        voiceMeta: {
          quantity: first.quantity,
          sector: first.sector,
          notes: first.notes,
        },
      })
    }

    let phrase: string
    if (modalQueue.length > 0) {
      if (directLabels.length > 0) {
        phrase = `Agregado: ${directLabels.join(", ")}. Completá opciones en pantalla.`
      } else if (modalQueue.length === 1) {
        phrase = "Elegí opciones del plato en pantalla."
      } else {
        phrase = `Hay ${modalQueue.length} platos. Elegí las opciones del primero en pantalla.`
      }
    } else {
      phrase = `Agregado: ${voiceMatches.map((m) => {
        const base = `${m.quantity} ${m.product.name}`
        return m.notes ? `${base} (${m.notes})` : base
      }).join(", ")}`
    }
    speakShort(phrase)

    setVoiceConfirming(false)
    setVoiceMatches([])
    setVoiceTranscript("")
  }, [voiceMatches, pendingItems])

  /* ── resolve location (solo si aún vacío: no pisar el local de la mesa al cargarla) ── */
  useEffect(() => {
    const user = authApi.getStoredUser()
    const loc =
      user?.location ||
      (() => {
        try {
          return JSON.parse(
            localStorage.getItem(getLocationKey()) || "null"
          )
        } catch {
          return null
        }
      })()
    if (loc?.id) setLocationId((prev) => prev || loc.id)
  }, [])

  /* ── estado de turno (caja abierta) ── */
  const fetchOpenRegister = useCallback(async () => {
    if (!locationId) {
      setLoadingOpenRegister(false)
      setOpenRegister(null)
      return
    }
    setLoadingOpenRegister(true)
    try {
      const reg = await cashRegistersApi.getCurrentOpen(locationId)
      if (!reg || typeof reg !== "object" || Array.isArray(reg)) {
        setOpenRegister(null)
        return
      }
      const r = reg as Record<string, unknown>
      const id = r.id ?? (r.data as Record<string, unknown>)?.id ?? (r.register as Record<string, unknown>)?.id
      if (id == null || id === "") {
        setOpenRegister(null)
        return
      }
      setOpenRegister({ ...r, id } as any)
    } catch {
      setOpenRegister(null)
    } finally {
      setLoadingOpenRegister(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchOpenRegister()
  }, [fetchOpenRegister])

  const hasOpenShift = !!openRegister && !loadingOpenRegister

  /* ── fetch data ── */
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    setTable(null)
    setOrder(null)
    try {
      const tableData = await tablesApi.getById(tableId)
      setTable(tableData)

      /** Venta en mesa = siempre el local de la mesa (no el del usuario en otra sucursal). */
      const tableLocId = tableData?.location?.id ?? ""
      const effectiveLocationId = tableLocId || locationId || ""
      if (tableLocId) {
        setLocationId(tableLocId)
      }

      if (effectiveLocationId) {
        const productsData = await productsApi.getAll({
          isSellable: true,
          isActive: true,
          limit: 5000,
          _refresh: Date.now(),
        })
        const rawProducts = productsData?.data ?? productsData ?? []
        const scopedProducts = rawProducts
          .filter((product: any) =>
            isProductAvailableAtLocation(product, effectiveLocationId)
          )
          .map((product: any) => {
            const stockForLocation = Array.isArray(product.stockLevels)
              ? product.stockLevels.find(
                  (level: any) =>
                    (level.locationId ?? level.location?.id) ===
                    effectiveLocationId
                )
              : null
            return {
              ...product,
              salePrice: stockForLocation?.salePrice ?? product.salePrice ?? 0,
            }
          })

        setProducts(scopedProducts)
      } else {
        setProducts([])
      }

      // load existing order (división de mesa viene del backend para mozo y cajero)
      const openOrderId =
        tableData.currentOrderId ?? tableData.currentOrder?.id ?? null
      if (openOrderId) {
        try {
          const orderData = await ordersApi.getById(openOrderId)
          setOrder(orderData)
          if (typeof orderData?.customerCount === "number" && orderData.customerCount >= 1)
            setCustomerCount(Math.min(orderData.customerCount, 20))
          if (typeof orderData?.splitMode === "boolean") setSplitMode(orderData.splitMode)
          if (orderData?.itemPayer && typeof orderData.itemPayer === "object" && !Array.isArray(orderData.itemPayer))
            setItemPayer(orderData.itemPayer as Record<string, number | Record<number, number>>)
          else
            setItemPayer({})
        } catch {
          setOrder(null)
        }
      } else {
        setOrder(null)
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar datos de la mesa"
      const notFound =
        /not found|no encontrad|404/i.test(msg) ||
        /Table with ID/i.test(msg)
      setError(
        notFound
          ? "Esta mesa no existe en este local (enlace viejo, mesa eliminada u otro entorno)."
          : msg
      )
      setTable(null)
      setOrder(null)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [tableId, locationId])

  useEffect(() => {
    if (tableId) fetchData()
  }, [tableId, fetchData])

  const orderId = order?.id

  /* ── persistir división en el backend (visible para mozo y cajero en cualquier dispositivo) ── */
  const saveSplitMeta = useCallback(async () => {
    if (!orderId || !order || order.status !== "open") return
    try {
      await ordersApi.updateSplit(orderId, { customerCount, splitMode })
    } catch {}
  }, [orderId, order?.status, customerCount, splitMode])

  useEffect(() => {
    if (!orderId || !order || order.status !== "open") return
    saveSplitMeta()
  }, [orderId, order?.status, customerCount, splitMode, saveSplitMeta])

  const itemPayerSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!orderId || !order || order.status !== "open") return
    const orderItemIds = new Set((order?.items ?? []).map((i: any) => i.id))
    const itemPayerForApi = Object.fromEntries(
      Object.entries(itemPayer).filter(([key]) => orderItemIds.has(key))
    )
    if (Object.keys(itemPayerForApi).length === 0) return
    if (itemPayerSaveTimeoutRef.current) clearTimeout(itemPayerSaveTimeoutRef.current)
    itemPayerSaveTimeoutRef.current = setTimeout(() => {
      itemPayerSaveTimeoutRef.current = null
      ordersApi.updateSplit(orderId, { itemPayer: itemPayerForApi }).catch(() => {})
    }, 600)
    return () => {
      if (itemPayerSaveTimeoutRef.current) clearTimeout(itemPayerSaveTimeoutRef.current)
    }
  }, [orderId, order?.status, order?.items, itemPayer])

  /* ── derived: categories ── */
  const categories = useMemo(() => {
    const cats = new Map<
      string,
      { id: string; name: string; icon: string; color: string; sortOrder?: number }
    >()
    products.forEach((p) => {
      if (p.category && !cats.has(p.category.id)) {
        cats.set(p.category.id, p.category)
      }
    })
    return Array.from(cats.values()).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )
  }, [products])

  /* ── derived: filtered products ── */
  const filteredProducts = useMemo(() => {
    let list = products
    if (activeCategory === "__uncategorized__") {
      list = list.filter((p) => !p.category?.id)
    } else if (activeCategory !== "all") {
      list = list.filter((p) => p.category?.id === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = foldForPosSearch(searchQuery.trim())
      list = list.filter((p) => {
        const name = foldForPosSearch(String(p.name ?? ""))
        const cat = foldForPosSearch(String(p.category?.name ?? ""))
        const sku = foldForPosSearch(String(p.sku ?? ""))
        return name.includes(q) || cat.includes(q) || sku.includes(q)
      })
    }
    return list
  }, [products, activeCategory, searchQuery])

  /* ── derived: totals ── */
  const pendingSubtotal = pendingItems.reduce(
    (s, i) => s + i.unitPrice * i.quantity,
    0
  )
  const existingSubtotal = order?.subtotal ?? 0
  const orderTotal = existingSubtotal + pendingSubtotal - discount

  const getDistribution = useCallback(
    (id: string, quantity: number): Record<number, number> => {
      const val = itemPayer[id]
      if (val == null) return { 1: quantity }
      if (typeof val === "number") return { [val]: quantity }
      return val
    },
    [itemPayer]
  )

  const splitTotals = useMemo(() => {
    const perPerson: Record<number, number> = {}
    if (!splitMode || customerCount < 2) return perPerson
    for (let n = 1; n <= customerCount; n++) perPerson[n] = 0
    const unitPrice = (item: any) => item.unitPrice ?? (item.totalPrice ?? 0) / (item.quantity || 1)
    order?.items?.forEach((item: any) => {
      const dist = getDistribution(item.id, item.quantity ?? 0)
      const up = unitPrice(item)
      Object.entries(dist).forEach(([n, qty]) => {
        const who = parseInt(n, 10)
        if (perPerson[who] !== undefined && qty > 0) perPerson[who] += up * qty
      })
    })
    pendingItems.forEach((item) => {
      const dist = getDistribution(item.tempId, item.quantity)
      Object.entries(dist).forEach(([n, qty]) => {
        const who = parseInt(n, 10)
        if (perPerson[who] !== undefined && qty > 0) perPerson[who] += item.unitPrice * qty
      })
    })
    return perPerson
  }, [splitMode, customerCount, order?.items, pendingItems, itemPayer, getDistribution])

  /* ── solo se puede cerrar cuando todos los ítems están servidos ── */
  const allItemsServed =
    !order?.items?.length ||
    order.items.every((i: any) => i.status === "served")

  /* ── add product ── */
  const addProduct = async (product: any) => {
    if (locationId && !hasOpenShift) {
      sileo.warning({ title: "Abra un turno para cargar la mesa", description: "Vaya a Caja y abra el turno." })
      return
    }
    setModifierModalLoading(true)
    try {
      let groups: any[] = []
      try {
        const raw = await productsApi.getModifiers(product.id, true)
        groups = Array.isArray(raw) ? raw : []
      } catch {
        groups = []
      }

      const posCtx = await recipesApi.getPosContext(product.id).catch(() => ({
        modifierGroupIds: [] as string[],
        ingredients: [] as {
          id: string
          productId: string
          name: string
          modifierGroupId?: string | null
        }[],
      }))

      const filtered = filterModifierGroupsByRecipe(
        groups,
        posCtx.modifierGroupIds ?? []
      )
      const recipeIngs = recipeIngredientsForPosModal(posCtx.ingredients ?? [])
      const openModal = filtered.length > 0 || recipeIngs.length > 0

      if (openModal) {
        voiceModifierQueueRef.current = []
        setModifierModal({
          product,
          groups: filtered,
          selections: buildInitialModifierSelections(
            product,
            filtered,
            recipeIngs,
            []
          ),
          recipeIngredients: recipeIngs,
          excludedIngredientIds: [],
          excludedModifierStockLineIds: [],
        })
        return
      }
    } finally {
      setModifierModalLoading(false)
    }

    const emptyKey = pendingLineMatchKey({})
    const existing = pendingItems.find(
      (i) => i.productId === product.id && pendingLineMatchKey(i) === emptyKey
    )
    if (existing) {
      setPendingItems((prev) =>
        prev.map((i) =>
          i.tempId === existing.tempId ? { ...i, quantity: i.quantity + 1 } : i
        )
      )
    } else {
      setPendingItems((prev) => [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          productId: product.id,
          productSku: product.sku ?? undefined,
          productName: product.name,
          quantity: 1,
          unitPrice: product.salePrice,
          sector: resolvePreparationSector(product),
          notes: "",
        },
      ])
    }
  }

  const closeModifierModal = () => {
    voiceModifierQueueRef.current = []
    setModifierModal(null)
  }

  const openNextVoiceModifierFromQueue = () => {
    const next = voiceModifierQueueRef.current.shift()
    if (!next) {
      setModifierModal(null)
      return
    }
    setModifierModal({
      product: next.product,
      groups: next.groups,
      selections: buildInitialModifierSelections(
        next.product,
        next.groups,
        next.recipeIngredients,
        []
      ),
      recipeIngredients: next.recipeIngredients,
      excludedIngredientIds: [],
      excludedModifierStockLineIds: [],
      voiceMeta: {
        quantity: next.quantity,
        sector: next.sector,
        notes: next.notes,
      },
    })
  }

  type ModifierModalState = NonNullable<typeof modifierModal>

  const commitModifierModalState = (
    m: ModifierModalState,
    selections: Record<string, string | string[]>
  ) => {
    const { product, groups, recipeIngredients, voiceMeta } = m
    const excludedIngredientIds = m.excludedIngredientIds
    const excludedModifierStockLineIds = m.excludedModifierStockLineIds ?? []
    const visibleGroups = effectiveModifierGroupsForPosModal(
      product,
      groups,
      recipeIngredients,
      excludedIngredientIds,
      selections
    )
    const sel: Record<string, string | string[]> = { ...selections }
    for (const g of visibleGroups) {
      const v = sel[g.id]
      const one = Array.isArray(v) ? v[0] : v
      if (one && !(g.options || []).some((o: any) => o.id === one)) {
        const defId = pickDefaultOptionIdForGroupPos(g, g.options || [])
        if (defId) sel[g.id] = defId
      }
    }
    for (const g of visibleGroups) {
      const s = sel[g.id]
      const n = Array.isArray(s) ? s.length : s ? 1 : 0
      if (g.required && n === 0) {
        sileo.error({ title: "Faltan opciones", description: `Elegí opciones en "${g.name}".` })
        return
      }
      if (g.minSelect > 0 && n < g.minSelect) {
        sileo.error({
          title: "Faltan opciones",
          description: `En "${g.name}" necesitás al menos ${g.minSelect}.`,
        })
        return
      }
      if (n > 1) {
        sileo.error({
          title: "Una opción por grupo",
          description: `En "${g.name}" solo podés elegir una opción.`,
        })
        return
      }
    }
    const normalizedSelections: Record<string, string | string[]> = {}
    for (const g of visibleGroups) {
      const v = sel[g.id]
      if (v == null) continue
      const one = Array.isArray(v) ? v[0] : v
      if (one) normalizedSelections[g.id] = one
    }
    const extra = extraPriceFromSelections(visibleGroups, normalizedSelections)
    const unitPrice = Math.round(((Number(product.salePrice) || 0) + extra) * 100) / 100
    let summary = fullPosModifierSummary(
      visibleGroups,
      normalizedSelections,
      recipeIngredients,
      excludedIngredientIds
    )
    const modStockSin = summaryExcludedModifierStockLines(
      groups,
      normalizedSelections,
      excludedModifierStockLineIds
    )
    if (modStockSin) {
      summary = summary ? `${summary} · ${modStockSin}` : modStockSin
    }
    const key = pendingLineMatchKey({
      modifierSelections:
        Object.keys(normalizedSelections).length > 0 ? normalizedSelections : undefined,
      excludedRecipeIngredientIds:
        excludedIngredientIds.length > 0 ? excludedIngredientIds : undefined,
      excludedModifierStockLineIds:
        excludedModifierStockLineIds.length > 0
          ? excludedModifierStockLineIds
          : undefined,
    })
    const existing = pendingItems.find(
      (i) => i.productId === product.id && pendingLineMatchKey(i) === key
    )
    const qtyAdd = voiceMeta?.quantity ?? 1
    const sector = voiceMeta?.sector ?? resolvePreparationSector(product)
    const notes = voiceMeta?.notes?.trim() ?? ""
    if (existing) {
      setPendingItems((prev) =>
        prev.map((i) =>
          i.tempId === existing.tempId ? { ...i, quantity: i.quantity + qtyAdd } : i
        )
      )
    } else {
      setPendingItems((prev) => [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          productId: product.id,
          productSku: product.sku ?? undefined,
          productName: product.name,
          quantity: qtyAdd,
          unitPrice,
          sector,
          notes,
          modifierSelections:
            Object.keys(normalizedSelections).length > 0
              ? normalizedSelections
              : undefined,
          modifierSummary: summary || undefined,
          excludedRecipeIngredientIds:
            excludedIngredientIds.length > 0 ? [...excludedIngredientIds] : undefined,
          excludedModifierStockLineIds:
            excludedModifierStockLineIds.length > 0
              ? [...excludedModifierStockLineIds]
              : undefined,
        },
      ])
    }
    if (voiceModifierQueueRef.current.length > 0) {
      openNextVoiceModifierFromQueue()
    } else {
      setModifierModal(null)
    }
  }

  const confirmModifierModal = () => {
    if (!modifierModal) return
    commitModifierModalState(modifierModal, modifierModal.selections)
  }

  /** Voz: confirmar sin tocar — mismas reglas que al abrir (1ª opción en obligatorios, todo incluido). */
  const confirmModifierModalVoiceDefaults = () => {
    if (!modifierModal?.voiceMeta) return
    const asSingle = buildInitialModifierSelections(
      modifierModal.product,
      modifierModal.groups,
      modifierModal.recipeIngredients,
      []
    )
    if (modifierModal.product?.sku && LICUADO_450_SKUS.has(modifierModal.product.sku)) {
      const eff = effectiveModifierGroupsForPosModal(
        modifierModal.product,
        modifierModal.groups,
        modifierModal.recipeIngredients,
        [],
        asSingle
      )
      const sorted = [...eff].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      if (sorted.length >= 2) {
        const gLiq = sorted[1]
        const optIds = new Set((gLiq.options || []).map((o: any) => o.id))
        const cur = asSingle[gLiq.id]
        const curOne = Array.isArray(cur) ? cur[0] : cur
        if (curOne && !optIds.has(curOne)) {
          const first = gLiq.options?.[0]
          if (first?.id) asSingle[gLiq.id] = first.id
        }
      }
    }
    commitModifierModalState(
      {
        ...modifierModal,
        excludedIngredientIds: [],
        excludedModifierStockLineIds: [],
      },
      asSingle
    )
  }

  /* ── quantity helpers ── */
  const changeQty = (tempId: string, delta: number) => {
    setPendingItems((prev) =>
      prev
        .map((i) =>
          i.tempId === tempId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  const removePending = (tempId: string) => {
    setPendingItems((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  /* ── set sector ── */
  const setSector = (tempId: string, sector: PendingItem["sector"]) => {
    setPendingItems((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, sector } : i))
    )
    setSectorTarget(null)
  }

  /* ── save note ── */
  const saveNote = () => {
    if (!notesTarget) return
    setPendingItems((prev) =>
      prev.map((i) =>
        i.tempId === notesTarget ? { ...i, notes: notesDraft } : i
      )
    )
    setNotesTarget(null)
    setNotesDraft("")
  }

  /* ── update order item (cantidad / notas) ── */
  const saveOrderItemEdit = async () => {
    if (!editingOrderItem) return
    setUpdatingItem(true)
    setError("")
    try {
      await ordersApi.updateOrderItem(editingOrderItem.id, {
        quantity: editingOrderItem.quantity,
        notes: editingOrderItem.notes || undefined,
      })
      setEditingOrderItem(null)
      await fetchData()
      sileo.success({ title: "Ítem actualizado" })
    } catch {
      setError("Error al actualizar ítem")
      sileo.error({ title: "Error al actualizar ítem" })
    } finally {
      setUpdatingItem(false)
    }
  }

  /* ── remove order item ── */
  const removeOrderItem = async (itemId: string) => {
    if (!confirm("¿Eliminar este ítem del pedido?")) return
    setRemovingItemId(itemId)
    setError("")
    try {
      await ordersApi.removeOrderItem(itemId)
      await fetchData()
      sileo.success({ title: "Ítem eliminado" })
    } catch {
      setError("Error al eliminar ítem")
      sileo.error({ title: "Error al eliminar ítem" })
    } finally {
      setRemovingItemId(null)
    }
  }

  /* ── send to kitchen ── */
  const sendToKitchen = async () => {
    if (pendingItems.length === 0) return
    setSending(true)
    setError("")
    try {
      const items = pendingItems.map((i) => {
        const noteParts = [i.notes?.trim(), i.modifierSummary?.trim()].filter(Boolean)
        return {
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          sector: i.sector,
          notes: noteParts.length ? noteParts.join(" · ") : undefined,
          modifierSelections:
            i.modifierSelections && Object.keys(i.modifierSelections).length > 0
              ? i.modifierSelections
              : undefined,
          excludedRecipeIngredientIds:
            i.excludedRecipeIngredientIds && i.excludedRecipeIngredientIds.length > 0
              ? i.excludedRecipeIngredientIds
              : undefined,
          excludedModifierStockLineIds:
            i.excludedModifierStockLineIds && i.excludedModifierStockLineIds.length > 0
              ? i.excludedModifierStockLineIds
              : undefined,
        }
      })

      if (!order) {
        // Create new order
        await ordersApi.create({
          locationId,
          type: "dine_in",
          tableId,
          customerCount,
          items,
        })
      } else {
        // Add items to existing order (la alerta de voz "se le agregó" solo suena en Cocina/Cafetería)
        for (const item of items) {
          await ordersApi.addItem(order.id, item)
        }
      }

      setPendingItems([])
      await fetchData()
      sileo.success({ title: "Pedido enviado a cocina" })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al enviar pedido"
      setError(msg)
      sileo.error({ title: "Error al enviar pedido", description: msg })
    } finally {
      setSending(false)
    }
  }

  /* ── close order ── */
  const closeOrder = async () => {
    const isErrorsOrTrashTable = table?.tableType === "errors" || table?.tableType === "trash"
    const effectiveMethod = paymentMethod || "cash"
    if (!order) return
    if (!isErrorsOrTrashTable) {
      if (!splitMode || Object.keys(splitTotals).length === 0) {
        if (!effectiveMethod) return
      }
      if (invoiceType === "factura_a" && !customerId) {
        setError("Para Factura A seleccioná o agregá un cliente por CUIT")
        return
      }
      if (invoiceType === "cuenta_corriente" && !customerId) {
        setError("Para Cuenta corriente seleccioná un cliente con cuenta corriente")
        return
      }
    }
    setClosing(true)
    setError("")
    try {
      const isCuentaCorriente = invoiceType === "cuenta_corriente"
      const hasSplitPayments = !isErrorsOrTrashTable && !isCuentaCorriente && splitMode && Object.keys(splitTotals).length > 0
      const payload: {
        paymentMethod: string
        discountAmount?: number
        notes?: string
        invoiceType?: string
        customerId?: string
        payments?: { diner: number; method: string; amount: number }[]
      } = isErrorsOrTrashTable
        ? {
            paymentMethod: "cash",
            notes: paymentNotes || undefined,
          }
        : isCuentaCorriente
          ? {
              paymentMethod: "cuenta_corriente",
              discountAmount: discount > 0 ? discount : undefined,
              notes: paymentNotes || undefined,
              invoiceType: "cuenta_corriente",
              customerId: customerId ?? undefined,
            }
          : {
              paymentMethod: effectiveMethod,
              discountAmount: discount > 0 ? discount : undefined,
              notes: paymentNotes || undefined,
              invoiceType: invoiceType === "factura_a" ? "factura_a" : invoiceType === "eventual" ? "eventual" : "consumidor",
              customerId: customerId || undefined,
            }
      if (hasSplitPayments) {
        payload.payments = Object.entries(splitTotals).map(([num, amount]) => ({
          diner: parseInt(String(num), 10) || 1,
          method: String(paymentByDiner[Number(num)] || effectiveMethod).trim() || "cash",
          amount: Math.round(Number(amount) * 100) / 100,
        }))
      }
      await ordersApi.close(order.id, payload)
      setShowPayment(false)
      const methodLabel = isCuentaCorriente ? "Cuenta corriente" : effectiveMethod === "cash" ? "Efectivo" : effectiveMethod === "card" ? "Tarjeta" : effectiveMethod === "transfer" ? "Transferencia" : effectiveMethod
      setClosing(false)
      setClosedOrderSnapshot({
        orderNumber: order.orderNumber ?? order.id,
        tableName: /^\d+$/.test(String(table?.name ?? "")) ? `Mesa ${table?.name}` : (table?.name ?? "Mesa"),
        items: order.items ?? [],
        total: orderTotal,
        paymentMethod: methodLabel,
        discount,
      })
      setShowCierreReceiptModal(true)
      sileo.success({ title: "Cuenta cerrada correctamente" })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al cerrar la cuenta"
      setError(msg)
      sileo.error({ title: msg })
      setClosing(false)
    }
  }

  /** Abre el modal de pre cierre para que el cliente verifique la cuenta e imprima en la misma página. */
  const handlePreCierreControl = () => {
    if (!order || !table) return
    setShowPreCierreModal(true)
  }

  /* Auto-imprimir al abrir el modal de pre cierre (abre el cuadro de impresión del sistema con la impresora por defecto) */
  useEffect(() => {
    if (!showPreCierreModal || !order) return
    const t = setTimeout(() => {
      window.print()
    }, 400)
    return () => clearTimeout(t)
  }, [showPreCierreModal, order?.id])

  /* Auto-imprimir al abrir el modal de comprobante de cierre */
  useEffect(() => {
    if (!showCierreReceiptModal || !closedOrderSnapshot) return
    const t = setTimeout(() => {
      window.print()
    }, 400)
    return () => clearTimeout(t)
  }, [showCierreReceiptModal, closedOrderSnapshot])

  /* ── loading ── */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
          <p className="mt-3 text-sm text-gray-500">Cargando mesa...</p>
        </div>
      </div>
    )
  }

  if (!table) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-3 text-sm font-medium text-gray-800">Mesa no encontrada</p>
          {error ? (
            <p className="mt-2 text-xs text-gray-500">{error}</p>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              Abrí la mesa desde el mapa de Mesas para usar un enlace válido.
            </p>
          )}
          <button
            onClick={() => router.push("/pos/tables" + posStationSuffix())}
            className="mt-4 text-sm font-medium text-blue-600 hover:underline"
          >
            Volver a mesas
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col lg:flex-row">
      {/* ═══════════════════════════════════
          IZQUIERDA — Comanda, total y Enviar a Cocina (estilo anterior + adaptable)
          ═══════════════════════════════════ */}
      <div className="flex w-full min-w-0 flex-col border-b border-gray-200 bg-white lg:max-w-[420px] lg:min-w-[360px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push("/pos/tables" + posStationSuffix())}
              title="Volver a mesas"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-gray-800">
                {/^\d+$/.test(String(table.name ?? "")) ? `Mesa ${table.name}` : table.name}
              </h2>
              <p className="truncate text-xs text-gray-400">
                {table.zone} · {table.capacity} asientos
              </p>
            </div>
          </div>

          {/* Customer count + Dividir cuenta */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <div className="flex items-center rounded-lg border border-gray-200">
                <button
                  onClick={() => setCustomerCount(Math.max(1, customerCount - 1))}
                  title="Reducir comensales"
                  className="px-2 py-1 text-gray-400 hover:text-gray-600"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[28px] text-center text-sm font-medium text-gray-700">
                  {customerCount}
                </span>
                <button
                  onClick={() => setCustomerCount(customerCount + 1)}
                  title="Aumentar comensales"
                  className="px-2 py-1 text-gray-400 hover:text-gray-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {customerCount > 1 && (
              <button
                type="button"
                onClick={() => setSplitMode((prev) => !prev)}
                title={splitMode ? "Dejar de dividir cuenta" : "Dividir cuenta por comensal"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  splitMode
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                <SplitSquareVertical className="h-3.5 w-3.5" />
                {splitMode ? "Dividido" : "Dividir cuenta"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError("")}
              title="Cerrar"
              className="ml-auto text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Sin turno abierto: no se puede cargar la mesa */}
        {locationId && !loadingOpenRegister && !openRegister && (
          <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-blue-600" />
            <span className="flex-1">
              No hay turno abierto. Abra un turno en <strong>Caja</strong> para poder cargar esta mesa.
            </span>
            <button
              type="button"
              onClick={() => router.push("/pos/caja" + posStationSuffix())}
              className="shrink-0 rounded-lg border border-blue-400 bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-200"
            >
              Ir a Caja
            </button>
          </div>
        )}

        {/* Scrollable order list */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Cliente (Factura A) en detalle de la comanda */}
          {invoiceType === "factura_a" && cuitSearchResult && typeof cuitSearchResult === "object" && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Cliente (Factura A)
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">
                {cuitSearchResult.name ?? cuitSearchResult.razonSocial ?? "—"}
              </p>
              <p className="text-xs text-gray-600">
                CUIT {cuitSearchResult.cuit ?? cuitSearchResult.CUIT ?? "—"}
              </p>
            </div>
          )}

          {/* Existing order items */}
          {order && order.items && order.items.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Pedido actual #{order.orderNumber}
              </p>
              <div className="space-y-2">
                {order.items.map((item: any) => {
                  const sectorInfo = SECTORS.find(
                    (s) => s.value === item.sector
                  )
                  const isRemoving = removingItemId === item.id
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {item.productName}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              ITEM_STATUS_STYLES[item.status] ||
                                ITEM_STATUS_STYLES.pending
                            )}
                          >
                            {ITEM_STATUS_LABELS[item.status] || item.status}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span className="text-gray-900 font-medium">x{item.quantity}</span>
                          <span className="text-gray-500">
                            {formatCurrency((item.unitPrice ?? item.totalPrice / (item.quantity || 1)))}{" "}
                            c/u
                          </span>
                          {sectorInfo && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                sectorInfo.color
                              )}
                            >
                              {sectorInfo.label}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p
                            className="mt-2 rounded-lg border-l-4 border-blue-500 bg-blue-50/90 py-1.5 pl-2 pr-2 text-sm font-semibold leading-snug text-blue-950 break-words"
                            title={item.notes}
                          >
                            {item.notes}
                          </p>
                        )}
                        {splitMode && (
                          <div className="mt-1.5 space-y-1">
                            {item.quantity === 1 ? (
                              <select
                                aria-label={`Asignar ${item.productName} a comensal`}
                                value={(() => {
                                  const val = itemPayer[item.id]
                                  if (typeof val === "number") return val
                                  if (val && typeof val === "object") {
                                    const k = Object.keys(val).find((n) => (val as Record<number, number>)[Number(n)] > 0)
                                    return k ? parseInt(k, 10) : 1
                                  }
                                  return 1
                                })()}
                                onChange={(e) =>
                                  setItemPayer((prev) => ({
                                    ...prev,
                                    [item.id]: parseInt(e.target.value, 10),
                                  }))
                                }
                                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                              >
                                {Array.from({ length: customerCount }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>
                                    Comensal {n}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs text-gray-500">Por unidad:</span>
                                {Array.from({ length: customerCount }, (_, i) => {
                                  const n = i + 1
                                  const dist = getDistribution(item.id, item.quantity ?? 0)
                                  const q = typeof dist[n] === "number" ? dist[n] : 0
                                  const qty = item.quantity ?? 0
                                  return (
                                    <label key={n} className="flex items-center gap-1 text-xs">
                                      <span className="text-gray-500">C{n}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={qty}
                                        value={q}
                                        onChange={(e) => {
                                          const v = Math.max(0, Math.min(qty, parseInt(e.target.value, 10) || 0))
                                          setItemPayer((prev) => {
                                            const current = getDistribution(item.id, qty)
                                            const next: Record<number, number> = {}
                                            for (let i = 1; i <= customerCount; i++) next[i] = i === n ? v : (current[i] ?? 0)
                                            const sumExcept1 = Object.entries(next)
                                              .filter(([k]) => k !== "1")
                                              .reduce((a, [, b]) => a + b, 0)
                                            next[1] = Math.max(0, qty - sumExcept1)
                                            if (next[1] < 0) {
                                              next[n] += next[1]
                                              next[1] = 0
                                            }
                                            return { ...prev, [item.id]: next }
                                          })
                                        }}
                                        className="w-10 rounded border border-gray-200 px-1 py-0.5 text-center text-xs"
                                        aria-label={`Comensal ${n} cantidad`}
                                      />
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          {formatCurrency(item.totalPrice)}
                        </span>
                        {order.status === "open" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrderItem({
                                  id: item.id,
                                  productName: item.productName,
                                  quantity: item.quantity,
                                  notes: item.notes || "",
                                })
                              }
                              title="Editar cantidad o notas"
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOrderItem(item.id)}
                              disabled={isRemoving}
                              title="Eliminar del pedido"
                              className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                            >
                              {isRemoving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending items (local) */}
          {pendingItems.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-500">
                Nuevos ítems
              </p>
              <div className="space-y-2">
                {pendingItems.map((item) => {
                  const sectorInfo = SECTORS.find(
                    (s) => s.value === item.sector
                  )
                  return (
                    <div
                      key={item.tempId}
                      className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                          {item.productName}
                        </span>
                        <span className="shrink-0 text-sm font-medium text-gray-700">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                      {item.modifierSummary ? (
                        <p className="mt-1.5 rounded-lg border-l-4 border-blue-500 bg-blue-100/90 py-1.5 pl-2 pr-2 text-sm font-semibold leading-snug text-blue-950 break-words">
                          {item.modifierSummary}
                        </p>
                      ) : null}
                      {isBaristaTakeProductSku(item.productSku) ? (
                        <p className="mt-1.5 rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-1.5 text-[11px] leading-snug text-amber-950">
                          <span className="font-semibold">Posavasos</span>
                          {" · "}
                          Al cerrar cuenta: descuenta{" "}
                          <span className="font-medium">1 posavaso (stock) cada 2 take</span> en el
                          pedido. Este producto suma take; el pack/collar de la preparación va aparte en
                          la receta.
                        </p>
                      ) : null}
                      <div className="mt-0.5 text-xs text-gray-500">
                        <span className="font-medium text-gray-900">x{item.quantity}</span>
                        {" · "}
                        {formatCurrency(item.unitPrice)} c/u
                      </div>
                      {splitMode && (
                        <div className="mt-1.5 space-y-1">
                          {item.quantity === 1 ? (
                            <select
                              aria-label={`Asignar ${item.productName} a comensal`}
                              value={(() => {
                                const val = itemPayer[item.tempId]
                                if (typeof val === "number") return val
                                if (val && typeof val === "object") {
                                  const k = Object.keys(val).find((n) => (val as Record<number, number>)[Number(n)] > 0)
                                  return k ? parseInt(k, 10) : 1
                                }
                                return 1
                              })()}
                              onChange={(e) =>
                                setItemPayer((prev) => ({
                                  ...prev,
                                  [item.tempId]: parseInt(e.target.value, 10),
                                }))
                              }
                              className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              {Array.from({ length: customerCount }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  Comensal {n}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs text-gray-500">Por unidad:</span>
                              {Array.from({ length: customerCount }, (_, i) => {
                                const n = i + 1
                                const dist = getDistribution(item.tempId, item.quantity)
                                const q = typeof dist[n] === "number" ? dist[n] : 0
                                const qty = item.quantity
                                return (
                                  <label key={n} className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500">C{n}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={qty}
                                      value={q}
                                      onChange={(e) => {
                                        const v = Math.max(0, Math.min(qty, parseInt(e.target.value, 10) || 0))
                                        setItemPayer((prev) => {
                                          const current = getDistribution(item.tempId, qty)
                                          const next: Record<number, number> = {}
                                          for (let i = 1; i <= customerCount; i++) next[i] = i === n ? v : (current[i] ?? 0)
                                          const sumExcept1 = Object.entries(next)
                                            .filter(([k]) => k !== "1")
                                            .reduce((a, [, b]) => a + b, 0)
                                          next[1] = Math.max(0, qty - sumExcept1)
                                          if (next[1] < 0) {
                                            next[n] += next[1]
                                            next[1] = 0
                                          }
                                          return { ...prev, [item.tempId]: next }
                                        })
                                      }}
                                      className="w-10 rounded border border-blue-200 px-1 py-0.5 text-center text-xs"
                                      aria-label={`Comensal ${n} cantidad`}
                                    />
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        {/* Quantity */}
                        <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                          <button
                            onClick={() => changeQty(item.tempId, -1)}
                            title="Reducir cantidad"
                            className="px-2 py-1 text-gray-400 hover:text-gray-600"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[24px] text-center text-sm font-medium text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => changeQty(item.tempId, 1)}
                            title="Aumentar cantidad"
                            className="px-2 py-1 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Sector */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setSectorTarget(
                                sectorTarget === item.tempId
                                  ? null
                                  : item.tempId
                              )
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                              sectorInfo?.color || "bg-gray-100 text-gray-600"
                            )}
                          >
                            {sectorInfo && (
                              <sectorInfo.icon className="h-3 w-3" />
                            )}
                            {sectorInfo?.label || item.sector}
                          </button>
                          {sectorTarget === item.tempId && (
                            <div className="absolute left-0 top-full z-30 mt-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                              {SECTORS.map((s) => (
                                <button
                                  key={s.value}
                                  onClick={() =>
                                    setSector(item.tempId, s.value)
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-gray-50",
                                    item.sector === s.value && "bg-gray-50"
                                  )}
                                >
                                  <s.icon className="h-3.5 w-3.5" />
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Notes */}
                        <button
                          onClick={() => {
                            setNotesTarget(item.tempId)
                            setNotesDraft(item.notes)
                          }}
                          className={cn(
                            "rounded-lg p-1 transition-colors",
                            item.notes
                              ? "text-blue-500 hover:bg-blue-50"
                              : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
                          )}
                          title="Notas"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex-1" />

                        {/* Remove */}
                        <button
                          onClick={() => removePending(item.tempId)}
                          title="Eliminar ítem"
                          className="rounded-lg p-1 text-red-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {item.notes && (
                        <p className="mt-1.5 rounded-lg border-l-4 border-gray-400 bg-gray-100/80 py-1.5 pl-2 pr-2 text-sm font-semibold leading-snug text-gray-900 break-words">
                          Nota: {item.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!order || !order.items?.length) && pendingItems.length === 0 && (
            <div className="flex min-h-[200px] flex-1 items-center justify-center py-8 text-center">
              <div>
                <Receipt className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-4 text-sm text-gray-500">
                  Mesa vacía. Agrega productos del menú.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Order summary + actions ── */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-4">
          {/* Totals */}
          <div className="mb-4 space-y-1 text-sm">
            {order && (
              <div className="flex justify-between text-gray-500">
                <span>Pedido actual</span>
                <span>{formatCurrency(existingSubtotal)}</span>
              </div>
            )}
            {pendingItems.length > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>Nuevos ítems</span>
                <span>{formatCurrency(pendingSubtotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Descuento</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold text-gray-800">
              <span>Total</span>
              <span>{formatCurrency(Math.max(0, orderTotal))}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push("/pos/tables" + posStationSuffix())}
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Volver
            </button>

            {canCloseAccount && order?.tableId && (
              <button
                type="button"
                onClick={async () => {
                  setShowChangeTableModal(true)
                  setChangeTableMode("full")
                  setNewTableIdForChange("")
                  setSelectedItemIdsForMove([])
                  setChangeTableError(null)
                  if (locationId) {
                    try {
                      const list = await tablesApi.getAll(locationId)
                      setTablesForChange(Array.isArray(list) ? list : [])
                    } catch {
                      setTablesForChange([])
                    }
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-500 bg-white px-4 py-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Cambiar mesa
              </button>
            )}

            {pendingItems.length > 0 && (
              <button
                onClick={sendToKitchen}
                disabled={sending || !hasOpenShift}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar a Cocina
              </button>
            )}

            {canCloseAccount && order && pendingItems.length === 0 && (
              allItemsServed ? (
                preCierreOrderId === order.id ||
                table?.tableType === "errors" ||
                table?.tableType === "trash" ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <Receipt className="h-4 w-4" />
                    Cerrar Cuenta
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePreCierreControl}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-blue-500 bg-blue-50 py-3 text-sm font-semibold text-blue-800 transition-all hover:bg-blue-100 active:scale-[0.98]"
                  >
                    <FileCheck className="h-4 w-4" />
                    Pre cierre de control
                  </button>
                )
              ) : (
                <button
                  disabled
                  title="Todos los productos deben estar servidos"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-200 py-3 text-sm font-semibold text-gray-500 cursor-not-allowed"
                >
                  <Receipt className="h-4 w-4" />
                  Cerrar Cuenta (falta servir)
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════
          DERECHA — Buscar producto, Voz y grilla de productos
          ═══════════════════════════════════ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
        {/* Search + Voice */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Voice button */}
            <button
              onClick={voiceActive ? stopVoice : startVoice}
              disabled={voiceProcessing}
              title={voiceActive ? "Detener grabación" : "Comandar por voz. Ej: dos cortados jarrito suave, un latte con leche"}
              className={cn(
                "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 transition-all",
                voiceActive
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                  : voiceProcessing
                    ? "bg-blue-100 text-blue-600 border border-blue-300"
                    : "border border-gray-200 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
              )}
            >
              {voiceProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : voiceActive ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              <span className="hidden sm:inline text-xs font-medium">
                {voiceProcessing ? "IA..." : voiceActive ? "Parar" : "Voz"}
              </span>
            </button>
          </div>

          {/* Voice transcript display */}
          {(voiceActive || voiceTranscript) && !voiceConfirming && (
            <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
              <p className="text-xs text-blue-700/90 mb-2">
                Con ruido de fondo, acercá el micrófono y hablá claro. Si algo se escuchó mal, editá el texto abajo y tocá Buscar.
              </p>
              <div className="flex items-center gap-2 text-xs font-medium text-blue-600 mb-1">
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                {voiceActive ? "Escuchando..." : voiceProcessing ? "Procesando..." : "Escuchado (podés corregir):"}
              </div>
              {voiceActive || voiceProcessing ? (
                <p className="text-sm text-gray-700">
                  {voiceTranscript || (
                    <span className="italic text-gray-400">Decí lo que querés agregar, ej: &quot;dos cortados jarrito suave, un latte&quot;</span>
                  )}
                </p>
              ) : (
                <>
                  <textarea
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder='Ej: dos cortados jarrito suave, un latte con leche'
                    className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    rows={2}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={applyTranscriptAsVoice}
                      className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
                    >
                      Buscar
                    </button>
                    {voiceMatches.length === 0 && voiceTranscript.trim().length >= 3 && (
                      <span className="text-xs text-gray-500">No se encontraron productos. Corregí y tocá Buscar de nuevo.</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Voice confirmation panel */}
          {voiceConfirming && voiceMatches.length > 0 && (
            <div className="mt-2 rounded-xl border-2 border-blue-400 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 mb-3">
                <Sparkles className="h-4 w-4" />
                Confirmá la comanda por voz
              </div>
              <div className="space-y-2 mb-3">
                {voiceMatches.map((m, i) => {
                  const sectorInfo = SECTORS.find((s) => s.value === m.sector)
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 border border-blue-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-xs font-bold text-blue-700">
                        {m.quantity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">
                          {m.product.name}
                        </span>
                        {m.notes && (
                          <p
                            className="mt-1 text-sm font-semibold leading-snug text-gray-800 break-words"
                            title={m.notes}
                          >
                            {m.notes}
                          </p>
                        )}
                      </div>
                      {sectorInfo && (
                        <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-medium", sectorInfo.color)}>
                          {sectorInfo.label}
                        </span>
                      )}
                      <span className="shrink-0 text-sm font-medium text-gray-600">
                        {formatCurrency(m.product.salePrice * m.quantity)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setVoiceConfirming(false)
                    setVoiceMatches([])
                    setVoiceTranscript("")
                  }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={startVoice}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Reintentar
                </button>
                <button
                  onClick={confirmVoiceItems}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  <Check className="h-4 w-4" />
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category tabs: scroll horizontal en móvil con padding final para ver la última categoría */}
        <div className="flex shrink-0 overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-white scrollbar-thin -mx-1">
          <div className="flex gap-2 px-4 py-2.5 pr-6 sm:pr-4 min-w-max">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === "all"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              )}
            >
              Todos
            </button>
            {products.some((p) => !p.category?.id) && (
              <button
                type="button"
                onClick={() => setActiveCategory("__uncategorized__")}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  activeCategory === "__uncategorized__"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                Sin categoría
              </button>
            )}
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  activeCategory === cat.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid: padding con safe area en móvil */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4">
          {filteredProducts.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-gray-400">
                No se encontraron productos
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const qty = pendingItems
                  .filter((i) => i.productId === product.id)
                  .reduce((s, i) => s + i.quantity, 0)
                /* ── Pruebas mesas/comandas: condición de stock en grilla desactivada.
                    Para volver a bloquear ítems sin stock en el local, descomentar el bloque
                    y eliminar las dos líneas `const blockedByGridStock = false` / `showSinStockEnLocal`.
                const stockLocationId = table?.location?.id || locationId || ""
                const locationStockQty = Array.isArray(product.stockLevels)
                  ? Number(
                      product.stockLevels.find(
                        (l: { locationId?: string; location?: { id?: string } }) =>
                          (l.locationId ?? l.location?.id) === stockLocationId
                      )?.quantity ?? 0
                    )
                  : 0
                const noStockAtLocation = locationStockQty <= 0
                const blockedByGridStock = noStockAtLocation
                const showSinStockEnLocal = noStockAtLocation
                ── */
                const blockedByGridStock = false
                const showSinStockEnLocal = false
                return (
                  <button
                    key={product.id}
                    onClick={() => void addProduct(product)}
                    disabled={
                      !hasOpenShift || modifierModalLoading || blockedByGridStock
                    }
                    className={cn(
                      "relative flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left transition-all hover:border-blue-300 hover:shadow-sm active:scale-[0.97]",
                      !hasOpenShift && "cursor-not-allowed opacity-60",
                      blockedByGridStock && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <span className="mb-2 flex h-16 w-full shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl.startsWith("http") ? product.imageUrl : product.imageUrl.startsWith("/") ? product.imageUrl : `/${product.imageUrl}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-gray-400">
                          {product.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-gray-800 line-clamp-2">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs text-gray-400">
                      {product.category?.name}
                    </span>
                    <span className="mt-auto pt-2 text-sm font-bold text-blue-600">
                      {formatCurrency(product.salePrice)}
                    </span>
                    {showSinStockEnLocal && (
                      <span className="mt-1 text-xs font-semibold leading-snug text-red-600 sm:text-sm">
                        Sin stock en este local
                      </span>
                    )}
                    {qty && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white ring-2 ring-white">
                        {qty}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════
          MODAL CAMBIO DE MESA (solo cajero/admin)
          ═══════════════════════════════════ */}
      {showChangeTableModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 dark:border dark:border-gray-700">
            <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Cambiar mesa</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Pedido actual en {table?.name ?? "esta mesa"}. Elige la mesa de destino.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {changeTableError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {changeTableError}
                </div>
              )}

              <div className="mb-4">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mover</span>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="changeTableMode"
                      checked={changeTableMode === "full"}
                      onChange={() => setChangeTableMode("full")}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Mesa completa</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="changeTableMode"
                      checked={changeTableMode === "items"}
                      onChange={() => setChangeTableMode("items")}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Por artículo</span>
                  </label>
                </div>
              </div>

              {changeTableMode === "items" && (order.items?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Seleccionar ítems</span>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                    {(order.items ?? []).map((item: any) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIdsForMove.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIdsForMove((prev) => [...prev, item.id])
                            } else {
                              setSelectedItemIdsForMove((prev) => prev.filter((id) => id !== item.id))
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                          {item.quantity > 1 ? `${item.quantity}× ` : ""}
                          {item.productName ?? item.product?.name}
                          {item.notes ? ` — ${item.notes}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nueva mesa</label>
              <select
                value={newTableIdForChange}
                onChange={(e) => setNewTableIdForChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">Seleccionar mesa</option>
                {tablesForChange
                  .filter((t) => t.id !== order.tableId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.status === "available" ? "(disponible)" : "(ocupada)"}
                    </option>
                  ))}
              </select>
            </div>
            <div className="shrink-0 flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowChangeTableModal(false)
                  setChangeTableError(null)
                }}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !newTableIdForChange ||
                  changingTable ||
                  (changeTableMode === "items" && selectedItemIdsForMove.length === 0)
                }
                onClick={async () => {
                  if (!newTableIdForChange || changingTable) return
                  if (changeTableMode === "items" && selectedItemIdsForMove.length === 0) return
                  setChangingTable(true)
                  setChangeTableError(null)
                  try {
                    if (changeTableMode === "full") {
                      await ordersApi.changeTable(order.id, newTableIdForChange)
                    } else {
                      await ordersApi.moveItems(order.id, selectedItemIdsForMove, newTableIdForChange)
                    }
                    setShowChangeTableModal(false)
                    setNewTableIdForChange("")
                    setSelectedItemIdsForMove([])
                    await fetchData()
                  } catch (e: any) {
                    setChangeTableError(e?.message ?? "Error al cambiar la mesa")
                  } finally {
                    setChangingTable(false)
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {changingTable ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          MODAL PRE CIERRE DE CONTROL (comprobante para imprimir)
          ═══════════════════════════════════ */}
      {showPreCierreModal && order && table && (
        <>
          <style dangerouslySetInnerHTML={{ __html: THERMAL_RECEIPT_PRINT_CSS }} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="pre-cierre-print-content max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <h1 className="thermal-print-title text-lg font-bold text-gray-900">Pre cierre de control</h1>
              <p className="thermal-print-meta mt-1 text-sm text-gray-500">
                {/^\d+$/.test(String(table.name ?? "")) ? `Mesa ${table.name}` : table.name} · Pedido #{order.orderNumber ?? order.id}
              </p>
              <p className="thermal-print-meta text-sm text-gray-500">
                {new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="thermal-print-lead mb-4 text-sm text-gray-600">Verifique la cuenta antes del pago.</p>
              <table className="thermal-print-table w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="pb-2">Producto</th>
                    <th className="thermal-print-col-qty pb-2">Cant.</th>
                    <th className="thermal-print-col-pu pb-2">P.unit</th>
                    <th className="thermal-print-col-total pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map((i: any) => {
                    const qty = i.quantity ?? 1
                    const up = i.unitPrice ?? (i.totalPrice ?? 0) / qty
                    const total = i.totalPrice ?? up * qty
                    return (
                      <tr key={i.id} className="border-b border-gray-100">
                        <td className="py-2">{i.productName ?? i.product?.name ?? "Ítem"}</td>
                        <td className="thermal-print-col-qty py-2">{qty}</td>
                        <td className="thermal-print-col-pu py-2">{formatCurrency(up)}</td>
                        <td className="thermal-print-col-total py-2 text-right">{formatCurrency(total)}</td>
                      </tr>
                    )
                  })}
                  {pendingItems.map((p) => (
                    <tr key={p.tempId} className="border-b border-gray-100">
                      <td className="py-2">{p.productName}</td>
                      <td className="thermal-print-col-qty py-2">{p.quantity}</td>
                      <td className="thermal-print-col-pu py-2">{formatCurrency(p.unitPrice)}</td>
                      <td className="thermal-print-col-total py-2 text-right">{formatCurrency(p.unitPrice * p.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {discount > 0 && (
                <p className="thermal-print-discount mt-2 text-sm text-blue-700">Descuento: -{formatCurrency(discount)}</p>
              )}
              <p className="thermal-print-total mt-3 text-base font-bold text-gray-900">
                Total: {formatCurrency(Math.max(0, orderTotal))}
              </p>
              <p className="thermal-print-foot mt-4 text-xs text-gray-500">Documento de verificación. No es ticket de pago.</p>
              <p className="no-print mt-2 text-xs text-gray-500">Se abrió el cuadro de impresión. Elegí la impresora y confirmá.</p>
              <div className="no-print mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Reimprimir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreCierreOrderId(order.id)
                    setShowPreCierreModal(false)
                    sileo.success({ title: "Ya podés cerrar la cuenta." })
                  }}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════
          MODAL COMPROBANTE DE CIERRE (imprimir al cerrar cuenta)
          ═══════════════════════════════════ */}
      {showCierreReceiptModal && closedOrderSnapshot && (
        <>
          <style dangerouslySetInnerHTML={{ __html: THERMAL_RECEIPT_PRINT_CSS }} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="cierre-receipt-print-content max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <h1 className="thermal-print-title text-lg font-bold text-gray-900">Comprobante de cierre</h1>
              <p className="thermal-print-meta mt-1 text-sm text-gray-500">
                {closedOrderSnapshot.tableName} · Pedido #{closedOrderSnapshot.orderNumber}
              </p>
              <p className="thermal-print-meta text-sm text-gray-500">
                {new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="thermal-print-lead mb-4 text-sm font-medium text-emerald-700">Cuenta cerrada</p>
              <table className="thermal-print-table w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="pb-2">Producto</th>
                    <th className="thermal-print-col-qty pb-2">Cant.</th>
                    <th className="thermal-print-col-pu pb-2">P.unit</th>
                    <th className="thermal-print-col-total pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(closedOrderSnapshot.items ?? []).map((i: any) => {
                    const qty = i.quantity ?? 1
                    const up = i.unitPrice ?? (i.totalPrice ?? 0) / qty
                    const total = i.totalPrice ?? up * qty
                    return (
                      <tr key={i.id} className="border-b border-gray-100">
                        <td className="py-2">{i.productName ?? i.product?.name ?? "Ítem"}</td>
                        <td className="thermal-print-col-qty py-2">{qty}</td>
                        <td className="thermal-print-col-pu py-2">{formatCurrency(up)}</td>
                        <td className="thermal-print-col-total py-2 text-right">{formatCurrency(total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {closedOrderSnapshot.discount > 0 && (
                <p className="thermal-print-discount mt-2 text-sm text-blue-700">Descuento: -{formatCurrency(closedOrderSnapshot.discount)}</p>
              )}
              <p className="thermal-print-total mt-3 text-base font-bold text-gray-900">
                Total: {formatCurrency(Math.max(0, closedOrderSnapshot.total))}
              </p>
              <p className="thermal-print-pay mt-1 text-sm text-gray-600">Pago: {closedOrderSnapshot.paymentMethod}</p>
              <p className="thermal-print-foot mt-4 text-xs text-gray-500">Comprobante de cierre de cuenta.</p>
              <p className="no-print mt-2 text-xs text-gray-500">Se abrió el cuadro de impresión. Elegí la impresora y confirmá.</p>
              <div className="no-print mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Reimprimir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCierreReceiptModal(false)
                    setClosedOrderSnapshot(null)
                    router.push("/pos/tables" + posStationSuffix())
                  }}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modificadores de producto (pan, punto, dips, etc.) */}
      {modifierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pt-5 pb-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {modifierModal.product.name}
                </h3>
                <p
                  className={cn(
                    "text-sm text-gray-500",
                    modifierModal.voiceMeta ? "mt-0.5" : "mt-1"
                  )}
                >
                  Elegí las opciones del plato
                </p>
              </div>
              <button
                type="button"
                onClick={closeModifierModal}
                className="shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {modifierModal.voiceMeta ? (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
                <p className="font-semibold text-blue-900">Completando pedido por voz</p>
                {modifierModal.voiceMeta.quantity > 1 ? (
                  <p className="mt-0.5">Cantidad: {modifierModal.voiceMeta.quantity}</p>
                ) : null}
                {modifierModal.voiceMeta.notes ? (
                  <p className="mt-0.5">Nota: {modifierModal.voiceMeta.notes}</p>
                ) : null}
                {voiceModifierQueueRef.current.length > 0 ? (
                  <p className="mt-1.5 text-blue-800">
                    Luego te pedimos las opciones de otros{" "}
                    {voiceModifierQueueRef.current.length} ítem
                    {voiceModifierQueueRef.current.length === 1 ? "" : "s"}.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-4">
              {modifierModal.recipeIngredients.some((ing) => !ing.modifierGroupId) ? (
                <div className="rounded-xl border border-slate-600 bg-slate-900 p-4 text-slate-100 shadow-inner">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Incluye (desmarcá lo que no va)
                  </p>
                  <p className="mb-3 text-xs text-slate-400">
                    Va a la comanda como &quot;Sin: …&quot; si quitás algo.
                  </p>
                  <ul className="space-y-2">
                    {modifierModal.recipeIngredients
                      .filter((ing) => !ing.modifierGroupId)
                      .map((ing) => {
                      const excluded = modifierModal.excludedIngredientIds.includes(
                        ing.id
                      )
                      const checked = !excluded
                      return (
                        <li key={ing.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-slate-800/80">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setModifierModal((m) => {
                                  if (!m) return null
                                  const has = m.excludedIngredientIds.includes(ing.id)
                                  const nextExcluded = has
                                    ? m.excludedIngredientIds.filter((x) => x !== ing.id)
                                    : [...m.excludedIngredientIds, ing.id]
                                  let nextSelections = { ...m.selections }
                                  if (!has && ing.modifierGroupId) {
                                    const gid = ing.modifierGroupId
                                    const { [gid]: _removed, ...rest } = nextSelections
                                    nextSelections = rest
                                  }
                                  if (has && ing.modifierGroupId) {
                                    const g = m.groups.find(
                                      (x: any) => x.id === ing.modifierGroupId
                                    )
                                    const opts = g?.options || []
                                    if (g?.required && opts.length > 0) {
                                      const defId = pickDefaultOptionIdForGroupPos(
                                        g,
                                        opts
                                      )
                                      if (defId) {
                                        nextSelections = {
                                          ...nextSelections,
                                          [g.id]: defId,
                                        }
                                      }
                                    }
                                  }
                                  return {
                                    ...m,
                                    excludedIngredientIds: nextExcluded,
                                    selections: nextSelections,
                                  }
                                })
                              }
                              className="h-4 w-4 shrink-0 rounded border-slate-500 bg-slate-800 text-sky-500 focus:ring-sky-500"
                            />
                            <span className="text-sm text-slate-100">{ing.name}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {modifierModal.groups.length === 0 &&
              !modifierModal.recipeIngredients.some((ing) => !ing.modifierGroupId) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium text-amber-900 dark:text-amber-50">
                    No hay opciones cargadas para este plato
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-amber-900/90 dark:text-amber-100/90">
                    <li>
                      La lista <strong>Incluye</strong> (insumos base) sale de la{" "}
                      <strong>receta activa</strong> del plato (ingredientes <em>sin</em> grupo de variantes).
                      Si no ves nada, revisá que la receta tenga esas filas cargadas.
                    </li>
                    <li>
                      Para radios/checks (pan, punto, etc.), los grupos de la receta deben coincidir con el
                      catálogo de modificadores; si la receta referencia grupos inexistentes, no se muestra
                      nada.
                    </li>
                  </ul>
                  <p className="mt-3 text-xs text-amber-800/80 dark:text-amber-200/80">
                    Podés usar <strong>Agregar al pedido</strong> igual para seguir probando.
                  </p>
                </div>
              ) : null}

              {effectiveModifierGroupsForPosModal(
                modifierModal.product,
                modifierModal.groups,
                modifierModal.recipeIngredients,
                modifierModal.excludedIngredientIds,
                modifierModal.selections
              ).map((g) => {
                const sel = modifierModal.selections[g.id]
                const checkedId = Array.isArray(sel) ? sel[0] : sel
                return (
                  <div key={g.id} className="rounded-xl border border-sky-900/30 bg-sky-50/40 p-3">
                    <p className="mb-2 text-sm font-medium text-gray-800">
                      {g.name}
                      {g.required ? (
                        <span className="ml-1 text-red-500" aria-hidden>
                          *
                        </span>
                      ) : null}
                    </p>
                    <div className="space-y-1.5">
                      {(g.options || []).map((o: any) => {
                        const checked = checkedId === o.id
                        return (
                          <label
                            key={o.id}
                            className={cn(
                              "block cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
                              checked
                                ? "border-sky-500 bg-sky-100/80"
                                : "border-gray-100 hover:bg-gray-50"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`modifier-${g.id}`}
                                checked={checked}
                                onChange={() =>
                                  setModifierModal((m) => {
                                    if (!m) return null
                                    const sku = m.product?.sku
                                    if (sku && LICUADO_450_SKUS.has(sku)) {
                                      const vis = visibleModifierGroupsForPosModal(
                                        m.groups,
                                        m.recipeIngredients,
                                        m.excludedIngredientIds
                                      )
                                      const sorted = [...vis].sort(
                                        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                                      )
                                      const [gTipo, gLiq] = sorted
                                      if (sorted.length >= 2 && g.id === gTipo?.id && gLiq) {
                                        const nextSel = { ...m.selections, [g.id]: o.id }
                                        const oTipo = gTipo.options || []
                                        const oLiq = gLiq.options || []
                                        const tipoIdx = oTipo.findIndex((x: any) => x.id === o.id)
                                        let start = 0
                                        if (tipoIdx === 0) start = 0
                                        else if (tipoIdx === 1) start = 3
                                        else start = 6
                                        const firstLiq = oLiq[start]
                                        if (firstLiq) nextSel[gLiq.id] = firstLiq.id
                                        return {
                                          ...m,
                                          selections: nextSel,
                                          excludedModifierStockLineIds:
                                            sanitizeExcludedModifierStockLineIds(
                                              m.groups,
                                              nextSel,
                                              m.excludedModifierStockLineIds ?? [],
                                            ),
                                        }
                                      }
                                    }
                                    const nextSelections = reconcileModifierSelectionsAfterChange(
                                      m.product,
                                      m.groups,
                                      m.recipeIngredients,
                                      m.excludedIngredientIds,
                                      m.selections,
                                      g.id,
                                      o.id
                                    )
                                    const baseExcluded = isPreparationModifierGroupPos(g)
                                      ? []
                                      : (m.excludedModifierStockLineIds ?? [])
                                    return {
                                      ...m,
                                      selections: nextSelections,
                                      excludedModifierStockLineIds:
                                        sanitizeExcludedModifierStockLineIds(
                                          m.groups,
                                          nextSelections,
                                          baseExcluded,
                                        ),
                                    }
                                  })
                                }
                                className="text-sky-600"
                              />
                              <span className="flex-1">{o.label}</span>
                              {Number(o.priceDelta) > 0 ? (
                                <span className="text-xs text-gray-500">
                                  +{formatCurrency(o.priceDelta)}
                                </span>
                              ) : null}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    {checkedId
                      ? (() => {
                          const opt = (g.options || []).find((x: any) => x.id === checkedId)
                          const stockLines = getPrepOptionStockLinesForChecklist(opt)
                          if (stockLines.length === 0) return null
                          return (
                            <div className="mt-3 rounded-xl border border-slate-600 bg-slate-900 p-4 text-slate-100 shadow-inner">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                Incluye (desmarcá lo que no va)
                              </p>
                              <p className="mb-3 text-xs text-slate-400">
                                Va a la comanda como &quot;Sin: …&quot; si quitás algo.
                              </p>
                              <ul className="space-y-2">
                                {stockLines.map((line) => {
                                  const excluded = (
                                    modifierModal.excludedModifierStockLineIds || []
                                  ).includes(line.id)
                                  const lineChecked = !excluded
                                  return (
                                    <li key={line.id}>
                                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-slate-800/80">
                                        <input
                                          type="checkbox"
                                          checked={lineChecked}
                                          onChange={() =>
                                            setModifierModal((m) => {
                                              if (!m) return null
                                              const cur = m.excludedModifierStockLineIds ?? []
                                              const has = cur.includes(line.id)
                                              const next = has
                                                ? cur.filter((x) => x !== line.id)
                                                : [...cur, line.id]
                                              return {
                                                ...m,
                                                excludedModifierStockLineIds: next,
                                              }
                                            })
                                          }
                                          className="h-4 w-4 shrink-0 rounded border-slate-500 bg-slate-800 text-sky-500 focus:ring-sky-500"
                                        />
                                        <span className="text-sm text-slate-100">
                                          {line.label}
                                        </span>
                                      </label>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )
                        })()
                      : null}
                  </div>
                )
              })}
            </div>
            </div>

            <div className="shrink-0 border-t border-gray-100 bg-white px-5 pb-5 pt-4">
            <p className="text-sm text-gray-600">
              Precio unitario:{" "}
              <span className="font-semibold text-gray-900">
                {formatCurrency(
                  (Number(modifierModal.product.salePrice) || 0) +
                    extraPriceFromSelections(
                      effectiveModifierGroupsForPosModal(
                        modifierModal.product,
                        modifierModal.groups,
                        modifierModal.recipeIngredients,
                        modifierModal.excludedIngredientIds,
                        modifierModal.selections
                      ),
                      modifierModal.selections
                    )
                )}
              </span>
            </p>
            {modifierModal.voiceMeta ? (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={confirmModifierModalVoiceDefaults}
                  className="w-full rounded-xl border-2 border-blue-400/80 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-100"
                >
                  Valores por defecto
                </button>
                <p className="text-center text-xs text-gray-500">
                  Primera opción en cada grupo obligatorio, grupos opcionales sin extra, todos
                  los ingredientes incluidos.
                </p>
              </div>
            ) : null}
            <div className={cn("flex gap-2", modifierModal.voiceMeta ? "mt-3" : "mt-4")}>
              <button
                type="button"
                onClick={closeModifierModal}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModifierModal}
                className="flex-1 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Agregar al pedido
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          PAYMENT MODAL
          ═══════════════════════════════════ */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-100 px-6 py-4">
              <h2 className="mb-1 text-lg font-semibold text-gray-800">
                Cerrar Cuenta
              </h2>
              <p className="text-sm text-gray-500">
                {/^\d+$/.test(String(table?.name ?? "")) ? `Mesa ${table.name}` : table?.name} · Pedido #{order?.orderNumber}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">

            {(table?.tableType !== "errors" && table?.tableType !== "trash") && (
            <>
            {/* Método de pago: no aplica para cuenta corriente (no se cobra en el momento) */}
            {invoiceType !== "cuenta_corriente" && (splitMode && Object.keys(splitTotals).length > 0 ? (
              <div className="mb-5 w-full">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Medio de pago por comensal
                </p>
                <div className="space-y-3">
                  {Object.entries(splitTotals).map(([num, total]) => (
                    <div
                      key={num}
                      className="flex w-full flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3"
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          Comensal {num}
                        </span>
                        <span className="text-sm tabular-nums text-gray-600">
                          {formatCurrency(total)}
                        </span>
                      </div>
                      <div className="flex w-full flex-wrap gap-2">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() =>
                              setPaymentByDiner((prev) => ({
                                ...prev,
                                [Number(num)]: m.value,
                              }))
                            }
                            className={cn(
                              "flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all sm:flex-initial",
                              (paymentByDiner[Number(num)] ?? (paymentMethod || "cash")) === m.value
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100"
                            )}
                            title={m.label}
                          >
                            <m.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Método de pago
                </p>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setPaymentMethod(m.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                        paymentMethod === m.value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <m.icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            ))}

            {/* Tipo de comprobante / Factura A */}
            <p className="mb-2 text-sm font-medium text-gray-700">
              Comprobante
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("consumidor")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "consumidor"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Consumidor
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("eventual")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "eventual"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Eventual
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("cuenta_corriente")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "cuenta_corriente"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Cuenta corriente
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("factura_a")
                  setCustomerId(null)
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "factura_a"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Factura A
              </button>
            </div>

            {/* Cliente (Cuenta corriente) */}
            {invoiceType === "cuenta_corriente" && locationId && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                <label className="mb-1.5 block text-xs font-medium text-blue-800">
                  Cliente con cuenta corriente
                </label>
                {loadingRunningCustomers ? (
                  <p className="text-sm text-blue-700">Cargando clientes…</p>
                ) : runningAccountCustomers.length === 0 ? (
                  <p className="text-sm text-blue-700">No hay clientes con cuenta corriente. Dales un límite en Gestión → Clientes.</p>
                ) : (
                  <div className="relative w-full">
                    <button
                      type="button"
                      onClick={() => setRunningAccountDropdownOpen((o) => !o)}
                      className="flex w-full items-center justify-between rounded-lg border border-blue-300 bg-white px-3 py-2 text-left text-sm text-gray-800"
                    >
                      <span className="truncate">
                        {customerId
                          ? (() => {
                              const c = runningAccountCustomers.find((x: any) => x.id === customerId)
                              return c ? `${c.name}${c.creditLimit != null ? ` (límite $${Number(c.creditLimit).toLocaleString("es-AR")})` : ""}` : "Elegir cliente"
                            })()
                          : "Elegir cliente"}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" />
                    </button>
                    {runningAccountDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 w-full min-w-0 rounded-lg border border-blue-200 bg-white shadow-lg">
                        <div className="border-b border-blue-100 p-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              autoComplete="off"
                              value={runningAccountCustomerSearch}
                              onChange={(e) => setRunningAccountCustomerSearch(e.target.value)}
                              placeholder="Buscar por nombre o CUIT..."
                              className="w-full rounded-md border border-blue-200 py-2 pl-9 pr-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                        </div>
                        <ul className="max-h-48 overflow-y-auto py-1">
                          {filteredRunningAccountCustomers.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-blue-700">Ningún cliente coincide con la búsqueda.</li>
                          ) : (
                            filteredRunningAccountCustomers.map((c: any) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomerId(c.id)
                                    setRunningAccountDropdownOpen(false)
                                    setRunningAccountCustomerSearch("")
                                  }}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-sm",
                                    customerId === c.id ? "bg-blue-100 font-medium text-blue-900" : "text-gray-800 hover:bg-blue-50"
                                  )}
                                >
                                  {c.name} {c.creditLimit != null ? `(límite $${Number(c.creditLimit).toLocaleString("es-AR")})` : ""}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Cliente (Factura A) — igual que en la segunda foto */}
            {invoiceType === "factura_a" && cuitSearchResult && typeof cuitSearchResult === "object" && (
              <div className="mb-4 overflow-hidden rounded-xl bg-[#3d4a3d] shadow-inner">
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Cliente (Factura A)
                  </p>
                  <p className="mt-1 text-base font-semibold text-gray-100">
                    {cuitSearchResult.name ?? cuitSearchResult.razonSocial ?? "—"}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-400">
                    CUIT {cuitSearchResult.cuit ?? cuitSearchResult.CUIT ?? "—"}
                  </p>
                </div>
                <div className="h-px bg-emerald-600/50" />
                <button
                  type="button"
                  onClick={() => {
                    setCuitSearchResult(null)
                    setCustomerId(null)
                    setCustomerSearch("")
                    setCustomerSearchResults([])
                    setCustomerSearchEmpty(false)
                  }}
                  className="w-full py-2 text-center text-xs font-medium text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300"
                >
                  Cambiar cliente
                </button>
              </div>
            )}

            {invoiceType === "factura_a" && locationId && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                {!cuitSearchResult && !showAddCustomer ? (
                  <>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">
                      Buscar cliente por nombre o CUIT
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value)
                          setCustomerSearchResults([])
                          setCustomerSearchEmpty(false)
                        }}
                        placeholder="Nombre o CUIT (ej. 20-12345678-9)"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!customerSearch.trim()) return
                          setCuitSearching(true)
                          setCustomerSearchResults([])
                          setCustomerSearchEmpty(false)
                          try {
                            const listRaw = await customersApi.getAll(
                              locationId,
                              customerSearch.trim()
                            )
                            const list = Array.isArray(listRaw) ? listRaw : (listRaw as any)?.data ?? []
                            if (list.length === 0) {
                              setCuitSearchResult(null)
                              setCustomerId(null)
                              setCustomerSearchResults([])
                              setCustomerSearchEmpty(true)
                            } else if (list.length === 1) {
                              const c = list[0]
                              setCuitSearchResult(c)
                              setCustomerId(c?.id ?? null)
                              setCustomerSearchResults([])
                            } else {
                              setCuitSearchResult(null)
                              setCustomerId(null)
                              setCustomerSearchResults(list)
                              setCustomerSearchEmpty(false)
                            }
                          } catch {
                            setCuitSearchResult(null)
                            setCustomerId(null)
                            setCustomerSearchResults([])
                            setCustomerSearchEmpty(true)
                          } finally {
                            setCuitSearching(false)
                          }
                        }}
                        disabled={cuitSearching || !customerSearch.trim()}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {cuitSearching ? "Buscando…" : "Buscar"}
                      </button>
                    </div>
                    {customerSearchEmpty && (
                      <p className="mt-2 text-sm text-blue-700">
                        El cliente no está cargado.
                      </p>
                    )}
                    {customerSearchResults.length > 1 && (
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                        <p className="mb-1.5 text-xs font-medium text-gray-500">
                          Varios resultados, elegí uno:
                        </p>
                        {customerSearchResults.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCuitSearchResult(c)
                              setCustomerId(c?.id ?? null)
                              setCustomerSearchResults([])
                            }}
                            className="flex w-full justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            <span className="font-medium text-gray-800 truncate">{c.name ?? "—"}</span>
                            <span className="shrink-0 text-gray-500">{c.cuit ?? ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {customerSearchResults.length === 0 && cuitSearchResult === null && customerSearch.trim() && !cuitSearching && /[\d-]/.test(customerSearch.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCustomer(true)
                          setNewCustomerCuit(customerSearch.trim())
                          setNewCustomerName("")
                        }}
                        className="mt-2 text-sm text-emerald-600 hover:underline"
                      >
                        + Agregar cliente con este CUIT
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCustomer(true)
                        setNewCustomerName("")
                        setNewCustomerCuit(customerSearch.trim() && /[\d-]/.test(customerSearch.trim()) ? customerSearch.trim() : "")
                      }}
                      className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      + Agregar nuevo cliente
                    </button>
                  </>
                ) : showAddCustomer ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">
                      Nuevo cliente (Factura A)
                    </p>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Razón social o nombre"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={newCustomerCuit}
                      onChange={(e) => setNewCustomerCuit(formatCuitDisplay(e.target.value))}
                      placeholder="CUIT (ej. 20-12345678-9)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCustomer(false)
                          setNewCustomerName("")
                          setNewCustomerCuit("")
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newCustomerName.trim() || !newCustomerCuit.trim()) return
                          setAddingCustomer(true)
                          try {
                            const created = await customersApi.create({
                              locationId,
                              name: newCustomerName.trim(),
                              cuit: newCustomerCuit.trim(),
                            })
                            const c = created?.data ?? created
                            setCustomerId(c?.id ?? null)
                            setCuitSearchResult(c)
                            setShowAddCustomer(false)
                            setNewCustomerName("")
                            setNewCustomerCuit("")
                            sileo.success({ title: "Cliente creado" })
                          } catch (e) {
                            setError("No se pudo crear el cliente. ¿CUIT duplicado?")
                            sileo.error({ title: "No se pudo crear el cliente. ¿CUIT duplicado?" })
                          } finally {
                            setAddingCustomer(false)
                          }
                        }}
                        disabled={addingCustomer || !newCustomerName.trim() || !newCustomerCuit.trim()}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {addingCustomer ? "Creando…" : "Crear y usar"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Discount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Descuento ($)
              </label>
              <input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) =>
                  setDiscount(parseInt(e.target.value) || 0)
                }
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            </>
            )}

            {/* Notes */}
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Notas
              </label>
              <textarea
                rows={2}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Observaciones opcionales..."
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Total */}
            <div className="mb-5 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-600">Total</span>
              <span className="text-xl font-bold text-gray-800">
                {formatCurrency(Math.max(0, orderTotal))}
              </span>
            </div>

            {/* Vista previa del comprobante (Factura A / Consumidor) */}
            {(table?.tableType !== "errors" && table?.tableType !== "trash") && order && (
              <div className="mb-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vista previa del comprobante
                </p>
                <div className="rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800 shadow-inner">
                  <div className="border-b border-gray-200 pb-2">
                    <p className="font-semibold">
                      {invoiceType === "factura_a"
                        ? "FACTURA A"
                        : invoiceType === "eventual"
                          ? "COMPROBANTE EVENTUAL"
                          : invoiceType === "cuenta_corriente"
                            ? "CUENTA CORRIENTE (no cobrado)"
                            : "COMPROBANTE CONSUMIDOR FINAL"}
                    </p>
                    <p className="mt-0.5 text-gray-600">
                      {/^\d+$/.test(String(table?.name ?? "")) ? `Mesa ${table?.name}` : table?.name} · Pedido #{order.orderNumber ?? order.id}
                    </p>
                    <p className="text-gray-500">
                      {new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  {invoiceType === "factura_a" && (cuitSearchResult || customerId) && (
                    <div className="border-b border-gray-200 py-2">
                      <p className="text-gray-600">
                        Cliente: {cuitSearchResult?.name ?? cuitSearchResult?.razonSocial ?? "—"}
                      </p>
                      <p className="text-gray-500">
                        CUIT: {cuitSearchResult?.cuit ?? cuitSearchResult?.CUIT ?? "—"}
                      </p>
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto py-2">
                    {(order.items ?? []).map((i: any) => {
                      const qty = i.quantity ?? 1
                      const up = i.unitPrice ?? (i.totalPrice ?? 0) / qty
                      const total = i.totalPrice ?? up * qty
                      return (
                        <div key={i.id} className="flex justify-between gap-2 border-b border-gray-100 py-0.5 last:border-0">
                          <span className="truncate">{i.productName ?? i.product?.name ?? "Ítem"}</span>
                          <span className="shrink-0">{qty} × {formatCurrency(up)} = {formatCurrency(total)}</span>
                        </div>
                      )
                    })}
                    {pendingItems.map((p) => (
                      <div key={p.tempId} className="flex justify-between gap-2 border-b border-gray-100 py-0.5 last:border-0">
                        <span className="truncate">{p.productName}</span>
                        <span className="shrink-0">{p.quantity} × {formatCurrency(p.unitPrice)} = {formatCurrency(p.unitPrice * p.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  {discount > 0 && (
                    <p className="py-1 text-blue-700">Descuento: -{formatCurrency(discount)}</p>
                  )}
                  <div className="mt-2 border-t border-gray-200 pt-2 font-semibold">
                    Total: {formatCurrency(Math.max(0, orderTotal))}
                  </div>
                </div>
              </div>
            )}

            {/* Resumen por comensal (dividir cuenta) */}
            {(table?.tableType !== "errors" && table?.tableType !== "trash") && splitMode && Object.keys(splitTotals).length > 0 && (
              <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Resumen por comensal
                </p>
                <div className="space-y-1">
                  {Object.entries(splitTotals).map(([num, total]) => (
                    <div key={num} className="flex justify-between text-sm">
                      <span className="text-gray-600">Comensal {num}</span>
                      <span className="font-medium text-gray-800">{formatCurrency(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowPayment(false)
                  setPaymentMethod("")
                  setPaymentByDiner({})
                  setDiscount(0)
                  setPaymentNotes("")
                  setInvoiceType("consumidor")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={closeOrder}
                disabled={
                  ((table?.tableType !== "errors" && table?.tableType !== "trash") &&
                    (invoiceType === "cuenta_corriente" ? !customerId : (!paymentMethod && !(splitMode && Object.keys(splitTotals).length > 0)))) ||
                  closing
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Confirmar Pago
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          EDIT ORDER ITEM MODAL
          ═══════════════════════════════════ */}
      {editingOrderItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">
              Editar ítem · {editingOrderItem.productName}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingOrderItem.quantity}
                  onChange={(e) =>
                    setEditingOrderItem((prev) =>
                      prev
                        ? {
                            ...prev,
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          }
                        : null
                    )
                  }
                  title="Cantidad"
                  placeholder="1"
                  aria-label="Cantidad"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notas
                </label>
                <textarea
                  rows={2}
                  value={editingOrderItem.notes}
                  onChange={(e) =>
                    setEditingOrderItem((prev) =>
                      prev ? { ...prev, notes: e.target.value } : null
                    )
                  }
                  placeholder="Opcional"
                  className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditingOrderItem(null)}
                className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={saveOrderItemEdit}
                disabled={updatingItem}
                className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {updatingItem && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          NOTES MODAL
          ═══════════════════════════════════ */}
      {notesTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">
              Notas del ítem
            </h3>
            <textarea
              autoFocus
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Sin cebolla, extra queso..."
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setNotesTarget(null)
                  setNotesDraft("")
                }}
                className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={saveNote}
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
