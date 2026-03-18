"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  Search,
  Plus,
  Bot,
  Calendar,
  Factory,
  Sparkles,
  AlertCircle,
  X,
  Loader2,
  QrCode,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import { productionApi } from "@/lib/api/production"
import { recipesApi } from "@/lib/api/recipes"
import { locationsApi } from "@/lib/api/locations"
import { aiEventsApi } from "@/lib/api/ai-events"
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import type { ProductionStatus } from "@/types"

// ---------- helpers ----------

const statusConfig: Record<
  ProductionStatus,
  { label: string; dot?: string; bg: string; text: string; pulse?: boolean }
> = {
  draft: {
    label: "Borrador",
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-400",
  },
  pending: {
    label: "Pendiente",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-400",
  },
  in_progress: {
    label: "En Curso",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    pulse: true,
  },
  completed: {
    label: "Completada",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  completed_adjusted: {
    label: "Completada (Ajustada)",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  cancelled: {
    label: "Cancelada",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
}

const allStatuses: { value: ProductionStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En Curso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
]

// ---------- skeleton ----------

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100">
                {Array.from({ length: 7 }).map((_, colIdx) => (
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

export default function ProductionPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<ProductionStatus | "">(
    ""
  )
  const [selectedDate, setSelectedDate] = useState("")

  // Data state
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // AI suggestion
  const [productionSuggestion, setProductionSuggestion] = useState<any>(null)

  // Recipes and locations for create modal
  const [recipesList, setRecipesList] = useState<{ id: string; name: string }[]>([])
  const [locationsList, setLocationsList] = useState<{ id: string; name: string }[]>([])
  /** Ubicaciones permitidas para la receta seleccionada (según lo configurado en la receta). */
  const [allowedLocationIds, setAllowedLocationIds] = useState<string[]>([])

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newOrder, setNewOrder] = useState({
    recipeId: "",
    locationId: "",
    plannedQty: 1,
    plannedDate: "",
    notes: "",
  })
  // Combobox receta: búsqueda por teclado
  const [recipeSearch, setRecipeSearch] = useState("")
  const [recipeDropdownOpen, setRecipeDropdownOpen] = useState(false)

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

  // Load AI events on mount
  useEffect(() => {
    async function loadAiSuggestion() {
      try {
        const events = await aiEventsApi.getActive()
        const eventsArray = Array.isArray(events) ? events : (events as any).data || []
        const suggestion = eventsArray.find(
          (e: any) => e.type === "production_suggestion"
        )
        setProductionSuggestion(suggestion || null)
      } catch {
        // Non-critical
      }
    }
    loadAiSuggestion()
  }, [])

  // Load recipes and locations on mount (todas las ubicaciones para filtrar por receta)
  useEffect(() => {
    async function loadRecipes() {
      try {
        const res = await recipesApi.getAll({ limit: 5000 })
        const data = (res as any).data ?? res.data ?? []
        setRecipesList(data.map((r: any) => ({ id: r.id, name: r.name })))
      } catch {
        // Non-critical
      }
    }
    async function loadLocations() {
      try {
        const res = await locationsApi.getAll()
        const locs = Array.isArray(res) ? res : (res as any).data || []
        setLocationsList(locs.map((l: any) => ({ id: l.id, name: l.name, type: l.type })))
      } catch {
        // Non-critical
      }
    }
    loadRecipes()
    loadLocations()
  }, [])

  // Al elegir una receta, cargar sus ubicaciones (las configuradas en la receta)
  useEffect(() => {
    if (!showCreateModal || !newOrder.recipeId) {
      setAllowedLocationIds([])
      return
    }
    let cancelled = false
    recipesApi
      .getById(newOrder.recipeId)
      .then((recipe: any) => {
        if (cancelled) return
        const ids = (recipe.recipeLocations ?? []).map(
          (rl: any) => rl.locationId ?? rl.location?.id
        ).filter(Boolean)
        setAllowedLocationIds(ids)
      })
      .catch(() => {
        if (!cancelled) setAllowedLocationIds([])
      })
    return () => {
      cancelled = true
    }
  }, [showCreateModal, newOrder.recipeId])

  // Si la ubicación elegida no está en las permitidas para la receta, limpiarla
  useEffect(() => {
    if (
      newOrder.locationId &&
      allowedLocationIds.length > 0 &&
      !allowedLocationIds.includes(newOrder.locationId)
    ) {
      setNewOrder((prev) => ({ ...prev, locationId: "" }))
    }
  }, [allowedLocationIds, newOrder.locationId])

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = {}
      if (selectedStatus) params.status = selectedStatus

      const res = await productionApi.getAll(params)
      const data = res.data ?? (res as any).data ?? []
      const totalCount = res.total ?? (res as any).meta?.total ?? 0
      setOrders(data)
      setTotal(totalCount)
    } catch (err: any) {
      const msg = err.message || "Error al cargar las órdenes de producción"
      setError(msg)
      setOrders([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [selectedStatus])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Client-side filters for search + date
  const filteredOrders = orders.filter((order) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const orderNumber = order.orderNumber?.toLowerCase() || ""
      const recipeName =
        order.recipe?.name?.toLowerCase() ||
        order.recipeName?.toLowerCase() ||
        ""
      if (!orderNumber.includes(q) && !recipeName.includes(q)) {
        return false
      }
    }

    if (selectedDate) {
      const orderDate =
        order.plannedDate?.slice(0, 10) || ""
      if (orderDate !== selectedDate) return false
    }

    return true
  })

  // Handle create production order — hoy en fecha local (YYYY-MM-DD) para evitar problemas de zona horaria
  const now = new Date()
  const minPlannedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    if (!newOrder.recipeId) {
      setCreateError("Seleccioná una receta de la lista.")
      return
    }
    if (!newOrder.locationId) {
      setCreateError("Seleccioná una ubicación.")
      return
    }
    if (newOrder.plannedQty <= 0) {
      setCreateError("La cantidad planificada debe ser mayor a 0.")
      return
    }
    if (!newOrder.plannedDate?.trim()) {
      setCreateError("La fecha planificada es obligatoria.")
      return
    }
    const plannedStr = newOrder.plannedDate.slice(0, 10)
    if (plannedStr < minPlannedDate) {
      setCreateError("La fecha planificada no puede ser anterior a hoy.")
      return
    }
    setCreating(true)
    try {
      await productionApi.create({
        recipeId: newOrder.recipeId,
        locationId: newOrder.locationId,
        plannedQty: newOrder.plannedQty,
        plannedDate: newOrder.plannedDate,
        notes: newOrder.notes || undefined,
      })
      setShowCreateModal(false)
      setNewOrder({
        recipeId: "",
        locationId: "",
        plannedQty: 1,
        plannedDate: "",
        notes: "",
      })
      setRecipeSearch("")
      setRecipeDropdownOpen(false)
      fetchOrders()
      sileo.success({ title: "Orden de producción creada" })
    } catch (err: any) {
      const msg = err.message || "Error al crear la orden de producción"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Producción</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona las órdenes de producción y recetas
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreateError(null); setShowCreateModal(true) }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva Producción
        </button>
      </div>

      {/* -------- Filters -------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status */}
        <select
          aria-label="Filtrar por estado"
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as ProductionStatus | "")
          }
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {allStatuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Date */}
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="date"
            aria-label="Filtrar por fecha"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por orden o receta..."
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
            onClick={fetchOrders}
            className="ml-auto text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Orders Table -------- */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Orden #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Receta
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Ubicación
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Costo Est.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const status = (order.status || "draft") as ProductionStatus
                  const cfg = statusConfig[status] || statusConfig.draft
                  const recipeName =
                    order.recipe?.name || order.recipeName || "—"
                  const locationName =
                    order.location?.name || order.locationName || "—"
                  const plannedQty = order.plannedQty ?? 0
                  const actualQty = order.actualQty
                  const estimatedCost = order.estimatedCost ?? 0
                  const plannedDate = order.plannedDate

                  return (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/production/${order.id}`)}
                        className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                            {order.orderNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-900 dark:text-white">
                              {recipeName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 dark:text-white">
                            {locationName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {status === "completed" ||
                          status === "completed_adjusted" ? (
                            <span className="text-sm tabular-nums text-gray-700 dark:text-white">
                              <span className="text-gray-400 dark:text-gray-300">
                                {formatNumber(plannedQty)}
                              </span>
                              <span className="mx-1 text-gray-300 dark:text-gray-400">→</span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {formatNumber(actualQty ?? plannedQty)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                              {formatNumber(plannedQty)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                          {formatCurrency(estimatedCost)}
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
                          {plannedDate ? formatDate(plannedDate) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={status === "completed" || status === "completed_adjusted" ? `/production/${order.id}#lote` : `/production/${order.id}`}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                            >
                              {(status === "completed" || status === "completed_adjusted") ? (
                                <>
                                  <QrCode className="h-4 w-4" />
                                  Ver QR
                                </>
                              ) : (
                                <>
                                  Ver <ChevronRight className="h-4 w-4" />
                                </>
                              )}
                            </Link>
                          </div>
                        </td>
                      </tr>
                  )
                })}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm text-gray-400 dark:text-white"
                    >
                      <Factory className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-400" />
                      No se encontraron órdenes de producción
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredOrders.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-white">
                Mostrando{" "}
                <span className="font-medium text-gray-700 dark:text-white">
                  {filteredOrders.length}
                </span>{" "}
                de{" "}
                <span className="font-medium text-gray-700 dark:text-white">{total}</span>{" "}
                orden{total !== 1 ? "es" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------- AI Suggestion Card -------- */}
      {productionSuggestion && (
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/80 to-white p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100">
              <Sparkles className="h-5 w-5 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Producción Sugerida por IA
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {productionSuggestion.description}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700"
                >
                  <Bot className="h-4 w-4" />
                  Crear Orden desde Sugerencia
                </button>
                <span className="text-xs text-gray-400">
                  Sugerido el {formatDate(productionSuggestion.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------- Create Production Order Modal -------- */}
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
                Nueva Orden de Producción
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
            <form onSubmit={handleCreateOrder}>
              <div className="space-y-4 px-6 py-5">
                {createError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {createError}
                  </div>
                )}

                {/* Recipe — combobox con búsqueda por teclado */}
                <div className="relative">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Receta <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      aria-label="Receta"
                      aria-autocomplete="list"
                      aria-expanded={recipeDropdownOpen}
                      role="combobox"
                      value={
                        newOrder.recipeId
                          ? recipesList.find((r) => r.id === newOrder.recipeId)
                              ?.name ?? recipeSearch
                          : recipeSearch
                      }
                      onChange={(e) => {
                        setRecipeSearch(e.target.value)
                        setRecipeDropdownOpen(true)
                        if (newOrder.recipeId)
                        setNewOrder({
                          ...newOrder,
                          recipeId: "",
                          locationId: "",
                        })
                      }}
                      onFocus={() => setRecipeDropdownOpen(true)}
                      onBlur={() =>
                        setTimeout(() => setRecipeDropdownOpen(false), 150)
                      }
                      placeholder="Escribí para buscar o seleccionar receta..."
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-700 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                  </div>
                  {recipeDropdownOpen && (
                    <ul
                      className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
                      role="listbox"
                    >
                      {recipesList
                        .filter((r) =>
                          r.name
                            .toLowerCase()
                            .includes(recipeSearch.trim().toLowerCase())
                        )
                        .map((r) => (
                          <li
                            key={r.id}
                            role="option"
                            aria-selected={newOrder.recipeId === r.id}
                            className={cn(
                              "cursor-pointer px-3 py-2 text-sm",
                              newOrder.recipeId === r.id
                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                                : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setNewOrder({
                                ...newOrder,
                                recipeId: r.id,
                                locationId: "",
                              })
                              setRecipeSearch("")
                              setRecipeDropdownOpen(false)
                            }}
                          >
                            {r.name}
                          </li>
                        ))}
                      {recipesList.filter((r) =>
                        r.name
                          .toLowerCase()
                          .includes(recipeSearch.trim().toLowerCase())
                      ).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No hay recetas que coincidan
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                {/* Location: solo las configuradas para la receta elegida */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Ubicación <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    aria-label="Ubicación"
                    value={newOrder.locationId}
                    onChange={(e) =>
                      setNewOrder({ ...newOrder, locationId: e.target.value })
                    }
                    disabled={!newOrder.recipeId}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!newOrder.recipeId
                        ? "Seleccioná primero una receta"
                        : allowedLocationIds.length === 0
                          ? "Esta receta no tiene ubicaciones configuradas"
                          : "Seleccionar ubicación..."}
                    </option>
                    {(allowedLocationIds.length > 0
                      ? locationsList.filter((loc) =>
                          allowedLocationIds.includes(loc.id)
                        )
                      : locationsList
                    ).map((loc: any) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                        {loc.type === "WAREHOUSE" ? " (Depósito)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Planned Qty + Date row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Cantidad Planificada <span className="text-red-500">*</span>
                    </label>
                    <FormattedNumberInput
                      required
                      aria-label="Cantidad planificada"
                      placeholder="1"
                      value={newOrder.plannedQty}
                      onChange={(n) =>
                        setNewOrder({
                          ...newOrder,
                          plannedQty: n,
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Fecha Planificada <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      aria-label="Fecha planificada"
                      min={minPlannedDate}
                      value={newOrder.plannedDate}
                      onChange={(e) =>
                        setNewOrder({ ...newOrder, plannedDate: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Notas
                  </label>
                  <textarea
                    value={newOrder.notes}
                    onChange={(e) =>
                      setNewOrder({ ...newOrder, notes: e.target.value })
                    }
                    rows={3}
                    placeholder="Notas adicionales..."
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
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
                  {creating ? "Creando..." : "Crear Orden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
