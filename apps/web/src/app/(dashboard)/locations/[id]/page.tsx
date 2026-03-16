"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  ArrowLeft,
  DollarSign,
  AlertTriangle,
  Truck,
  TicketCheck,
  Warehouse,
  Coffee,
  UtensilsCrossed,
  Zap,
  Building2,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  Package,
  ShieldAlert,
  Loader2,
  Pencil,
  X,
  Trash2,
} from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import {
  cn,
  formatCurrency,
  formatQuantity,
  formatTime,
  getStockStatusColor,
  getStockStatusLabel,
} from "@/lib/utils"

// ---------- helpers ----------

const typeConfig: Record<
  string,
  { label: string; icon: React.ReactNode; bg: string; text: string; darkBg: string; darkText: string }
> = {
  warehouse: {
    label: "Depósito",
    icon: <Warehouse className="h-3.5 w-3.5" />,
    bg: "bg-gray-100",
    text: "text-gray-700",
    darkBg: "dark:bg-gray-600",
    darkText: "dark:text-white",
  },
  WAREHOUSE: {
    label: "Depósito",
    icon: <Warehouse className="h-3.5 w-3.5" />,
    bg: "bg-gray-100",
    text: "text-gray-700",
    darkBg: "dark:bg-gray-600",
    darkText: "dark:text-white",
  },
  cafe: {
    label: "Café",
    icon: <Coffee className="h-3.5 w-3.5" />,
    bg: "bg-amber-50",
    text: "text-amber-700",
    darkBg: "dark:bg-amber-900/50",
    darkText: "dark:text-amber-300",
  },
  CAFE: {
    label: "Café",
    icon: <Coffee className="h-3.5 w-3.5" />,
    bg: "bg-amber-50",
    text: "text-amber-700",
    darkBg: "dark:bg-amber-900/50",
    darkText: "dark:text-amber-300",
  },
  restaurant: {
    label: "Restaurante",
    icon: <UtensilsCrossed className="h-3.5 w-3.5" />,
    bg: "bg-purple-50",
    text: "text-purple-700",
    darkBg: "dark:bg-purple-900/50",
    darkText: "dark:text-purple-300",
  },
  RESTAURANT: {
    label: "Restaurante",
    icon: <UtensilsCrossed className="h-3.5 w-3.5" />,
    bg: "bg-purple-50",
    text: "text-purple-700",
    darkBg: "dark:bg-purple-900/50",
    darkText: "dark:text-purple-300",
  },
  express: {
    label: "Express",
    icon: <Zap className="h-3.5 w-3.5" />,
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-900/50",
    darkText: "dark:text-cyan-300",
  },
  EXPRESS: {
    label: "Express",
    icon: <Zap className="h-3.5 w-3.5" />,
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-900/50",
    darkText: "dark:text-cyan-300",
  },
  hotel: {
    label: "Hotel",
    icon: <Building2 className="h-3.5 w-3.5" />,
    bg: "bg-slate-50",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-900/50",
    darkText: "dark:text-slate-300",
  },
  HOTEL: {
    label: "Hotel",
    icon: <Building2 className="h-3.5 w-3.5" />,
    bg: "bg-slate-50",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-900/50",
    darkText: "dark:text-slate-300",
  },
}

const movementTypeLabels: Record<string, string> = {
  production_out: "Salida Producción",
  production_in: "Entrada Producción",
  goods_receipt: "Ingreso Mercadería",
  shipment_in: "Recepción Envío",
  shipment_out: "Despacho Envío",
  sale: "Venta",
  correction: "Corrección",
  adjustment: "Ajuste",
}

const locationTypeOptions: { value: string; label: string }[] = [
  { value: "WAREHOUSE", label: "Depósito" },
  { value: "CAFE", label: "Café" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "EXPRESS", label: "Express" },
  { value: "HOTEL", label: "Hotel" },
]

// ---------- main page ----------

