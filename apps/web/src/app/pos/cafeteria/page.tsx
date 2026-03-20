"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ordersApi } from "@/lib/api/orders"
import { authApi } from "@/lib/api/auth"
import { getLocationKey } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  orderIsUrgent,
  orderHasPendingOnBoard,
  orderHasInProgressOnBoard,
  urgentLeadMinutesForVoice,
  type KdsBoardConfig,
} from "@/lib/kitchen-display-urgency"
import { unlockAudio, speakAnnouncement, cancelSpeech, speakShort } from "@/lib/speech"
import {
  Coffee,
  Clock,
  Play,
  CheckCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Bell,
  Wine,
  Croissant,
  Volume2,
  VolumeX,
  Flame,
} from "lucide-react"

/* ── Sector config — ONLY café/bar/bakery belong here ── */
const CAFE_SECTORS = ["coffee", "bar", "bakery"]

const SECTOR_FILTERS: { value: string; label: string; icon: any }[] = [
  { value: "all", label: "Todos", icon: Coffee },
  { value: "coffee", label: "Café", icon: Coffee },
  { value: "bar", label: "Bar", icon: Wine },
  { value: "bakery", label: "Panadería", icon: Croissant },
]

const SECTOR_LABELS: Record<string, string> = {
  coffee: "Café",
  bar: "Bar",
  bakery: "Panadería",
}

/* ── Thresholds ── */

/* ── Helpers ── */
function minutesAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000)
}

