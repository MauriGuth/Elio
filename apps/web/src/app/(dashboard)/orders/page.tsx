"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Users,
  Clock,
  MapPin,
  Coffee,
  ChevronDown,
  X,
  Loader2,
  Warehouse,
  ExternalLink,
} from "lucide-react"
import { locationsApi } from "@/lib/api/locations"
import { tablesApi } from "@/lib/api/tables"
import { ordersApi } from "@/lib/api/orders"
import { cn } from "@/lib/utils"
import type { TableStatus } from "@/types"

const statusConfig: Record<
  string,
  { label: string; border: string; bg: string; text: string; dot: string }
> = {
  available: {
    label: "Libre",
    border: "border-green-300 dark:border-green-600",
    bg: "bg-green-50 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
  },
  occupied: {
    label: "Ocupada",
    border: "border-red-300 dark:border-red-600",
    bg: "bg-red-50 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  ordering: {
    label: "Pidiendo",
    border: "border-yellow-300 dark:border-yellow-600",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-300",
    dot: "bg-yellow-500",
  },
  billing: {
    label: "Cuenta",
    border: "border-blue-300 dark:border-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  reserved: {
    label: "Reservada",
    border: "border-purple-300 dark:border-purple-600",
    bg: "bg-purple-50 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-300",
    dot: "bg-purple-500",
  },
  disabled: {
    label: "Deshabilitada",
    border: "border-gray-300 dark:border-gray-600",
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-400",
    dot: "bg-gray-400",
  },
}

const DEFAULT_STATUS = statusConfig.available

function getStatusConfig(status: string | undefined) {
  return statusConfig[status ?? "available"] ?? DEFAULT_STATUS
}