export default function LocationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const locationId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editType, setEditType] = useState("CAFE")
  const [editLatitude, setEditLatitude] = useState<string>("")
  const [editLongitude, setEditLongitude] = useState<string>("")
  const [editGeofenceRadius, setEditGeofenceRadius] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [user, setUser] = useState<{ role?: string } | null>(null)
  useEffect(() => {
    setUser(authApi.getStoredUser())
  }, [])
  const isLogisticsRole =
    user?.role === "LOGISTICS" || user?.role === "logistics"

  const startEditing = (loc: any) => {
    setEditName(loc.name ?? "")
    setEditAddress(loc.address ?? "")
    setEditType((loc.type ?? "CAFE").toUpperCase())
    setEditLatitude(loc.latitude != null ? String(loc.latitude) : "")
    setEditLongitude(loc.longitude != null ? String(loc.longitude) : "")
    setEditGeofenceRadius(loc.geofenceRadiusMeters != null ? String(loc.geofenceRadiusMeters) : "200")
    setSaveError(null)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setSaveError(null)
  }

  const saveLocation = async () => {
    if (!locationId) return
    setSaving(true)
    setSaveError(null)
    try {
      await locationsApi.update(locationId, {
        name: editName.trim(),
        address: editAddress.trim() || undefined,
        type: editType,
        latitude: editLatitude ? parseFloat(editLatitude) : undefined,
        longitude: editLongitude ? parseFloat(editLongitude) : undefined,
        geofenceRadiusMeters: editGeofenceRadius ? parseInt(editGeofenceRadius, 10) : undefined,
      })
      setEditing(false)
      fetchData()
      sileo.success({ title: "Local actualizado correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al guardar"
      setSaveError(msg)
      sileo.error({ title: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!locationId) return
    const ok = window.confirm(
      `¿Eliminar el local "${location?.name ?? "este local"}"? Esta acción no se puede deshacer.`
    )
    if (!ok) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await locationsApi.delete(locationId)
      sileo.success({ title: "Local eliminado" })
      router.push("/locations")
    } catch (err: any) {
      const msg = err.message || "Error al eliminar el local"
      setDeleteError(msg)
      sileo.error({ title: msg })
    } finally {
      setDeleting(false)
    }
  }

  const fetchData = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await locationsApi.getDashboard(locationId)
      setDashboard(res)
    } catch (err: any) {
      const msg = err.message || "Error al cargar dashboard"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/locations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-white transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Locales
        </Link>
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
          <button
            onClick={fetchData}
            className="ml-2 font-medium underline hover:no-underline dark:text-red-300"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // Not found state
  if (!dashboard?.location) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Package className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-500" />
        <p className="text-gray-500 dark:text-gray-400">Local no encontrado</p>
        <Link
          href="/locations"
          className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Volver a locales
        </Link>
      </div>
    )
  }

  const location = dashboard.location
  const typeCfg = typeConfig[location.type] ?? typeConfig.warehouse
  const status = location.isActive
    ? location.status ?? "online"
    : "offline"

  // Extract dashboard data
  const stockItems: any[] = dashboard.stockItems ?? dashboard.stock ?? []
  const movements: any[] = dashboard.recentMovements ?? dashboard.movements ?? []
  const locationAlerts: any[] = dashboard.alerts ?? []
  /** Solo alertas de stock (stock_critical, stock_low) para la sección Alertas Activas */
  const locationAlertsStockOnly = locationAlerts.filter(
    (a: any) => a.type === "stock_critical" || a.type === "stock_low" || (a.type && String(a.type).startsWith("stock_"))
  )
  const kpis = {
    salesToday: dashboard.salesToday ?? 0,
    criticalStock:
      dashboard.criticalStock ??
      stockItems.filter(
        (s: any) =>
          s.status === "critical" ||
          (s.stock && s.stock.status === "critical")
      ).length,
    pendingShipments: dashboard.pendingShipments ?? 0,
    ticketsToday: dashboard.ticketsToday ?? dashboard.ordersToday ?? 0,
  }

  return (
    <div className="space-y-6">
      {/* -------- Back + Header -------- */}
      <div>
        <Link
          href="/locations"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-white transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Locales
        </Link>

        {editing ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">
              Editar local
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nombre
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Nombre del local"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ubicación / Dirección
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Dirección"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tipo
                </label>
                <select
                  aria-label="Tipo de local"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {locationTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Geofence (para que mozos, cajeros, cocina, etc. solo entren en el local)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">Latitud</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editLatitude}
                      onChange={(e) => setEditLatitude(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Ej: -34.6037"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">Longitud</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editLongitude}
                      onChange={(e) => setEditLongitude(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Ej: -58.3816"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">Radio (m)</label>
                    <input
                      type="number"
                      min={50}
                      value={editGeofenceRadius}
                      onChange={(e) => setEditGeofenceRadius(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="200"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Si se completan lat/long, esos roles solo podrán iniciar sesión estando dentro del radio (metros).
                </p>
              </div>
              {saveError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveLocation}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {location.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  typeCfg.bg,
                  typeCfg.text,
                  typeCfg.darkBg,
                  typeCfg.darkText
                )}
              >
                {typeCfg.icon}
                {typeCfg.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  status === "online"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                    : status === "warning"
                      ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                      : "bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                )}
              >
            <span className="relative flex h-2 w-2">
              {status === "online" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  status === "online"
                    ? "bg-green-500"
                    : status === "warning"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                )}
              />
            </span>
            {status === "online"
              ? "Online"
              : status === "warning"
                ? "Alerta"
                : "Offline"}
          </span>
              {!isLogisticsRole && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(location)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Eliminar
                  </button>
                </div>
              )}
            </div>
            {deleteError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            )}
            {location.address && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-300 dark:text-gray-400">
                {location.address}
              </p>
            )}
          </>
        )}
      </div>

      {/* -------- KPI Cards: 2x2 en móvil, 4 columnas en desktop -------- */}
      <div
        className={cn(
          "grid gap-3 sm:gap-4 grid-cols-2",
          !isLogisticsRole && "lg:grid-cols-4"
        )}
      >
        {[
          ...(!isLogisticsRole
            ? [
{
            label: "Ventas Hoy",
            value: formatCurrency(kpis.salesToday),
            icon: <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />,
            bg: "bg-green-50 dark:bg-green-900/40",
            alert: false as boolean,
          },
              ]
            : []),
          {
            label: "Stock Crítico",
            value: String(kpis.criticalStock),
            icon: (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            ),
            bg: "bg-red-50 dark:bg-red-900/40",
            alert: kpis.criticalStock > 0,
          },
          {
            label: "Envíos Pendientes",
            value: String(kpis.pendingShipments),
            icon: <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
            bg: "bg-blue-50 dark:bg-blue-900/40",
            alert: false as boolean,
          },
          ...(!isLogisticsRole
            ? [
                {
                  label: "Tickets Hoy",
                  value: String(kpis.ticketsToday),
                  icon: (
                    <TicketCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  ),
                  bg: "bg-purple-50 dark:bg-purple-900/40",
                  alert: false as boolean,
                },
              ]
            : []),
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-300">{kpi.label}</span>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  kpi.bg
                )}
              >
                {kpi.icon}
              </div>
            </div>
            <p
              className={cn(
                "mt-2 text-2xl font-bold tabular-nums",
                kpi.alert ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
              )}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* -------- Stock del Local: en móvil layout vertical para no truncar ── */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Stock del Local
            </h3>
            <span className="ml-auto rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-900 dark:text-white">
              {stockItems.length} productos
            </span>
          </div>
          <div className="space-y-2">
            {stockItems.map((item: any) => {
              const product = item.product ?? item
              const stock = item.stock ?? item
              const name =
                product.name ?? product.productName ?? "Producto"
              const unit = product.unit ?? ""
              const quantity = stock.quantity ?? stock.currentQuantity ?? 0
              const minQty = stock.minQuantity ?? stock.min ?? 0
              const stockStatus = stock.status ?? "normal"
              const categoryLabel = product.category?.name ?? "Sin categoría"

              return (
                <div
                  key={item.id ?? product.id ?? name}
                  className="flex flex-col gap-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-300">
                      {categoryLabel}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white break-words">
                      {name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Mín: {formatQuantity(minQty)} {unit}
                    </p>
                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                      {formatQuantity(quantity)} {unit}
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        getStockStatusColor(stockStatus)
                      )}
                    >
                      {getStockStatusLabel(stockStatus)}
                    </span>
                  </div>
                </div>
              )
            })}
            {stockItems.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Sin productos en este local
              </p>
            )}
          </div>
        </div>

        {/* -------- Movimientos Recientes -------- */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Movimientos Recientes
            </h3>
          </div>
          <div className="space-y-2">
            {movements.map((mov: any) => {
              const qty = mov.quantity ?? 0

              return (
                <div
                  key={mov.id}
                  className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      qty > 0
                        ? "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400"
                    )}
                  >
                    {qty > 0 ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {mov.productName ??
                          mov.product?.name ??
                          "Producto"}
                      </p>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          qty > 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                      >
                        {qty > 0 ? "+" : ""}
                        {qty}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {movementTypeLabels[mov.type] ?? mov.type}
                      </span>
                      {mov.reference && (
                        <>
                          <span className="text-gray-300 dark:text-gray-500">·</span>
                          <span>{mov.reference}</span>
                        </>
                      )}
                      {mov.createdAt && (
                        <span className="ml-auto">
                          {formatTime(mov.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {movements.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Sin movimientos recientes
              </p>
            )}
          </div>
        </div>
      </div>

      {/* -------- Alertas Activas (solo stock) -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Alertas Activas
          </h3>
          {locationAlertsStockOnly.length > 0 && (
            <span className="ml-auto inline-flex items-center rounded-full bg-red-50 dark:bg-red-900/50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
              {locationAlertsStockOnly.length}
            </span>
          )}
        </div>
        {locationAlertsStockOnly.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            Sin alertas activas de stock para este local
          </p>
        ) : (
          <div className="space-y-2">
            {locationAlertsStockOnly.map((alert: any) => (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-4 py-3",
                  alert.priority === "critical"
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30"
                    : alert.priority === "high"
                      ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/30"
                      : "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/30"
                )}
              >
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    alert.priority === "critical"
                      ? "text-red-600 dark:text-red-400"
                      : alert.priority === "high"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-yellow-600 dark:text-yellow-400"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      alert.priority === "critical"
                        ? "text-red-800 dark:text-red-200"
                        : alert.priority === "high"
                          ? "text-orange-800 dark:text-orange-200"
                          : "text-yellow-800 dark:text-yellow-200"
                    )}
                  >
                    {alert.title}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      alert.priority === "critical"
                        ? "text-red-600 dark:text-red-300"
                        : alert.priority === "high"
                          ? "text-orange-600 dark:text-orange-300"
                          : "text-yellow-600 dark:text-yellow-300"
                    )}
                  >
                    {alert.message}
                  </p>
                </div>
                {alert.createdAt && (
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {formatTime(alert.createdAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
