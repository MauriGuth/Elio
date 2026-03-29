"use client"

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import {
  Search,
  Plus,
  Truck,
  ArrowRight,
  MapPin,
  Package,
  AlertCircle,
  X,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
} from "lucide-react"
import { shipmentsApi } from "@/lib/api/shipments"
import { locationsApi } from "@/lib/api/locations"
import { productsApi } from "@/lib/api/products"
import { suppliersApi } from "@/lib/api/suppliers"
import { cn, formatDate } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import type { ShipmentStatus } from "@/types"

// ---------- helpers ----------

const statusConfig: Record<
  ShipmentStatus,
  { label: string; dot?: string; bg: string; text: string; pulse?: boolean }
> = {
  draft: {
    label: "Borrador",
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-400",
  },
  prepared: {
    label: "Preparado",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-400",
  },
  dispatched: {
    label: "Despachado",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    pulse: true,
  },
  in_transit: {
    label: "En Tránsito",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    pulse: true,
  },
  reception_control: {
    label: "Control de recepción",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    pulse: true,
  },
  delivered: {
    label: "Entregado",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  received: {
    label: "Recibido",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  received_with_diff: {
    label: "Recibido con Diferencia",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  closed: {
    label: "Cerrado",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-600",
  },
  cancelled: {
    label: "Cancelado",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
}

const allStatuses: { value: ShipmentStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "prepared", label: "Preparado" },
  { value: "dispatched", label: "Despachado" },
  { value: "in_transit", label: "En Tránsito" },
  { value: "reception_control", label: "Control de recepción" },
  { value: "delivered", label: "Entregado" },
  { value: "received", label: "Recibido" },
  { value: "closed", label: "Cerrado" },
  { value: "cancelled", label: "Cancelado" },
]

// ---------- skeleton ----------

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100">
                {Array.from({ length: 6 }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-3">
                    <div
                      className="h-4 animate-pulse rounded bg-gray-100"
                      style={{ width: `${50 + Math.random() * 50}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function logisticsAddressOrCoords(ent: any): string | undefined {
  if (!ent) return undefined
  const a = String(ent.address ?? "").trim()
  if (a) return a
  if (ent.latitude != null && ent.longitude != null) {
    return `${ent.latitude}, ${ent.longitude}`
  }
  return undefined
}

type RouteSegCell = { line1: string; line2?: string }

function routeSegments(shipment: any): RouteSegCell[] {
  const out: RouteSegCell[] = []
  let line1 = shipment.origin?.name || "—"
  const ps0 = shipment.pickupSupplier
  if (ps0?.name?.trim()) {
    line1 = `${line1} — ${ps0.name.trim()}`
  }
  const sub0 = logisticsAddressOrCoords(ps0) || logisticsAddressOrCoords(shipment.origin)
  out.push(sub0 ? { line1, line2: sub0 } : { line1 })

  if (shipment.isMultiStop && Array.isArray(shipment.stops) && shipment.stops.length > 0) {
    const ordered = [...shipment.stops].sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    for (const s of ordered) {
      const psn = s.pickupSupplier?.name?.trim()
      if (psn) {
        const sub = logisticsAddressOrCoords(s.pickupSupplier)
        out.push(sub ? { line1: psn, line2: sub } : { line1: psn })
      } else {
        const n = s.location?.name || "—"
        const sub = logisticsAddressOrCoords(s.location)
        out.push(sub ? { line1: n, line2: sub } : { line1: n })
      }
    }
    return out
  }
  const d1 = shipment.destination?.name || "—"
  const d2 = logisticsAddressOrCoords(shipment.destination)
  out.push(d2 ? { line1: d1, line2: d2 } : { line1: d1 })
  return out
}

/** Slug del local creado por migración (retiro en proveedor). */
const RETIRO_MERCADERIA_SLUG = "retiro-mercaderia-proveedor"

/** Valor de <select> para «ir a / salir de un proveedor» (elige proveedor abajo). */
const PROVEEDOR_SENTINEL = "__proveedor__"

type LogisticsLocLite = {
  id: string
  name: string
  type?: string
  slug?: string
  mapConfig?: Record<string, unknown> | null
}

type LogisticsHubSaved = {
  offsetXPx: number
  offsetYPx: number
  lineEndDx: number
  lineEndDy: number
}

function readLogisticsHub(mapConfig: unknown): LogisticsHubSaved | null {
  if (!mapConfig || typeof mapConfig !== "object" || Array.isArray(mapConfig)) return null
  const hub = (mapConfig as Record<string, unknown>).logisticsHub
  if (!hub || typeof hub !== "object" || Array.isArray(hub)) return null
  const h = hub as Record<string, unknown>
  const x = h.offsetXPx
  const y = h.offsetYPx
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  const dx = h.lineEndDx
  const dy = h.lineEndDy
  const lineEndDx = typeof dx === "number" && Number.isFinite(dx) ? dx : 0
  const lineEndDy = typeof dy === "number" && Number.isFinite(dy) ? dy : 0
  return { offsetXPx: x, offsetYPx: y, lineEndDx, lineEndDy }
}

function readExtraLocationIds(mapConfig: unknown): string[] {
  if (!mapConfig || typeof mapConfig !== "object" || Array.isArray(mapConfig)) return []
  const raw = (mapConfig as Record<string, unknown>).logisticsHubMapSettings
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  const ids = (raw as Record<string, unknown>).extraLocationIds
  if (!Array.isArray(ids)) return []
  return ids.filter((x): x is string => typeof x === "string" && x.length > 0)
}

function normalizeLocationFromApi(l: any): LogisticsLocLite {
  return {
    id: l.id,
    name: l.name,
    type: l.type,
    slug: l.slug,
    mapConfig:
      l.mapConfig && typeof l.mapConfig === "object" && !Array.isArray(l.mapConfig)
        ? (l.mapConfig as Record<string, unknown>)
        : l.mapConfig ?? null,
  }
}

type HubDraftEntry = {
  x: number
  y: number
  lineEndDx: number
  lineEndDy: number
}

function defaultHubRadial(index: number, total: number, label: string): { x: number; y: number } {
  const angle = (360 / total) * index - 90
  const radians = (angle * Math.PI) / 180
  const isExpress =
    label.toLowerCase().includes("microcentro") || label.toLowerCase().includes("express")
  const lineLength = isExpress ? 260 : 220
  return {
    x: Math.cos(radians) * lineLength,
    y: Math.sin(radians) * lineLength,
  }
}

function resolveHubNodeCoords(
  dest: Pick<LogisticsLocLite, "id" | "name" | "mapConfig">,
  index: number,
  total: number,
  draft: Record<string, Pick<HubDraftEntry, "x" | "y"> | HubDraftEntry>,
): { x: number; y: number } {
  const fromDraft = draft[dest.id]
  if (fromDraft) return { x: fromDraft.x, y: fromDraft.y }
  const saved = readLogisticsHub(dest.mapConfig)
  if (saved) return { x: saved.offsetXPx, y: saved.offsetYPx }
  return defaultHubRadial(index, total, dest.name ?? "")
}

function resolveLineEndOffset(
  dest: Pick<LogisticsLocLite, "id" | "mapConfig">,
  draft: Record<string, Partial<HubDraftEntry> & { x?: number; y?: number }>,
): { dx: number; dy: number } {
  const e = draft[dest.id]
  const saved = readLogisticsHub(dest.mapConfig)
  if (e) {
    return {
      dx: typeof e.lineEndDx === "number" ? e.lineEndDx : (saved?.lineEndDx ?? 0),
      dy: typeof e.lineEndDy === "number" ? e.lineEndDy : (saved?.lineEndDy ?? 0),
    }
  }
  if (saved) return { dx: saved.lineEndDx, dy: saved.lineEndDy }
  return { dx: 0, dy: 0 }
}

function clampHubRadius(x: number, y: number, minR: number, maxR: number): { x: number; y: number } {
  const len = Math.hypot(x, y)
  if (len < 1e-6) return { x: minR, y: 0 }
  if (len < minR) {
    const f = minR / len
    return { x: x * f, y: y * f }
  }
  if (len > maxR) {
    const f = maxR / len
    return { x: x * f, y: y * f }
  }
  return { x, y }
}

/** Límite del punto de enganche de la línea respecto al centro del nodo (px). */
const HUB_LINE_ATTACH_MAX = 88

function locationsWithoutRetiroSystem(locs: LogisticsLocLite[], retiroId?: string) {
  return locs.filter(
    (l) => l.slug !== RETIRO_MERCADERIA_SLUG && !(retiroId && l.id === retiroId),
  )
}

// ---------- producto buscable (envíos) ----------

type LogisticsProductOption = { id: string; name: string; sku: string }

type ShipmentLineDraft = {
  productId: string
  /** Texto de búsqueda cuando aún no hay producto elegido */
  productQuery: string
  sentQty: number
}

function emptyShipmentLine(): ShipmentLineDraft {
  return { productId: "", productQuery: "", sentQty: 1 }
}

function logisticsProductLabel(p: LogisticsProductOption) {
  return p.sku ? `${p.sku} - ${p.name}` : p.name
}

type LogisticsSupplierOption = {
  id: string
  name: string
  address?: string | null
  taxId?: string | null
  latitude?: number | null
  longitude?: number | null
}

function supplierHasRoutePoint(s: LogisticsSupplierOption) {
  return Boolean(
    (s.address && s.address.trim()) ||
      (s.latitude != null && s.longitude != null),
  )
}

function LogisticsSupplierSearchInput({
  suppliers,
  supplierId,
  supplierQuery,
  onSupplierChange,
  isOpen,
  onOpenChange,
}: {
  suppliers: LogisticsSupplierOption[]
  supplierId: string
  supplierQuery: string
  onSupplierChange: (next: { id: string; query: string }) => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routable = useMemo(
    () => suppliers.filter(supplierHasRoutePoint),
    [suppliers],
  )
  const selected = useMemo(
    () => routable.find((s) => s.id === supplierId),
    [routable, supplierId],
  )
  const inputValue = selected ? selected.name : supplierQuery

  const filtered = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return routable.slice(0, 100)
    return routable
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.taxId && s.taxId.toLowerCase().includes(q)),
      )
      .slice(0, 100)
  }, [routable, supplierQuery])

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  return (
    <div className="relative min-w-0">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label="Proveedor de retiro"
        autoComplete="off"
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value
          onSupplierChange({ id: "", query: v })
          onOpenChange(true)
        }}
        onFocus={() => {
          clearBlurTimer()
          onOpenChange(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => onOpenChange(false), 150)
        }}
        placeholder="Buscar proveedor por nombre o CUIT..."
        className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-700 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      {isOpen && filtered.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {filtered.map((s) => (
            <li
              key={s.id}
              role="option"
              aria-selected={supplierId === s.id}
              className="cursor-pointer px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              onMouseDown={(e) => {
                e.preventDefault()
                clearBlurTimer()
                onSupplierChange({ id: s.id, query: "" })
                onOpenChange(false)
              }}
            >
              <span className="font-medium">{s.name}</span>
              {s.address?.trim() ? (
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400 truncate">
                  {s.address.trim()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {isOpen && supplierQuery.trim() && filtered.length === 0 ? (
        <p className="absolute z-40 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {routable.length === 0
            ? "Ningún proveedor tiene dirección ni coordenadas. Cargalas en Proveedores."
            : "Sin coincidencias"}
        </p>
      ) : null}
    </div>
  )
}

function LogisticsProductSearchInput({
  products,
  line,
  onLineChange,
  isOpen,
  onOpenChange,
  ariaLabel = "Producto",
}: {
  products: LogisticsProductOption[]
  line: ShipmentLineDraft
  onLineChange: (next: ShipmentLineDraft) => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  ariaLabel?: string
}) {
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selected = useMemo(
    () => products.find((p) => p.id === line.productId),
    [products, line.productId],
  )
  const inputValue = selected ? logisticsProductLabel(selected) : line.productQuery

  const filtered = useMemo(() => {
    const q = line.productQuery.trim().toLowerCase()
    if (!q) return products.slice(0, 100)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          logisticsProductLabel(p).toLowerCase().includes(q),
      )
      .slice(0, 100)
  }, [products, line.productQuery])

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value
          onLineChange({
            ...line,
            productId: "",
            productQuery: v,
          })
          onOpenChange(true)
        }}
        onFocus={() => {
          clearBlurTimer()
          onOpenChange(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => onOpenChange(false), 150)
        }}
        placeholder="Escribí para buscar producto..."
        className="min-w-0 w-full max-w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-700 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      {isOpen && filtered.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {filtered.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={line.productId === p.id}
              className="cursor-pointer px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              onMouseDown={(e) => {
                e.preventDefault()
                clearBlurTimer()
                onLineChange({
                  ...line,
                  productId: p.id,
                  productQuery: "",
                })
                onOpenChange(false)
              }}
            >
              {logisticsProductLabel(p)}
            </li>
          ))}
        </ul>
      ) : null}
      {isOpen && line.productQuery.trim() && filtered.length === 0 ? (
        <p className="absolute z-40 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
          Sin coincidencias
        </p>
      ) : null}
    </div>
  )
}

// ---------- main page ----------

export default function LogisticsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<ShipmentStatus | "">(
    ""
  )
  const [selectedOrigin, setSelectedOrigin] = useState("")
  const [selectedDestination, setSelectedDestination] = useState("")

  // Data state
  const [shipmentsList, setShipmentsList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Locations for filter dropdowns and map (incl. type para excluir depósito)
  const [locations, setLocations] = useState<LogisticsLocLite[]>([])
  /** Id del local de sistema «retiro mercadería / proveedor» (GET dedicado; no depende del listado). */
  const [systemRetiroLocationId, setSystemRetiroLocationId] = useState("")

  /** Mapa hub: modo edición y borrador de posiciones (px desde el centro). */
  const [hubEditMode, setHubEditMode] = useState(false)
  const [hubDraft, setHubDraft] = useState<Record<string, HubDraftEntry>>({})
  const [hubDragging, setHubDragging] = useState<{
    id: string
    startClientX: number
    startClientY: number
    startX: number
    startY: number
  } | null>(null)
  const [hubAttachDragging, setHubAttachDragging] = useState<{
    id: string
    startClientX: number
    startClientY: number
    startDx: number
    startDy: number
    nodeX: number
    nodeY: number
  } | null>(null)
  const [hubSaving, setHubSaving] = useState(false)
  /** Locales inactivos (p. ej. «Dorado») para agregarlos al mapa. */
  const [inactiveLocations, setInactiveLocations] = useState<LogisticsLocLite[]>([])
  /** En modo edición: ids extra guardados en el depósito (`logisticsHubMapSettings`). */
  const [hubExtraLocationIdsDraft, setHubExtraLocationIdsDraft] = useState<string[] | null>(null)

  // Products for create modal
  const [productsList, setProductsList] = useState<{ id: string; name: string; sku: string }[]>([])

  const [suppliersForPickup, setSuppliersForPickup] = useState<LogisticsSupplierOption[]>([])
  const [originSupplierPick, setOriginSupplierPick] = useState<{ id: string; query: string }>({
    id: "",
    query: "",
  })
  const [destSupplierPick, setDestSupplierPick] = useState<{ id: string; query: string }>({
    id: "",
    query: "",
  })
  const [openOriginSupplier, setOpenOriginSupplier] = useState(false)
  const [openDestSupplier, setOpenDestSupplier] = useState(false)
  const [openMultiSupplierKey, setOpenMultiSupplierKey] = useState<string | null>(null)

  /** Productos por proveedor (solo ítems vinculados en Proveedores) para paradas/origen/destino tipo proveedor */
  const [supplierProductsBySupplierId, setSupplierProductsBySupplierId] = useState<
    Record<string, LogisticsProductOption[]>
  >({})
  const supplierProductsLoadingRef = useRef<Set<string>>(new Set())
  const supplierProductsCacheRef = useRef(supplierProductsBySupplierId)
  supplierProductsCacheRef.current = supplierProductsBySupplierId

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newShipment, setNewShipment] = useState({
    originId: "",
    destinationId: "",
    estimatedArrival: "",
    notes: "",
  })
  const [shipmentItems, setShipmentItems] = useState<ShipmentLineDraft[]>([
    emptyShipmentLine(),
  ])

  type MultiStopDraft = {
    locationId: string
    supplierPick: { id: string; query: string }
    items: ShipmentLineDraft[]
  }
  const emptyMultiStop = (): MultiStopDraft => ({
    locationId: "",
    supplierPick: { id: "", query: "" },
    items: [emptyShipmentLine()],
  })
  const [createMode, setCreateMode] = useState<"multi" | "single">("multi")
  const [multiStops, setMultiStops] = useState<MultiStopDraft[]>([
    emptyMultiStop(),
    emptyMultiStop(),
  ])

  /** `s:0` = ítem simple fila 0; `m:parada:ítem` = multi-parada */
  const [openProductKey, setOpenProductKey] = useState<string | null>(null)

  const [estimateDurationMin, setEstimateDurationMin] = useState<number | null>(null)
  const [estimateReason, setEstimateReason] = useState<'no_api_key' | 'no_address' | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

  const retiroLocationId = useMemo(
    () =>
      systemRetiroLocationId ||
      locations.find((l) => l.slug === RETIRO_MERCADERIA_SLUG)?.id ||
      "",
    [systemRetiroLocationId, locations],
  )
  const selectLocations = useMemo(
    () => locationsWithoutRetiroSystem(locations, retiroLocationId || undefined),
    [locations, retiroLocationId],
  )

  const supplierIdsNeededForModalProducts = useMemo(() => {
    if (!showCreateModal) return [] as string[]
    const ids = new Set<string>()
    if (createMode === "multi") {
      for (const s of multiStops) {
        if (s.locationId === PROVEEDOR_SENTINEL && s.supplierPick.id) {
          ids.add(s.supplierPick.id)
        }
      }
    } else {
      if (newShipment.destinationId === PROVEEDOR_SENTINEL && destSupplierPick.id) {
        ids.add(destSupplierPick.id)
      }
      if (newShipment.originId === PROVEEDOR_SENTINEL && originSupplierPick.id) {
        ids.add(originSupplierPick.id)
      }
    }
    return [...ids]
  }, [
    showCreateModal,
    createMode,
    multiStops,
    newShipment.destinationId,
    newShipment.originId,
    destSupplierPick.id,
    originSupplierPick.id,
  ])

  const supplierIdsKeyForProducts = useMemo(
    () => [...supplierIdsNeededForModalProducts].sort().join("|"),
    [supplierIdsNeededForModalProducts],
  )

  useEffect(() => {
    if (!showCreateModal || supplierIdsNeededForModalProducts.length === 0) return
    let cancelled = false
    for (const supplierId of supplierIdsNeededForModalProducts) {
      if (supplierProductsCacheRef.current[supplierId] !== undefined) continue
      if (supplierProductsLoadingRef.current.has(supplierId)) continue
      supplierProductsLoadingRef.current.add(supplierId)
      suppliersApi
        .getProducts(supplierId)
        .then((rows) => {
          if (cancelled) return
          const arr = Array.isArray(rows) ? rows : []
          const products: LogisticsProductOption[] = arr.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ""),
            name: String(p.name ?? ""),
            sku: String(p.sku ?? ""),
          }))
          setSupplierProductsBySupplierId((prev) => ({ ...prev, [supplierId]: products }))
        })
        .catch(() => {
          if (cancelled) return
          setSupplierProductsBySupplierId((prev) => ({ ...prev, [supplierId]: [] }))
        })
        .finally(() => {
          supplierProductsLoadingRef.current.delete(supplierId)
        })
    }
    return () => {
      cancelled = true
    }
  }, [showCreateModal, supplierIdsKeyForProducts, supplierIdsNeededForModalProducts])

  const singleModeSupplierIdForItems = useMemo(() => {
    if (createMode !== "single") return null
    if (newShipment.destinationId === PROVEEDOR_SENTINEL && destSupplierPick.id) {
      return destSupplierPick.id
    }
    if (newShipment.originId === PROVEEDOR_SENTINEL && originSupplierPick.id) {
      return originSupplierPick.id
    }
    return null
  }, [
    createMode,
    newShipment.destinationId,
    newShipment.originId,
    destSupplierPick.id,
    originSupplierPick.id,
  ])

  const productsForSingleModeItems = useMemo((): LogisticsProductOption[] => {
    if (!singleModeSupplierIdForItems) return productsList
    return supplierProductsBySupplierId[singleModeSupplierIdForItems] ?? []
  }, [singleModeSupplierIdForItems, productsList, supplierProductsBySupplierId])

  const handleOriginSupplierPickChange = useCallback(
    (next: { id: string; query: string }) => {
      setOriginSupplierPick((prev) => {
        if (prev.id && next.id !== prev.id) {
          setShipmentItems([emptyShipmentLine()])
        }
        return next
      })
    },
    [],
  )

  const handleDestSupplierPickChange = useCallback(
    (next: { id: string; query: string }) => {
      setDestSupplierPick((prev) => {
        if (prev.id && next.id !== prev.id) {
          setShipmentItems([emptyShipmentLine()])
        }
        return next
      })
    },
    [],
  )

  // Proveedores para retiro en proveedor (modal crear envío)
  useEffect(() => {
    if (!showCreateModal) return
    suppliersApi
      .getAll({ limit: 500, isActive: true })
      .then((res) => {
        const rows = res.data ?? (res as { data?: unknown[] }).data ?? []
        setSuppliersForPickup(
          (Array.isArray(rows) ? rows : []).map((s: Record<string, unknown>) => ({
            id: String(s.id ?? ""),
            name: String(s.name ?? ""),
            address: (s.address as string) ?? null,
            taxId: (s.taxId as string) ?? null,
            latitude: (s.latitude as number) ?? null,
            longitude: (s.longitude as number) ?? null,
          })),
        )
      })
      .catch(() => setSuppliersForPickup([]))
  }, [showCreateModal])

  // Estimate duration when origin/destination change (Google Maps opcional) — solo envío simple
  useEffect(() => {
    if (
      !showCreateModal ||
      createMode !== "single" ||
      !newShipment.originId ||
      !newShipment.destinationId
    ) {
      setEstimateDurationMin(null)
      setEstimateReason(null)
      return
    }
    if (
      !retiroLocationId &&
      (newShipment.originId === PROVEEDOR_SENTINEL ||
        newShipment.destinationId === PROVEEDOR_SENTINEL)
    ) {
      setEstimateDurationMin(null)
      setEstimateReason(null)
      return
    }
    const originProv = newShipment.originId === PROVEEDOR_SENTINEL
    const destProv = newShipment.destinationId === PROVEEDOR_SENTINEL
    if (originProv && !originSupplierPick.id) {
      setEstimateDurationMin(null)
      setEstimateReason(null)
      setEstimateLoading(false)
      return
    }
    if (destProv && !destSupplierPick.id) {
      setEstimateDurationMin(null)
      setEstimateReason(null)
      setEstimateLoading(false)
      return
    }
    const originLocId = originProv ? retiroLocationId : newShipment.originId
    const destLocId = destProv ? retiroLocationId : newShipment.destinationId
    if (!originLocId || !destLocId) {
      setEstimateDurationMin(null)
      setEstimateReason(null)
      return
    }
    let cancelled = false
    setEstimateLoading(true)
    setEstimateDurationMin(null)
    setEstimateReason(null)
    shipmentsApi
      .getEstimateDuration(
        originLocId,
        destLocId,
        originProv ? originSupplierPick.id : undefined,
        destProv ? destSupplierPick.id : undefined,
      )
      .then((res: any) => {
        if (cancelled) return
        if (res?.durationMin != null) {
          setEstimateDurationMin(res.durationMin)
          setEstimateReason(null)
        } else {
          setEstimateReason(res?.reason ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) setEstimateDurationMin(null)
        if (!cancelled) setEstimateReason(null)
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    showCreateModal,
    createMode,
    newShipment.originId,
    newShipment.destinationId,
    originSupplierPick.id,
    destSupplierPick.id,
    retiroLocationId,
  ])

  // Close modal on Escape (el formulario se limpia al volver a abrir con «Nuevo Envío»)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreateModal(false)
    }
    if (showCreateModal) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showCreateModal])

  // Load locations on mount (activos + inactivos para el mapa / agregar «Dorado», etc.)
  useEffect(() => {
    async function loadLocations() {
      try {
        const [activeRes, inactiveRes] = await Promise.all([
          locationsApi.getAll(),
          locationsApi.getAll({ isActive: false }),
        ])
        const activeLocs = Array.isArray(activeRes) ? activeRes : (activeRes as any).data || []
        const inactiveLocs = Array.isArray(inactiveRes)
          ? inactiveRes
          : (inactiveRes as any).data || []
        setLocations(activeLocs.map(normalizeLocationFromApi))
        setInactiveLocations(inactiveLocs.map(normalizeLocationFromApi))
      } catch {
        try {
          const res = await locationsApi.getAll()
          const locs = Array.isArray(res) ? res : (res as any).data || []
          setLocations(locs.map(normalizeLocationFromApi))
        } catch {
          // Non-critical
        }
      }
    }
    loadLocations()
  }, [])

  useEffect(() => {
    let cancelled = false
    locationsApi
      .getSystemRetiroMercaderiaProveedor()
      .then((row) => {
        if (!cancelled && row?.id) setSystemRetiroLocationId(row.id)
      })
      .catch(() => {
        /* Si falla (p. ej. migración pendiente), retiroLocationId puede salir del getAll por slug */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Load products for modal
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await productsApi.getAll({ limit: 3000 })
        const data = res.data || []
        setProductsList(data.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku })))
      } catch {
        // Non-critical
      }
    }
    loadProducts()
  }, [])

  // Fetch shipments
  const fetchShipments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = {}
      if (selectedStatus) params.status = selectedStatus
      if (selectedOrigin) params.originId = selectedOrigin
      if (selectedDestination) params.destinationId = selectedDestination

      const res = await shipmentsApi.getAll(params)
      const data = res.data ?? (res as any).data ?? []
      const totalCount = res.total ?? (res as any).meta?.total ?? 0
      setShipmentsList(data)
      setTotal(totalCount)
    } catch (err: any) {
      const msg = err.message || "Error al cargar los envíos"
      setError(msg)
      setShipmentsList([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [selectedStatus, selectedOrigin, selectedDestination])

  useEffect(() => {
    fetchShipments()
  }, [fetchShipments])

  // Client-side search filter
  const filteredShipments = searchQuery
    ? shipmentsList.filter((shipment) => {
        const q = searchQuery.toLowerCase()
        return shipment.shipmentNumber?.toLowerCase().includes(q)
      })
    : shipmentsList

  // Active shipments for the map
  const activeShipments = shipmentsList.filter(
    (s) =>
      s.status === "in_transit" ||
      s.status === "dispatched" ||
      s.status === "prepared" ||
      s.status === "reception_control"
  )

  const locationCatalog = useMemo(() => {
    const m = new Map<string, LogisticsLocLite>()
    for (const l of locations) m.set(l.id, l)
    for (const l of inactiveLocations) {
      if (!m.has(l.id)) m.set(l.id, l)
    }
    return m
  }, [locations, inactiveLocations])

  /** Depósito: guarda `logisticsHubMapSettings.extraLocationIds` para locales extra en el mapa. */
  const warehouseLocation = useMemo(
    () => locations.find((l) => l.type === "WAREHOUSE" || l.type === "warehouse"),
    [locations],
  )

  const resolvedExtraLocationIds = useMemo(() => {
    if (hubEditMode && hubExtraLocationIdsDraft !== null) return hubExtraLocationIdsDraft
    return readExtraLocationIds(warehouseLocation?.mapConfig ?? null)
  }, [hubEditMode, hubExtraLocationIdsDraft, warehouseLocation])

  // Destinos para el mapa: locales no depósito + extras configurados (p. ej. inactivos como «Dorado»).
  const destinations = useMemo(() => {
    const isWarehouse = (t?: string) => t === "WAREHOUSE" || t === "warehouse"
    let base: LogisticsLocLite[] = []
    if (locations.length > 0) {
      const list = locations.filter((l) => !isWarehouse(l.type))
      base = list.length > 0 ? list : [...locations]
    } else {
      const seen = new Set<string>()
      base = shipmentsList
        .map((s) => s.destination)
        .filter((d) => {
          if (!d?.id || seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
        .map((d: any) => ({
          id: d.id,
          name: d.name ?? "—",
          type: d.type,
          slug: d.slug,
          mapConfig: null,
        }))
    }
    const seen = new Set(base.map((b) => b.id))
    const extras: LogisticsLocLite[] = []
    for (const id of resolvedExtraLocationIds) {
      if (seen.has(id)) continue
      const row = locationCatalog.get(id)
      if (row && !isWarehouse(row.type)) {
        extras.push(row)
        seen.add(id)
      }
    }
    return [...base, ...extras]
  }, [locations, shipmentsList, locationCatalog, resolvedExtraLocationIds])

  const hubMapPersistable =
    locations.length > 0 &&
    destinations.every((d) => locationCatalog.has(d.id))

  const addableHubLocations = useMemo(() => {
    const isWarehouse = (t?: string) => t === "WAREHOUSE" || t === "warehouse"
    const onMap = new Set(destinations.map((d) => d.id))
    return [...locationCatalog.values()]
      .filter((l) => !isWarehouse(l.type) && !onMap.has(l.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [locationCatalog, destinations])

  /** Para el desplegable: nodos ya dibujados (p. ej. Dorado no se ofrece «agregar» otra vez). */
  const destinationsSortedForHubSelect = useMemo(
    () => [...destinations].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [destinations],
  )

  const baseHubDestinationIds = useMemo(() => {
    const isWarehouse = (t?: string) => t === "WAREHOUSE" || t === "warehouse"
    if (locations.length > 0) {
      const list = locations.filter((l) => !isWarehouse(l.type))
      const base = list.length > 0 ? list : locations
      return new Set(base.map((b) => b.id))
    }
    const seen = new Set<string>()
    for (const s of shipmentsList) {
      const d = s.destination
      if (d?.id) seen.add(d.id)
    }
    return seen
  }, [locations, shipmentsList])

  useEffect(() => {
    if (!hubDragging) return
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - hubDragging.startClientX
      const dy = e.clientY - hubDragging.startClientY
      const nx = hubDragging.startX + dx
      const ny = hubDragging.startY + dy
      const clamped = clampHubRadius(nx, ny, 72, 292)
      const id = hubDragging.id
      setHubDraft((prev) => {
        const loc =
          locations.find((l) => l.id === id) ?? inactiveLocations.find((l) => l.id === id)
        const saved = readLogisticsHub(loc?.mapConfig)
        const prevE = prev[id]
        return {
          ...prev,
          [id]: {
            x: clamped.x,
            y: clamped.y,
            lineEndDx: prevE?.lineEndDx ?? saved?.lineEndDx ?? 0,
            lineEndDy: prevE?.lineEndDy ?? saved?.lineEndDy ?? 0,
          },
        }
      })
    }
    const onUp = () => setHubDragging(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [hubDragging, locations, inactiveLocations])

  useEffect(() => {
    if (!hubAttachDragging) return
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - hubAttachDragging.startClientX
      const dy = e.clientY - hubAttachDragging.startClientY
      let ndx = hubAttachDragging.startDx + dx
      let ndy = hubAttachDragging.startDy + dy
      ndx = Math.max(-HUB_LINE_ATTACH_MAX, Math.min(HUB_LINE_ATTACH_MAX, ndx))
      ndy = Math.max(-HUB_LINE_ATTACH_MAX, Math.min(HUB_LINE_ATTACH_MAX, ndy))
      const { id, nodeX, nodeY } = hubAttachDragging
      setHubDraft((prev) => ({
        ...prev,
        [id]: {
          x: nodeX,
          y: nodeY,
          lineEndDx: ndx,
          lineEndDy: ndy,
        },
      }))
    }
    const onUp = () => setHubAttachDragging(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [hubAttachDragging])

  const exitHubEdit = useCallback(() => {
    setHubEditMode(false)
    setHubDraft({})
    setHubDragging(null)
    setHubAttachDragging(null)
    setHubExtraLocationIdsDraft(null)
  }, [])

  const handleHubSave = useCallback(async () => {
    if (!hubMapPersistable) return
    const w = warehouseLocation
    const oldExtras = readExtraLocationIds(w?.mapConfig ?? null)
    const draftExtrasList = hubExtraLocationIdsDraft
    const extraSaveNeeded =
      w != null &&
      draftExtrasList !== null &&
      [...draftExtrasList].sort().join("\0") !== [...oldExtras].sort().join("\0")
    if (Object.keys(hubDraft).length === 0 && !extraSaveNeeded) {
      exitHubEdit()
      return
    }
    setHubSaving(true)
    try {
      if (extraSaveNeeded && w && hubExtraLocationIdsDraft !== null) {
        const whBase =
          w.mapConfig && typeof w.mapConfig === "object" && !Array.isArray(w.mapConfig)
            ? { ...(w.mapConfig as Record<string, unknown>) }
            : {}
        whBase.logisticsHubMapSettings = { extraLocationIds: [...hubExtraLocationIdsDraft] }
        await locationsApi.update(w.id, { mapConfig: whBase })
        setLocations((prev) =>
          prev.map((l) => (l.id === w.id ? { ...l, mapConfig: whBase } : l)),
        )
      }
      for (const id of Object.keys(hubDraft)) {
        const loc =
          locations.find((l) => l.id === id) ?? inactiveLocations.find((l) => l.id === id)
        if (!loc) continue
        const entry = hubDraft[id]
        const base =
          loc.mapConfig && typeof loc.mapConfig === "object" && !Array.isArray(loc.mapConfig)
            ? { ...(loc.mapConfig as Record<string, unknown>) }
            : {}
        base.logisticsHub = {
          offsetXPx: entry.x,
          offsetYPx: entry.y,
          lineEndDx: entry.lineEndDx,
          lineEndDy: entry.lineEndDy,
        }
        await locationsApi.update(id, { mapConfig: base })
      }
      const applyEntry = (l: LogisticsLocLite): LogisticsLocLite => {
        const entry = hubDraft[l.id]
        if (!entry) return l
        const base =
          l.mapConfig && typeof l.mapConfig === "object" && !Array.isArray(l.mapConfig)
            ? { ...(l.mapConfig as Record<string, unknown>) }
            : {}
        base.logisticsHub = {
          offsetXPx: entry.x,
          offsetYPx: entry.y,
          lineEndDx: entry.lineEndDx,
          lineEndDy: entry.lineEndDy,
        }
        return { ...l, mapConfig: base }
      }
      setLocations((prev) => prev.map(applyEntry))
      setInactiveLocations((prev) => prev.map(applyEntry))
      exitHubEdit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el mapa"
      sileo.error({ title: msg })
    } finally {
      setHubSaving(false)
    }
  }, [
    hubMapPersistable,
    hubDraft,
    locations,
    inactiveLocations,
    warehouseLocation,
    hubExtraLocationIdsDraft,
    exitHubEdit,
  ])

  const handleHubResetRadial = useCallback(async () => {
    if (!hubMapPersistable) return
    setHubSaving(true)
    try {
      for (const dest of destinations) {
        const loc = locations.find((l) => l.id === dest.id)
        if (!loc) continue
        const hadHub =
          readLogisticsHub(loc.mapConfig) != null || hubDraft[dest.id] != null
        if (!hadHub) continue
        const base =
          loc.mapConfig && typeof loc.mapConfig === "object" && !Array.isArray(loc.mapConfig)
            ? { ...(loc.mapConfig as Record<string, unknown>) }
            : {}
        delete base.logisticsHub
        await locationsApi.update(dest.id, {
          mapConfig: Object.keys(base).length > 0 ? base : {},
        })
      }
      setLocations((prev) =>
        prev.map((l) => {
          const base =
            l.mapConfig && typeof l.mapConfig === "object" && !Array.isArray(l.mapConfig)
              ? { ...(l.mapConfig as Record<string, unknown>) }
              : {}
          delete base.logisticsHub
          return {
            ...l,
            mapConfig: Object.keys(base).length > 0 ? base : null,
          }
        }),
      )
      setHubDraft({})
      exitHubEdit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo restaurar el mapa"
      sileo.error({ title: msg })
    } finally {
      setHubSaving(false)
    }
  }, [hubMapPersistable, destinations, locations, hubDraft, exitHubEdit])

  useEffect(() => {
    if (!hubEditMode || showCreateModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitHubEdit()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [hubEditMode, showCreateModal, exitHubEdit])

  // Fecha mínima para llegada estimada (hoy, en fecha local)
  const d = new Date()
  const minEstimatedArrival = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const parseEstimatedArrival = () => {
    if (!newShipment.estimatedArrival?.trim()) return undefined
    const t = newShipment.estimatedArrival.trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00.000Z` : t
  }

  const resetCreateForm = () => {
    setNewShipment({ originId: "", destinationId: "", estimatedArrival: "", notes: "" })
    setOriginSupplierPick({ id: "", query: "" })
    setDestSupplierPick({ id: "", query: "" })
    setSupplierProductsBySupplierId({})
    supplierProductsLoadingRef.current.clear()
    setOpenOriginSupplier(false)
    setOpenDestSupplier(false)
    setOpenMultiSupplierKey(null)
    setEstimateDurationMin(null)
    setEstimateReason(null)
    setShipmentItems([emptyShipmentLine()])
    setOpenProductKey(null)
    setCreateMode("multi")
    setMultiStops([emptyMultiStop(), emptyMultiStop()])
  }

  // Handle create shipment
  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    if (newShipment.estimatedArrival?.trim()) {
      const plannedStr = newShipment.estimatedArrival.trim().slice(0, 10)
      if (plannedStr < minEstimatedArrival) {
        setCreateError("La llegada estimada no puede ser anterior a hoy.")
        return
      }
    }
    if (!newShipment.originId) {
      setCreateError("Seleccioná un origen.")
      return
    }

    const originProv = newShipment.originId === PROVEEDOR_SENTINEL
    const destProv = newShipment.destinationId === PROVEEDOR_SENTINEL

    if (originProv && destProv) {
      setCreateError(
        "No podés poner proveedor en origen y destino en un solo trayecto. Usá «Varias paradas» o elegí un local en uno de los dos.",
      )
      return
    }
    /** Multi-parada con proveedor: el backend asigna el local de retiro por slug si mandás pickupSupplierId; no hace falta retiroLocationId en el cliente. */
    if (
      !retiroLocationId &&
      (originProv || (createMode === "single" && destProv))
    ) {
      setCreateError(
        "Falta el local de sistema «Retiro de mercadería o proveedor» (slug en base de datos). Ejecutá las migraciones de Prisma, revisá Locales o reactivá ese local si está inactivo.",
      )
      return
    }
    if (originProv && !originSupplierPick.id) {
      setCreateError("Elegí el proveedor de origen (con dirección o coordenadas en Proveedores).")
      return
    }

    setCreating(true)
    try {
      const estimatedArrival = parseEstimatedArrival()
      const itemRows = (rows: ShipmentLineDraft[]) =>
        rows
          .filter((it) => it.productId && it.sentQty > 0)
          .map((it) => ({ productId: it.productId, sentQty: it.sentQty }))

      let createdAsMultiFromSingle = false

      if (createMode === "multi") {
        if (multiStops.length < 2) {
          setCreateError("La ruta multi-parada requiere al menos dos paradas.")
          setCreating(false)
          return
        }
        const dedupKeys: string[] = []
        for (let i = 0; i < multiStops.length; i++) {
          const s = multiStops[i]
          const isProvStop = s.locationId === PROVEEDOR_SENTINEL
          if (!s.locationId) {
            setCreateError(`Elegí el local o proveedor de la parada ${i + 1}.`)
            setCreating(false)
            return
          }
          if (isProvStop && !s.supplierPick.id.trim()) {
            setCreateError(`Elegí el proveedor de la parada ${i + 1}.`)
            setCreating(false)
            return
          }
          const isLast = i === multiStops.length - 1
          if (
            !isLast &&
            s.locationId === newShipment.originId &&
            !isProvStop
          ) {
            setCreateError(
              `La parada ${i + 1} no puede ser el mismo local que el origen (solo en la última parada, p. ej. vuelta al depósito).`,
            )
            setCreating(false)
            return
          }
          dedupKeys.push(
            isProvStop ? `p:${s.supplierPick.id.trim()}` : `l:${s.locationId}`,
          )
          const valid = itemRows(s.items)
          if (valid.length === 0) {
            const label = isProvStop
              ? "proveedor"
              : locations.find((l) => l.id === s.locationId)?.name || "local"
            setCreateError(`Agregá al menos un ítem en la parada ${i + 1} (${label}).`)
            setCreating(false)
            return
          }
        }
        if (new Set(dedupKeys).size !== dedupKeys.length) {
          setCreateError("No repetir la misma parada (mismo local o mismo proveedor).")
          setCreating(false)
          return
        }
        const stopsPayload = multiStops.map((s) => {
          const isProv = s.locationId === PROVEEDOR_SENTINEL
          const pickId = s.supplierPick.id.trim()
          return {
            locationId: (isProv ? retiroLocationId : s.locationId).trim(),
            ...(isProv && pickId ? { pickupSupplierId: pickId } : {}),
            items: itemRows(s.items),
          }
        })
        await shipmentsApi.createMulti({
          originId: newShipment.originId,
          estimatedArrival,
          notes: newShipment.notes || undefined,
          stops: stopsPayload,
        })
      } else {
        if (!newShipment.destinationId) {
          setCreateError("Seleccioná un destino.")
          setCreating(false)
          return
        }
        if (destProv && !destSupplierPick.id) {
          setCreateError("Elegí el proveedor de destino (con dirección o coordenadas en Proveedores).")
          setCreating(false)
          return
        }
        const validItems = itemRows(shipmentItems)
        if (validItems.length === 0) {
          setCreateError("Debes agregar al menos un ítem al envío")
          setCreating(false)
          return
        }

        if (destProv && !originProv) {
          await shipmentsApi.createMulti({
            originId: newShipment.originId,
            estimatedArrival,
            notes: newShipment.notes || undefined,
            stops: [
              {
                locationId: retiroLocationId,
                pickupSupplierId: destSupplierPick.id,
                items: validItems,
              },
              {
                locationId: newShipment.originId,
                items: validItems,
              },
            ],
          })
          createdAsMultiFromSingle = true
        } else if (originProv && !destProv) {
          await shipmentsApi.create({
            originId: retiroLocationId,
            destinationId: newShipment.destinationId,
            pickupSupplierId: originSupplierPick.id,
            estimatedArrival,
            estimatedDurationMin: estimateDurationMin ?? undefined,
            notes: newShipment.notes || undefined,
            items: validItems,
          })
        } else {
          await shipmentsApi.create({
            originId: newShipment.originId,
            destinationId: newShipment.destinationId,
            estimatedArrival,
            estimatedDurationMin: estimateDurationMin ?? undefined,
            notes: newShipment.notes || undefined,
            items: validItems,
          })
        }
      }

      setShowCreateModal(false)
      resetCreateForm()
      fetchShipments()
      sileo.success({
        title:
          createMode === "multi" || createdAsMultiFromSingle
            ? "Tour / envío multi-parada creado correctamente"
            : "Envío creado correctamente",
      })
    } catch (err: any) {
      const msg = err.message || "Error al crear el envío"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  // Items helpers (un solo destino)
  const addItem = () =>
    setShipmentItems([...shipmentItems, emptyShipmentLine()])
  const removeItem = (index: number) => {
    if (shipmentItems.length > 1) {
      setShipmentItems(shipmentItems.filter((_, i) => i !== index))
    }
  }
  const updateItem = (index: number, field: string, value: string | number) => {
    setShipmentItems(
      shipmentItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  const addMultiStop = () => setMultiStops((prev) => [...prev, emptyMultiStop()])
  const removeMultiStop = (idx: number) => {
    setMultiStops((prev) => {
      if (prev.length <= 2) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }
  const moveMultiStop = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= multiStops.length) return
    setMultiStops((prev) => {
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const setStopLocation = (stopIdx: number, locationId: string) => {
    setMultiStops((prev) =>
      prev.map((s, i) =>
        i === stopIdx
          ? {
              ...s,
              locationId,
              supplierPick:
                locationId === PROVEEDOR_SENTINEL
                  ? s.supplierPick
                  : { id: "", query: "" },
            }
          : s,
      ),
    )
  }
  const addStopItem = (stopIdx: number) => {
    setMultiStops((prev) =>
      prev.map((s, i) =>
        i === stopIdx ? { ...s, items: [...s.items, emptyShipmentLine()] } : s,
      ),
    )
  }
  const removeStopItem = (stopIdx: number, itemIdx: number) => {
    setMultiStops((prev) =>
      prev.map((s, i) => {
        if (i !== stopIdx) return s
        if (s.items.length <= 1) return s
        return { ...s, items: s.items.filter((_, j) => j !== itemIdx) }
      }),
    )
  }
  const updateStopItem = (
    stopIdx: number,
    itemIdx: number,
    field: "productId" | "sentQty",
    value: string | number,
  ) => {
    setMultiStops((prev) =>
      prev.map((s, i) => {
        if (i !== stopIdx) return s
        return {
          ...s,
          items: s.items.map((it, j) =>
            j === itemIdx ? { ...it, [field]: value } : it,
          ),
        }
      }),
    )
  }

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Logística y Envíos
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los envíos entre depósito y sucursales
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null)
            const d = new Date()
            const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
            resetCreateForm()
            setNewShipment((prev) => ({ ...prev, estimatedArrival: today }))
            setShowCreateModal(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo Envío
        </button>
      </div>

      {/* -------- Filters -------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status */}
        <select
          aria-label="Filtrar por estado"
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as ShipmentStatus | "")
          }
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {allStatuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Origin */}
        <select
          aria-label="Filtrar por origen"
          value={selectedOrigin}
          onChange={(e) => setSelectedOrigin(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los orígenes</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Destination */}
        <select
          aria-label="Filtrar por destino"
          value={selectedDestination}
          onChange={(e) => setSelectedDestination(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los destinos</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número de envío..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* -------- Error -------- */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchShipments}
            className="ml-auto text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Shipments Table -------- */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    # Envío
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Ruta
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Fecha de creación
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Creado por
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map((shipment) => {
                  const status = (shipment.status || "draft") as ShipmentStatus
                  const cfg = statusConfig[status] || statusConfig.draft
                  const segments = routeSegments(shipment)
                  const totalItems =
                    shipment.totalItems ?? shipment._count?.items ?? 0
                  const createdByName =
                    shipment.createdBy?.firstName && shipment.createdBy?.lastName
                      ? `${shipment.createdBy.firstName} ${shipment.createdBy.lastName}`
                      : typeof shipment.createdBy === "string"
                      ? shipment.createdBy
                      : "—"

                  return (
                    <tr
                      key={shipment.id}
                      onClick={() => router.push(`/logistics/${shipment.id}`)}
                      className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                            {shipment.shipmentNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            {segments.map((seg, idx) => (
                              <span
                                key={`${shipment.id}-seg-${idx}`}
                                className="flex items-start gap-2"
                              >
                                {idx > 0 ? (
                                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                                ) : null}
                                <span className="flex min-w-0 flex-col gap-0">
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {seg.line1}
                                  </span>
                                  {seg.line2 ? (
                                    <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                      {seg.line2}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            ))}
                          </div>
                          {shipment.isMultiStop ? (
                            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                              Ruta multi-parada (un envío, varios locales)
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-gray-200">
                          {totalItems}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                              cfg.bg,
                              cfg.text
                            )}
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              {cfg.pulse && (
                                <span
                                  className={cn(
                                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                                    cfg.dot
                                  )}
                                />
                              )}
                              <span
                                className={cn(
                                  "relative inline-flex h-1.5 w-1.5 rounded-full",
                                  cfg.dot
                                )}
                              />
                            </span>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-white">
                          {shipment.createdAt ? formatDate(shipment.createdAt) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-white">
                          {createdByName}
                        </td>
                      </tr>
                  )
                })}

                {filteredShipments.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-gray-400 dark:text-white"
                    >
                      <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      No se encontraron envíos con los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredShipments.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-white">
                Mostrando{" "}
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {filteredShipments.length}
                </span>{" "}
                de{" "}
                <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span>{" "}
                envío{total !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------- Active Shipments Map -------- */}
      {!loading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Envíos Activos</h3>
                <p className="text-xs text-gray-500 dark:text-white">Depósito y destinos</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {destinations.length > 0 && hubMapPersistable ? (
                hubEditMode ? (
                  <>
                    {warehouseLocation ? (
                      <label className="inline-flex max-w-full flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-300 sm:max-w-[min(100%,22rem)]">
                        <span className="sr-only">Locales en el mapa y agregar al mapa</span>
                        <select
                          className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          value=""
                          onChange={(e) => {
                            const id = e.target.value
                            if (!id) return
                            setHubExtraLocationIdsDraft((prev) => {
                              const cur =
                                prev ?? readExtraLocationIds(warehouseLocation.mapConfig ?? null)
                              if (cur.includes(id)) return cur
                              return [...cur, id]
                            })
                            e.target.value = ""
                          }}
                        >
                          <option value="">+ Agregar local al mapa…</option>
                          {destinationsSortedForHubSelect.length > 0 ? (
                            <optgroup label="Ya están en el diagrama (no se eligen acá)">
                              {destinationsSortedForHubSelect.map((l) => (
                                <option key={`on-${l.id}`} value={l.id} disabled>
                                  {l.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {addableHubLocations.length > 0 ? (
                            <optgroup label="Se pueden agregar al mapa">
                              {addableHubLocations.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                        <span className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                          Los que ya son nodos (p. ej. Dorado) aparecen arriba en gris: no hace falta
                          agregarlos. Los nombres salen del alta en Locales; si ves uno de prueba,
                          renombralo o eliminalo ahí.
                        </span>
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={hubSaving}
                      onClick={() => void handleHubSave()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/40"
                    >
                      {hubSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Guardar disposición
                    </button>
                    <button
                      type="button"
                      disabled={hubSaving}
                      onClick={exitHubEdit}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={hubSaving}
                      onClick={() => void handleHubResetRadial()}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/30"
                    >
                      Círculo automático
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setHubEditMode(true)
                      setHubDraft({})
                      setHubExtraLocationIdsDraft(
                        readExtraLocationIds(warehouseLocation?.mapConfig ?? null),
                      )
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Editar mapa
                  </button>
                )
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                  activeShipments.length > 0
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-white"
                )}
              >
                {activeShipments.length} activo{activeShipments.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-gray-800 dark:to-gray-900">
            {destinations.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-8">
                <Package className="h-10 w-10 text-gray-300 dark:text-gray-500" />
                <p className="mt-3 text-sm font-medium text-gray-500 dark:text-white">Sin destinos aún</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">Los destinos aparecerán cuando haya envíos</p>
              </div>
            ) : (
              <>
                <div className="relative flex min-h-[min(32rem,90vh)] min-w-0 items-center justify-center overflow-auto px-4 py-20 sm:px-8 sm:py-24">
                {/* Líneas desde el centro hasta cada destino (destinos al final de la línea para no amontonar) */}
                <svg
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
                  width={600}
                  height={600}
                  viewBox="0 0 600 600"
                >
                  {destinations.map((dest, i) => {
                    const activeToThis = shipmentsList.filter(
                      (s) =>
                        s.destination?.id === dest.id &&
                        (s.status === "in_transit" || s.status === "dispatched" || s.status === "prepared")
                    )
                    const isActive = activeToThis.length > 0
                    const cx = 300
                    const cy = 300
                    const draftLayer = hubEditMode ? hubDraft : {}
                    const { x: ox, y: oy } = resolveHubNodeCoords(
                      dest,
                      i,
                      destinations.length,
                      draftLayer,
                    )
                    const { dx: adx, dy: ady } = resolveLineEndOffset(dest, draftLayer)
                    const x2 = cx + ox + adx
                    const y2 = cy + oy + ady
                    return (
                      <g key={dest.id} className={!isActive ? "text-slate-300 dark:text-slate-500" : ""}>
                        <line
                          x1={cx}
                          y1={cy}
                          x2={x2}
                          y2={y2}
                          stroke={isActive ? "#3b82f6" : "currentColor"}
                          strokeWidth={isActive ? 2.5 : 1.5}
                          strokeDasharray={isActive ? "8 6" : "6 6"}
                          strokeLinecap="round"
                        />
                        {isActive && (
                          <circle r="5" fill="#3b82f6" opacity={0.9}>
                            <animateMotion dur="2.5s" repeatCount="indefinite" path={`M${cx},${cy} L${x2},${y2}`} />
                          </circle>
                        )}
                      </g>
                    )
                  })}
                </svg>

                {/* Central hub */}
                <div className="absolute left-1/2 top-1/2 z-10 flex w-[5.75rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-2 border-blue-300 bg-white px-2 py-2 text-center shadow-md shadow-blue-100/50 dark:border-blue-600 dark:bg-gray-800 dark:shadow-none sm:w-[6.25rem]">
                  <Package className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="mt-1 block text-balance text-[9px] font-semibold leading-snug text-blue-800 dark:text-blue-200">
                    Depósito Central
                  </span>
                </div>

                {/* Nodos y punto de enganche de la línea (modo edición) */}
                {destinations.map((dest, i) => {
                  const activeToThis = shipmentsList.filter(
                    (s) =>
                      s.destination?.id === dest.id &&
                      (s.status === "in_transit" || s.status === "dispatched" || s.status === "prepared")
                  )
                  const isActive = activeToThis.length > 0
                  const draftLayer = hubEditMode ? hubDraft : {}
                  const { x, y } = resolveHubNodeCoords(dest, i, destinations.length, draftLayer)
                  const { dx: adx, dy: ady } = resolveLineEndOffset(dest, draftLayer)
                  const canDragHub = hubEditMode && hubMapPersistable
                  const isExtraOnlyOnMap =
                    resolvedExtraLocationIds.includes(dest.id) && !baseHubDestinationIds.has(dest.id)
                  return (
                    <Fragment key={dest.id}>
                      {canDragHub ? (
                        <div
                          className="absolute left-1/2 top-1/2 z-[11] flex h-6 w-6 cursor-grab items-center justify-center rounded-full border-2 border-amber-200 bg-amber-400 shadow-md active:cursor-grabbing touch-none dark:border-amber-700 dark:bg-amber-500"
                          style={{
                            transform: `translate(calc(-50% + ${x + adx}px), calc(-50% + ${y + ady}px))`,
                          }}
                          title="Arrastrá para cambiar dónde se conecta la línea al local"
                          aria-label={`Punto de conexión de la línea hacia ${dest.name}`}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setHubAttachDragging({
                              id: dest.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              startDx: adx,
                              startDy: ady,
                              nodeX: x,
                              nodeY: y,
                            })
                          }}
                        />
                      ) : null}
                      <div
                        className="absolute left-1/2 top-1/2 z-10"
                        style={{
                          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                        }}
                      >
                        <div
                          role={canDragHub ? "button" : undefined}
                          tabIndex={canDragHub ? 0 : undefined}
                          onPointerDown={(e) => {
                            if (!canDragHub) return
                            e.preventDefault()
                            e.stopPropagation()
                            const cur = resolveHubNodeCoords(
                              dest,
                              i,
                              destinations.length,
                              hubDraft,
                            )
                            setHubDragging({
                              id: dest.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              startX: cur.x,
                              startY: cur.y,
                            })
                          }}
                          onKeyDown={(e) => {
                            if (!canDragHub) return
                            if (e.key === "Enter" || e.key === " ") e.preventDefault()
                          }}
                          aria-label={canDragHub ? `Mover ${dest.name} en el mapa` : undefined}
                          className={cn(
                            "relative flex min-w-[100px] max-w-[140px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-2 px-3 py-2.5 shadow-sm transition-all touch-none select-none",
                            isActive
                              ? "border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 shadow-blue-100/50 dark:shadow-none"
                              : "border-gray-200 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90",
                            canDragHub &&
                              "cursor-grab active:cursor-grabbing ring-2 ring-amber-400/60 ring-offset-2 ring-offset-transparent dark:ring-amber-500/50"
                          )}
                        >
                          {canDragHub && isExtraOnlyOnMap ? (
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 z-[1] flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                              title="Quitar del mapa"
                              aria-label={`Quitar ${dest.name} del mapa`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                setHubExtraLocationIdsDraft((prev) => {
                                  const cur =
                                    prev ?? readExtraLocationIds(warehouseLocation?.mapConfig ?? null)
                                  return cur.filter((x) => x !== dest.id)
                                })
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                          <span
                            className={cn(
                              "text-center text-xs font-semibold leading-tight",
                              isActive ? "text-blue-800 dark:text-blue-200" : "text-gray-600 dark:text-white"
                            )}
                          >
                            {dest.name}
                          </span>
                          {isActive && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-200">
                              <Truck className="h-3 w-3" />
                              {activeToThis.length} envío{activeToThis.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  )
                })}
                </div>

                {hubEditMode && hubMapPersistable && (
                  <div className="border-t border-amber-200/70 bg-amber-50/90 px-4 py-2.5 text-center dark:border-amber-900/50 dark:bg-amber-950/25">
                    <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
                      Arrastrá el recuadro del local para moverlo; el círculo ámbar ajusta dónde llega la línea punteada.
                      Podés agregar locales con el selector (se guardan en el depósito).
                      «Guardar disposición» persiste en cada local sin borrar el plano del salón.
                    </p>
                  </div>
                )}

                {activeShipments.length === 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/50 px-4 py-4 text-center">
                    <p className="text-sm font-medium text-gray-600 dark:text-white">
                      No hay envíos activos en este momento
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* -------- Create Shipment Modal -------- */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nuevo Envío
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => {
                  setShowCreateModal(false)
                  resetCreateForm()
                }}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateShipment}>
              <div className="min-w-0 space-y-4 px-6 py-5">
                {createError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {createError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-1">
                  <button
                    type="button"
                    onClick={() => setCreateMode("multi")}
                    className={cn(
                      "inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      createMode === "multi"
                        ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                    )}
                  >
                    <Layers className="h-4 w-4 shrink-0" />
                    Varias paradas
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode("single")}
                    className={cn(
                      "inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      createMode === "single"
                        ? "bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                    )}
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    Un destino
                  </button>
                </div>

                {createMode === "multi" ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Un solo envío con varias paradas en orden (locales y/o proveedores). En el detalle se
                    alinea con Google Maps. Podés poner el depósito u origen como última parada para la
                    recepción al volver del proveedor.
                  </p>
                ) : null}

                {/* Origin */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Origen <span className="text-red-500">*</span>
                  </label>
                  <select
                    aria-label="Origen"
                    value={newShipment.originId}
                    onChange={(e) => {
                      const id = e.target.value
                      if (id !== PROVEEDOR_SENTINEL) {
                        setOriginSupplierPick({ id: "", query: "" })
                      }
                      setNewShipment((prev) => ({ ...prev, originId: id }))
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar origen...</option>
                    <option value={PROVEEDOR_SENTINEL}>Proveedor (retiro en domicilio del proveedor)</option>
                    {selectLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  {newShipment.originId === PROVEEDOR_SENTINEL ? (
                    <div className="mt-2 space-y-1.5">
                      <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-white">
                        Proveedor de origen <span className="text-red-500">*</span>
                      </label>
                      <LogisticsSupplierSearchInput
                        suppliers={suppliersForPickup}
                        supplierId={originSupplierPick.id}
                        supplierQuery={originSupplierPick.query}
                        onSupplierChange={handleOriginSupplierPickChange}
                        isOpen={openOriginSupplier}
                        onOpenChange={setOpenOriginSupplier}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        El envío sale del domicilio del proveedor (dirección o coordenadas en Proveedores).
                      </p>
                    </div>
                  ) : null}
                </div>

                {createMode === "single" ? (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                        Destino <span className="text-red-500">*</span>
                      </label>
                      <select
                        aria-label="Destino"
                        value={newShipment.destinationId}
                        onChange={(e) => {
                          const id = e.target.value
                          if (id !== PROVEEDOR_SENTINEL) {
                            setDestSupplierPick({ id: "", query: "" })
                          }
                          setNewShipment({ ...newShipment, destinationId: id })
                        }}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Seleccionar destino...</option>
                        <option value={PROVEEDOR_SENTINEL}>
                          Proveedor (retiro; se agrega vuelta al origen como segunda parada)
                        </option>
                        {selectLocations
                          .filter(
                            (loc) =>
                              newShipment.originId !== PROVEEDOR_SENTINEL
                                ? loc.id !== newShipment.originId
                                : true,
                          )
                          .map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                      </select>
                      {newShipment.destinationId === PROVEEDOR_SENTINEL ? (
                        <div className="mt-2 space-y-1.5">
                          <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-white">
                            Proveedor de destino <span className="text-red-500">*</span>
                          </label>
                          <LogisticsSupplierSearchInput
                            suppliers={suppliersForPickup}
                            supplierId={destSupplierPick.id}
                            supplierQuery={destSupplierPick.query}
                            onSupplierChange={handleDestSupplierPickChange}
                            isOpen={openDestSupplier}
                            onOpenChange={setOpenDestSupplier}
                          />
                          <p className="text-xs text-emerald-800 dark:text-emerald-200/90">
                            Se crea un solo tour multi-parada: primero retiro en el proveedor (control y
                            firma allí) y luego recepción en el origen que elegiste arriba.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {newShipment.originId && newShipment.destinationId && (
                      <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                        {estimateLoading ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Estimando tiempo de ruta...
                          </span>
                        ) : estimateDurationMin != null ? (
                          <span>
                            Tiempo estimado de ruta: <strong>{estimateDurationMin} min</strong>
                          </span>
                        ) : (
                          <span className="text-gray-500">
                            {newShipment.originId === PROVEEDOR_SENTINEL && !originSupplierPick.id
                              ? "Elegí el proveedor de origen (con dirección o coordenadas) para estimar."
                              : newShipment.destinationId === PROVEEDOR_SENTINEL &&
                                  !destSupplierPick.id
                                ? "Elegí el proveedor de destino (con dirección o coordenadas) para estimar."
                                : estimateReason === "no_api_key"
                                  ? "Sin estimación: configurá la variable GOOGLE_MAPS_API_KEY en la API (Railway)."
                                  : estimateReason === "no_address"
                                    ? "Sin estimación: cargá dirección o coordenadas en locales y/o en los proveedores elegidos."
                                    : "Sin estimación (configurá direcciones o coordenadas y GOOGLE_MAPS_API_KEY en la API)."}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-white">
                          {singleModeSupplierIdForItems
                            ? "Ítems (catálogo del proveedor)"
                            : "Ítems"}{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={addItem}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Agregar ítem
                        </button>
                      </div>
                      {singleModeSupplierIdForItems &&
                      supplierProductsBySupplierId[singleModeSupplierIdForItems] === undefined ? (
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          Cargando productos vinculados al proveedor…
                        </p>
                      ) : singleModeSupplierIdForItems &&
                        (supplierProductsBySupplierId[singleModeSupplierIdForItems]?.length ?? 0) ===
                          0 ? (
                        <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                          Este proveedor no tiene productos vinculados. Asocialos en{" "}
                          <span className="font-medium">Proveedores</span> para poder armar el envío.
                        </p>
                      ) : null}
                      <div className="space-y-2">
                        {shipmentItems.map((item, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/40 p-2.5 min-w-0"
                          >
                            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                              <LogisticsProductSearchInput
                                products={productsForSingleModeItems}
                                line={item}
                                onLineChange={(next) =>
                                  setShipmentItems((rows) =>
                                    rows.map((it, i) => (i === index ? next : it)),
                                  )
                                }
                                isOpen={openProductKey === `s:${index}`}
                                onOpenChange={(open) =>
                                  setOpenProductKey(open ? `s:${index}` : null)
                                }
                              />
                              <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
                                <FormattedNumberInput
                                  value={item.sentQty}
                                  onChange={(n) =>
                                    updateItem(index, "sentQty", n)
                                  }
                                  placeholder="1"
                                  className="w-[5.5rem] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  aria-label="Eliminar ítem"
                                  onClick={() => removeItem(index)}
                                  disabled={shipmentItems.length <= 1}
                                  className="shrink-0 rounded-lg border border-transparent p-2 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 dark:hover:border-red-800 dark:hover:bg-red-900/30 hover:text-red-500 disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-white">
                        Paradas <span className="text-red-500">*</span>
                        <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                          (mín. 2, orden = ruta)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={addMultiStop}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar parada
                      </button>
                    </div>

                    <div className="space-y-4">
                      {multiStops.map((stop, stopIdx) => {
                        const isProveedorParada = stop.locationId === PROVEEDOR_SENTINEL
                        const supplierStopId = stop.supplierPick.id
                        const cachedSupplierProducts =
                          isProveedorParada && supplierStopId
                            ? supplierProductsBySupplierId[supplierStopId]
                            : undefined
                        const productsForMultiStop = isProveedorParada
                          ? (cachedSupplierProducts ?? [])
                          : productsList
                        const isLastStop = stopIdx === multiStops.length - 1
                        const takenLocalElsewhere = new Set(
                          multiStops
                            .map((s, i) =>
                              i !== stopIdx &&
                              s.locationId &&
                              s.locationId !== PROVEEDOR_SENTINEL
                                ? s.locationId
                                : "",
                            )
                            .filter(Boolean),
                        )
                        return (
                          <div
                            key={stopIdx}
                            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30 p-4"
                          >
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                Parada {stopIdx + 1}
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label="Subir parada"
                                  onClick={() => moveMultiStop(stopIdx, -1)}
                                  disabled={stopIdx === 0}
                                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Bajar parada"
                                  onClick={() => moveMultiStop(stopIdx, 1)}
                                  disabled={stopIdx === multiStops.length - 1}
                                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Quitar parada"
                                  onClick={() => removeMultiStop(stopIdx)}
                                  disabled={multiStops.length <= 2}
                                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mb-3 space-y-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                Local o proveedor
                              </label>
                              <select
                                aria-label={`Parada ${stopIdx + 1} — local o proveedor`}
                                value={stop.locationId}
                                onChange={(e) => setStopLocation(stopIdx, e.target.value)}
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Seleccionar...</option>
                                <option value={PROVEEDOR_SENTINEL}>Proveedor (retiro en domicilio)</option>
                                {selectLocations
                                  .filter((loc) => {
                                    if (
                                      loc.id === newShipment.originId &&
                                      !isLastStop
                                    ) {
                                      return false
                                    }
                                    return (
                                      !takenLocalElsewhere.has(loc.id) ||
                                      loc.id === stop.locationId
                                    )
                                  })
                                  .map((loc) => (
                                    <option key={loc.id} value={loc.id}>
                                      {loc.name}
                                    </option>
                                  ))}
                              </select>
                              {stop.locationId === PROVEEDOR_SENTINEL ? (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                    Proveedor <span className="text-red-500">*</span>
                                  </label>
                                  <LogisticsSupplierSearchInput
                                    suppliers={suppliersForPickup}
                                    supplierId={stop.supplierPick.id}
                                    supplierQuery={stop.supplierPick.query}
                                    onSupplierChange={(next) =>
                                      setMultiStops((prev) =>
                                        prev.map((s, i) => {
                                          if (i !== stopIdx) return s
                                          const idChanged = next.id !== s.supplierPick.id
                                          return {
                                            ...s,
                                            supplierPick: next,
                                            items: idChanged ? [emptyShipmentLine()] : s.items,
                                          }
                                        }),
                                      )
                                    }
                                    isOpen={openMultiSupplierKey === `m:${stopIdx}`}
                                    onOpenChange={(open) =>
                                      setOpenMultiSupplierKey(open ? `m:${stopIdx}` : null)
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                {stop.locationId === PROVEEDOR_SENTINEL
                                  ? stop.supplierPick.id
                                    ? "Ítems (catálogo del proveedor)"
                                    : "Ítems"
                                  : "Ítems en este local"}
                              </span>
                              <button
                                type="button"
                                onClick={() => addStopItem(stopIdx)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                              >
                                <Plus className="h-3 w-3" />
                                Ítem
                              </button>
                            </div>
                            {stop.locationId === PROVEEDOR_SENTINEL && !stop.supplierPick.id ? (
                              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                                Elegí un proveedor arriba para listar solo sus productos vinculados.
                              </p>
                            ) : stop.locationId === PROVEEDOR_SENTINEL &&
                              stop.supplierPick.id &&
                              cachedSupplierProducts === undefined ? (
                              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                                Cargando productos del proveedor…
                              </p>
                            ) : stop.locationId === PROVEEDOR_SENTINEL &&
                              stop.supplierPick.id &&
                              cachedSupplierProducts?.length === 0 ? (
                              <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                                Sin productos vinculados a este proveedor. Cargalos en{" "}
                                <span className="font-medium">Proveedores</span>.
                              </p>
                            ) : null}
                            <div className="min-w-0 space-y-2">
                              {stop.items.map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-800/40 p-2 min-w-0"
                                >
                                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                                    <LogisticsProductSearchInput
                                      products={productsForMultiStop}
                                      line={item}
                                      onLineChange={(next) =>
                                        setMultiStops((prev) =>
                                          prev.map((s, i) => {
                                            if (i !== stopIdx) return s
                                            return {
                                              ...s,
                                              items: s.items.map((it, j) =>
                                                j === itemIdx ? next : it,
                                              ),
                                            }
                                          }),
                                        )
                                      }
                                      isOpen={
                                        openProductKey === `m:${stopIdx}:${itemIdx}`
                                      }
                                      onOpenChange={(open) =>
                                        setOpenProductKey(
                                          open ? `m:${stopIdx}:${itemIdx}` : null,
                                        )
                                      }
                                    />
                                    <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
                                      <FormattedNumberInput
                                        value={item.sentQty}
                                        onChange={(n) =>
                                          updateStopItem(stopIdx, itemIdx, "sentQty", n)
                                        }
                                        placeholder="1"
                                        className="w-[5.5rem] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        aria-label="Eliminar ítem"
                                        onClick={() => removeStopItem(stopIdx, itemIdx)}
                                        disabled={stop.items.length <= 1}
                                        className="shrink-0 rounded-lg border border-transparent p-2 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 dark:hover:border-red-800 dark:hover:bg-red-900/30 hover:text-red-500 disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="rounded-lg border border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                      La ruta y tiempos con tráfico se calculan al preparar o despachar el envío desde el detalle.
                    </div>
                  </>
                )}

                {/* Estimated Arrival */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Llegada Estimada
                  </label>
                  <input
                    type="date"
                    aria-label="Llegada estimada"
                    min={minEstimatedArrival}
                    value={newShipment.estimatedArrival}
                    onChange={(e) =>
                      setNewShipment({ ...newShipment, estimatedArrival: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Notas
                  </label>
                  <textarea
                    value={newShipment.notes}
                    onChange={(e) =>
                      setNewShipment({ ...newShipment, notes: e.target.value })
                    }
                    rows={2}
                    placeholder="Notas adicionales..."
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    resetCreateForm()
                  }}
                  disabled={creating}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating
                    ? "Creando..."
                    : createMode === "multi"
                      ? "Crear envío multi-parada"
                      : "Crear Envío"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
