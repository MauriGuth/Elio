"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { sileo } from "sileo"
import {
  MapPin,
  Warehouse,
  Coffee,
  UtensilsCrossed,
  Zap,
  Building2,
  ArrowRight,
  AlertTriangle,
  Package,
  Truck,
  DollarSign,
  Loader2,
  Plus,
} from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import { cn, formatCurrency, formatTime } from "@/lib/utils"

const POLL_INTERVAL_MS = 30_000 // 30 segundos

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

// ---------- main page ----------

export default function LocationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null)
  const [user, setUser] = useState<{ role?: string } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isLogisticsRole =
    user?.role === "LOGISTICS" || user?.role === "logistics"

  useEffect(() => {
    setUser(authApi.getStoredUser())
  }, [])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await locationsApi.getAll()
      const list = Array.isArray(res) ? res : []
      const withKpis = await Promise.all(
        list.map(async (loc: any) => {
          try {
            const dash = await locationsApi.getDashboard(loc.id)
            const d = dash && typeof dash === "object" ? dash as Record<string, any> : {}
            return {
              ...loc,
              salesToday: d.salesToday ?? loc.salesToday ?? null,
              criticalStock: d.criticalStock ?? d.kpis?.criticalStock ?? loc.criticalStock ?? 0,
              pendingShipments: d.pendingShipments ?? d.kpis?.pendingShipments ?? loc.pendingShipments ?? 0,
              _criticalCount: d.criticalStock ?? d.kpis?.criticalStock ?? loc._criticalCount ?? 0,
              _pendingShipments: d.pendingShipments ?? d.kpis?.pendingShipments ?? loc._pendingShipments ?? 0,
              _alertCount: Array.isArray(d.activeAlerts) ? d.activeAlerts.length : (Array.isArray(d.alerts) ? d.alerts.length : (loc._alertCount ?? 0)),
            }
          } catch {
            return { ...loc }
          }
        })
      )
      setLocations(withKpis)
      setLastFetchedAt(new Date())
    } catch (err: any) {
      const msg = err.message || "Error al cargar locales"
      if (!silent) {
        setError(msg)
        sileo.error({ title: msg })
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchData(true)
    }, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  useEffect(() => {
    if (!lastFetchedAt) return
    const tick = () => {
      setSecondsAgo(Math.floor((Date.now() - lastFetchedAt.getTime()) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastFetchedAt])

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Locales y Sucursales
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300 dark:text-gray-400">
            Vista general de todas las ubicaciones de la operación
            {lastFetchedAt != null && secondsAgo != null && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                · Actualizado hace {secondsAgo < 60 ? `${secondsAgo} s` : `${Math.floor(secondsAgo / 60)} min`}
              </span>
            )}
          </p>
        </div>
        {!isLogisticsRole && (
          <Link
            href="/locations/new"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            Agregar local
          </Link>
        )}
      </div>

      {/* -------- Error -------- */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
          <button
            onClick={() => fetchData()}
            className="ml-2 font-medium underline hover:no-underline dark:text-red-300"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Loading -------- */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* -------- Location Cards -------- */}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {locations.map((loc) => {
            const typeCfg =
              typeConfig[loc.type] ?? typeConfig.warehouse
            const status = loc.isActive
              ? loc.status ?? "online"
              : "offline"
            const criticalStock = loc._criticalCount ?? loc.criticalStock ?? 0
            const pendingShipments =
              loc._pendingShipments ?? loc.pendingShipments ?? 0
            const alertCount = loc._alertCount ?? loc.alertCount ?? 0

            return (
              <div
                key={loc.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 transition-shadow hover:shadow-md"
              >
                {/* Top row: name, badge, status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                      <MapPin className="h-5 w-5 text-gray-500 dark:text-gray-300" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {loc.name}
                      </h3>
                      {loc.address && (
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-300">
                          {loc.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                  </div>
                </div>

                {/* KPIs row (logística no ve Ventas hoy) */}
                <div
                  className={cn(
                    "mt-5 grid gap-3",
                    isLogisticsRole ? "grid-cols-2" : "grid-cols-3"
                  )}
                >
                  {!isLogisticsRole && (
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-300">
                        <DollarSign className="h-3 w-3" />
                        Ventas hoy
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {loc.salesToday != null && loc.salesToday > 0
                          ? formatCurrency(loc.salesToday)
                          : "N/A"}
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-300">
                      <AlertTriangle className="h-3 w-3" />
                      Stock crítico
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-sm font-semibold tabular-nums",
                        criticalStock > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {criticalStock}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-300">
                      <Truck className="h-3 w-3" />
                      Envíos pend.
                    </div>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {pendingShipments}
                    </p>
                  </div>
                </div>

                {/* Alerts count + heartbeat + link */}
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-4">
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-300">
                    {alertCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {alertCount} alerta
                        {alertCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {loc.lastHeartbeat && (
                      <span>
                        Último latido:{" "}
                        {formatTime(loc.lastHeartbeat)}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/locations/${loc.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/40"
                  >
                    Ver Dashboard
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )
          })}

          {locations.length === 0 && !loading && (
            <div className="col-span-2 flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-16">
              <Package className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-500" />
              <p className="text-sm text-gray-500 dark:text-gray-300">
                No se encontraron locales
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
