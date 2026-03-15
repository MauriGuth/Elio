"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ordersApi } from "@/lib/api/orders"
import { authApi } from "@/lib/api/auth"
import { api, getLocationKey } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  ChefHat,
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
  LogOut,
} from "lucide-react"

/* ── Sector config — ONLY kitchen + delivery belong here ── */
const KITCHEN_SECTORS = ["kitchen", "delivery"]

const SECTOR_FILTERS: { value: string; label: string; icon: any }[] = [
  { value: "all", label: "Todos", icon: ChefHat },
  { value: "kitchen", label: "Cocina", icon: Flame },
  { value: "delivery", label: "Delivery", icon: Truck },
]

const SECTOR_LABELS: Record<string, string> = {
  kitchen: "Cocina",
  delivery: "Delivery",
}

/* ── Thresholds ── */
const URGENT_PENDING_MIN = 10
const URGENT_PREP_MIN = 30
const LEGACY_KITCHEN_LOCATION_KEY = "elio_kitchen_location"

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

function speakText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = "es-AR"
  utt.rate = 0.95
  utt.volume = 1
  const voices = window.speechSynthesis.getVoices()
  const esVoice =
    voices.find((v) => v.lang.startsWith("es") && v.name.includes("Google")) ||
    voices.find((v) => v.lang.startsWith("es"))
  if (esVoice) utt.voice = esVoice
  window.speechSynthesis.speak(utt)
}

/* ══════════════════════════════════════
   MAIN COMPONENT — Kitchen Display
   ══════════════════════════════════════ */
