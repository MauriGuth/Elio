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
  type KdsBoardConfig,
} from "@/lib/kitchen-display-urgency"
import { unlockAudio, speakAnnouncement as speakAnnouncementChunked, cancelSpeech, speakShort } from "@/lib/speech"
import {
  ChefHat,
  Coffee,
  Wine,
  Croissant,
  Clock,
  Play,
  CheckCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Bell,
  Flame,
  Truck,
  Volume2,
  VolumeX,
  Sparkles,
  X,
} from "lucide-react"

/* ── Sector config: cocina solo muestra estos sectores ── */
const KITCHEN_SECTORS = ["kitchen", "delivery"]

const SECTOR_FILTERS: {
  value: string
  label: string
  icon: any
}[] = [
  { value: "all", label: "Todos", icon: ChefHat },
  { value: "kitchen", label: "Cocina", icon: Flame },
  { value: "delivery", label: "Delivery", icon: Truck },
]

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

/* ── Voice announcement: solo anuncia items de sectores permitidos (ej. cocina) ── */
function buildAnnouncement(
  order: any,
  sectorFilter: string,
  allowedSectors?: string[]
): { text: string; sector: string } | null {
  let items = (order.items ?? []).filter(
    (i: any) => !i.skipComanda && i.status === "pending"
  )
  if (allowedSectors?.length) {
    items = items.filter((i: any) => allowedSectors.includes(i.sector))
  }
  items = items.filter(
    (i: any) => sectorFilter === "all" || i.sector === sectorFilter
  )
  if (items.length === 0) return null

  const tableName = order.tableName || `Pedido ${order.orderNumber}`

  // Group items by sector
  const bySector = new Map<string, string[]>()
  for (const item of items) {
    const sector = item.sector || "kitchen"
    if (!bySector.has(sector)) bySector.set(sector, [])
    const qty = item.quantity > 1 ? `${item.quantity} ` : ""
    const notes = item.notes ? `, ${item.notes}` : ""
    bySector.get(sector)!.push(`${qty}${item.productName}${notes}`)
  }

  const parts: string[] = []
  const sectorLabels: Record<string, string> = {
    kitchen: "Cocina",
    bar: "Bar",
    coffee: "Café",
    bakery: "Panadería",
    delivery: "Delivery",
  }

  for (const [sector, sectorItems] of bySector) {
    const label = sectorLabels[sector] || sector
    if (sectorFilter === "all" && bySector.size > 1) {
      parts.push(`${label}: ${sectorItems.join(", ")}`)
    } else {
      parts.push(sectorItems.join(", "))
    }
  }

  const mainSector =
    bySector.size === 1 ? Array.from(bySector.keys())[0] : "all"

  return {
    text: `Nueva comanda, ${tableName}. ${parts.join(". ")}`,
    sector: mainSector,
  }
}

interface AnnouncementItem {
  id: string
  text: string
  sector: string
  orderNumber: string
  tableName: string
  timestamp: number
}

