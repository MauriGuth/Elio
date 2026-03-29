"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ordersApi } from "@/lib/api/orders"
import { authApi } from "@/lib/api/auth"
import { api, getLocationKey } from "@/lib/api"
import {
  loadKitchenEquipoIds,
  saveKitchenEquipoIds,
} from "@/lib/kitchen-equipo"
import { usersApi } from "@/lib/api/users"
import { cn } from "@/lib/utils"
import {
  orderIsUrgent,
  orderHasPendingOnBoard,
  orderHasInProgressOnBoard,
  urgentLeadMinutesForVoice,
  type KdsBoardConfig,
} from "@/lib/kitchen-display-urgency"
import { unlockAudio, speakAnnouncement, cancelSpeech, speakShort } from "@/lib/speech"
import { sileo } from "sileo"
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
  Users,
  X,
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
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [speakingText, setSpeakingText] = useState<string | null>(null)
  const announcementQueueRef = useRef<string[]>([])
  const isSpeakingRef = useRef(false)
  const announcedUrgentRef = useRef<Set<string>>(new Set())
  const voiceUnlockedRef = useRef(false)

  /* ── equipo cocina (solo usuarios rol Cocina + local; persistido en este navegador) ── */
  const [showEquipoModal, setShowEquipoModal] = useState(false)
  const [kitchenStaffForLocation, setKitchenStaffForLocation] = useState<any[]>([])
  const [equipoDraftIds, setEquipoDraftIds] = useState<string[]>([])
  const [equipoModalLoading, setEquipoModalLoading] = useState(false)
  const [equipoModalError, setEquipoModalError] = useState("")
  const [equipoSearch, setEquipoSearch] = useState("")
  const [equipoStorageTick, setEquipoStorageTick] = useState(0)

  const fetchKitchenStaffForLocation = useCallback(async (): Promise<boolean> => {
    if (!locationId) return false
    try {
      const res = await usersApi.getAll({
        role: "KITCHEN",
        locationId,
        isActive: true,
        limit: 100,
        page: 1,
      })
      const list = Array.isArray(res) ? res : res?.data ?? []
      const filtered = list.filter(
        (u: any) => u.isActive !== false && u.role === "KITCHEN",
      )
      filtered.sort((a: any, b: any) => {
        const na =
          `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email || ""
        const nb =
          `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || b.email || ""
        return na.localeCompare(nb, "es", { sensitivity: "base" })
      })
      setKitchenStaffForLocation(filtered)
      return true
    } catch {
      setKitchenStaffForLocation([])
      return false
    }
  }, [locationId])

  useEffect(() => {
    fetchKitchenStaffForLocation()
  }, [fetchKitchenStaffForLocation])

  const equipoMemberNames = useMemo(() => {
    if (!locationId) return []
    const saved = loadKitchenEquipoIds(locationId)
    const byId = new Map(kitchenStaffForLocation.map((u: any) => [u.id, u]))
    return saved
      .map((id) => {
        const u = byId.get(id)
        if (!u) return null
        const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
        return n || u.email || null
      })
      .filter(Boolean) as string[]
  }, [locationId, kitchenStaffForLocation, equipoStorageTick])

  const openEquipoModal = () => {
    if (!locationId) return
    setEquipoDraftIds(loadKitchenEquipoIds(locationId))
    setEquipoSearch("")
    setEquipoModalError("")
    setShowEquipoModal(true)
    setEquipoModalLoading(true)
    void fetchKitchenStaffForLocation().then((ok) => {
      if (!ok) setEquipoModalError("No se pudo cargar la lista de cocina.")
      setEquipoModalLoading(false)
    })
  }

  const kitchenStaffFiltered = useMemo(() => {
    const q = equipoSearch.trim().toLowerCase()
    if (!q) return kitchenStaffForLocation
    return kitchenStaffForLocation.filter((u: any) => {
      const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase()
      return n.includes(q) || String(u.email ?? "").toLowerCase().includes(q)
    })
  }, [kitchenStaffForLocation, equipoSearch])

  const toggleEquipoDraft = (userId: string) => {
    setEquipoDraftIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  const saveEquipoAndClose = () => {
    if (!locationId) return
    const allowed = new Set(kitchenStaffForLocation.map((u: any) => u.id))
    const next = equipoDraftIds.filter((id) => allowed.has(id))
    saveKitchenEquipoIds(locationId, next)
    setEquipoStorageTick((t) => t + 1)
    setShowEquipoModal(false)
    sileo.success({ title: "Equipo actualizado" })
  }

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

      // Solo órdenes realmente nuevas respecto al poll anterior (en la 1ª carga no anunciar: evita colapsar la voz / 20 mensajes seguidos)
      const newOnes =
        prevIds.size > 0 ? list.filter((o: any) => !prevIds.has(o.id)) : []
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
                    KITCHEN_SECTORS.includes((i.sector || "").toLowerCase())
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
            if (!prevIds.has(order.id)) continue // skip brand-new orders (already announced above)
            const prevItemIds = prevItemMap.get(order.id)
            if (!prevItemIds) continue
            const addedItems = (order.items ?? []).filter(
              (i: any) =>
                !i.skipComanda &&
                !prevItemIds.has(i.id) &&
                i.status === "pending" &&
                KITCHEN_SECTORS.includes((i.sector || "").toLowerCase())
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
  }, [locationId, voiceEnabled])

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

  const boardCfg: KdsBoardConfig = {
    allowedSectors: KITCHEN_SECTORS,
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
      allowedSectors: KITCHEN_SECTORS,
      sectorFilter,
      excludeSkipComanda: true,
    }
    for (const order of urgentOrders) {
      if (!announcedUrgentRef.current.has(order.id)) {
        announcedUrgentRef.current.add(order.id)
        const tableName = order.tableName || order.table?.name || `Pedido ${order.orderNumber}`
        const waitMin = urgentLeadMinutesForVoice(order, voiceCfg)
        const text = `¡Atención! ${tableName} pasó a urgente. Superó el tiempo de elaboración del plato (lleva unos ${waitMin} minutos en cocina).`
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
        speakShort(`¡${tableName} lista! Comanda terminada.`)
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
          {equipoMemberNames.length > 0 && (
            <span
              className="hidden max-w-[min(280px,40vw)] truncate text-xs text-gray-400 sm:inline"
              title={equipoMemberNames.join(", ")}
            >
              Equipo: {equipoMemberNames.join(", ")}
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

          <button
            type="button"
            onClick={openEquipoModal}
            title="Quiénes están en cocina en este turno"
            className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Equipo</span>
          </button>

          {/* Voice toggle — al activar voz, desbloquear audio (necesario en móvil) */}
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

      {showEquipoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipo-modal-title"
            className="kitchen-equipo-modal flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 border-b border-gray-800 px-4 py-3">
              <div>
                <h2 id="equipo-modal-title" className="text-lg font-bold text-white">
                  Equipo de cocina
                </h2>
                <p className="mt-1 text-xs text-gray-400">
                  Solo usuarios con rol <span className="font-medium text-gray-300">Cocina</span>{" "}
                  habilitados en <span className="font-medium text-gray-300">{locationName}</span>.
                  Marcá quiénes están en el turno (queda guardado en este dispositivo).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEquipoModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-gray-800 px-4 py-2">
              <input
                type="search"
                value={equipoSearch}
                onChange={(e) => setEquipoSearch(e.target.value)}
                placeholder="Buscar por nombre o email…"
                className="kitchen-equipo-search-input w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {equipoModalLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                </div>
              ) : equipoModalError ? (
                <p className="py-6 text-center text-sm text-red-400">{equipoModalError}</p>
              ) : kitchenStaffFiltered.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  No hay usuarios de cocina asignados a este local. Asignálos en Administración → Usuarios
                  (rol Cocina y local o locales permitidos).
                </p>
              ) : (
                <ul className="space-y-1">
                  {kitchenStaffFiltered.map((u: any) => {
                    const label =
                      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id
                    const checked = equipoDraftIds.includes(u.id)
                    return (
                      <li key={u.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-800/80">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEquipoDraft(u.id)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="font-medium text-white">{label}</span>
                            {u.email && label !== u.email && (
                              <span className="truncate text-xs text-gray-500">{u.email}</span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowEquipoModal(false)}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEquipoModalLoading(true)
                  setEquipoModalError("")
                  void fetchKitchenStaffForLocation().then((ok) => {
                    if (!ok) setEquipoModalError("No se pudo cargar la lista de cocina.")
                    setEquipoModalLoading(false)
                  })
                }}
                disabled={equipoModalLoading}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Actualizar lista
              </button>
              <button
                type="button"
                onClick={saveEquipoAndClose}
                disabled={equipoModalLoading}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner: texto que se está anunciando por voz (por si el TV no se entiende) */}
      {speakingText && voiceEnabled && (
        <div className="border-b border-amber-800 bg-amber-950/90 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-200">
            <Volume2 className="mr-1.5 inline h-4 w-4 text-amber-400" />
            Ahora dice: <span className="text-amber-100">{speakingText}</span>
          </p>
        </div>
      )}

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
                  <p className="mt-1.5 rounded-lg border-l-4 border-amber-400 bg-amber-950/40 py-1.5 pl-2 pr-1 text-base font-bold leading-snug text-amber-200 break-words">
                    {item.notes}
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
