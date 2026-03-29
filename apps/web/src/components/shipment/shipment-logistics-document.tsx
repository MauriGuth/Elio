"use client"

import {
  ArrowRight,
  Truck,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  MapPin,
  AlertTriangle,
} from "lucide-react"
import { cn, formatDate, formatNumber, formatTime } from "@/lib/utils"

function locationNavPoint(loc: any): string | null {
  if (!loc) return null
  if (loc.latitude != null && loc.longitude != null) {
    return `${loc.latitude},${loc.longitude}`
  }
  const a = (loc.address || "").trim()
  return a || null
}

function shipmentOriginNavPoint(shipment: any): string | null {
  const ps = shipment?.pickupSupplier
  if (ps) {
    if (ps.latitude != null && ps.longitude != null) {
      return `${ps.latitude},${ps.longitude}`
    }
    const pa = (ps.address || "").trim()
    if (pa) return pa
  }
  return locationNavPoint(shipment?.origin)
}

function addressOrCoords(ent: any): string | undefined {
  if (!ent) return undefined
  const a = String(ent.address ?? "").trim()
  if (a) return a
  if (ent.latitude != null && ent.longitude != null) {
    return `${ent.latitude}, ${ent.longitude}`
  }
  return undefined
}

function stopNavPoint(stop: any): string | null {
  if (!stop) return null
  if (stop.pickupSupplier) {
    const ps = stop.pickupSupplier
    if (ps.latitude != null && ps.longitude != null) {
      return `${ps.latitude},${ps.longitude}`
    }
    const pa = (ps.address || "").trim()
    if (pa) return pa
  }
  return locationNavPoint(stop.location)
}

function stopTitleDoc(stop: any): string {
  if (!stop) return "—"
  const n = stop.pickupSupplier?.name?.trim()
  if (n) return n
  return stop.location?.name || "—"
}

function stopSubtitleDoc(stop: any): string | undefined {
  if (!stop) return undefined
  if (stop.pickupSupplier) return addressOrCoords(stop.pickupSupplier)
  return addressOrCoords(stop.location)
}

type RouteSegLine = { line1: string; line2?: string }

function routeSegmentsFromShipment(shipment: any): RouteSegLine[] {
  const out: RouteSegLine[] = []
  let line1 = shipment?.origin?.name || "—"
  const ps0 = shipment?.pickupSupplier
  if (ps0?.name?.trim()) {
    line1 = `${line1} — ${ps0.name.trim()}`
  }
  const sub0 = addressOrCoords(ps0) || addressOrCoords(shipment?.origin)
  out.push(sub0 ? { line1, line2: sub0 } : { line1 })

  if (shipment?.isMultiStop && Array.isArray(shipment.stops) && shipment.stops.length > 0) {
    const ordered = [...shipment.stops].sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    for (const s of ordered) {
      if (s.pickupSupplier) {
        const n = s.pickupSupplier.name?.trim() || "Proveedor"
        const sub = addressOrCoords(s.pickupSupplier)
        out.push(sub ? { line1: n, line2: sub } : { line1: n })
      } else {
        const n = s.location?.name || "—"
        const sub = addressOrCoords(s.location)
        out.push(sub ? { line1: n, line2: sub } : { line1: n })
      }
    }
    return out
  }
  const d1 = shipment?.destination?.name || "—"
  const d2 = addressOrCoords(shipment?.destination)
  out.push(d2 ? { line1: d1, line2: d2 } : { line1: d1 })
  return out
}

