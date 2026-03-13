"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Truck,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  MapPin,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { cn, formatDate, formatDateOnly, formatTime, formatNumber } from "@/lib/utils"

// Usar la ruta API del mismo origen (proxy al backend) para evitar problemas de URL/CORS
const SHIPMENT_API_PATH = "/api/shipment"

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: { label: "Borrador", bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
  prepared: { label: "Preparado", bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  dispatched: { label: "Despachado", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "En Tránsito", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  reception_control: { label: "Control de recepción", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  delivered: { label: "Entregado", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  received: { label: "Recibido", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  received_with_diff: { label: "Recibido con Diferencia", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  closed: { label: "Cerrado", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-600" },
  cancelled: { label: "Cancelado", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
}

const progressSteps = [
  { key: "draft", label: "Creado" },
  { key: "prepared", label: "Preparado" },
  { key: "dispatched", label: "Despachado" },
  { key: "in_transit", label: "En Tránsito" },
  { key: "reception_control", label: "Control de recepción" },
  { key: "received", label: "Recibido" },
]

const statusOrder: Record<string, number> = {
  draft: 0,
  prepared: 1,
  dispatched: 2,
  in_transit: 3,
  reception_control: 4,
  delivered: 5,
  received: 5,
  received_with_diff: 5,
  closed: 5,
  cancelled: -1,
}

export default function ShipmentPublicPage() {
  const params = useParams()
  const number = (typeof params.number === "string" ? params.number : "").trim()
  const [shipment, setShipment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!number) {
      setLoading(false)
      setError("Número de envío no válido")
      return
    }
    setLoading(true)
    setError(null)
    fetch(`${SHIPMENT_API_PATH}/${encodeURIComponent(number)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Envío no encontrado")
          throw new Error("Error al cargar el envío")
        }
        return res.json()
      })
      .then(setShipment)
      .catch((e) => setError(e.message || "Error"))
      .finally(() => setLoading(false))
  }, [number])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600">Cargando detalle del envío...</p>
      </div>
    )
  }

  if (error || !shipment) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center max-w-sm">
          <p className="font-medium text-red-800">{error || "Envío no encontrado"}</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>
      </div>
    )
  }

  const status = (shipment.status || "draft") as string
  const cfg = statusConfig[status] || statusConfig.draft
  const currentStep = statusOrder[status] ?? -1
  const isReceived = status === "received" || status === "received_with_diff"
  const originName = shipment.origin?.name ?? "—"
  const destName = shipment.destination?.name ?? "—"
  const createdByName =
    shipment.createdBy?.firstName && shipment.createdBy?.lastName
      ? `${shipment.createdBy.firstName} ${shipment.createdBy.lastName}`.trim()
      : "—"

  const items: {
    id: string
    productName: string
    sentQty: number
    receivedQty?: number
    difference?: number
    diffReason?: string
    unit?: string
  }[] = (shipment.items || []).map((item: any) => ({
    id: item.id || item.productId || item.product?.id,
    productName: item.product?.name ?? "—",
    sentQty: item.sentQty ?? 0,
    receivedQty: item.receivedQty,
    difference:
      item.difference ??
      (item.receivedQty != null ? (item.sentQty ?? 0) - item.receivedQty : undefined),
    diffReason: item.diffReason,
    unit: item.product?.unit,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        {/* Header */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-2xl font-bold text-gray-900">{shipment.shipmentNumber}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900">{originName}</span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{destName}</span>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.bg, cfg.text)}>
              <span className={cn("flex h-1.5 w-1.5 rounded-full", cfg.dot)} />
              {cfg.label}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400">Creado</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {shipment.createdAt ? formatDate(shipment.createdAt) : "—"}
              </p>
            </div>
            {shipment.dispatchedAt && (
              <div>
                <p className="text-xs text-gray-400">Despachado</p>
                <p className="mt-0.5 font-semibold text-gray-900">{formatTime(shipment.dispatchedAt)}</p>
              </div>
            )}
            {shipment.receivedAt && (
              <div>
                <p className="text-xs text-gray-400">Recibido</p>
                <p className="mt-0.5 font-semibold text-green-600">{formatTime(shipment.receivedAt)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Creado por</p>
              <p className="mt-0.5 font-semibold text-gray-900">{createdByName}</p>
            </div>
          </div>
        </div>

        {/* Tiempo de llegada (depósito → local) */}
        {shipment.dispatchedAt &&
          shipment.receptionControlStartedAt &&
          (status === "reception_control" || status === "received" || status === "received_with_diff") && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Tiempo de llegada (depósito → local)</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-gray-400">Despachado</p>
                <p className="mt-0.5 font-medium text-gray-900">{formatTime(shipment.dispatchedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Llegada al local (inicio control)</p>
                <p className="mt-0.5 font-medium text-gray-900">{formatTime(shipment.receptionControlStartedAt)}</p>
              </div>
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                {Math.round(
                  (new Date(shipment.receptionControlStartedAt).getTime() -
                    new Date(shipment.dispatchedAt).getTime()) /
                    60000
                )}{" "}
                min
              </span>
            </div>
          </div>
        )}

        {/* Tiempo de control de recepción (demora en controlar el pedido) */}
        {(status === "received" || status === "received_with_diff") &&
          shipment.receptionControlStartedAt &&
          shipment.receptionControlCompletedAt && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Tiempo de control de recepción</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-gray-400">Inicio control</p>
                <p className="mt-0.5 font-medium text-gray-900">{formatTime(shipment.receptionControlStartedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Recepción confirmada</p>
                <p className="mt-0.5 font-medium text-gray-900">{formatTime(shipment.receptionControlCompletedAt)}</p>
              </div>
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                Demoró{" "}
                {Math.round(
                  (new Date(shipment.receptionControlCompletedAt).getTime() -
                    new Date(shipment.receptionControlStartedAt).getTime()) /
                    60000
                )}{" "}
                min en controlar el pedido
              </span>
            </div>
          </div>
        )}

        {/* Tiempo de entrega (cuando no se usó control de recepción) */}
        {shipment.dispatchedAt &&
          (shipment.receivedAt || shipment.actualArrivalAt) &&
          !shipment.receptionControlStartedAt && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Tiempo de entrega</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-gray-400">Despachado</p>
                <p className="mt-0.5 font-medium text-gray-900">{formatTime(shipment.dispatchedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Recibido</p>
                <p className="mt-0.5 font-medium text-gray-900">
                  {formatTime(shipment.actualArrivalAt ?? shipment.receivedAt)}
                </p>
              </div>
              {(() => {
                const receivedTime = (shipment.actualArrivalAt ?? shipment.receivedAt) as string
                const dispatched = new Date(shipment.dispatchedAt).getTime()
                const received = new Date(receivedTime).getTime()
                const durationMin = Math.round((received - dispatched) / 60000)
                return (
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    Tardó {durationMin} min desde el despacho
                  </span>
                )
              })()}
            </div>
          </div>
        )}

        {/* Ruta */}
        {(shipment.estimatedDurationMin != null || shipment.origin?.address || shipment.destination?.address) && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Ruta</h3>
            <div className="flex flex-wrap items-center gap-3">
              {shipment.estimatedDurationMin != null && (
                <span className="text-sm text-gray-600">Tiempo estimado: {shipment.estimatedDurationMin} min</span>
              )}
              {(shipment.origin?.address || shipment.destination?.address) && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(shipment.origin?.address || "")}&destination=${encodeURIComponent(shipment.destination?.address || "")}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <MapPin className="h-4 w-4" />
                  Ver ruta en Google Maps
                </a>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {status !== "cancelled" && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Progreso del envío</h3>
            </div>
            <div className="relative flex items-center justify-between">
              <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-gray-200" />
              <div
                className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, (currentStep / (progressSteps.length - 1)) * 100))}%` }}
              />
              {progressSteps.map((step, i) => {
                const isLastStep = i === progressSteps.length - 1
                const isCompleted = i < currentStep || (isLastStep && isReceived)
                const isCurrent = i === currentStep && !(isLastStep && isReceived)
                return (
                  <div key={step.key} className="relative z-10 flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border-2",
                        isCompleted && "border-blue-500 bg-blue-500 text-white",
                        isCurrent && "border-blue-500 bg-white text-blue-600 ring-4 ring-blue-100",
                        !isCompleted && !isCurrent && "border-gray-200 bg-white text-gray-400"
                      )}
                    >
                      {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : isCurrent ? <Truck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </div>
                    <p className={cn("mt-2 text-xs font-medium", isCurrent ? "text-blue-600" : isCompleted ? "text-gray-900" : "text-gray-400")}>
                      {step.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Detalle de ítems</h3>
            <span className="text-xs text-gray-400">{items.length} producto{items.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Producto</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cant. enviada</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cant. recibida</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Diferencia</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hasReceived = item.receivedQty != null
                  const hasDiff = item.difference != null && item.difference !== 0
                  return (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {formatNumber(item.sentQty)} {item.unit ?? ""}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {hasReceived ? `${formatNumber(item.receivedQty!)} ${item.unit ?? ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasReceived ? (
                          <span className={cn("font-medium tabular-nums", hasDiff ? "text-red-600" : "text-green-600")}>
                            {hasDiff ? item.difference : "0"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasReceived ? (
                          hasDiff ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
                              <AlertTriangle className="h-3.5 w-3.5" /> Diferencia
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> OK
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                      No hay ítems en este envío
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {items.some((i) => i.diffReason) && (
            <div className="mt-4 space-y-2">
              {items.filter((i) => i.diffReason).map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <p className="text-xs text-orange-700">
                    <span className="font-medium">{item.productName}:</span> {item.diffReason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recepción registrada */}
        {(shipment.receivedByName || shipment.receivedBySignature || shipment.receptionNotes) && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recepción registrada</h3>
            <div className="flex flex-wrap gap-4">
              {shipment.receivedByName && (
                <div>
                  <p className="text-xs text-gray-400">Recibido por</p>
                  <p className="mt-0.5 font-medium text-gray-900">{shipment.receivedByName}</p>
                </div>
              )}
              {shipment.receivedBySignature && (
                <div className="w-full">
                  <p className="mb-2 text-xs text-gray-400">Firma de quien recibió</p>
                  <img
                    src={shipment.receivedBySignature}
                    alt="Firma de quien recibió el pedido"
                    className="max-h-24 rounded-lg border border-gray-200 bg-white object-contain p-1"
                  />
                </div>
              )}
              {shipment.receptionNotes && (
                <div className="w-full">
                  <p className="text-xs text-gray-400">Observaciones</p>
                  <p className="mt-0.5 text-sm text-gray-900 whitespace-pre-wrap">{shipment.receptionNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">Detalle del envío · Nova</p>
      </div>
    </div>
  )
}