export default function KitchenDisplayPage() {
  const router = useRouter()
  const [locationId, setLocationId] = useState("")
  const [locationName, setLocationName] = useState("")
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
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const announcementQueueRef = useRef<string[]>([])
  const isSpeakingRef = useRef(false)
  const announcedUrgentRef = useRef<Set<string>>(new Set())

  /* ── resolve location from kitchen-specific storage ── */
  useEffect(() => {
    const isAuth = authApi.isAuthenticated()
    if (!isAuth) {
      router.push("/kitchen")
      return
    }

    const user = authApi.getStoredUser()
    const loc =
      user?.location ||
      (() => {
        try {
          const scopedValue = localStorage.getItem(getLocationKey())
          if (scopedValue) return JSON.parse(scopedValue)

          const legacyValue = localStorage.getItem(LEGACY_KITCHEN_LOCATION_KEY)
          if (!legacyValue) return null

          localStorage.setItem(getLocationKey(), legacyValue)
          return JSON.parse(legacyValue)
        } catch {
          return null
        }
      })()

    if (loc?.id) {
      setLocationId(loc.id)
      setLocationName(loc.name || "Cocina")
    } else {
      router.push("/kitchen")
    }
  }, [router])

  /* ── fetch orders ── */
  const fetchOrders = useCallback(async () => {
    if (!locationId) return
    try {
      const data = await ordersApi.getKitchenOrders(locationId)
      const list = Array.isArray(data) ? data : data?.data ?? []
      setOrders(list)

      // Detect new orders AND new items added to existing orders
      const currentIds = new Set<string>(list.map((o: any) => o.id))
      const prevIds = prevOrderIdsRef.current
      const prevItemMap = prevItemIdsRef.current
      const newItemMap = new Map<string, Set<string>>()

      if (prevIds.size > 0) {
        const newOnes = list.filter((o: any) => !prevIds.has(o.id))
        if (newOnes.length > 0) {
          setHasNewOrders(true)
          setTimeout(() => setHasNewOrders(false), 5_000)

          // Build voice announcements for NEW orders (only kitchen sectors)
          if (voiceEnabled) {
            for (const order of newOnes) {
              const tableName =
                order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
              const items = (order.items ?? [])
                .filter(
                  (i: any) =>
                    !i.skipComanda &&
                    i.status === "pending" &&
                    KITCHEN_SECTORS.includes(i.sector) &&
                    (sectorFilter === "all" || i.sector === sectorFilter)
                )
                .map((i: any) => {
                  const qty = i.quantity > 1 ? `${i.quantity} ` : ""
                  const notes = i.notes ? `, ${i.notes}` : ""
                  return `${qty}${i.productName}${notes}`
                })

              if (items.length > 0) {
                const text = `Nueva comanda, ${tableName}. ${items.join(", ")}`
                announcementQueueRef.current.push(text)
              }
            }
            if (!isSpeakingRef.current) processQueue()
          }
        }

        // Detect new items added to EXISTING orders
        if (voiceEnabled) {
          for (const order of list) {
            if (!prevIds.has(order.id)) continue // skip brand-new orders (already announced)
            const prevItemIds = prevItemMap.get(order.id)
            if (!prevItemIds) continue
            const addedItems = (order.items ?? []).filter(
              (i: any) =>
                !i.skipComanda &&
                !prevItemIds.has(i.id) &&
                i.status === "pending" &&
                KITCHEN_SECTORS.includes(i.sector)
            )
            if (addedItems.length > 0) {
              setHasNewOrders(true)
              setTimeout(() => setHasNewOrders(false), 5_000)
              const tableName =
                order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
              const itemNames = addedItems
                .map((i: any) => {
                  const qty = i.quantity > 1 ? `${i.quantity} ` : ""
                  const notes = i.notes ? `, ${i.notes}` : ""
                  return `${qty}${i.productName}${notes}`
                })
                .join(", ")
              const text = `A ${tableName} se le agregó: ${itemNames}`
              announcementQueueRef.current.push(text)
            }
          }
          if (announcementQueueRef.current.length > 0 && !isSpeakingRef.current) processQueue()
        }
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
      return
    }
    isSpeakingRef.current = true
    const text = announcementQueueRef.current.shift()!
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      const utt = new SpeechSynthesisUtterance(text)
      utt.lang = "es-AR"
      utt.rate = 0.95
      utt.volume = 1
      const voices = window.speechSynthesis.getVoices()
      const esVoice =
        voices.find(
          (v) => v.lang.startsWith("es") && v.name.includes("Google")
        ) || voices.find((v) => v.lang.startsWith("es"))
      if (esVoice) utt.voice = esVoice
      utt.onend = () => setTimeout(processQueue, 500)
      utt.onerror = () => setTimeout(processQueue, 500)
      window.speechSynthesis.speak(utt)
    } else {
      isSpeakingRef.current = false
    }
  }, [])

  // Preload voices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () =>
        window.speechSynthesis.getVoices()
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Auto-refresh every 10s
  useEffect(() => {
    if (!locationId) return
    const id = setInterval(fetchOrders, 3_000)
    return () => clearInterval(id)
  }, [locationId, fetchOrders])

  /* ── Time tick to re-evaluate urgent status every 10s ── */
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3_000)
    return () => clearInterval(id)
  }, [])

  /* ── classify orders — only kitchen sectors ── */
  const filterItems = (order: any) => {
    const all = (order.items ?? []).filter((i: any) => KITCHEN_SECTORS.includes(i.sector))
    if (sectorFilter === "all") return all
    return all.filter((i: any) => i.sector === sectorFilter)
  }

  const hasItemsWithStatus = (order: any, status: string) =>
    filterItems(order).some((i: any) => i.status === status)

  /** Check if any in_progress item started > N minutes ago */
  const hasPrepOverTime = (order: any, minutes: number) =>
    filterItems(order).some(
      (i: any) => i.status === "in_progress" && i.startedAt && minutesAgo(i.startedAt) >= minutes
    )

  // Urgent = pending > 10min OR in_progress > 30min
  const urgentOrders = orders.filter((o) => {
    const urgentPending = hasItemsWithStatus(o, "pending") && minutesAgo(o.openedAt) >= URGENT_PENDING_MIN
    const urgentPrep = hasPrepOverTime(o, URGENT_PREP_MIN)
    return urgentPending || urgentPrep
  })

  const urgentIds = new Set(urgentOrders.map((o) => o.id))

  const pendingOrders = orders.filter(
    (o) =>
      !urgentIds.has(o.id) &&
      hasItemsWithStatus(o, "pending") &&
      minutesAgo(o.openedAt) < URGENT_PENDING_MIN
  )

  const inProgressOrders = orders.filter(
    (o) => !urgentIds.has(o.id) && hasItemsWithStatus(o, "in_progress")
  )

  /* ── Detect newly urgent orders and announce ── */
  useEffect(() => {
    if (!voiceEnabled || urgentOrders.length === 0) return
    for (const order of urgentOrders) {
      if (!announcedUrgentRef.current.has(order.id)) {
        announcedUrgentRef.current.add(order.id)
        const tableName = order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
        const waitMin = minutesAgo(order.openedAt)
        const text = `¡Atención! ${tableName} pasó a urgente. Lleva ${waitMin} minutos de demora.`
        announcementQueueRef.current.push(text)
      }
    }
    if (announcementQueueRef.current.length > 0 && !isSpeakingRef.current) {
      processQueue()
    }
  }, [urgentOrders, voiceEnabled, processQueue])

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
      const order = orders.find((o) => o.id === orderId)
      if (order && voiceEnabled) {
        const tableName =
          order.tableName || order.table?.name || `Pedido #${order.orderNumber}`
        speakText(`¡${tableName} lista! Comanda terminada.`)
      }
      await fetchOrders()
    } catch {
      setError("Error al actualizar estado")
    } finally {
      setUpdating(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("elio_kitchen_location")
    api.clearToken()
    router.push("/kitchen")
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
          <p className="mt-3 text-sm text-gray-400">Cargando cocina...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-lg font-bold text-white">Cocina</h1>
            <p className="text-xs text-gray-500">{locationName}</p>
          </div>

          {hasNewOrders && (
            <span className="flex items-center gap-1.5 animate-pulse rounded-full bg-orange-500/20 px-3 py-1 text-xs font-semibold text-orange-400">
              <Bell className="h-3.5 w-3.5" />
              Nueva comanda
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sector filter */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-800 p-1">
            {SECTOR_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSectorFilter(s.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sectorFilter === s.value
                    ? "bg-orange-500 text-white"
                    : "text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{s.label}</span>
              </button>
            ))}
          </div>

          {/* Voice toggle */}
          <button
            onClick={() => {
              setVoiceEnabled(!voiceEnabled)
              if (voiceEnabled) window.speechSynthesis?.cancel()
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              voiceEnabled
                ? "bg-orange-500/20 text-orange-400"
                : "bg-gray-800 text-gray-500 hover:text-gray-300"
            )}
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{voiceEnabled ? "Voz ON" : "Voz OFF"}</span>
          </button>

          <button
            onClick={async () => { setRefreshing(true); await fetchOrders(); setTimeout(() => setRefreshing(false), 600) }}
            title="Actualizar"
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-white active:scale-90 transition-all"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", refreshing && "animate-spin")} />
          </button>

          <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:bg-red-900 hover:text-red-300">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
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

      {/* ── Three-column board ── */}
      <div className="flex-1 overflow-auto">
        <div className="grid min-h-full grid-cols-1 gap-0 md:grid-cols-3">
          {/* URGENTE */}
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
                <p className="py-8 text-center text-sm text-gray-600">Sin pedidos urgentes</p>
              ) : (
                urgentOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    variant="urgent"
                    allowedSectors={KITCHEN_SECTORS}
                    sectorFilter={sectorFilter}
                    sectorLabels={SECTOR_LABELS}
                    onStart={handleStart}
                    onReady={handleReady}
                    updating={updating}
                  />
                ))
              )}
            </div>
          </div>

          {/* EN COLA */}
          <div className="flex flex-col border-r border-gray-800 md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-amber-950/90 px-4 py-2.5 backdrop-blur">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-400">En Cola</span>
              <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                {pendingOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {pendingOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-600">Sin pedidos en cola</p>
              ) : (
                pendingOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    variant="pending"
                    allowedSectors={KITCHEN_SECTORS}
                    sectorFilter={sectorFilter}
                    sectorLabels={SECTOR_LABELS}
                    onStart={handleStart}
                    onReady={handleReady}
                    updating={updating}
                  />
                ))
              )}
            </div>
          </div>

          {/* EN PREPARACIÓN */}
          <div className="flex flex-col md:min-h-full">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-blue-950/90 px-4 py-2.5 backdrop-blur">
              <Flame className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-400">En Preparación</span>
              <span className="ml-auto rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                {inProgressOrders.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {inProgressOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-600">Sin pedidos en preparación</p>
              ) : (
                inProgressOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    variant="in_progress"
                    allowedSectors={KITCHEN_SECTORS}
                    sectorFilter={sectorFilter}
                    sectorLabels={SECTOR_LABELS}
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

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-800 bg-gray-950 px-4 py-2 text-xs text-gray-500">
        <span>
          Total: {urgentOrders.length + pendingOrders.length + inProgressOrders.length} pedidos
        </span>
        <div className="flex items-center gap-3">
          {voiceEnabled && (
            <span className="flex items-center gap-1 text-orange-500">
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

/* ── Order Card Component ── */
function OrderCard({
  order,
  variant,
  allowedSectors,
  sectorFilter,
  sectorLabels,
  onStart,
  onReady,
  updating,
}: {
  order: any
  variant: "urgent" | "pending" | "in_progress"
  allowedSectors: string[]
  sectorFilter: string
  sectorLabels: Record<string, string>
  onStart: (orderId: string, itemIds: string[]) => void
  onReady: (orderId: string, itemIds: string[]) => void
  updating: string | null
}) {
  const items =
    order.items?.filter((i: any) => {
      if (!allowedSectors.includes(i.sector)) return false
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
            ? "border-gray-700 bg-gray-800"
            : "border-blue-500/40 bg-blue-950/30"
      )}
    >
      {/* Header */}
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
          {tableName && <p className="text-sm text-gray-400">{tableName}</p>}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
            isUrgent ? "bg-red-500/20 text-red-300" : "bg-gray-700 text-gray-300"
          )}
        >
          <Clock className="h-3 w-3" />
          {formatWait(order.openedAt)}
        </div>
      </div>

      {/* Items with FULL detail */}
      <div className="mb-3 space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className="rounded-lg bg-black/20 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-700 text-xs font-bold text-white">
                {item.quantity}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-white">
                  {item.productName}
                </span>
                {item.notes && (
                  <p className="mt-0.5 text-xs italic text-amber-400">
                    Nota: {item.notes}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  item.sector === "delivery"
                    ? "bg-green-900/50 text-green-300"
                    : "bg-orange-900/50 text-orange-300"
                )}
              >
                {sectorLabels[item.sector] ?? item.sector}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {pendingIds.length > 0 && (
          <button
            onClick={() => onStart(order.id, pendingIds)}
            disabled={isUpdating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-400 active:scale-[0.97] disabled:opacity-50"
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