export default function OrdersPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [selectedLocation, setSelectedLocation] = useState("")
  const [tables, setTables] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTables, setLoadingTables] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  // Todas las ubicaciones (locales + depósito) para el selector
  useEffect(() => {
    setLoading(true)
    setError(null)
    locationsApi
      .getAll()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.data ?? []
        setLocations(list)
        if (list.length > 0 && !selectedLocation) setSelectedLocation(list[0].id)
      })
      .catch(() => setError("Error al cargar locales"))
      .finally(() => setLoading(false))
  }, [])

  const fetchTablesAndOrders = useCallback(async () => {
    if (!selectedLocation) {
      setTables([])
      setOrders([])
      return
    }
    setLoadingTables(true)
    try {
      const [tablesData, ordersRes] = await Promise.all([
        tablesApi.getAll(selectedLocation),
        ordersApi.getAll({ locationId: selectedLocation, status: "open" }),
      ])
      const tablesList = Array.isArray(tablesData) ? tablesData : []
      const ordersList = ordersRes?.data ?? []
      setTables(tablesList)
      setOrders(ordersList)
    } catch {
      setTables([])
      setOrders([])
    } finally {
      setLoadingTables(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    fetchTablesAndOrders()
  }, [fetchTablesAndOrders])

  const ordersByTableId = useMemo(() => {
    const map: Record<string, any> = {}
    for (const o of orders) {
      if (o.tableId) map[o.tableId] = o
    }
    return map
  }, [orders])

  const tablesByZone = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const t of tables) {
      const zone = t.zone?.trim() || "General"
      if (!map[zone]) map[zone] = []
      map[zone].push(t)
    }
    return map
  }, [tables])

  const zoneNames = useMemo(() => Object.keys(tablesByZone).sort(), [tablesByZone])

  const stats = useMemo(() => {
    const occupied = tables.filter(
      (t) => t.status === "occupied" || t.status === "billing"
    ).length
    const available = tables.filter((t) => t.status === "available").length
    const ordering = tables.filter((t) => t.status === "ordering").length
    const withOrder = tables.filter((t) => ordersByTableId[t.id]).length
    const occupiedTables = tables.filter((t) => ordersByTableId[t.id])
    const avgTime =
      occupiedTables.length > 0
        ? Math.round(
            occupiedTables.reduce((sum, t) => {
              const order = ordersByTableId[t.id]
              if (!order?.openedAt) return sum
              const min = Math.floor(
                (Date.now() - new Date(order.openedAt).getTime()) / 60000
              )
              return sum + min
            }, 0) / occupiedTables.length
          )
        : 0
    return { occupied, available, ordering, withOrder, avgTime }
  }, [tables, ordersByTableId])

  const selectedTableInfo = tables.find((t) => t.id === selectedTable)
  const selectedLocationName =
    locations.find((l) => l.id === selectedLocation)?.name ?? ""
  const isDepot =
    locations.find((l) => l.id === selectedLocation)?.type === "WAREHOUSE"

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Comandas &amp; Mesas
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gestión de mesas y pedidos por local y depósito
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              aria-label="Seleccionar local o depósito"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-9 pr-8 text-sm font-medium text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                  {loc.type === "WAREHOUSE" || loc.type === "warehouse"
                    ? " (Depósito)"
                    : ""}
                </option>
              ))}
            </select>
            {isDepot ? (
              <Warehouse className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
            ) : (
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            )}
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <Link
            href={
              selectedLocation
                ? `/pos/tables?station=${isDepot ? "deposito" : "cajero"}`
                : "#"
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir POS
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loadingTables ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : !selectedLocation ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center text-gray-500 dark:text-gray-400">
          Seleccioná un local o depósito
        </div>
      ) : tables.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {isDepot
              ? "Este depósito no tiene mesas configuradas. Podés crearlas desde el POS (Mesas) o desde la API."
              : "Este local no tiene mesas. Agregá mesas desde el POS (Mesas)."}
          </p>
          <Link
            href={`/pos/tables?station=${isDepot ? "deposito" : "cajero"}`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Ir a POS Mesas <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {zoneNames.map((zoneName) => {
              const zoneTables = tablesByZone[zoneName] ?? []
              if (zoneTables.length === 0) return null
              return (
                <div
                  key={zoneName}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {zoneName}
                    </h3>
                    <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-900 dark:text-white">
                      {zoneTables.length} mesas
                    </span>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {zoneTables.map((table) => {
                      const cfg = getStatusConfig(table.status)
                      const order = ordersByTableId[table.id]
                      const isSelected = selectedTable === table.id
                      const elapsedMin = order?.openedAt
                        ? Math.floor(
                            (Date.now() - new Date(order.openedAt).getTime()) /
                              60000
                          )
                        : null

                      return (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() =>
                            setSelectedTable(
                              selectedTable === table.id ? null : table.id
                            )
                          }
                          className={cn(
                            "relative flex flex-col items-center justify-center rounded-xl border-2 transition-all",
                            cfg.border,
                            cfg.bg,
                            "px-3 py-4",
                            isSelected && "ring-2 ring-blue-500 ring-offset-2",
                            "hover:shadow-md cursor-pointer"
                          )}
                        >
                          <span
                            className={cn(
                              "font-bold",
                              cfg.text,
                              "text-lg"
                            )}
                          >
                            {table.name}
                          </span>
                          {table.status === "available" ? (
                            <span className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
                              Libre
                            </span>
                          ) : (
                            <div className="mt-1 flex flex-col items-center gap-0.5">
                              {order && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                  {order.customerCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Users className="h-3 w-3" />
                                      {order.customerCount}
                                    </span>
                                  )}
                                  {elapsedMin != null && elapsedMin > 0 && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" />
                                      {elapsedMin} min
                                    </span>
                                  )}
                                </div>
                              )}
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  cfg.text
                                )}
                              >
                                <span
                                  className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)}
                                />
                                {cfg.label}
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {selectedTableInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl border-2",
                        getStatusConfig(selectedTableInfo.status).border,
                        getStatusConfig(selectedTableInfo.status).bg
                      )}
                    >
                      <span
                        className={cn(
                          "text-lg font-bold",
                          getStatusConfig(selectedTableInfo.status).text
                        )}
                      >
                        {selectedTableInfo.name}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Mesa {selectedTableInfo.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedTableInfo.zone || "General"} · Capacidad:{" "}
                        {selectedTableInfo.capacity ?? "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar detalle de mesa"
                    onClick={() => setSelectedTable(null)}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Estado
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        getStatusConfig(selectedTableInfo.status).bg,
                        getStatusConfig(selectedTableInfo.status).text
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          getStatusConfig(selectedTableInfo.status).dot
                        )}
                      />
                      {getStatusConfig(selectedTableInfo.status).label}
                    </span>
                  </div>

                  {ordersByTableId[selectedTableInfo.id] && (
                    <>
                      <div className="flex justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Comensales
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {ordersByTableId[selectedTableInfo.id].customerCount ??
                            1}
                        </span>
                      </div>
                      {ordersByTableId[selectedTableInfo.id].openedAt && (
                        <div className="flex justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Tiempo
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {Math.floor(
                              (Date.now() -
                                new Date(
                                  ordersByTableId[selectedTableInfo.id].openedAt
                                ).getTime()) /
                                60000
                            )}{" "}
                            min
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-5 flex gap-2">
                  <Link
                    href={`/pos/tables/${selectedTableInfo.id}?station=${
                      isDepot ? "deposito" : "cajero"
                    }`}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    {selectedTableInfo.status === "available"
                      ? "Abrir mesa"
                      : "Ver comanda"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedTable(null)}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2.5 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="font-medium tabular-nums">{stats.occupied}</span>{" "}
              ocupadas
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium tabular-nums">{stats.available}</span>{" "}
              libres
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="font-medium tabular-nums">{stats.ordering}</span>{" "}
              pidiendo
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              Tiempo promedio:{" "}
              <span className="font-medium tabular-nums">{stats.avgTime} min</span>
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {isDepot ? (
                <Warehouse className="h-3.5 w-3.5" />
              ) : (
                <Coffee className="h-3.5 w-3.5" />
              )}
              {selectedLocationName}
              {isDepot ? " (Depósito)" : ""}
            </span>
          </div>

        </>
      )}
    </div>
  )
}