/* ── Order card: solo muestra items de allowedSectors (cocina/delivery) ── */
function KitchenOrderCard({
  order,
  variant,
  sectorFilter,
  allowedSectors,
  onStart,
  onReady,
  updating,
}: {
  order: any
  variant: "urgent" | "pending" | "in_progress"
  sectorFilter: string
  allowedSectors: string[]
  onStart: (orderId: string, itemIds: string[]) => void
  onReady: (orderId: string, itemIds: string[]) => void
  updating: string | null
}) {
  const items =
    order.items?.filter((i: any) => {
      if (!allowedSectors.includes(i.sector)) return false
      if (sectorFilter !== "all" && i.sector !== sectorFilter) return false
      if (variant === "urgent" || variant === "pending")
        return i.status === "pending"
      return i.status === "in_progress"
    }) ?? []

  if (items.length === 0) return null

  const waitMin = minutesAgo(order.openedAt)
  const isUrgent = variant === "urgent"
  const isUpdating = updating === order.id

  const pendingIds = items
    .filter((i: any) => i.status === "pending")
    .map((i: any) => i.id)
  const progressIds = items
    .filter((i: any) => i.status === "in_progress")
    .map((i: any) => i.id)

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        isUrgent
          ? "border-red-500/40 bg-red-950/50"
          : variant === "pending"
            ? "border-gray-700 bg-gray-800"
            : "border-blue-500/40 bg-blue-950/30"
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">
              #{order.orderNumber}
            </span>
            {isUrgent && (
              <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Urgente
              </span>
            )}
          </div>
          {order.tableName && (
            <p className="text-sm text-gray-400">{order.tableName}</p>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
            isUrgent
              ? "bg-red-500/20 text-red-300"
              : "bg-gray-700 text-gray-300"
          )}
        >
          <Clock className="h-3 w-3" />
          {formatWait(order.openedAt)}
        </div>
      </div>

      {/* Items */}
      <div className="mb-3 space-y-1.5">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-700 text-xs font-bold text-gray-300">
              {item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-200">
                {item.productName}
              </span>
              {item.notes && (
                <p className="mt-1.5 rounded-lg border-l-4 border-amber-400 bg-amber-950/35 py-1.5 pl-2 pr-1 text-base font-bold leading-snug text-amber-100 break-words">
                  {item.notes}
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                item.sector === "bar"
                  ? "bg-purple-900/50 text-purple-300"
                  : item.sector === "coffee"
                    ? "bg-amber-900/50 text-amber-300"
                    : item.sector === "bakery"
                      ? "bg-yellow-900/50 text-yellow-300"
                      : "bg-orange-900/50 text-orange-300"
              )}
            >
              {
                SECTOR_FILTERS.find((s) => s.value === item.sector)?.label ??
                item.sector
              }
            </span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {(variant === "urgent" || variant === "pending") &&
          pendingIds.length > 0 && (
            <button
              onClick={() => onStart(order.id, pendingIds)}
              disabled={isUpdating}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-400 active:scale-[0.97] disabled:opacity-50"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Iniciar
            </button>
          )}

        {variant === "in_progress" && progressIds.length > 0 && (
          <button
            onClick={() => onReady(order.id, progressIds)}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Listo
          </button>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════
   MAIN COMPONENT — Kitchen Display
   ══════════════════════════════════════ */
export default function KitchenPage() {
  const [locationId, setLocationId] = useState("")
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sectorFilter, setSectorFilter] = useState("all")
  const [updating, setUpdating] = useState<string | null>(null)
  const [hasNewOrders, setHasNewOrders] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const prevOrderIdsRef = useRef<Set<string>>(new Set())
  const prevItemIdsRef = useRef<Map<string, Set<string>>>(new Map()) // orderId → Set<itemId>

  /* ── voice state ── */
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [speakingText, setSpeakingText] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const announcementQueueRef = useRef<AnnouncementItem[]>([])
  const voiceUnlockedRef = useRef(false)
  const isSpeakingRef = useRef(false)

  /* ── resolve location ── */
  useEffect(() => {
    const user = authApi.getStoredUser()
    const loc =
      user?.location ||
      (() => {
        try {
          return JSON.parse(
            localStorage.getItem(getLocationKey()) || "null"
          )
        } catch {
          return null
        }
      })()
    if (loc?.id) setLocationId(loc.id)
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
          setHasNewOrders(true)
          setTimeout(() => setHasNewOrders(false), 5_000)

          // Build announcements for new orders (solo items de cocina/delivery)
          for (const newOrder of newOnes) {
            const ann = buildAnnouncement(newOrder, sectorFilter, KITCHEN_SECTORS)
            if (ann) {
              const item: AnnouncementItem = {
                id: crypto.randomUUID(),
                text: ann.text,
                sector: ann.sector,
                orderNumber: newOrder.orderNumber,
                tableName: newOrder.tableName || `#${newOrder.orderNumber}`,
                timestamp: Date.now(),
              }
              setAnnouncements((prev) => [item, ...prev].slice(0, 10))

              if (voiceEnabled) {
                announcementQueueRef.current.push(item)
              }
            }
          }

          // Process announcement queue
          if (voiceEnabled && !isSpeakingRef.current) {
            processAnnouncementQueue()
          }
        }

        // Detect new items added to EXISTING orders (solo anuncia si son de cocina/delivery)
        for (const order of list) {
          if (!prevIds.has(order.id)) continue // skip brand-new orders (already announced above)
          const prevItemIds = prevItemMap.get(order.id)
          if (!prevItemIds) continue
          const addedItems = (order.items ?? []).filter(
            (i: any) =>
              !i.skipComanda &&
              !prevItemIds.has(i.id) &&
              i.status === "pending"
          )
          const addedKitchenItems = addedItems.filter((i: any) =>
            KITCHEN_SECTORS.includes(i.sector)
          )
          if (addedKitchenItems.length > 0) {
            setHasNewOrders(true)
            setTimeout(() => setHasNewOrders(false), 5_000)
            const tableName =
              order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
            const itemNames = addedKitchenItems
              .map((i: any) => {
                const qty = i.quantity > 1 ? `${i.quantity} ` : ""
                const notes = i.notes ? `, ${i.notes}` : ""
                return `${qty}${i.productName}${notes}`
              })
              .join(", ")
            const ann: AnnouncementItem = {
              id: crypto.randomUUID(),
              text: `A ${tableName} se le agregó: ${itemNames}`,
              sector: addedKitchenItems[0]?.sector || "kitchen",
              orderNumber: order.orderNumber,
              tableName: tableName,
              timestamp: Date.now(),
            }
            setAnnouncements((prev) => [ann, ...prev].slice(0, 10))
            if (voiceEnabled) {
              announcementQueueRef.current.push(ann)
            }
          }
        }
        if (voiceEnabled && announcementQueueRef.current.length > 0 && !isSpeakingRef.current) {
          processAnnouncementQueue()
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
  }, [locationId])

  const processAnnouncementQueue = useCallback(() => {
    if (announcementQueueRef.current.length === 0) {
      isSpeakingRef.current = false
      setSpeakingText(null)
      return
    }
    isSpeakingRef.current = true
    const next = announcementQueueRef.current.shift()!
    setSpeakingText(next.text)
    speakAnnouncementChunked(next.text, () => {
      setSpeakingText(null)
      setTimeout(processAnnouncementQueue, 350)
    })
  }, [])

  // Preload voices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices()
      }
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Auto-refresh every 3 s
  useEffect(() => {
    if (!locationId) return
    const id = setInterval(fetchOrders, 3_000)
    return () => clearInterval(id)
  }, [locationId, fetchOrders])

  /* ── tick to re-evaluate urgency every 10s ── */
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3_000)
    return () => clearInterval(id)
  }, [])

  /* ── helpers: solo cocina/delivery ── */
  const boardCfg: KdsBoardConfig = {
    allowedSectors: KITCHEN_SECTORS,
    sectorFilter,
    excludeSkipComanda: true,
  }

  const urgentOrders = orders.filter((o) => orderIsUrgent(o, boardCfg))

  const urgentIds = new Set(urgentOrders.map((o: any) => o.id))

  const pendingOrders = orders.filter(
    (o) => !urgentIds.has(o.id) && orderHasPendingOnBoard(o, boardCfg)
  )

  const inProgressOrders = orders.filter(
    (o) => !urgentIds.has(o.id) && orderHasInProgressOnBoard(o, boardCfg)
  )

  /* ── actions ── */
  const handleStart = async (orderId: string, itemIds: string[]) => {
    setUpdating(orderId)
    try {
      await Promise.all(
        itemIds.map((id) =>
          ordersApi.updateItemStatus(id, { status: "in_progress" })
        )
      )
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
      await Promise.all(
        itemIds.map((id) =>
          ordersApi.updateItemStatus(id, { status: "ready" })
        )
      )
      // Find the order to announce
      const order = orders.find((o) => o.id === orderId)
      if (order && voiceEnabled) {
        const tableName = order.tableName || order.table?.name || `Pedido #${order.orderNumber}`
        speakShort(`¡${tableName} lista! Comanda terminada.`)
      }
      await fetchOrders()
    } catch {
      setError("Error al actualizar estado")
    } finally {
      setUpdating(null)
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-3 text-sm text-gray-400">Cargando cocina...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* ── Kitchen header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-amber-500" />
          <h1 className="text-lg font-bold text-white">
            Pantalla de Cocina
          </h1>

          {/* New order indicator */}
          {hasNewOrders && (
            <span className="flex items-center gap-1.5 animate-pulse rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
              <Bell className="h-3.5 w-3.5" />
              Nuevo pedido
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sector filter */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-800 p-1">
            {SECTOR_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSectorFilter(s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sectorFilter === s.value
                    ? "bg-amber-500 text-white"
                    : "text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Voice toggle — al activar, desbloquear audio (necesario en móvil) */}
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
            title={voiceEnabled ? "Desactivar anuncios de voz" : "Activar anuncios de voz"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              voiceEnabled
                ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                : "bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
            )}
          >
            {voiceEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {voiceEnabled ? "Voz ON" : "Voz OFF"}
            </span>
          </button>

          {/* Refresh */}
          <button
            onClick={async () => { setRefreshing(true); await fetchOrders(); setTimeout(() => setRefreshing(false), 600) }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 transition-all hover:bg-gray-700 hover:text-white active:scale-90"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Actualizar</span>
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

      {/* Banner: texto que se anuncia por voz (por si no se entiende en TV/móvil) */}
      {speakingText && voiceEnabled && (
        <div className="border-b border-amber-800 bg-amber-950/90 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-200">
            <Volume2 className="mr-1.5 inline h-4 w-4 text-amber-400" />
            Ahora dice: <span className="text-amber-100">{speakingText}</span>
          </p>
        </div>
      )}

      {/* ── Recent announcements banner ── */}
      {announcements.length > 0 && (
        <div className="border-b border-gray-800 bg-gray-950/80">
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
            {announcements.slice(0, 3).map((ann) => {
              const sectorLabel =
                SECTOR_FILTERS.find((s) => s.value === ann.sector)?.label || ""
              const age = Math.floor((Date.now() - ann.timestamp) / 60_000)
              const ageStr = age < 1 ? "ahora" : `${age}min`
              return (
                <div
                  key={ann.id}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5"
                >
                  <Bell className="h-3 w-3 text-amber-400" />
                  <span className="text-xs text-amber-300">
                    <span className="font-semibold">{ann.tableName}</span>
                    {sectorLabel && (
                      <span className="ml-1 text-amber-500">({sectorLabel})</span>
                    )}
                  </span>
                  <span className="text-[10px] text-gray-500">{ageStr}</span>
                </div>
              )
            })}
            {announcements.length > 3 && (
              <span className="shrink-0 text-[10px] text-gray-500">
                +{announcements.length - 3} más
              </span>
            )}
            <button
              onClick={() => setAnnouncements([])}
              title="Limpiar anuncios"
              className="ml-auto shrink-0 rounded p-1 text-gray-600 hover:bg-gray-800 hover:text-gray-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Three-column board ── */}
      <div className="flex-1 overflow-auto">
        <div className="grid min-h-full grid-cols-1 gap-0 md:grid-cols-3">
          {/* URGENTE column */}
          <div className="flex flex-col border-r border-gray-800 md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-red-950/90 px-4 py-2.5 backdrop-blur">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold text-red-400">Urgente</span>
              <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
                {urgentOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {urgentOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-600">
                  Sin pedidos urgentes
                </p>
              ) : (
                urgentOrders.map((order) => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    variant="urgent"
                    sectorFilter={sectorFilter}
                    allowedSectors={KITCHEN_SECTORS}
                    onStart={handleStart}
                    onReady={handleReady}
                    updating={updating}
                  />
                ))
              )}
            </div>
          </div>

          {/* EN COLA column */}
          <div className="flex flex-col border-r border-gray-800 md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-amber-950/90 px-4 py-2.5 backdrop-blur">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">
                En Cola
              </span>
              <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                {pendingOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {pendingOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-600">
                  Sin pedidos en cola
                </p>
              ) : (
                pendingOrders.map((order) => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    variant="pending"
                    sectorFilter={sectorFilter}
                    allowedSectors={KITCHEN_SECTORS}
                    onStart={handleStart}
                    onReady={handleReady}
                    updating={updating}
                  />
                ))
              )}
            </div>
          </div>

          {/* EN PREPARACIÓN column */}
          <div className="flex flex-col md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-blue-950/90 px-4 py-2.5 backdrop-blur">
              <Flame className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400">
                En Preparación
              </span>
              <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                {inProgressOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {inProgressOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-600">
                  Sin pedidos en preparación
                </p>
              ) : (
                inProgressOrders.map((order) => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    variant="in_progress"
                    sectorFilter={sectorFilter}
                    allowedSectors={KITCHEN_SECTORS}
                    onStart={handleStart}
                    onReady={handleReady}
                    updating={updating}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer stats ── */}
      <div className="flex items-center justify-between border-t border-gray-800 bg-gray-950 px-4 py-2 text-xs text-gray-500">
        <span>
          Total: {urgentOrders.length + pendingOrders.length + inProgressOrders.length} pedidos activos
        </span>
        <div className="flex items-center gap-3">
          {voiceEnabled && (
            <span className="flex items-center gap-1 text-amber-500">
              <Volume2 className="h-3 w-3" />
              Anuncios de voz activos
            </span>
          )}
          <span>Auto-actualización cada 3s</span>
        </div>
      </div>
    </div>
  )
}
