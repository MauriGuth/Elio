"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import {
  Truck,
  MapPin,
  Loader2,
  AlertTriangle,
  ClipboardList,
  ShoppingCart,
} from "lucide-react"
import { stockApi } from "@/lib/api/stock"
import { locationsApi } from "@/lib/api/locations"
import { shipmentsApi } from "@/lib/api/shipments"
import { cn } from "@/lib/utils"

type Item = {
  id: string
  productId: string
  product: { id: string; name: string; sku: string | null; unit: string; avgCost: number }
  locationId: string
  location: { id: string; name: string; type: string }
  quantity: number
  minQuantity: number
  maxQuantity: number | null
  status: "critical" | "medium" | "normal"
  suggestedOrderQty: number
  soldLast7Days: number
  soldLast30Days: number
  suggestedOrderQtyByDemand: number
}

const statusConfig = {
  critical: {
    label: "Crítico",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-800 dark:text-red-200",
    dot: "bg-red-500",
  },
  medium: {
    label: "Bajo",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  normal: {
    label: "Normal",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
}

function isWarehouseLocation(type?: string) {
  return type === "WAREHOUSE" || String(type ?? "").toLowerCase() === "warehouse"
}

export default function LogisticsSummaryPage() {
  const router = useRouter()
  const [locations, setLocations] = useState<Array<{ id: string; name: string; type?: string }>>([])
  const [locationId, setLocationId] = useState("")
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlyNeedsReorder, setOnlyNeedsReorder] = useState(true)
  const [creatingOrderForLocationId, setCreatingOrderForLocationId] = useState<string | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await stockApi.getLogisticsSummary(locationId || undefined)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el resumen")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    locationsApi.getAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as any)?.data ?? []
      setLocations(list)
    }).catch(() => {})
  }, [])

  const retailLocations = useMemo(
    () => locations.filter((l) => !isWarehouseLocation(l.type)),
    [locations],
  )

  useEffect(() => {
    if (!locationId) return
    const loc = locations.find((l) => l.id === locationId)
    if (loc && isWarehouseLocation(loc.type)) setLocationId("")
  }, [locations, locationId])

  const byLocation = items.reduce<Record<string, Item[]>>((acc, item) => {
    const key = item.locationId
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const locationOrder = Object.keys(byLocation)
    .map((id) => {
      const first = byLocation[id][0]
      return { id, name: first.location.name, type: first.location.type }
    })
    .sort((a, b) => {
      const isWh = (t?: string) =>
        t === "WAREHOUSE" || String(t).toLowerCase() === "warehouse"
      if (locationId) {
        return isWh(a.type) - isWh(b.type) || a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })

  const filteredByLocation = locationOrder.map((loc) => ({
    location: loc,
    items: (byLocation[loc.id] ?? []).filter(
      (i) => !onlyNeedsReorder || i.status === "critical" || i.status === "medium"
    ),
  })).filter((g) => g.items.length > 0)

  const depotId = locations.find((l) => l.type === "WAREHOUSE")?.id ?? null

  const handleHacerPedido = useCallback(
    async (destinationLocId: string, destinationItems: Item[]) => {
      if (!depotId || depotId === destinationLocId) {
        setOrderError("No hay depósito configurado o el destino es el depósito.")
        return
      }
      const itemsToSend = destinationItems
        .map((row) => {
          const qty = Math.max(row.suggestedOrderQty ?? 0, row.suggestedOrderQtyByDemand ?? 0)
          return qty > 0 ? { productId: row.productId, sentQty: Math.max(0.01, Math.ceil(qty)) } : null
        })
        .filter((x): x is { productId: string; sentQty: number } => x !== null)
      if (itemsToSend.length === 0) {
        setOrderError("No hay cantidades sugeridas para este local. Revisá mín/máx o demanda.")
        return
      }
      setCreatingOrderForLocationId(destinationLocId)
      setOrderError(null)
      try {
        await shipmentsApi.create({
          originId: depotId,
          destinationId: destinationLocId,
          notes: "Pedido generado desde Resumen para logística",
          items: itemsToSend,
        })
        sileo.success({ title: "Pedido creado correctamente" })
        router.push("/logistics")
      } catch (err: any) {
        const msg = err?.message ?? "Error al crear el envío"
        setOrderError(msg)
        sileo.error({ title: msg })
      } finally {
        setCreatingOrderForLocationId(null)
      }
    },
    [depotId, router]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Resumen para logística
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Stock por local y sugerencia de pedido (mín/máx y demanda). El depósito no aparece acá: esta vista es solo para sucursales / negocios.
          </p>
        </div>
        <Link
          href="/logistics"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Truck className="h-4 w-4" />
          Ver envíos en Logística
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Local
          </label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm"
            aria-label="Filtrar por local"
          >
            <option value="">Todos los locales</option>
            {retailLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-6">
          <input
            type="checkbox"
            checked={onlyNeedsReorder}
            onChange={(e) => setOnlyNeedsReorder(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Solo productos críticos o bajo mínimo
          </span>
        </label>
      </div>

      {(error || orderError) && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p>{error ?? orderError}</p>
          {orderError?.includes("Logística y Envíos") ? (
            <Link
              href="/logistics"
              className="mt-2 inline-flex font-medium text-red-800 underline hover:text-red-900 dark:text-red-200 dark:hover:text-white"
            >
              Ir a Logística y Envíos
            </Link>
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-8">
          {filteredByLocation.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                {onlyNeedsReorder
                  ? "No hay productos críticos o bajo mínimo en el período seleccionado."
                  : "No hay stock cargado para los filtros elegidos."}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Ajustá el local o desmarcá &quot;Solo productos críticos o bajo mínimo&quot; para ver todo el stock.
              </p>
            </div>
          ) : (
            filteredByLocation.map(({ location, items: locationItems }) => (
              <div
                key={location.id}
                className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                  <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {location.name}
                    {location.type === "WAREHOUSE" && (
                      <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                        (Depósito)
                      </span>
                    )}
                  </h2>
                  <span className="ml-2 rounded-full bg-gray-200 dark:bg-gray-600 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                    {locationItems.length} producto{locationItems.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-right">Actual</th>
                        <th className="px-4 py-3 text-right">Mín.</th>
                        <th className="px-4 py-3 text-right">Máx.</th>
                        <th className="px-4 py-3 text-right" title="Ventas últimos 7 días">Ventas 7d</th>
                        <th className="px-4 py-3 text-right" title="Ventas últimos 30 días">Ventas 30d</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3 text-right">Sug. (mín/máx)</th>
                        <th className="px-4 py-3 text-right">Sug. (por demanda)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {locationItems.map((row) => {
                        const config = statusConfig[row.status]
                        return (
                          <tr
                            key={row.id}
                            className="text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {row.product.name}
                              </p>
                              {row.product.sku && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {row.product.sku} · {row.product.unit}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {Number(row.quantity).toLocaleString("es-AR")}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                              {Number(row.minQuantity).toLocaleString("es-AR")}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                              {row.maxQuantity != null
                                ? Number(row.maxQuantity).toLocaleString("es-AR")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                              {(row.soldLast7Days ?? 0) > 0
                                ? Number(row.soldLast7Days).toLocaleString("es-AR")
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                              {(row.soldLast30Days ?? 0) > 0
                                ? Number(row.soldLast30Days).toLocaleString("es-AR")
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                                  config.bg,
                                  config.text
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
                                {config.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.suggestedOrderQty > 0 ? (
                                <span className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300 tabular-nums">
                                  {Number(row.suggestedOrderQty).toLocaleString("es-AR")}{" "}
                                  {row.product.unit}
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.suggestedOrderQtyByDemand > 0 ? (
                                <span className="inline-flex items-center gap-1 font-medium text-violet-700 dark:text-violet-300 tabular-nums" title="Para cubrir ~7 días de ventas recientes">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  {Number(row.suggestedOrderQtyByDemand).toLocaleString("es-AR")}{" "}
                                  {row.product.unit}
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {location.type !== "WAREHOUSE" && depotId && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleHacerPedido(location.id, locationItems)}
                      disabled={creatingOrderForLocationId === location.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creatingOrderForLocationId === location.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-4 w-4" />
                      )}
                      Hacer pedido (desde depósito → {location.name})
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {(items.some((i) => i.suggestedOrderQty > 0) || items.some((i) => i.suggestedOrderQtyByDemand > 0)) && (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Sug. (mín/máx):</strong> cantidad para llevar el stock al máximo definido (o al doble del mínimo si no hay máximo).
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-4 py-3">
                <p className="text-sm text-violet-800 dark:text-violet-200">
                  <strong>Sug. (por demanda):</strong> según ventas reales de los últimos 7 días — cantidad sugerida para tener stock suficiente para cubrir ese consumo. Combiná con mín/máx para afinar el pedido.
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los pedidos de logística pueden basarse en demanda; no todos los días tendrán la misma cantidad de viajes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