function formatWait(dateStr: string): string {
  const m = minutesAgo(dateStr)
  if (m < 1) return "Ahora"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

/* ══════════════════════════════════════
   MAIN COMPONENT — POS Cafetería Display
   ══════════════════════════════════════ */
export default function PosCafeteriaPage() {
  const [locationId, setLocationId] = useState("")
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sectorFilter, setSectorFilter] = useState("all")
  const [updating, setUpdating] = useState<string | null>(null)
  const [hasNewOrders, setHasNewOrders] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const prevItemIdsRef = useRef<Map<string, Set<string>>>(new Map())

  /* ── voice state ── */
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [speakingText, setSpeakingText] = useState<string | null>(null)
  const announcementQueueRef = useRef<string[]>([])
  const isSpeakingRef = useRef(false)
  const announcedUrgentRef = useRef<Set<string>>(new Set())
  const voiceUnlockedRef = useRef(false)

  /* ── resolve location from POS storage ── */
  useEffect(() => {
    const user = authApi.getStoredUser()
    const loc =
      user?.location ||
      (() => {
        try {
          return JSON.parse(localStorage.getItem(getLocationKey()) || "null")
        } catch {
          return null
        }
      })()

    if (loc?.id) {
      setLocationId(loc.id)
    }
  }, [])

  /* ── fetch orders ── */
  const fetchOrders = useCallback(async () => {
    if (!locationId) return
    try {
      const data = await ordersApi.getKitchenOrders(locationId)
      const list = Array.isArray(data) ? data : data?.data ?? []
      setOrders(list)

      // Detect new orders and new items added to existing orders
      const currentIds = new Set<string>(list.map((o: any) => o.id))
      const prevIds = prevOrderIdsRef.current
      const prevItemMap = prevItemIdsRef.current
      const newItemMap = new Map<string, Set<string>>()

      // Incluir primera carga: si no hay prevIds, tratar todas las órdenes como nuevas para anunciar
      const newOnes = prevIds.size > 0 ? list.filter((o: any) => !prevIds.has(o.id)) : list
      if (newOnes.length > 0) {
          const hasNewCafe = newOnes.some((o: any) =>
            (o.items ?? []).some(
              (i: any) => i.status === "pending" && CAFE_SECTORS.includes(i.sector)
            )
          )
          if (hasNewCafe) {
            setHasNewOrders(true)
            setTimeout(() => setHasNewOrders(false), 5_000)
          }

          if (voiceEnabled) {
            for (const order of newOnes) {
              const tableName =
                order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
              const items = (order.items ?? [])
                .filter(
                  (i: any) =>
                    !i.skipComanda &&
                    i.status === "pending" &&
                    CAFE_SECTORS.includes(i.sector) &&
                    (sectorFilter === "all" || i.sector === sectorFilter)
                )
                .map((i: any) => {
                  const qty = i.quantity > 1 ? `${i.quantity} ` : ""
                  const notes = i.notes ? `, ${i.notes}` : ""
                  return `${qty}${i.productName}${notes}`
                })

              if (items.length > 0) {
                const text = `Nueva comanda cafetería, ${tableName}. ${items.join(", ")}`
                announcementQueueRef.current.push(text)
              }
            }
            if (!isSpeakingRef.current) processQueue()
          }
        }

        // Detect new items added to EXISTING orders
        if (voiceEnabled) {
          for (const order of list) {
            if (!prevIds.has(order.id)) continue // skip brand-new (already announced above)
            const prevItemIds = prevItemMap.get(order.id)
            if (!prevItemIds) continue
            const addedItems = (order.items ?? []).filter(
              (i: any) =>
                !i.skipComanda &&
                !prevItemIds.has(i.id) &&
                i.status === "pending" &&
                CAFE_SECTORS.includes(i.sector)
            )
            if (addedItems.length > 0) {
              setHasNewOrders(true)
              setTimeout(() => setHasNewOrders(false), 5_000)
              const tableName = order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
              const itemNames = addedItems.map((i: any) => {
                const qty = i.quantity > 1 ? `${i.quantity} ` : ""
                const notes = i.notes ? `, ${i.notes}` : ""
                return `${qty}${i.productName}${notes}`
              }).join(", ")
              announcementQueueRef.current.push(`A ${tableName} se le agregó: ${itemNames}`)
            }
          }
          if (announcementQueueRef.current.length > 0 && !isSpeakingRef.current) processQueue()
        }

      // Update tracking refs
      for (const order of list) {
        const itemIds = new Set<string>((order.items ?? []).map((i: any) => i.id))
        newItemMap.set(order.id, itemIds)
      }
      prevOrderIdsRef.current = currentIds
      prevItemIdsRef.current = newItemMap
      setError("")
    } catch {
      setError("Error al cargar pedidos")
    } finally {
      setLoading(false)
    }
  }, [locationId, voiceEnabled, sectorFilter])

  const processQueue = useCallback(() => {
    if (announcementQueueRef.current.length === 0) {
      isSpeakingRef.current = false
      setSpeakingText(null)
      return
    }
    isSpeakingRef.current = true
    const text = announcementQueueRef.current.shift()!
    setSpeakingText(text)
    speakAnnouncement(text, () => {
      setSpeakingText(null)
      setTimeout(processQueue, 350)
    })
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (!locationId) return
    const id = setInterval(fetchOrders, 3_000)
    return () => clearInterval(id)
  }, [locationId, fetchOrders])

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3_000)
    return () => clearInterval(id)
  }, [])

  /* ── classify orders — only café sectors ── */
  const boardCfg: KdsBoardConfig = {
    allowedSectors: CAFE_SECTORS,
    sectorFilter,
    excludeSkipComanda: true,
  }

  const urgentOrders = orders.filter((o) => orderIsUrgent(o, boardCfg))

  const urgentIds = new Set(urgentOrders.map((o) => o.id))

  const pendingOrders = orders.filter(
    (o) => !urgentIds.has(o.id) && orderHasPendingOnBoard(o, boardCfg)
  )

  const inProgressOrders = orders.filter(
    (o) => !urgentIds.has(o.id) && orderHasInProgressOnBoard(o, boardCfg)
  )

  /* ── Detect newly urgent orders and announce ── */
  useEffect(() => {
    if (!voiceEnabled || urgentOrders.length === 0) return
    const voiceCfg: KdsBoardConfig = {
      allowedSectors: CAFE_SECTORS,
      sectorFilter,
      excludeSkipComanda: true,
    }
    for (const order of urgentOrders) {
      if (!announcedUrgentRef.current.has(order.id)) {
        announcedUrgentRef.current.add(order.id)
        const tableName = order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
        const waitMin = urgentLeadMinutesForVoice(order, voiceCfg)
        const text = `¡Atención cafetería! ${tableName} pasó a urgente. Superó el tiempo de elaboración (unos ${waitMin} minutos).`
        announcementQueueRef.current.push(text)
      }
    }
    if (announcementQueueRef.current.length > 0 && !isSpeakingRef.current) {
      processQueue()
    }
  }, [urgentOrders, voiceEnabled, processQueue, sectorFilter])

  /* ── actions ── */
  const handleStart = async (orderId: string, itemIds: string[]) => {
    setUpdating(orderId)
    try {
      await Promise.all(itemIds.map((id) => ordersApi.updateItemStatus(id, { status: "in_progress" })))
      await fetchOrders()
    } catch {
      setError("Error al actualizar estado")
    } finally {
      setUpdating(null)
    }
  }

  const handleReady = async (orderId: string, itemIds: string[]) => {
    setUpdating(orderId)
    try {
      await Promise.all(itemIds.map((id) => ordersApi.updateItemStatus(id, { status: "ready" })))
      const order = orders.find((o) => o.id === orderId)
      if (order && voiceEnabled) {
        const tableName = order.tableName || order.table?.name || `Pedido #${order.orderNumber}`
        speakShort(`¡${tableName} lista! Pedido de cafetería terminado.`)
      }
      await fetchOrders()
    } catch {
      setError("Error al actualizar estado")
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
          <p className="mt-3 text-sm text-gray-500">Cargando cafetería...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-stone-900 text-white">
      {/* ── Sub-header with filters ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Coffee className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-bold text-white">Cafetería</span>

          {hasNewOrders && (
            <span className="flex items-center gap-1.5 animate-pulse rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
              <Bell className="h-3.5 w-3.5" />
              Nueva comanda
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-stone-800 p-1">
            {SECTOR_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSectorFilter(s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sectorFilter === s.value
                    ? "bg-amber-600 text-white"
                    : "text-stone-400 hover:bg-stone-700 hover:text-stone-200"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{s.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              const next = !voiceEnabled
              setVoiceEnabled(next)
              if (next) {
                if (!voiceUnlockedRef.current) {
                  unlockAudio()
                  voiceUnlockedRef.current = true
                }
              } else {
                cancelSpeech()
              }
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              voiceEnabled
                ? "bg-amber-500/20 text-amber-400"
                : "bg-stone-800 text-stone-500 hover:text-stone-300"
            )}
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{voiceEnabled ? "Voz ON" : "Voz OFF"}</span>
          </button>

          <button
            onClick={async () => { setRefreshing(true); await fetchOrders(); setTimeout(() => setRefreshing(false), 600) }}
            title="Actualizar"
            className="flex items-center gap-1.5 rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-stone-400 hover:bg-stone-700 hover:text-white active:scale-90 transition-all"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-800 bg-red-900/50 px-4 py-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {speakingText && voiceEnabled && (
        <div className="border-b border-amber-800 bg-amber-950/90 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-200">
            <Volume2 className="mr-1.5 inline h-4 w-4 text-amber-400" />
            Ahora dice: <span className="text-amber-100">{speakingText}</span>
          </p>
        </div>
      )}

      {/* ── Three-column board ── */}
      <div className="flex-1 overflow-auto">
        <div className="grid min-h-full grid-cols-1 gap-0 md:grid-cols-3">
          {/* URGENTE */}
          <div className="flex flex-col border-r border-stone-800 md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone-800 bg-red-950/90 px-4 py-2.5 backdrop-blur">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold text-red-400">Urgente</span>
              <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
                {urgentOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {urgentOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-600">Sin pedidos urgentes</p>
              ) : (
                urgentOrders.map((order) => (
                  <CafeOrderCard key={order.id} order={order} variant="urgent" sectorFilter={sectorFilter} onStart={handleStart} onReady={handleReady} updating={updating} />
                ))
              )}
            </div>
          </div>

          {/* EN COLA */}
          <div className="flex flex-col border-r border-stone-800 md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone-800 bg-amber-950/90 px-4 py-2.5 backdrop-blur">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">En Cola</span>
              <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                {pendingOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {pendingOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-600">Sin pedidos en cola</p>
              ) : (
                pendingOrders.map((order) => (
                  <CafeOrderCard key={order.id} order={order} variant="pending" sectorFilter={sectorFilter} onStart={handleStart} onReady={handleReady} updating={updating} />
                ))
              )}
            </div>
          </div>

          {/* EN PREPARACIÓN */}
          <div className="flex flex-col md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone-800 bg-blue-950/90 px-4 py-2.5 backdrop-blur">
              <Flame className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400">En Preparación</span>
              <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                {inProgressOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {inProgressOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-600">Sin pedidos en preparación</p>
              ) : (
                inProgressOrders.map((order) => (
                  <CafeOrderCard key={order.id} order={order} variant="in_progress" sectorFilter={sectorFilter} onStart={handleStart} onReady={handleReady} updating={updating} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-stone-800 bg-stone-950 px-4 py-2 text-xs text-stone-500">
        <span>Total: {urgentOrders.length + pendingOrders.length + inProgressOrders.length} pedidos</span>
        <div className="flex items-center gap-3">
          {voiceEnabled && (
            <span className="flex items-center gap-1 text-amber-500">
              <Volume2 className="h-3 w-3" />
              Voz activa
            </span>
          )}
          <span>Auto-actualización cada 3s</span>
        </div>
      </div>
    </div>
  )
}

/* ── Café Order Card ── */
function CafeOrderCard({
  order,
  variant,
  sectorFilter,
  onStart,
  onReady,
  updating,
}: {
  order: any
  variant: "urgent" | "pending" | "in_progress"
  sectorFilter: string
  onStart: (orderId: string, itemIds: string[]) => void
  onReady: (orderId: string, itemIds: string[]) => void
  updating: string | null
}) {
  const items =
    order.items?.filter((i: any) => {
      if (!CAFE_SECTORS.includes(i.sector)) return false
      if (sectorFilter !== "all" && i.sector !== sectorFilter) return false
      if (variant === "urgent") return i.status === "pending" || i.status === "in_progress"
      if (variant === "pending") return i.status === "pending"
      return i.status === "in_progress"
    }) ?? []

  if (items.length === 0) return null

  const isUrgent = variant === "urgent"
  const isUpdating = updating === order.id
  const tableName = order.tableName || order.table?.name || ""

  const pendingIds = items.filter((i: any) => i.status === "pending").map((i: any) => i.id)
  const progressIds = items.filter((i: any) => i.status === "in_progress").map((i: any) => i.id)

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        isUrgent
          ? "border-red-500/40 bg-red-950/50"
          : variant === "pending"
            ? "border-stone-700 bg-stone-800"
            : "border-blue-500/40 bg-blue-950/30"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">#{order.orderNumber}</span>
            {isUrgent && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                Urgente
              </span>
            )}
          </div>
          {tableName && <p className="text-sm text-stone-400">{tableName}</p>}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
            isUrgent ? "bg-red-500/20 text-red-300" : "bg-stone-700 text-stone-300"
          )}
        >
          <Clock className="h-3 w-3" />
          {formatWait(order.openedAt)}
        </div>
      </div>

      <div className="mb-3 space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className="rounded-lg bg-black/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-700 text-xs font-bold text-white">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-white">{item.productName}</span>
                {item.notes && (
                  <p className="mt-1.5 rounded-lg border-l-4 border-amber-400 bg-amber-950/40 py-1.5 pl-2 pr-1 text-base font-bold leading-snug text-amber-100 break-words">
                    {item.notes}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  item.sector === "coffee"
                    ? "bg-amber-900/50 text-amber-300"
                    : item.sector === "bar"
                      ? "bg-purple-900/50 text-purple-300"
                      : "bg-orange-900/50 text-orange-300"
                )}
              >
                {SECTOR_LABELS[item.sector] ?? item.sector}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {pendingIds.length > 0 && (
          <button
            onClick={() => onStart(order.id, pendingIds)}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-500 active:scale-[0.97] disabled:opacity-50"
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Iniciar
          </button>
        )}

        {progressIds.length > 0 && (
          <button
            onClick={() => onReady(order.id, progressIds)}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-50"
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            ¡Listo!
          </button>
        )}
      </div>
    </div>
  )
}
