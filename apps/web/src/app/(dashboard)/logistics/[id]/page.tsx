"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  ArrowLeft,
  ArrowRight,
  Truck,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  AlertTriangle,
  QrCode,
  Send,
  ClipboardCheck,
  Loader2,
  FileText,
  MapPin,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import { toPng } from "html-to-image"
import { shipmentsApi } from "@/lib/api/shipments"
import {
  cn,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatTime,
  formatNumber,
  triggerContentUpdateAnimation,
} from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import type { ShipmentStatus } from "@/types"

// ---------- helpers ----------

function routeSegmentsFromShipment(shipment: any): string[] {
  const o = shipment?.origin?.name || "—"
  if (shipment?.isMultiStop && Array.isArray(shipment.stops) && shipment.stops.length > 0) {
    const ordered = [...shipment.stops].sort(
      (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    return [o, ...ordered.map((s: any) => s.location?.name || "—")]
  }
  return [o, shipment?.destination?.name || "—"]
}

/** Tramo actual en multi-parada: enlace Maps + minutos del leg (API al despachar/reordenar). */
function getMultiStopActiveLegNavigation(shipment: any): {
  mapsUrl: string
  estimatedLegMin: number | null
  legDescription: string
} | null {
  if (!shipment?.isMultiStop || !Array.isArray(shipment.stops) || shipment.stops.length < 1) {
    return null
  }
  const st = shipment.status || ""
  if (!["in_transit", "dispatched", "reception_control"].includes(st)) {
    return null
  }
  const ordered = [...shipment.stops].sort(
    (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  const enc = (a: string) => encodeURIComponent((a || "").trim())

  const idx = ordered.findIndex((s: any) => !s.receptionControlCompletedAt)
  if (idx === -1) return null

  const cur = ordered[idx]!

  if (!cur.arrivedAt) {
    const fromAddr =
      idx === 0
        ? shipment.origin?.address?.trim()
        : ordered[idx - 1]?.location?.address?.trim()
    const toAddr = cur.location?.address?.trim()
    if (!fromAddr || !toAddr) return null
    return {
      mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${enc(fromAddr)}&destination=${enc(toAddr)}&travelmode=driving`,
      estimatedLegMin: cur.legDurationMin ?? null,
      legDescription:
        idx === 0
          ? `Depósito → ${cur.location?.name ?? "Parada 1"}`
          : `${ordered[idx - 1]?.location?.name ?? "Parada anterior"} → ${cur.location?.name ?? ""}`,
    }
  }

  if (idx < ordered.length - 1) {
    const next = ordered[idx + 1]!
    const fromAddr = cur.location?.address?.trim()
    const toAddr = next.location?.address?.trim()
    if (!fromAddr || !toAddr) return null
    return {
      mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${enc(fromAddr)}&destination=${enc(toAddr)}&travelmode=driving`,
      estimatedLegMin: next.legDurationMin ?? null,
      legDescription: `${cur.location?.name ?? ""} → ${next.location?.name ?? ""}`,
    }
  }

  return null
}

function multiStopFullRouteMapsUrl(shipment: any): string | null {
  const o = (shipment?.origin?.address || "").trim()
  if (!shipment?.isMultiStop || !Array.isArray(shipment.stops) || shipment.stops.length < 2) {
    return null
  }
  const ordered = [...shipment.stops].sort(
    (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  const last = ordered[ordered.length - 1]
  const d = (last?.location?.address || shipment.destination?.address || "").trim()
  if (!o || !d) return null
  const mids = ordered
    .slice(0, -1)
    .map((s: any) => s.location?.address)
    .filter(Boolean)
    .map((a: string) => encodeURIComponent(a))
  const wp = mids.length > 0 ? `&waypoints=${mids.join("%7C")}` : ""
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}${wp}&travelmode=driving`
}

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
    label: "Tiempo de control de recepción",
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

// ---------- skeleton ----------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="space-y-3">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
          <div className="flex gap-6 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
                <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="h-16 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex flex-col items-center space-y-3 py-4">
            <div className="h-40 w-40 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- main page ----------

export default function ShipmentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const shipmentId = params.id as string

  const [shipment, setShipment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [reorderStopsLoading, setReorderStopsLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [receivedByName, setReceivedByName] = useState("")
  const [receivedBySignature, setReceivedBySignature] = useState<string | null>(null)
  const [receptionNotes, setReceptionNotes] = useState("")
  const [hasSignature, setHasSignature] = useState(false)
  /** Cantidades enviadas por ítem (editable en draft/prepared) */
  const [sentQtys, setSentQtys] = useState<Record<string, number>>({})
  const [savingSentItemId, setSavingSentItemId] = useState<string | null>(null)
  /** Cantidades recibidas por ítem (solo en estado "Tiempo de control de recepción") */
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})
  /** Minutos transcurridos en control de recepción (contador en vivo cuando status === reception_control) */
  const [liveControlMinutes, setLiveControlMinutes] = useState<number | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [qrBaseUrl, setQrBaseUrl] = useState("")
  const [qrDownloadLoading, setQrDownloadLoading] = useState(false)
  const qrDownloadSnapshotRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window !== "undefined") setQrBaseUrl(window.location.origin)
  }, [])

  const loadShipment = useCallback(async () => {
    if (!shipmentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await shipmentsApi.getById(shipmentId)
      setShipment(data)
    } catch (err: any) {
      const msg = err?.message || "Error al cargar el envío"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [shipmentId])

  useEffect(() => {
    loadShipment()
  }, [loadShipment])

  // Inicializar cantidades enviadas editables en draft/prepared
  useEffect(() => {
    if (!shipment?.items?.length) return
    const st = (shipment.status || "").toLowerCase()
    if (st !== "draft" && st !== "prepared") return
    setSentQtys((prev) => {
      const next = { ...prev }
      for (const item of shipment.items) {
        const id = item.id || item.productId || item.product?.id
        if (id) next[id] = item.sentQty ?? item.quantity ?? 0
      }
      return next
    })
  }, [shipment?.id, shipment?.status, shipment?.items])

  // Cantidades recibidas editables: envío en control global o multi-parada con una parada en control activo
  useEffect(() => {
    if (!shipment?.items?.length) return
    const st = (shipment.status || "").toLowerCase()
    const anyStopInReception =
      !!shipment.isMultiStop &&
      Array.isArray(shipment.stops) &&
      shipment.stops.some(
        (s: any) => s.receptionControlStartedAt && !s.receptionControlCompletedAt,
      )
    if (st !== "reception_control" && !anyStopInReception) return
    setReceivedQtys((prev) => {
      const next = { ...prev }
      for (const item of shipment.items) {
        const id = item.id || item.productId || item.product?.id
        if (id) next[id] = item.receivedQty ?? item.sentQty ?? item.quantity ?? 0
      }
      return next
    })
  }, [
    shipment?.id,
    shipment?.status,
    shipment?.items,
    shipment?.isMultiStop,
    shipment?.stops,
  ])

  // Contador en vivo del tiempo de control (envío simple o parada activa en multi-parada)
  useEffect(() => {
    const st = (shipment?.status || "").toLowerCase()
    let startedAt: string | undefined
    if (shipment?.isMultiStop && Array.isArray(shipment.stops)) {
      const ordered = [...shipment.stops].sort(
        (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      )
      const active = ordered.find(
        (s: any) => s.receptionControlStartedAt && !s.receptionControlCompletedAt,
      )
      startedAt = active?.receptionControlStartedAt
    } else {
      startedAt = shipment?.receptionControlStartedAt
    }
    if (st !== "reception_control" || !startedAt) {
      setLiveControlMinutes(null)
      return
    }
    const compute = () =>
      Math.round((Date.now() - new Date(startedAt!).getTime()) / 60000)
    setLiveControlMinutes(compute())
    const interval = setInterval(() => setLiveControlMinutes(compute()), 10000)
    return () => clearInterval(interval)
  }, [shipment?.status, shipment?.receptionControlStartedAt, shipment?.isMultiStop, shipment?.stops])

  const handleMarkPrepared = async () => {
    if (!shipmentId || actionLoading) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.prepare(shipmentId)
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Envío marcado como preparado" })
    } catch (err: any) {
      const msg = err?.message || "Error al marcar como preparado"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!shipmentId || actionLoading) return
    if (typeof window !== "undefined" && !window.confirm("¿Cancelar este envío? Esta acción no se puede deshacer.")) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.cancel(shipmentId)
      sileo.success({ title: "Envío cancelado" })
      router.push("/logistics")
    } catch (err: any) {
      const msg = err?.message || "Error al cancelar el envío"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const handleLlegadaAlDestino = async () => {
    if (!shipmentId || actionLoading) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.startReceptionControl(shipmentId)
      const updated = await shipmentsApi.getById(shipmentId)
      setShipment(updated)
      triggerContentUpdateAnimation()
      const dispatchedAt = shipment?.dispatchedAt
      const startedAt = updated?.receptionControlStartedAt
      const minLlegada =
        dispatchedAt && startedAt
          ? Math.round(
              (new Date(startedAt).getTime() - new Date(dispatchedAt).getTime()) / 60000
            )
          : null
      if (minLlegada != null) {
        sileo.success({
          title: "Llegó al destino",
          description: `Tiempo del depósito al local: ${minLlegada} min. Complete los datos de recepción y confirme para registrar cuánto demoró en controlar el pedido.`,
        })
      } else {
        sileo.success({ title: "Llegó al destino. Complete los datos de recepción." })
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Error")
      sileo.error({ title: err?.message ?? "Error" })
    } finally {
      setActionLoading(false)
    }
  }

  const handleDispatch = async () => {
    if (!shipmentId || actionLoading) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.dispatch(shipmentId)
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Envío despachado. En tránsito." })
    } catch (err: any) {
      const msg = err?.message || "Error al despachar"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const getSignatureDataUrl = useCallback(() => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    const blank = document.createElement("canvas")
    blank.width = canvas.width
    blank.height = canvas.height
    if (canvas.toDataURL("image/png") === blank.toDataURL("image/png")) return null
    return canvas.toDataURL("image/png")
  }, [])

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setReceivedBySignature(null)
      setHasSignature(false)
    }
  }, [])

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const initCanvasContext = useCallback(() => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.strokeStyle = "#111827"
      ctx.lineWidth = 2
      ctx.lineCap = "round"
    }
    return ctx
  }, [])

  const handleSignatureMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getCanvasPoint(e)
    if (!p) return
    const ctx = initCanvasContext()
    if (!ctx) return
    lastPointRef.current = p
    isDrawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
    ctx.fillStyle = "#111827"
    ctx.fill()
    setReceivedBySignature("drawn")
  }

  const handleSignatureMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const p = getCanvasPoint(e)
    if (!p) return
    const ctx = initCanvasContext()
    if (!ctx || !lastPointRef.current) return
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPointRef.current = p
  }

  const handleSignatureMouseUp = () => {
    if (isDrawingRef.current) setHasSignature(true)
    isDrawingRef.current = false
    lastPointRef.current = null
  }

  const handleConfirmReception = async () => {
    if (!shipmentId || actionLoading || !items.length) return
    if (!receivedByName.trim()) {
      setActionError("El nombre de quien recibe es obligatorio.")
      return
    }
    const signature = getSignatureDataUrl()
    if (!signature) {
      setActionError("La firma es obligatoria para registrar la entrega.")
      return
    }
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.receive(shipmentId, {
        items: items.map((item) => ({
          itemId: item.id,
          receivedQty: receivedQtys[item.id] ?? item.sentQty,
        })),
        receivedByName: receivedByName.trim(),
        receivedBySignature: signature,
        receptionNotes: receptionNotes.trim() || undefined,
      })
      setReceivedByName("")
      setReceptionNotes("")
      clearSignature()
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Recepción confirmada correctamente" })
    } catch (err: any) {
      const msg = err?.message || "Error al confirmar recepción"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarkStopArrived = async (stopId: string) => {
    if (!shipmentId || actionLoading) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.markStopArrived(shipmentId, stopId)
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Llegada al local registrada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al registrar llegada"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const handleStartStopReception = async (stopId: string) => {
    if (!shipmentId || actionLoading) return
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.startStopReceptionControl(shipmentId, stopId)
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Control de recepción iniciado en esta parada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmStopReception = async (stopId: string) => {
    if (!shipmentId || actionLoading || !shipment?.items?.length) return
    if (!receivedByName.trim()) {
      setActionError("El nombre de quien recibe es obligatorio.")
      return
    }
    const signature = getSignatureDataUrl()
    if (!signature) {
      setActionError("La firma es obligatoria para registrar la entrega.")
      return
    }
    const stopItems = (shipment.items as any[]).filter(
      (i) => i.shipmentStopId === stopId,
    )
    if (!stopItems.length) {
      setActionError("No hay ítems para esta parada.")
      return
    }
    setActionLoading(true)
    setActionError(null)
    try {
      await shipmentsApi.receiveStop(shipmentId, stopId, {
        items: stopItems.map((item: any) => ({
          itemId: item.id,
          receivedQty: receivedQtys[item.id] ?? item.sentQty,
        })),
        receivedByName: receivedByName.trim(),
        receivedBySignature: signature,
        receptionNotes: receptionNotes.trim() || undefined,
      })
      setReceivedByName("")
      setReceptionNotes("")
      clearSignature()
      await loadShipment()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Recepción de la parada registrada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al confirmar recepción"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }

  const saveSentQty = useCallback(
    async (itemId: string, sentQty: number) => {
      if (!shipmentId || !shipment) return
      const item = (shipment.items || []).find(
        (i: any) => (i.id || i.productId || i.product?.id) === itemId
      )
      const current = item?.sentQty ?? item?.quantity ?? 0
      if (Math.abs(sentQty - current) < 1e-9) return
      setSavingSentItemId(itemId)
      try {
        await shipmentsApi.updateItem(shipmentId, itemId, { sentQty })
        setShipment((prev: any) => {
          if (!prev?.items) return prev
          return {
            ...prev,
            items: prev.items.map((i: any) =>
              (i.id || i.productId || i.product?.id) === itemId
                ? { ...i, sentQty }
                : i
            ),
          }
        })
        triggerContentUpdateAnimation()
      } catch (err: any) {
        sileo.error({ title: err?.message ?? "Error al guardar cantidad" })
      } finally {
        setSavingSentItemId(null)
      }
    },
    [shipmentId, shipment]
  )

  if (loading) {
    return <DetailSkeleton />
  }

  if (error || !shipment) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
          🚚
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {error ? "Error al cargar" : "Envío no encontrado"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {error || "El envío que buscas no existe."}
        </p>
        <Link
          href="/logistics"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Logística
        </Link>
      </div>
    )
  }

  const status = (shipment.status || "draft") as ShipmentStatus
  const cfg = statusConfig[status] || statusConfig.draft
  const currentStep = statusOrder[status] ?? -1
  const isMultiStop = !!shipment.isMultiStop
  const activeMultiLegNav = isMultiStop ? getMultiStopActiveLegNavigation(shipment) : null
  const fullMultiMapsUrl = isMultiStop ? multiStopFullRouteMapsUrl(shipment) : null
  const routeSegs = routeSegmentsFromShipment(shipment)
  const showShipmentQr =
    status === "received" || status === "received_with_diff"
  const qrRouteLine = routeSegs.join(" → ")

  // Adapt fields from API response
  const originName = shipment.origin?.name || "—"
  const destName = shipment.destination?.name || "—"
  const createdByName =
    shipment.createdBy?.firstName && shipment.createdBy?.lastName
      ? `${shipment.createdBy.firstName} ${shipment.createdBy.lastName}`
      : typeof shipment.createdBy === "string"
      ? shipment.createdBy
      : "—"

  // Items from API - adapt field names
  const items: {
    id: string
    productName: string
    sentQty: number
    receivedQty?: number
    difference?: number
    diffReason?: string
    shipmentStopId?: string
  }[] = (shipment.items || []).map((item: any) => ({
    id: item.id || item.productId || item.product?.id,
    shipmentStopId: item.shipmentStopId as string | undefined,
    productName: item.product?.name || item.productName || "—",
    sentQty: item.sentQty ?? item.quantity ?? 0,
    receivedQty: item.receivedQty,
    difference:
      item.difference ??
      (item.receivedQty != null ? item.sentQty - item.receivedQty : undefined),
    diffReason: item.diffReason || item.notes,
  }))

  const orderedStopsForReorder =
    isMultiStop && Array.isArray(shipment.stops)
      ? [...shipment.stops].sort(
          (a: { sortOrder?: number }, b: { sortOrder?: number }) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        )
      : []
  const canReorderStops =
    isMultiStop &&
    orderedStopsForReorder.length > 1 &&
    (status === "draft" || status === "prepared")

  const handleReorderStop = async (stopIndex: number, direction: -1 | 1) => {
    if (!shipmentId || reorderStopsLoading || !canReorderStops) return
    const j = stopIndex + direction
    if (j < 0 || j >= orderedStopsForReorder.length) return
    const ids = orderedStopsForReorder.map((s: { id: string }) => s.id)
    const next = [...ids]
    ;[next[stopIndex], next[j]] = [next[j]!, next[stopIndex]!]
    setReorderStopsLoading(true)
    try {
      const updated = await shipmentsApi.reorderStops(shipmentId, next)
      setShipment(updated)
      triggerContentUpdateAnimation()
      sileo.success({ title: "Orden de paradas actualizado" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo reordenar las paradas"
      sileo.error({ title: msg })
    } finally {
      setReorderStopsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* -------- Back link + Remito -------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/logistics"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-white transition-colors hover:text-gray-900 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Logística
        </Link>
        <Link
          href={`/logistics/${shipment.id}/remito`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
        >
          <FileText className="h-4 w-4" />
          Ver / Imprimir remito
        </Link>
      </div>

      {/* -------- Shipment Header -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {shipment.shipmentNumber}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {routeSegs.map((name, idx) => (
                  <span key={`hdr-${idx}`} className="flex items-center gap-2">
                    {idx > 0 ? (
                      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                    ) : null}
                    <span className="font-medium text-gray-900 dark:text-white">{name}</span>
                  </span>
                ))}
              </div>
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
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Creado</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {shipment.createdAt ? formatDate(shipment.createdAt) : "—"}
              </p>
            </div>
            {shipment.dispatchedAt && (
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Despachado</p>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                  {formatTime(shipment.dispatchedAt)}
                </p>
              </div>
            )}
            {shipment.receivedAt && (
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Recibido</p>
                <p className="mt-0.5 font-semibold text-green-600 dark:text-green-400">
                  {formatTime(shipment.receivedAt)}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Creado por</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {createdByName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------- Progreso del Envío (línea de tiempo) -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400 dark:text-white" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Progreso del Envío
          </h3>
        </div>

        {status === "cancelled" ? (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Este envío fue cancelado
            </p>
          </div>
        ) : (
          <div className="relative flex items-center justify-between">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 dark:bg-gray-600" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-blue-500 transition-all"
              style={{
                width: `${Math.max(0, (currentStep / (progressSteps.length - 1)) * 100)}%`,
              }}
            />
            {progressSteps.map((step, i) => {
              const isLastStep = i === progressSteps.length - 1
              const isReceived = status === "received" || status === "received_with_diff"
              const isCompleted =
                i < currentStep || (isLastStep && isReceived)
              const isCurrent =
                i === currentStep && !(isLastStep && isReceived)
              return (
                <div key={step.key} className="relative z-10 flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                      isCompleted &&
                        "border-blue-500 bg-blue-500 text-white",
                      isCurrent &&
                        "border-blue-500 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 ring-4 ring-blue-100 dark:ring-blue-900/50",
                      !isCompleted && !isCurrent &&
                        "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500"
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
                      "mt-2 text-xs font-medium",
                      isCurrent ? "text-blue-600 dark:text-blue-300" : isCompleted ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* -------- Tiempo de llegada (depósito → local): desde despacho hasta inicio de control -------- */}
      {shipment.dispatchedAt &&
        shipment.receptionControlStartedAt &&
        (status === "reception_control" || status === "received" || status === "received_with_diff") && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tiempo de llegada (depósito → local)
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Despachado</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.dispatchedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Llegada al local (inicio control)</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.receptionControlStartedAt)}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-200">
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

      {/* -------- Tiempo de control en vivo (solo mientras está en reception_control) -------- */}
      {status === "reception_control" &&
        shipment.receptionControlStartedAt &&
        liveControlMinutes !== null && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6">
          <h3 className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
            Tiempo de control de recepción
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Tiempo transcurrido:{" "}
            <span className="font-semibold">{liveControlMinutes} min</span>
          </p>
        </div>
      )}

      {/* -------- Demora en controlar el pedido (tras confirmar recepción) -------- */}
      {(status === "received" || status === "received_with_diff") &&
        shipment.receptionControlStartedAt &&
        shipment.receptionControlCompletedAt && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tiempo de control de recepción
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Inicio control</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.receptionControlStartedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Recepción confirmada</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.receptionControlCompletedAt)}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
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

      {/* -------- Tiempo de entrega (cuando no se usó control de recepción) -------- */}
      {shipment.dispatchedAt &&
        (shipment.receivedAt || shipment.actualArrivalAt) &&
        !shipment.receptionControlStartedAt && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Tiempo de entrega
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Despachado</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.dispatchedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Recibido</p>
              <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                {formatTime(shipment.actualArrivalAt ?? shipment.receivedAt)}
              </p>
            </div>
            {(() => {
              const receivedTime = (shipment.actualArrivalAt ?? shipment.receivedAt) as string
              const dispatched = new Date(shipment.dispatchedAt).getTime()
              const received = new Date(receivedTime).getTime()
              const durationMin = Math.round((received - dispatched) / 60000)
              return (
                <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-200">
                  Tardó {durationMin} min desde el despacho
                </span>
              )
            })()}
          </div>
        </div>
      )}

      {/* -------- Ruta (enlace a Maps) -------- */}
      {(shipment.routePolyline || shipment.estimatedDurationMin != null || (shipment.origin?.address || shipment.destination?.address)) && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Ruta
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              {shipment.routePolyline && (
                <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-3 py-1 text-xs font-medium text-green-800 dark:text-green-200">
                  Ruta guardada
                </span>
              )}
              {activeMultiLegNav ? (
                <>
                  {activeMultiLegNav.estimatedLegMin != null && (
                    <span className="text-sm text-gray-600 dark:text-white">
                      Tiempo estimado (este tramo):{" "}
                      <strong className="text-gray-900 dark:text-white">
                        {activeMultiLegNav.estimatedLegMin} min
                      </strong>
                    </span>
                  )}
                  {activeMultiLegNav.estimatedLegMin == null && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Tiempo estimado de este tramo no disponible en el sistema.
                    </span>
                  )}
                </>
              ) : (
                shipment.estimatedDurationMin != null && (
                  <span className="text-sm text-gray-600 dark:text-white">
                    Tiempo estimado: {shipment.estimatedDurationMin} min
                  </span>
                )
              )}
            </div>
            {activeMultiLegNav && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Google Maps: <span className="font-medium text-gray-700 dark:text-gray-300">{activeMultiLegNav.legDescription}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {(shipment.origin?.address || shipment.destination?.address) && (
                <a
                  href={
                    activeMultiLegNav?.mapsUrl ??
                    fullMultiMapsUrl ??
                    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(shipment.origin?.address || "")}&destination=${encodeURIComponent(shipment.destination?.address || "")}&travelmode=driving`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <MapPin className="h-4 w-4" />
                  {activeMultiLegNav
                    ? "Ver este tramo en Google Maps"
                    : "Ver ruta en Google Maps"}
                </a>
              )}
              {activeMultiLegNav && fullMultiMapsUrl && (
                <a
                  href={fullMultiMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  Ver ruta completa
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------- Grid: Items + QR -------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Items Table */}
        {!isMultiStop ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Detalle de Items
            </h3>
            <span className="ml-auto text-xs text-gray-400 dark:text-white">
              {items.length} producto{items.length !== 1 ? "s" : ""}
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
                {items.map((item) => {
                  const isReceptionMode = status === "reception_control"
                  const canEditSent =
                    status === "draft" || status === "prepared"
                  const displaySentQty =
                    canEditSent ? (sentQtys[item.id] ?? item.sentQty) : item.sentQty
                  const receivedQty = isReceptionMode
                    ? (receivedQtys[item.id] ?? item.sentQty)
                    : item.receivedQty
                  const hasReceived = receivedQty !== undefined && receivedQty !== null
                  const diff = hasReceived ? displaySentQty - (receivedQty ?? 0) : undefined
                  const hasDiff = diff !== undefined && diff !== 0

                  return (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.productName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                        {canEditSent ? (
                          <span className="inline-flex items-center gap-1">
                            <FormattedNumberInput
                              value={sentQtys[item.id] ?? item.sentQty}
                              onChange={(n) =>
                                setSentQtys((prev) => ({
                                  ...prev,
                                  [item.id]: Math.max(0, n),
                                }))
                              }
                              onBlur={() => {
                                const q = sentQtys[item.id] ?? item.sentQty
                                const prev = item.sentQty ?? 0
                                if (q >= 0 && Math.abs(q - prev) > 1e-9) {
                                  saveSentQty(item.id, q)
                                }
                              }}
                              className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              aria-label={`Cantidad enviada ${item.productName}`}
                              disabled={savingSentItemId === item.id}
                            />
                            {savingSentItemId === item.id && (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                            )}
                          </span>
                        ) : (
                          formatNumber(displaySentQty)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                        {isReceptionMode ? (
                          <FormattedNumberInput
                            value={receivedQtys[item.id] ?? item.sentQty}
                            onChange={(n) =>
                              setReceivedQtys((prev) => ({ ...prev, [item.id]: Math.max(0, n) }))
                            }
                            className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            aria-label={`Cantidad recibida ${item.productName}`}
                          />
                        ) : hasReceived ? (
                          formatNumber(item.receivedQty!)
                        ) : (
                          <span className="text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasReceived ? (
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              hasDiff ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
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

                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-gray-400 dark:text-white"
                    >
                      No hay items en este envío
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Diff reasons */}
          {items.some((item) => item.diffReason) && (
            <div className="mt-4 space-y-2">
              {items
                .filter((item) => item.diffReason)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 px-3 py-2"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-400" />
                    <p className="text-xs text-orange-700 dark:text-orange-200">
                      <span className="font-medium">{item.productName}:</span>{" "}
                      {item.diffReason}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
        ) : null}

        {/* QR del envío + datos de recepción alrededor (misma tarjeta) */}
        {showShipmentQr && (
          <div
            className={cn(
              "rounded-xl border border-blue-200/90 bg-white p-6 dark:border-blue-900/50 dark:bg-gray-800",
              isMultiStop ? "lg:col-span-3" : "lg:col-span-1",
            )}
          >
            <div className="mb-4 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-gray-400 dark:text-white" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                QR del Envío
              </h3>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-5">
              <div className="flex justify-center">
                <div className="flex h-44 w-44 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-600 dark:bg-gray-800">
                  <QRCodeCanvas
                    value={
                      qrBaseUrl
                        ? `${qrBaseUrl}/shipment/${shipment.id}`
                        : shipment.id
                    }
                    size={168}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-600">
                <p className="text-center text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                  {shipment.shipmentNumber}
                </p>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Ruta</dt>
                    <dd className="mt-1 font-medium leading-snug text-gray-900 dark:text-white">
                      {qrRouteLine}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Estado</dt>
                    <dd className="mt-1 font-semibold text-gray-900 dark:text-white">{cfg.label}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Despachado</dt>
                    <dd className="mt-1 tabular-nums text-gray-900 dark:text-white">
                      {shipment.dispatchedAt
                        ? formatDateTime(shipment.dispatchedAt)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Recibido</dt>
                    <dd className="mt-1 tabular-nums text-gray-900 dark:text-white">
                      {shipment.receivedAt ? formatDateTime(shipment.receivedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Ítems</dt>
                    <dd className="mt-1 font-medium tabular-nums text-gray-900 dark:text-white">
                      {items.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Creado por</dt>
                    <dd className="mt-1 text-gray-900 dark:text-white">{createdByName}</dd>
                  </div>
                </dl>
              </div>

              <p className="text-center text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                Escanear abre el detalle público del envío (ruta, ítems y tiempos por parada).
              </p>
              <button
                type="button"
                disabled={qrDownloadLoading}
                onClick={async () => {
                  const node = qrDownloadSnapshotRef.current
                  if (!node) return
                  setQrDownloadLoading(true)
                  const st = node.style
                  const showForCapture = () => {
                    /** Sin esto, toPng suele capturar vacío si el nodo está fuera del viewport. */
                    st.setProperty("position", "fixed")
                    st.setProperty("left", "0")
                    st.setProperty("top", "0")
                    st.setProperty("width", "340px")
                    st.setProperty("opacity", "1")
                    st.setProperty("visibility", "visible")
                    st.setProperty("z-index", "2147483646")
                    st.setProperty("pointer-events", "none")
                  }
                  const hideAfterCapture = () => {
                    st.removeProperty("position")
                    st.removeProperty("left")
                    st.removeProperty("top")
                    st.removeProperty("width")
                    st.removeProperty("opacity")
                    st.removeProperty("visibility")
                    st.removeProperty("z-index")
                    st.removeProperty("pointer-events")
                  }
                  try {
                    showForCapture()
                    await new Promise<void>((resolve) =>
                      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                    )
                    await new Promise((r) => setTimeout(r, 120))
                    const dataUrl = await toPng(node, {
                      pixelRatio: 2,
                      cacheBust: true,
                      backgroundColor: "#ffffff",
                    })
                    if (!dataUrl || dataUrl.length < 500) {
                      throw new Error("imagen vacía")
                    }
                    const a = document.createElement("a")
                    a.href = dataUrl
                    a.download = `qr-envio-${shipment.shipmentNumber}.png`
                    a.click()
                  } catch {
                    sileo.error({ title: "No se pudo generar la imagen del QR" })
                  } finally {
                    hideAfterCapture()
                    setQrDownloadLoading(false)
                  }
                }}
                className="mx-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {qrDownloadLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <QrCode className="h-3.5 w-3.5" />
                )}
                Descargar QR
              </button>
            </div>

            {/* Captura para descarga: modo claro (mejor contraste al abrir el PNG) */}
            <div
              ref={qrDownloadSnapshotRef}
              aria-hidden
              className="fixed top-0 left-[-12000px] box-border w-[340px] rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm [color-scheme:light]"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              <div className="flex justify-center">
                <div className="rounded-xl border border-gray-300 bg-white p-2">
                  <QRCodeCanvas
                    value={
                      qrBaseUrl
                        ? `${qrBaseUrl}/shipment/${shipment.id}`
                        : shipment.id
                    }
                    size={168}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>
              <div className="mt-5 border-t border-gray-200 pt-5">
                <p className="text-center text-lg font-bold tracking-tight text-gray-900">
                  {shipment.shipmentNumber}
                </p>
                <dl className="mt-4 space-y-3.5 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Ruta</dt>
                    <dd className="mt-1 font-semibold leading-snug text-gray-900">{qrRouteLine}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Estado</dt>
                    <dd className="mt-1 font-semibold text-gray-900">{cfg.label}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Despachado</dt>
                    <dd className="mt-1 tabular-nums text-gray-900">
                      {shipment.dispatchedAt ? formatDateTime(shipment.dispatchedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Recibido</dt>
                    <dd className="mt-1 tabular-nums text-gray-900">
                      {shipment.receivedAt ? formatDateTime(shipment.receivedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Ítems</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-gray-900">{items.length}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Creado por</dt>
                    <dd className="mt-1 text-gray-900">{createdByName}</dd>
                  </div>
                </dl>
              </div>
              <p className="mt-5 text-center text-[10px] leading-relaxed text-gray-500">
                Escanear abre el detalle público del envío (ruta, ítems y tiempos por parada).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* -------- Multi-parada: ítems y acciones por local (datos de recepción dentro de la parada activa) -------- */}
      {isMultiStop && Array.isArray(shipment.stops) && shipment.stops.length > 0 && (
        <div className="space-y-4 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Paradas de la ruta
            </h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              Registrá llegada, control y firma en cada local en orden. Los tiempos de tramo y de recepción quedan por parada.
              {canReorderStops
                ? " En borrador o preparado podés subir o bajar cada parada con las flechas para alinear la ruta con Google Maps."
                : null}
            </p>
          </div>
          {[...shipment.stops]
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((stop: any, idx: number) => {
              const ordered = [...shipment.stops].sort(
                (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
              )
              const prevStops = ordered.filter((s: any) => s.sortOrder < stop.sortOrder)
              const prevAllReceived = prevStops.every(
                (s: any) => s.receptionControlCompletedAt,
              )
              const stopItems = items.filter((it) => it.shipmentStopId === stop.id)
              const canMarkArrived =
                (status === "in_transit" ||
                  status === "dispatched" ||
                  status === "reception_control") &&
                !stop.arrivedAt &&
                prevAllReceived
              const canStartControl =
                !!stop.arrivedAt &&
                !stop.receptionControlStartedAt &&
                !stop.receptionControlCompletedAt &&
                (status === "in_transit" ||
                  status === "reception_control" ||
                  status === "dispatched")
              /** Solo flags de la parada: el envío puede volver a in_transit entre paradas. */
              const inStopReception =
                !!stop.receptionControlStartedAt &&
                !stop.receptionControlCompletedAt
              /** En ruta: una sola parada “en foco” muestra el pedido (la que tocó o la siguiente). */
              const liveReceptionStop = ordered.find(
                (s: any) =>
                  s.receptionControlStartedAt && !s.receptionControlCompletedAt,
              )
              const firstIncompleteStop = ordered.find(
                (s: any) => !s.receptionControlCompletedAt,
              )
              const focusStopId =
                liveReceptionStop?.id ?? firstIncompleteStop?.id ?? null
              const routeLegFocus =
                status === "in_transit" ||
                status === "dispatched" ||
                status === "reception_control"
              const showProductTable =
                status === "draft" ||
                status === "prepared" ||
                !routeLegFocus ||
                (focusStopId
                  ? stop.id === focusStopId && !stop.receptionControlCompletedAt
                  : true)
              let travelMin: number | null = null
              if (stop.arrivedAt) {
                if (idx === 0 && shipment.dispatchedAt) {
                  travelMin = Math.round(
                    (new Date(stop.arrivedAt).getTime() -
                      new Date(shipment.dispatchedAt).getTime()) /
                      60000,
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
              if (
                stop.receptionControlStartedAt &&
                stop.receptionControlCompletedAt
              ) {
                receptionMin = Math.round(
                  (new Date(stop.receptionControlCompletedAt).getTime() -
                    new Date(stop.receptionControlStartedAt).getTime()) /
                    60000,
                )
              }

              return (
                <div
                  key={stop.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    {canReorderStops ? (
                      <div
                        className="flex shrink-0 flex-col rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-0.5"
                        role="group"
                        aria-label={`Reordenar parada ${idx + 1}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleReorderStop(idx, -1)}
                          disabled={idx === 0 || reorderStopsLoading}
                          className="rounded-md p-1 text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-30"
                          aria-label="Mover parada hacia arriba"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorderStop(idx, 1)}
                          disabled={idx === ordered.length - 1 || reorderStopsLoading}
                          className="rounded-md p-1 text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-30"
                          aria-label="Mover parada hacia abajo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Parada {idx + 1}
                      </p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {stop.location?.name ?? "—"}
                      </p>
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
                    <div className="flex flex-wrap gap-2">
                      {canMarkArrived && (
                        <button
                          type="button"
                          onClick={() => handleMarkStopArrived(stop.id)}
                          disabled={actionLoading}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          Llegué a este local
                        </button>
                      )}
                      {canStartControl && (
                        <button
                          type="button"
                          onClick={() => handleStartStopReception(stop.id)}
                          disabled={actionLoading}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Iniciar control de recepción
                        </button>
                      )}
                    </div>
                  </div>

                  {showProductTable ? (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-400 dark:text-white" />
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Detalle de Items
                        </h4>
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
                              const canEditSent =
                                status === "draft" || status === "prepared"
                              const displaySentQty = canEditSent
                                ? sentQtys[item.id] ?? item.sentQty
                                : item.sentQty
                              const showReceivedPreview =
                                !inStopReception &&
                                item.receivedQty == null &&
                                !stop.receptionControlCompletedAt &&
                                (status === "draft" ||
                                  status === "prepared" ||
                                  status === "in_transit" ||
                                  status === "dispatched")

                              let receivedQty: number | undefined
                              let hasReceived = false
                              if (inStopReception) {
                                receivedQty = receivedQtys[item.id] ?? item.sentQty
                                hasReceived = true
                              } else if (item.receivedQty != null) {
                                receivedQty = item.receivedQty
                                hasReceived = true
                              }

                              const diff = hasReceived
                                ? displaySentQty - (receivedQty ?? 0)
                                : undefined
                              const hasDiff = diff !== undefined && diff !== 0

                              return (
                                <tr
                                  key={item.id}
                                  className="border-b border-gray-100 dark:border-gray-700"
                                >
                                  <td className="px-4 py-3">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                      {item.productName}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                    {canEditSent ? (
                                      <span className="inline-flex items-center gap-1">
                                        <FormattedNumberInput
                                          value={sentQtys[item.id] ?? item.sentQty}
                                          onChange={(n) =>
                                            setSentQtys((prev) => ({
                                              ...prev,
                                              [item.id]: Math.max(0, n),
                                            }))
                                          }
                                          onBlur={() => {
                                            const q = sentQtys[item.id] ?? item.sentQty
                                            const prev = item.sentQty ?? 0
                                            if (
                                              q >= 0 &&
                                              Math.abs(q - prev) > 1e-9
                                            ) {
                                              saveSentQty(item.id, q)
                                            }
                                          }}
                                          className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          aria-label={`Cantidad enviada ${item.productName}`}
                                          disabled={savingSentItemId === item.id}
                                        />
                                        {savingSentItemId === item.id && (
                                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                                        )}
                                      </span>
                                    ) : (
                                      formatNumber(displaySentQty)
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                    {inStopReception ? (
                                      <FormattedNumberInput
                                        value={receivedQtys[item.id] ?? item.sentQty}
                                        onChange={(n) =>
                                          setReceivedQtys((prev) => ({
                                            ...prev,
                                            [item.id]: Math.max(0, n),
                                          }))
                                        }
                                        className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        aria-label={`Cantidad recibida ${item.productName}`}
                                      />
                                    ) : item.receivedQty != null ? (
                                      formatNumber(item.receivedQty)
                                    ) : showReceivedPreview ? (
                                      <span
                                        className="text-gray-500 dark:text-gray-400"
                                        title="Mismo valor que enviado hasta que inicies el control de recepción en este local; ahí podrás ajustar lo recibido."
                                      >
                                        {formatNumber(displaySentQty)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300 dark:text-gray-400">
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {hasReceived ? (
                                      <span
                                        className={cn(
                                          "text-sm font-medium tabular-nums",
                                          hasDiff
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-green-600 dark:text-green-400",
                                        )}
                                      >
                                        {hasDiff ? diff : "0"}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-gray-300 dark:text-gray-400">
                                        —
                                      </span>
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
                                      <span className="text-xs text-gray-400 dark:text-white">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                            {stopItems.length === 0 && (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="px-4 py-8 text-center text-sm text-gray-400 dark:text-white"
                                >
                                  No hay items en esta parada
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {stopItems.some((item) => item.diffReason) && (
                        <div className="mt-4 space-y-2">
                          {stopItems
                            .filter((item) => item.diffReason)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 px-3 py-2"
                              >
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-400" />
                                <p className="text-xs text-orange-700 dark:text-orange-200">
                                  <span className="font-medium">
                                    {item.productName}:
                                  </span>{" "}
                                  {item.diffReason}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : !stop.receptionControlCompletedAt ? (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      El pedido de esta parada se muestra solo cuando es la parada actual de la ruta (la que te toca ahora).
                    </p>
                  ) : null}

                  {inStopReception && status === "reception_control" && (
                    <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-600">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Datos de recepción
                      </h4>
                      <div>
                        <label htmlFor="received-by-name" className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                          Nombre de quien recibe <span className="text-red-500">*</span>
                        </label>
                        <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                          Obligatorio para registrar la entrega
                        </p>
                        <input
                          id="received-by-name"
                          type="text"
                          value={receivedByName}
                          onChange={(e) => setReceivedByName(e.target.value)}
                          placeholder="Ej: Juan Pérez"
                          className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          aria-label="Nombre de quien recibe"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                          Firma <span className="text-red-500">*</span>
                        </label>
                        <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                          Obligatoria para registrar la entrega
                        </p>
                        <div className="flex flex-col gap-2">
                          <canvas
                            ref={signatureCanvasRef}
                            width={300}
                            height={120}
                            className="cursor-crosshair touch-none rounded-lg border border-gray-300 bg-white"
                            onMouseDown={handleSignatureMouseDown}
                            onMouseMove={handleSignatureMouseMove}
                            onMouseUp={handleSignatureMouseUp}
                            onMouseLeave={handleSignatureMouseUp}
                            aria-label="Área de firma"
                          />
                          <button
                            type="button"
                            onClick={clearSignature}
                            className="w-fit rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
                          >
                            Limpiar firma
                          </button>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="reception-notes" className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                          ¿Faltó algo o llegó algo roto/dañado? (opcional)
                        </label>
                        <textarea
                          id="reception-notes"
                          value={receptionNotes}
                          onChange={(e) => setReceptionNotes(e.target.value)}
                          placeholder="Ej: Faltaban 2 unidades de agua, una caja llegó golpeada..."
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          aria-label="Observaciones de recepción"
                        />
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Cuando esté completo, confirmá esta parada.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConfirmStopReception(stop.id)}
                        disabled={actionLoading || !hasSignature || !receivedByName.trim()}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Confirmar recepción de {stop.location?.name ?? "esta parada"}
                      </button>
                    </div>
                  )}

                  {stop.receptionControlCompletedAt && (
                    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-600">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                        Parada recepcionada
                      </p>
                      {stop.receivedByName ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Recibido por</p>
                          <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                            {stop.receivedByName}
                          </p>
                        </div>
                      ) : null}
                      {stop.receivedBySignature ? (
                        <div>
                          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Firma</p>
                          <img
                            src={stop.receivedBySignature}
                            alt={`Firma · ${stop.location?.name ?? "parada"}`}
                            className="max-h-28 max-w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white object-contain p-1"
                          />
                        </div>
                      ) : null}
                      {stop.receptionNotes?.trim() ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Observaciones</p>
                          <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-900 dark:text-white">
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

      {/* -------- Datos de recepción (solo envío simple; en multi-parada van dentro de la tarjeta activa) -------- */}
      {status === "reception_control" && !isMultiStop && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Datos de recepción
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="received-by-name" className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                Nombre de quien recibe <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                Obligatorio para registrar la entrega
              </p>
              <input
                id="received-by-name"
                type="text"
                value={receivedByName}
                onChange={(e) => setReceivedByName(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Nombre de quien recibe"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                Firma <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                Obligatoria para registrar la entrega
              </p>
              <div className="flex flex-col gap-2">
                <canvas
                  ref={signatureCanvasRef}
                  width={300}
                  height={120}
                  className="cursor-crosshair touch-none rounded-lg border border-gray-300 bg-white"
                  onMouseDown={handleSignatureMouseDown}
                  onMouseMove={handleSignatureMouseMove}
                  onMouseUp={handleSignatureMouseUp}
                  onMouseLeave={handleSignatureMouseUp}
                  aria-label="Área de firma"
                />
                <button
                  type="button"
                  onClick={clearSignature}
                  className="w-fit rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Limpiar firma
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reception-notes" className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                ¿Faltó algo o llegó algo roto/dañado? (opcional)
              </label>
              <textarea
                id="reception-notes"
                value={receptionNotes}
                onChange={(e) => setReceptionNotes(e.target.value)}
                placeholder="Ej: Faltaban 2 unidades de agua, una caja llegó golpeada..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Observaciones de recepción"
              />
            </div>
          </div>
        </div>
      )}

      {/* -------- Action error -------- */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* -------- Actions -------- */}
      <div className="flex flex-wrap items-center gap-3">
        {status === "draft" && (
          <button
            type="button"
            onClick={handleMarkPrepared}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-yellow-600 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4" />
            )}
            Marcar como Preparado
          </button>
        )}
        {status === "prepared" && (
          <button
            type="button"
            onClick={handleDispatch}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Despachar Envío
          </button>
        )}
        {(status === "dispatched" || status === "in_transit") && !isMultiStop && (
          <button
            type="button"
            onClick={handleLlegadaAlDestino}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Llegó al destino
          </button>
        )}
        {status === "reception_control" && !isMultiStop && (
          <button
            type="button"
            onClick={handleConfirmReception}
            disabled={actionLoading || !hasSignature || !receivedByName.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirmar Recepción
          </button>
        )}
        {status === "delivered" && (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Cerrar Envío
          </button>
        )}
        {(status === "draft" || status === "prepared") && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar Envío
          </button>
        )}
      </div>
    </div>
  )
}
