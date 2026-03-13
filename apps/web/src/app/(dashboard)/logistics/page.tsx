"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
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
} from "lucide-react"
import { shipmentsApi } from "@/lib/api/shipments"
import { locationsApi } from "@/lib/api/locations"
import { productsApi } from "@/lib/api/products"
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
  const [locations, setLocations] = useState<{ id: string; name: string; type?: string }[]>([])

  // Products for create modal
  const [productsList, setProductsList] = useState<{ id: string; name: string; sku: string }[]>([])

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
  const [shipmentItems, setShipmentItems] = useState<
    Array<{ productId: string; sentQty: number }>
  >([{ productId: "", sentQty: 1 }])
  const [estimateDurationMin, setEstimateDurationMin] = useState<number | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

  // Estimate duration when origin/destination change (Google Maps opcional)
  useEffect(() => {
    if (!showCreateModal || !newShipment.originId || !newShipment.destinationId) {
      setEstimateDurationMin(null)
      return
    }
    let cancelled = false
    setEstimateLoading(true)
    setEstimateDurationMin(null)
    shipmentsApi
      .getEstimateDuration(newShipment.originId, newShipment.destinationId)
      .then((res: any) => {
        if (!cancelled && res?.durationMin != null) setEstimateDurationMin(res.durationMin)
      })
      .catch(() => {
        if (!cancelled) setEstimateDurationMin(null)
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showCreateModal, newShipment.originId, newShipment.destinationId])

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreateModal(false)
    }
    if (showCreateModal) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showCreateModal])

  // Load locations on mount
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await locationsApi.getAll()
        const locs = Array.isArray(res) ? res : (res as any).data || []
        setLocations(locs.map((l: any) => ({ id: l.id, name: l.name, type: l.type })))
      } catch {
        // Non-critical
      }
    }
    loadLocations()
  }, [])

  // Load products for modal
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await productsApi.getAll({ limit: 200 })
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

  // Destinos para el mapa: todos los locales excepto el depósito (type === WAREHOUSE). Si type no viene, se muestra igual.
  const destinations = useMemo(() => {
    const isWarehouse = (t?: string) => t === "WAREHOUSE" || t === "warehouse"
    if (locations.length > 0) {
      const list = locations.filter((l) => !isWarehouse(l.type))
      if (list.length > 0) return list
      return locations
    }
    const seen = new Set<string>()
    return shipmentsList
      .map((s) => s.destination)
      .filter((d) => {
        if (!d?.id || seen.has(d.id)) return false
        seen.add(d.id)
        return true
      })
  }, [locations, shipmentsList])

  // Fecha mínima para llegada estimada (hoy, en fecha local)
  const d = new Date()
  const minEstimatedArrival = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

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
    setCreating(true)
    try {
      const validItems = shipmentItems.filter((item) => item.productId && item.sentQty > 0)
      if (validItems.length === 0) {
        setCreateError("Debes agregar al menos un ítem al envío")
        setCreating(false)
        return
      }
      const estimatedArrival =
        newShipment.estimatedArrival?.trim()
          ? /^\d{4}-\d{2}-\d{2}$/.test(newShipment.estimatedArrival.trim())
            ? `${newShipment.estimatedArrival.trim()}T12:00:00.000Z`
            : newShipment.estimatedArrival.trim()
          : undefined
      await shipmentsApi.create({
        originId: newShipment.originId,
        destinationId: newShipment.destinationId,
        estimatedArrival,
        estimatedDurationMin: estimateDurationMin ?? undefined,
        notes: newShipment.notes || undefined,
        items: validItems,
      })
      setShowCreateModal(false)
      setNewShipment({ originId: "", destinationId: "", estimatedArrival: "", notes: "" })
      setEstimateDurationMin(null)
      setShipmentItems([{ productId: "", sentQty: 1 }])
      fetchShipments()
      sileo.success({ title: "Envío creado correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al crear el envío"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  // Items helpers
  const addItem = () => setShipmentItems([...shipmentItems, { productId: "", sentQty: 1 }])
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
                  const originName = shipment.origin?.name || "—"
                  const destName = shipment.destination?.name || "—"
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
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {originName}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {destName}
                            </span>
                          </div>
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Envíos Activos</h3>
                <p className="text-xs text-gray-500 dark:text-white">Depósito y destinos</p>
              </div>
            </div>
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

          <div className="flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-gray-800 dark:to-gray-900">
            {destinations.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-8">
                <Package className="h-10 w-10 text-gray-300 dark:text-gray-500" />
                <p className="mt-3 text-sm font-medium text-gray-500 dark:text-white">Sin destinos aún</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">Los destinos aparecerán cuando haya envíos</p>
              </div>
            ) : (
              <>
                <div className="relative min-h-[380px] flex min-w-0 items-center justify-center overflow-auto px-6 py-10">
                {/* Líneas desde el centro hasta cada destino (destinos al final de la línea para no amontonar) */}
                <svg
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
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
                    const angle = (360 / destinations.length) * i - 90
                    const radians = (angle * Math.PI) / 180
                    const cx = 300
                    const cy = 300
                    const isExpressMicrocentro = dest.name?.toLowerCase().includes("microcentro") || dest.name?.toLowerCase().includes("express")
                    const lineLength = isExpressMicrocentro ? 260 : 220
                    const x2 = cx + Math.cos(radians) * lineLength
                    const y2 = cy + Math.sin(radians) * lineLength
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

                {/* Central hub: compacto para no solaparse con destinos */}
                <div className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 shadow-md shadow-blue-100/50 dark:shadow-none">
                  <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  <span className="mt-0.5 text-[9px] font-semibold leading-tight text-blue-800 dark:text-blue-200">Depósito Central</span>
                </div>

                {/* Nodos al final de cada línea para buena separación */}
                {destinations.map((dest, i) => {
                  const activeToThis = shipmentsList.filter(
                    (s) =>
                      s.destination?.id === dest.id &&
                      (s.status === "in_transit" || s.status === "dispatched" || s.status === "prepared")
                  )
                  const isActive = activeToThis.length > 0
                  const angle = (360 / destinations.length) * i - 90
                  const radians = (angle * Math.PI) / 180
                  const isExpressMicrocentro = dest.name?.toLowerCase().includes("microcentro") || dest.name?.toLowerCase().includes("express")
                  const lineLength = isExpressMicrocentro ? 260 : 220
                  const nodeDistance = lineLength
                  const x = Math.cos(radians) * nodeDistance
                  const y = Math.sin(radians) * nodeDistance
                  return (
                    <div
                      key={dest.id}
                      className="absolute left-1/2 top-1/2 z-10"
                      style={{
                        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                      }}
                    >
                      <div
                        className={cn(
                          "flex min-w-[100px] max-w-[140px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border-2 px-3 py-2.5 shadow-sm transition-all",
                          isActive
                            ? "border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 shadow-blue-100/50 dark:shadow-none"
                            : "border-gray-200 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90"
                        )}
                      >
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
                  )
                })}
                </div>

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
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
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
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateShipment}>
              <div className="space-y-4 px-6 py-5">
                {createError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {createError}
                  </div>
                )}

                {/* Origin */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Origen <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    aria-label="Origen"
                    value={newShipment.originId}
                    onChange={(e) =>
                      setNewShipment({ ...newShipment, originId: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar origen...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Destino <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    aria-label="Destino"
                    value={newShipment.destinationId}
                    onChange={(e) =>
                      setNewShipment({ ...newShipment, destinationId: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar destino...</option>
                    {locations
                      .filter((loc) => loc.id !== newShipment.originId)
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Tiempo estimado (Google Maps) */}
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
                        Sin estimación (configura direcciones en los locales para usar Google Maps)
                      </span>
                    )}
                  </div>
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

                {/* Items */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-white">
                      Ítems <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar ítem
                    </button>
                  </div>
                  <div className="space-y-2">
                    {shipmentItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          aria-label="Producto"
                          value={item.productId}
                          onChange={(e) => updateItem(index, "productId", e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Producto...</option>
                          {productsList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} - {p.name}
                            </option>
                          ))}
                        </select>
                        <FormattedNumberInput
                          value={item.sentQty}
                          onChange={(n) =>
                            updateItem(index, "sentQty", n)
                          }
                          placeholder="1"
                          className="w-24 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          aria-label="Eliminar ítem"
                          onClick={() => removeItem(index)}
                          disabled={shipmentItems.length <= 1}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  {creating ? "Creando..." : "Crear Envío"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