function multiStopFullRouteMapsUrl(shipment: any): string | null {
  const o = shipmentOriginNavPoint(shipment)
  if (!shipment?.isMultiStop || !Array.isArray(shipment.stops) || shipment.stops.length < 2) {
    return null
  }
  const ordered = [...shipment.stops].sort(
    (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  const last = ordered[ordered.length - 1]
  const d = stopNavPoint(last) || locationNavPoint(shipment.destination)
  if (!o || !d) return null
  const mids = ordered
    .slice(0, -1)
    .map((s: any) => stopNavPoint(s))
    .filter((pt): pt is string => Boolean(pt))
    .map((a) => encodeURIComponent(a))
  const wp = mids.length > 0 ? `&waypoints=${mids.join("%7C")}` : ""
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}${wp}&travelmode=driving`
}

function singleLegMapsUrl(shipment: any): string {
  const o = shipmentOriginNavPoint(shipment) || ""
  const d = locationNavPoint(shipment?.destination) || ""
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`
}

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: { label: "Borrador", bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400" },
  prepared: { label: "Preparado", bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  dispatched: { label: "Despachado", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "En Tránsito", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  reception_control: {
    label: "Tiempo de control de recepción",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  delivered: { label: "Entregado", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  received: { label: "Recibido", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  received_with_diff: {
    label: "Recibido con Diferencia",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  closed: { label: "Cerrado", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-600" },
  cancelled: { label: "Cancelado", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
}

const progressSteps = [
  { key: "draft", label: "Creado" },
  { key: "prepared", label: "Preparado" },
  { key: "dispatched", label: "Despachado" },
  { key: "in_transit", label: "En Tránsito" },
  { key: "reception_control", label: "Tiempo de control de recepción" },
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

export type ShipmentDocItem = {
  id: string
  productName: string
  sentQty: number
  receivedQty?: number
  diffReason?: string
  shipmentStopId?: string
}

function mapShipmentItems(shipment: any): ShipmentDocItem[] {
  return (shipment.items || []).map((item: any) => ({
    id: item.id || item.productId || item.product?.id,
    shipmentStopId: item.shipmentStopId as string | undefined,
    productName: item.product?.name || item.productName || "—",
    sentQty: item.sentQty ?? item.quantity ?? 0,
    receivedQty: item.receivedQty,
    diffReason: item.diffReason,
  }))
}

export function ShipmentLogisticsDocument({
  shipment,
  className,
  footerText = "Detalle del envío · Nova",
}: {
  shipment: any
  className?: string
  footerText?: string
}) {
  const status = (shipment.status || "draft") as string
  const cfg = statusConfig[status] || statusConfig.draft
  const currentStep = statusOrder[status] ?? -1
  const isReceived = status === "received" || status === "received_with_diff"
  const isMultiStop = !!shipment.isMultiStop
  const routeSegs = routeSegmentsFromShipment(shipment)
  const fullMultiMapsUrl = isMultiStop ? multiStopFullRouteMapsUrl(shipment) : null
  const mapsHref = fullMultiMapsUrl ?? singleLegMapsUrl(shipment)
  const mapsLinkOk = Boolean(
    fullMultiMapsUrl ||
      (shipmentOriginNavPoint(shipment) && locationNavPoint(shipment.destination)),
  )

  const createdByName =
    shipment.createdBy?.firstName && shipment.createdBy?.lastName
      ? `${shipment.createdBy.firstName} ${shipment.createdBy.lastName}`.trim()
      : "—"

  const items = mapShipmentItems(shipment)

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{shipment.shipmentNumber}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {routeSegs.map((seg, idx) => (
              <span key={`r-${idx}`} className="flex items-center gap-2">
                {idx > 0 ? <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" /> : null}
                <span className="flex flex-col">
                  <span className="font-medium text-gray-900 dark:text-white">{seg.line1}</span>
                  {seg.line2 ? (
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{seg.line2}</span>
                  ) : null}
                </span>
              </span>
            ))}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              cfg.bg,
              cfg.text,
            )}
          >
            <span className={cn("flex h-1.5 w-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-400">Creado</p>
            <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
              {shipment.createdAt ? formatDate(shipment.createdAt) : "—"}
            </p>
          </div>
          {shipment.dispatchedAt && (
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-400">Despachado</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {formatTime(shipment.dispatchedAt)}
              </p>
            </div>
          )}
          {shipment.receivedAt && (
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-400">Recibido</p>
              <p className="mt-0.5 font-semibold text-green-600 dark:text-green-400">
                {formatTime(shipment.receivedAt)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-400">Creado por</p>
            <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">{createdByName}</p>
          </div>
        </div>
      </div>

      {/* Progreso */}
      {status !== "cancelled" && (
        <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-5 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 dark:text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Progreso del Envío</h3>
          </div>
          <div className="relative flex items-center justify-between">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-gray-200 dark:bg-gray-600" />
            <div
              className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-blue-500 transition-all"
              style={{
                width: `${Math.max(0, (currentStep / (progressSteps.length - 1)) * 100)}%`,
              }}
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
                      isCurrent &&
                        "border-blue-500 bg-white text-blue-600 ring-4 ring-blue-100 dark:bg-gray-800 dark:text-blue-300 dark:ring-blue-900/50",
                      !isCompleted && !isCurrent && "border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500",
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isCurrent ? (
                      <Truck className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-2 max-w-[5.5rem] text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs",
                      isCurrent ? "text-blue-600 dark:text-blue-300" : isCompleted ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500",
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tiempo de llegada */}
      {shipment.dispatchedAt &&
        shipment.receptionControlStartedAt &&
        (status === "reception_control" || isReceived) && (
          <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Tiempo de llegada (depósito → local)
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-400">Despachado</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                  {formatTime(shipment.dispatchedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-400">Llegada al local (inicio control)</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                  {formatTime(shipment.receptionControlStartedAt)}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                {Math.round(
                  (new Date(shipment.receptionControlStartedAt).getTime() -
                    new Date(shipment.dispatchedAt).getTime()) /
                    60000,
                )}{" "}
                min
              </span>
            </div>
          </div>
        )}

      {/* Tiempo de control (cerrado) */}
      {isReceived && shipment.receptionControlStartedAt && shipment.receptionControlCompletedAt && (
        <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tiempo de control de recepción
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-400">Inicio control</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.receptionControlStartedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-400">Recepción confirmada</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.receptionControlCompletedAt)}
              </p>
            </div>
            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              Demoró{" "}
              {Math.round(
                (new Date(shipment.receptionControlCompletedAt).getTime() -
                  new Date(shipment.receptionControlStartedAt).getTime()) /
                  60000,
              )}{" "}
              min en controlar el pedido
            </span>
          </div>
        </div>
      )}

      {/* Tiempo de entrega (sin control global previo) */}
      {shipment.dispatchedAt &&
        (shipment.receivedAt || shipment.actualArrivalAt) &&
        !shipment.receptionControlStartedAt && (
          <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Tiempo de entrega</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-400">Despachado</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                  {formatTime(shipment.dispatchedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-400">Recibido</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                  {formatTime(shipment.actualArrivalAt ?? shipment.receivedAt)}
                </p>
              </div>
              {(() => {
                const receivedTime = shipment.actualArrivalAt ?? shipment.receivedAt
                const durationMin = Math.round(
                  (new Date(receivedTime).getTime() - new Date(shipment.dispatchedAt).getTime()) / 60000,
                )
                return (
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                    Tardó {durationMin} min desde el despacho
                  </span>
                )
              })()}
            </div>
          </div>
        )}

      {/* Ruta */}
      {(shipment.routePolyline ||
        shipment.estimatedDurationMin != null ||
        mapsLinkOk) && (
        <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Ruta</h3>
          <div className="flex flex-wrap items-center gap-3">
            {shipment.routePolyline && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                Ruta guardada
              </span>
            )}
            {shipment.estimatedDurationMin != null && (
              <span className="text-sm text-gray-600 dark:text-white">
                Tiempo estimado: {shipment.estimatedDurationMin} min
              </span>
            )}
            {mapsLinkOk && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <MapPin className="h-4 w-4" />
                Ver ruta en Google Maps
              </a>
            )}
          </div>
        </div>
      )}

      {/* Multi-parada: paradas */}
      {isMultiStop && Array.isArray(shipment.stops) && shipment.stops.length > 0 && (
        <div className="print:break-inside-avoid space-y-4 rounded-xl border border-blue-200/80 bg-blue-50/40 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Paradas de la ruta</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Registrá llegada, control y firma en cada local en orden. Los tiempos de tramo y de recepción quedan por
              parada.
            </p>
          </div>
          {[...shipment.stops]
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((stop: any, idx: number) => {
              const ordered = [...shipment.stops].sort(
                (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
              )
              const stopItems = items.filter((it) => it.shipmentStopId === stop.id)

              let travelMin: number | null = null
              if (stop.arrivedAt) {
                if (idx === 0 && shipment.dispatchedAt) {
                  travelMin = Math.round(
                    (new Date(stop.arrivedAt).getTime() - new Date(shipment.dispatchedAt).getTime()) / 60000,
                  )
                } else if (idx > 0) {
                  const prev = ordered[idx - 1]
                  if (prev?.receptionControlCompletedAt) {
                    travelMin = Math.round(
                      (new Date(stop.arrivedAt).getTime() -
                        new Date(prev.receptionControlCompletedAt).getTime()) /
                        60000,
                    )
                  }
                }
              }
              let receptionMin: number | null = null
              if (stop.receptionControlStartedAt && stop.receptionControlCompletedAt) {
                receptionMin = Math.round(
                  (new Date(stop.receptionControlCompletedAt).getTime() -
                    new Date(stop.receptionControlStartedAt).getTime()) /
                    60000,
                )
              }

              return (
                <div
                  key={stop.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
                >
                  <div className="mb-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Parada {idx + 1}
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{stopTitleDoc(stop)}</p>
                    {stopSubtitleDoc(stop) ? (
                      <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{stopSubtitleDoc(stop)}</p>
                    ) : null}
                    {travelMin != null && (
                      <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                        Tiempo desde el punto anterior:{" "}
                        <strong className="text-gray-900 dark:text-white">{travelMin} min</strong>
                      </p>
                    )}
                    {receptionMin != null && (
                      <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                        Tiempo en control de recepción:{" "}
                        <strong className="text-gray-900 dark:text-white">{receptionMin} min</strong>
                      </p>
                    )}
                  </div>

                  <div className="mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400 dark:text-white" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Detalle de Items</h4>
                    <span className="ml-auto text-xs text-gray-400 dark:text-white">
                      {stopItems.length} producto{stopItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                            Producto
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                            Cantidad Enviada
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                            Cantidad Recibida
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                            Diferencia
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stopItems.map((item) => {
                          const hasReceived = item.receivedQty != null
                          const displaySent = item.sentQty
                          const diff = hasReceived ? displaySent - (item.receivedQty ?? 0) : undefined
                          const hasDiff = diff !== undefined && diff !== 0
                          return (
                            <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {item.productName}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                {formatNumber(displaySent)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                {hasReceived ? formatNumber(item.receivedQty!) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {hasReceived ? (
                                  <span
                                    className={cn(
                                      "text-sm font-medium tabular-nums",
                                      hasDiff ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
                                    )}
                                  >
                                    {hasDiff ? diff : "0"}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-300 dark:text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {hasReceived ? (
                                  hasDiff ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Diferencia
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      OK
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-white">Pendiente</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {stopItems.some((i) => i.diffReason) && (
                    <div className="mt-3 space-y-2">
                      {stopItems
                        .filter((i) => i.diffReason)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-900/30"
                          >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                            <p className="text-xs text-orange-700 dark:text-orange-200">
                              <span className="font-medium">{item.productName}:</span> {item.diffReason}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}

                  {stop.receptionControlCompletedAt && (
                    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-600">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-300">Parada recepcionada</p>
                      {stop.receivedByName ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Recibido por</p>
                          <p className="mt-0.5 font-medium text-gray-900 dark:text-white">{stop.receivedByName}</p>
                        </div>
                      ) : null}
                      {stop.receivedBySignature ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Firma</p>
                          <img
                            src={stop.receivedBySignature}
                            alt={`Firma · ${stop.location?.name ?? "parada"}`}
                            className="mt-1 max-h-28 max-w-full rounded-lg border border-gray-200 bg-white object-contain p-1 dark:border-gray-600"
                          />
                        </div>
                      ) : null}
                      {stop.receptionNotes?.trim() ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Observaciones</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                            {stop.receptionNotes.trim()}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* Envío simple: ítems */}
      {!isMultiStop && (
        <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Detalle de ítems</h3>
            <span className="text-xs text-gray-400 dark:text-white">
              {items.length} producto{items.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-white">Producto</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-white">Cant. enviada</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-white">Cant. recibida</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-white">Diferencia</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-white">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hasReceived = item.receivedQty != null
                  const diff = hasReceived ? item.sentQty - (item.receivedQty ?? 0) : undefined
                  const hasDiff = diff !== undefined && diff !== 0
                  return (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.productName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-white">
                        {formatNumber(item.sentQty)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-white">
                        {hasReceived ? formatNumber(item.receivedQty!) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasReceived ? (
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              hasDiff ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400",
                            )}
                          >
                            {hasDiff ? diff : "0"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasReceived ? (
                          hasDiff ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                              <AlertTriangle className="h-3.5 w-3.5" /> Diferencia
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> OK
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {items.some((i) => i.diffReason) && (
            <div className="mt-4 space-y-2">
              {items
                .filter((i) => i.diffReason)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800 dark:bg-orange-900/30"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <p className="text-xs text-orange-700 dark:text-orange-200">
                      <span className="font-medium">{item.productName}:</span> {item.diffReason}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Recepción envío simple */}
      {!isMultiStop && (shipment.receivedByName || shipment.receivedBySignature || shipment.receptionNotes) && (
        <div className="print:break-inside-avoid rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Recepción registrada</h3>
          <div className="flex flex-wrap gap-4">
            {shipment.receivedByName && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-400">Recibido por</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-white">{shipment.receivedByName}</p>
              </div>
            )}
            {shipment.receivedBySignature && (
              <div className="w-full">
                <p className="mb-2 text-xs text-gray-400 dark:text-gray-400">Firma de quien recibió</p>
                <img
                  src={shipment.receivedBySignature}
                  alt="Firma"
                  className="max-h-24 rounded-lg border border-gray-200 bg-white object-contain p-1 dark:border-gray-600"
                />
              </div>
            )}
            {shipment.receptionNotes && (
              <div className="w-full">
                <p className="text-xs text-gray-400 dark:text-gray-400">Observaciones</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                  {shipment.receptionNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {footerText ? (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">{footerText}</p>
      ) : null}
    </div>
  )
}
