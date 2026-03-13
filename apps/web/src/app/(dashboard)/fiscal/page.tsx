"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Receipt,
  RotateCcw,
  RefreshCw,
  X,
} from "lucide-react"
import { locationsApi } from "@/lib/api/locations"
import { ordersApi } from "@/lib/api/orders"
import { arcaApi } from "@/lib/api/arca"
import { cn } from "@/lib/utils"

const fiscalStatusConfig: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: typeof AlertCircle }
> = {
  pending: {
    label: "Pendiente",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    icon: Clock,
  },
  processing: {
    label: "Procesando",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    icon: Loader2,
  },
  issued: {
    label: "Emitido",
    bg: "bg-green-50 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
    icon: CheckCircle2,
  },
  error: {
    label: "Error",
    bg: "bg-red-50 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    icon: AlertCircle,
  },
  disabled: {
    label: "Deshabilitado",
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-300",
    border: "border-gray-200 dark:border-gray-700",
    icon: AlertCircle,
  },
  skipped: {
    label: "Omitido",
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-300",
    border: "border-gray-200 dark:border-gray-700",
    icon: AlertCircle,
  },
}

function getFiscalStatusConfig(status: string | undefined) {
  return fiscalStatusConfig[status ?? "pending"] ?? fiscalStatusConfig.pending
}

function formatInvoiceType(value: string | undefined) {
  if (value === "factura_a") return "Factura A"
  if (value === "factura_b") return "Factura B"
  if (value === "factura_c") return "Factura C"
  return "Consumidor final"
}

/** AFIP devuelve fechas en YYYYMMDD; formatear para mostrar sin "Invalid Date". */
function formatAfipDate(value: string | undefined | null): string {
  if (!value) return "—"
  const s = String(value).replace(/\D/g, "")
  if (s.length >= 8) {
    const y = s.slice(0, 4)
    const m = s.slice(4, 6)
    const d = s.slice(6, 8)
    const date = new Date(`${y}-${m}-${d}`)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("es-AR")
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-AR")
}

export default function FiscalPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [selectedLocation, setSelectedLocation] = useState("")
  const [closedOrders, setClosedOrders] = useState<any[]>([])
  const [fiscalStatuses, setFiscalStatuses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [loadingFiscal, setLoadingFiscal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)
  const [refreshIconSpinning, setRefreshIconSpinning] = useState(false)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)
  const [viewingOrderDetail, setViewingOrderDetail] = useState<any | null>(null)
  const [loadingViewDetail, setLoadingViewDetail] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean
    message: string
    afip?: { codAutorizacion?: string; caeVto?: string; impTotal?: number }
    caeMatch?: boolean
  } | null>(null)
  const [loadingVerify, setLoadingVerify] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    locationsApi
      .getAll()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.data ?? []
        setLocations(list)
        if (list.length > 0) {
          const firstNonWarehouse =
            list.find((loc: any) => loc.type !== "WAREHOUSE") ?? list[0]
          setSelectedLocation(firstNonWarehouse.id)
        }
      })
      .catch(() => setError("Error al cargar locales"))
      .finally(() => setLoading(false))
  }, [])

  const fetchFiscalOrders = useCallback(async () => {
    if (!selectedLocation) {
      setClosedOrders([])
      setFiscalStatuses({})
      return
    }

    setLoadingFiscal(true)
    setError(null)

    try {
      const closedOrdersRes = await ordersApi.getAll({
        locationId: selectedLocation,
        status: "closed",
        limit: 20,
      })
      const recentClosedOrders = closedOrdersRes?.data ?? []
      setClosedOrders(recentClosedOrders)

      if (recentClosedOrders.length === 0) {
        setFiscalStatuses({})
        return
      }

      const entries = await Promise.all(
        recentClosedOrders.map(async (order) => {
          try {
            const status = await arcaApi.getOrderStatus(order.id)
            return [order.id, status] as const
          } catch (err) {
            return [
              order.id,
              {
                orderId: order.id,
                orderNumber: order.orderNumber,
                fiscalStatus: order.fiscalStatus ?? "pending",
                fiscalLastError:
                  err instanceof Error
                    ? err.message
                    : "No se pudo cargar el estado fiscal.",
                voucher: null,
              },
            ] as const
          }
        })
      )

      setFiscalStatuses(Object.fromEntries(entries))
    } catch (err) {
      setClosedOrders([])
      setFiscalStatuses({})
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el estado fiscal."
      )
    } finally {
      setLoadingFiscal(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    fetchFiscalOrders()
  }, [fetchFiscalOrders])

  /* Al abrir el detalle, cargar la orden completa con ítems */
  useEffect(() => {
    if (!viewingOrderId) {
      setViewingOrderDetail(null)
      setVerifyResult(null)
      return
    }
    setVerifyResult(null)
    setLoadingViewDetail(true)
    setViewingOrderDetail(null)
    ordersApi
      .getById(viewingOrderId)
      .then((data) => {
        const order = (data as any)?.data ?? data
        setViewingOrderDetail(order)
      })
      .catch(() => setViewingOrderDetail(null))
      .finally(() => setLoadingViewDetail(false))
  }, [viewingOrderId])

  const handleRetryFiscal = useCallback(
    async (orderId: string) => {
      setRetryingOrderId(orderId)
      setError(null)
      try {
        const status = await arcaApi.retryOrder(orderId)
        setFiscalStatuses((prev) => ({ ...prev, [orderId]: status }))
        await fetchFiscalOrders()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo reintentar la emisión fiscal."
        )
        try {
          const status = await arcaApi.getOrderStatus(orderId)
          setFiscalStatuses((prev) => ({ ...prev, [orderId]: status }))
        } catch {
          // noop
        }
      } finally {
        setRetryingOrderId(null)
      }
    },
    [fetchFiscalOrders]
  )

  const summary = useMemo(() => {
    const values = Object.values(fiscalStatuses)
    return {
      issued: values.filter((item: any) => item?.fiscalStatus === "issued").length,
      pending: values.filter((item: any) => item?.fiscalStatus === "pending").length,
      processing: values.filter((item: any) => item?.fiscalStatus === "processing").length,
      error: values.filter((item: any) => item?.fiscalStatus === "error").length,
    }
  }, [fiscalStatuses])

  const selectedLocationName =
    locations.find((loc) => loc.id === selectedLocation)?.name ?? ""

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Fiscalización ARCA
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Seguimiento de emisión fiscal, CAE, errores y reintentos por local.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              aria-label="Seleccionar local"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-9 pr-8 text-sm font-medium text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshIconSpinning(true)
              fetchFiscalOrders()
              setTimeout(() => setRefreshIconSpinning(false), 600)
            }}
            disabled={loadingFiscal}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-[1.02] hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 disabled:hover:scale-100"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                (loadingFiscal || refreshIconSpinning) && "animate-spin"
              )}
            />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
          <p className="text-sm text-green-700 dark:text-green-300">Emitidas</p>
          <p className="mt-1 text-2xl font-bold text-green-800 dark:text-green-200">
            {summary.issued}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-300">Pendientes</p>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
            {summary.pending}
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">Procesando</p>
          <p className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
            {summary.processing}
          </p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm text-red-700 dark:text-red-300">Con error</p>
          <p className="mt-1 text-2xl font-bold text-red-800 dark:text-red-200">
            {summary.error}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Comprobantes recientes
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Local seleccionado: {selectedLocationName || "Sin local"}
            </p>
          </div>
          {loadingFiscal && (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando datos fiscales
            </span>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {closedOrders.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No hay órdenes cerradas recientes para este local.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {closedOrders.map((order) => {
              const fiscal = fiscalStatuses[order.id]
              const fiscalStatus = fiscal?.fiscalStatus ?? order.fiscalStatus
              const fiscalCfg = getFiscalStatusConfig(fiscalStatus)
              const FiscalIcon = fiscalCfg.icon
              const voucher = fiscal?.voucher
              const canRetry =
                fiscalStatus === "error" ||
                fiscalStatus === "pending" ||
                fiscalStatus === "disabled"

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {order.orderNumber}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            fiscalCfg.bg,
                            fiscalCfg.text,
                            fiscalCfg.border
                          )}
                        >
                          <FiscalIcon
                            className={cn(
                              "h-3.5 w-3.5",
                              fiscalStatus === "processing" && "animate-spin"
                            )}
                          />
                          {fiscalCfg.label}
                        </span>
                        <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200">
                          {formatInvoiceType(
                            voucher?.invoiceType ?? order.invoiceType ?? undefined
                          )}
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm text-gray-600 dark:text-gray-400 sm:grid-cols-2 xl:grid-cols-5">
                        <div>
                          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500">
                            Mesa
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {order.table?.name ?? "Sin mesa"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500">
                            Total
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            ${Number(order.total ?? 0).toLocaleString("es-AR")}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500">
                            CAE
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {voucher?.cae ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500">
                            Comprobante
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {voucher?.cbteDesde
                              ? `${voucher.ptoVta ?? "—"}-${String(voucher.cbteDesde).padStart(8, "0")}`
                              : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-500">
                            Vencimiento CAE
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {voucher?.caeVto
                              ? new Date(voucher.caeVto).toLocaleDateString("es-AR")
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {(fiscal?.fiscalLastError || voucher?.errorMessage) && (
                        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                          {voucher?.errorMessage ?? fiscal?.fiscalLastError}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingOrderId(order.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                        Ver
                      </button>
                      {canRetry && (
                        <button
                          type="button"
                          onClick={() => handleRetryFiscal(order.id)}
                          disabled={retryingOrderId === order.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {retryingOrderId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          Reintentar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal detalle de factura */}
      {viewingOrderId && (() => {
        const orderFromList = closedOrders.find((o) => o.id === viewingOrderId)
        const order = viewingOrderDetail ?? orderFromList
        const fiscal = orderFromList ? fiscalStatuses[orderFromList.id] : null
        const voucher = fiscal?.voucher
        const fiscalStatus = fiscal?.fiscalStatus ?? order?.fiscalStatus
        const fiscalCfg = getFiscalStatusConfig(fiscalStatus)
        if (!orderFromList) return null
        const items = (viewingOrderDetail?.items ?? order?.items ?? []) as any[]
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => { setViewingOrderId(null); setViewingOrderDetail(null) }}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Detalle de factura · {order.orderNumber ?? orderFromList.orderNumber}
                </h2>
                <button
                  type="button"
                  onClick={() => { setViewingOrderId(null); setViewingOrderDetail(null) }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Estado</span>
                    <span className={cn("font-medium", fiscalCfg.text)}>{fiscalCfg.label}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Comprobante</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatInvoiceType(voucher?.invoiceType ?? order.invoiceType ?? undefined)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Mesa</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {order.table?.name ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Fecha cierre</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {order.closedAt
                        ? new Date(order.closedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                        : "—"}
                    </span>
                  </div>
                </div>
                {order.customer && (voucher?.invoiceType === "factura_a" || order.invoiceType === "factura_a") && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-3">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cliente (Factura A)</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {order.customer?.legalName ?? order.customer?.name ?? "—"}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      CUIT {order.customer?.cuit ?? "—"}
                    </p>
                  </div>
                )}
                <div>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Ítems</span>
                  {loadingViewDetail ? (
                    <div className="flex items-center gap-2 py-4 text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando productos...
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600 text-left text-xs text-gray-500">
                          <th className="pb-2">Producto</th>
                          <th className="pb-2 w-14 text-right">Cant.</th>
                          <th className="pb-2 w-20 text-right">P.unit</th>
                          <th className="pb-2 w-24 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i: any) => {
                          const qty = i.quantity ?? 1
                          const up = i.unitPrice ?? (i.totalPrice ?? 0) / qty
                          const total = i.totalPrice ?? up * qty
                          return (
                            <tr key={i.id} className="border-b border-gray-100 dark:border-gray-700">
                              <td className="py-2 text-gray-900 dark:text-white">{i.productName ?? i.product?.name ?? "—"}</td>
                              <td className="py-2 text-right">{qty}</td>
                              <td className="py-2 text-right">${Number(up).toLocaleString("es-AR")}</td>
                              <td className="py-2 text-right font-medium">${Number(total).toLocaleString("es-AR")}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex justify-end border-t border-gray-200 dark:border-gray-600 pt-2">
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    Total: ${Number(order.total ?? 0).toLocaleString("es-AR")}
                  </p>
                </div>
                {(voucher?.cae || voucher?.cbteDesde || voucher?.caeVto) && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-3 space-y-1">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Datos fiscales</span>
                    {voucher.cae && <p><span className="text-gray-500 dark:text-gray-400">CAE:</span> {voucher.cae}</p>}
                    {voucher.cbteDesde != null && (
                      <p>
                        <span className="text-gray-500 dark:text-gray-400">Comprobante:</span>{" "}
                        {voucher.ptoVta ?? "—"}-{String(voucher.cbteDesde).padStart(8, "0")}
                      </p>
                    )}
                    {voucher.caeVto && (
                      <p>
                        <span className="text-gray-500 dark:text-gray-400">Vencimiento CAE:</span>{" "}
                        {new Date(voucher.caeVto).toLocaleDateString("es-AR")}
                      </p>
                    )}
                  </div>
                )}
                {(fiscal?.fiscalLastError || voucher?.errorMessage) && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {voucher?.errorMessage ?? fiscal?.fiscalLastError}
                  </div>
                )}
                {voucher?.cae != null && voucher?.cbteDesde != null && (
                  <>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 p-3">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!viewingOrderId) return
                          setLoadingVerify(true)
                          setVerifyResult(null)
                          try {
                            const res = await arcaApi.verifyOrder(viewingOrderId)
                            const data = (res as any)?.data ?? res
                            setVerifyResult({
                              verified: !!data.verified,
                              message: data.message ?? (data.verified ? "Verificado en AFIP" : "Error"),
                              afip: data.afip,
                              caeMatch: data.caeMatch,
                            })
                          } catch {
                            setVerifyResult({
                              verified: false,
                              message: "No se pudo consultar AFIP. Revisá que ARCA esté habilitado y el comprobante esté emitido.",
                            })
                          } finally {
                            setLoadingVerify(false)
                          }
                        }}
                        disabled={loadingVerify}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60"
                      >
                        {loadingVerify ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Receipt className="h-4 w-4" />
                        )}
                        Verificar en AFIP
                      </button>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Consulta en AFIP que este comprobante figure correctamente (FECompConsultar).
                      </p>
                    </div>
                    {verifyResult && (
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm",
                          verifyResult.verified && verifyResult.caeMatch !== false
                            ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                            : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200"
                        )}
                      >
                        <p className="font-medium">{verifyResult.verified && verifyResult.caeMatch !== false ? "Verificado en AFIP" : "Resultado"}</p>
                        <p className="mt-0.5">{verifyResult.message}</p>
                        {verifyResult.afip?.caeVto && (
                          <p className="mt-1 text-xs opacity-90">CAE vto. AFIP: {formatAfipDate(verifyResult.afip.caeVto)}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setViewingOrderId(null); setViewingOrderDetail(null); setVerifyResult(null) }}
                  className="rounded-xl bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
