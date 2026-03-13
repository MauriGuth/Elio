"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import { tablesApi } from "@/lib/api/tables"
import { ordersApi } from "@/lib/api/orders"
import { locationsApi } from "@/lib/api/locations"
import { authApi } from "@/lib/api/auth"
import { cashRegistersApi } from "@/lib/api/cash-registers"
import { getLocationKey, posStationSuffix } from "@/lib/api"
import { cn, formatCurrency } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import {
  Plus,
  Edit3,
  Save,
  X,
  Trash2,
  Users,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
  Circle,
  Square,
  Bell,
  Check,
  Minus,
  Settings2,
  GripVertical,
} from "lucide-react"

/* ── Status theme map ── */
const STATUS_CONFIG: Record<
  string,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  available: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Disponible",
  },
  occupied: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    text: "text-blue-700",
    dot: "bg-blue-500",
    label: "Ocupada",
  },
  ordering: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Ordenando",
  },
  billing: {
    bg: "bg-purple-50",
    border: "border-purple-300",
    text: "text-purple-700",
    dot: "bg-purple-500",
    label: "Cuenta",
  },
  reserved: {
    bg: "bg-gray-50",
    border: "border-gray-300",
    text: "text-gray-600",
    dot: "bg-gray-400",
    label: "Reservada",
  },
  disabled: {
    bg: "bg-gray-100",
    border: "border-gray-200",
    text: "text-gray-400",
    dot: "bg-gray-300",
    label: "Deshabilitada",
  },
}

const DEFAULT_STATUS = STATUS_CONFIG.available

/* ── Helpers ── */
function autoLayoutTables(tables: any[]): any[] {
  const needsLayout = tables.filter(
    (t) => !t.positionX && !t.positionY
  ).length
  if (needsLayout > tables.length / 2) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)))
    return tables.map((t, i) => ({
      ...t,
      positionX: t.positionX || (i % cols) * 170 + 40,
      positionY: t.positionY || Math.floor(i / cols) * 150 + 40,
    }))
  }
  return tables
}

function formatElapsed(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return ""
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Puntos del polígono de una pared con grosor (recta → paralelogramo) */
function wallPolygonPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  halfWidth: number
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * halfWidth
  const ny = (dx / len) * halfWidth
  const ax = x1 + nx
  const ay = y1 + ny
  const bx = x1 - nx
  const by = y1 - ny
  const cx = x2 - nx
  const cy = y2 - ny
  const dx2 = x2 + nx
  const dy2 = y2 + ny
  return `${ax},${ay} ${bx},${by} ${cx},${cy} ${dx2},${dy2}`
}

/* ── Table form modal ── */
function TableFormModal({
  title,
  formData,
  setFormData,
  onSave,
  onCancel,
  saving,
  zones = [],
}: {
  title: string
  formData: { name: string; zone: string; capacity: number; shape: string; scale: number }
  setFormData: (d: any) => void
  onSave: () => void
  onCancel: () => void
  saving?: boolean
  zones?: string[]
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white">{title}</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nombre
            </label>
            <input
              value={formData.name}
              onChange={(e) =>
                setFormData((p: any) => ({ ...p, name: e.target.value }))
              }
              autoComplete="off"
              placeholder="Mesa 1"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-500 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Zona
            </label>
            {zones.length > 0 ? (
              <select
                aria-label="Zona de la mesa"
                value={formData.zone}
                onChange={(e) =>
                  setFormData((p: any) => ({ ...p, zone: e.target.value }))
                }
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="">Seleccionar zona</option>
                {zones.map((z: string) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            ) : (
              <input
                value={formData.zone}
                onChange={(e) =>
                  setFormData((p: any) => ({ ...p, zone: e.target.value }))
                }
                placeholder="Terraza, Interior, Barra..."
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder-gray-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Capacidad
            </label>
            <FormattedNumberInput
              placeholder="4"
              value={formData.capacity}
              onChange={(n) =>
                setFormData((p: any) => ({
                  ...p,
                  capacity: n === 0 ? 0 : Math.min(20, n),
                }))
              }
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder-gray-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Forma
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setFormData((p: any) => ({ ...p, shape: "square" }))
                }
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  formData.shape === "square"
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                <Square className="h-5 w-5" />
                Cuadrada
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData((p: any) => ({ ...p, shape: "round" }))
                }
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all",
                  formData.shape === "round"
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                <Circle className="h-5 w-5" />
                Redonda
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tamaño ({Math.round(formData.scale * 100)}%)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                title="Reducir tamaño"
                onClick={() =>
                  setFormData((p: any) => ({
                    ...p,
                    scale: Math.max(0.4, Math.round((p.scale - 0.1) * 10) / 10),
                  }))
                }
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={0.4}
                max={2.0}
                step={0.1}
                title="Escala de la mesa"
                value={formData.scale}
                onChange={(e) =>
                  setFormData((p: any) => ({
                    ...p,
                    scale: parseFloat(e.target.value),
                  }))
                }
                className="flex-1 accent-amber-500"
              />
              <button
                type="button"
                title="Aumentar tamaño"
                onClick={() =>
                  setFormData((p: any) => ({
                    ...p,
                    scale: Math.min(2.0, Math.round((p.scale + 0.1) * 10) / 10),
                  }))
                }
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>Chica</span>
              <span>Normal</span>
              <span>Grande</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={!formData.name.trim() || saving}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════ */
export default function TablesPage() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  /* ── state ── */
  const [locationId, setLocationId] = useState("")
  const [tables, setTables] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // edit mode
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedPositions, setEditedPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})

  // drag
  const [dragTarget, setDragTarget] = useState<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const prevDragTargetRef = useRef<string | null>(null)

  // resize (punto verde)
  const [resizeTarget, setResizeTarget] = useState<string | null>(null)
  const [editedScales, setEditedScales] = useState<Record<string, number>>({})
  const resizeStartRef = useRef({ x: 0, y: 0, scale: 1 })

  // zone filter
  const [activeZone, setActiveZone] = useState<string | null>(null)
  const [customZones, setCustomZones] = useState<string[]>([])
  const [showZonesModal, setShowZonesModal] = useState(false)
  const [zoneToRename, setZoneToRename] = useState<string | null>(null)
  const [zoneRenameValue, setZoneRenameValue] = useState("")
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null)
  const [zoneReassignTo, setZoneReassignTo] = useState("")
  const [newZoneName, setNewZoneName] = useState("")
  const [zoneSaveLoading, setZoneSaveLoading] = useState(false)

  // map config (paredes)
  const [walls, setWalls] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([])
  const [drawWallMode, setDrawWallMode] = useState(false)
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null)
  const [wallPreviewEnd, setWallPreviewEnd] = useState<{ x: number; y: number } | null>(null)
  const [savingWalls, setSavingWalls] = useState(false)
  // arrastrar pared: mover todo el segmento, o un extremo (rotar/cambiar tamaño)
  const [wallDrag, setWallDrag] = useState<{
    wallIndex: number
    kind: "end1" | "end2" | "body"
    mouseStartX: number
    mouseStartY: number
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)

  // modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingTable, setEditingTable] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: "",
    zone: "",
    capacity: 4,
    shape: "square",
    scale: 1.0,
  })

  // Ready notifications
  const [readyNotifications, setReadyNotifications] = useState<any[]>([])
  const dismissedReadyRef = useRef<Set<string>>(new Set())
  const [formSaving, setFormSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Turno abierto (caja): sin turno no se puede cargar ninguna mesa
  const [openRegister, setOpenRegister] = useState<any | null>(null)
  const [loadingOpenRegister, setLoadingOpenRegister] = useState(true)

  const user = authApi.getStoredUser()
  const isMozo = useMemo(() => user && (user.role === "waiter" || user.role === "WAITER"), [user?.role])

  /* ── resolve location (misma clave que el layout POS para admin/cajero/mozo) ── */
  useEffect(() => {
    const u = authApi.getStoredUser()
    const loc =
      u?.location ||
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

  useEffect(() => {
    if (isMozo && editMode) setEditMode(false)
  }, [isMozo, editMode])

  /* ── estado de turno (caja abierta) ── */
  const fetchOpenRegister = useCallback(async () => {
    if (!locationId) {
      setLoadingOpenRegister(false)
      setOpenRegister(null)
      return
    }
    setLoadingOpenRegister(true)
    try {
      const reg = await cashRegistersApi.getCurrentOpen(locationId)
      if (!reg || typeof reg !== "object" || Array.isArray(reg)) {
        setOpenRegister(null)
        return
      }
      const r = reg as Record<string, unknown>
      const id = r.id ?? (r.data as Record<string, unknown>)?.id ?? (r.register as Record<string, unknown>)?.id
      if (id == null || id === "") {
        setOpenRegister(null)
        return
      }
      setOpenRegister({ ...r, id } as any)
    } catch {
      setOpenRegister(null)
    } finally {
      setLoadingOpenRegister(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchOpenRegister()
  }, [fetchOpenRegister])

  /* ── fetch data ── */
  const fetchData = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    setError("")
    try {
      const [tablesData, ordersData] = await Promise.all([
        tablesApi.getAll(locationId),
        ordersApi.getAll({ locationId, status: "open" }),
      ])
      setTables(autoLayoutTables(tablesData))
      setOrders(ordersData?.data ?? [])
    } catch {
      setError("Error al cargar las mesas")
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── fetch location mapConfig (paredes + zonas) ── */
  useEffect(() => {
    if (!locationId) return
    let cancelled = false
    locationsApi.getById(locationId).then((loc: any) => {
      if (cancelled) return
      const mc = loc?.mapConfig
      const w = mc?.walls
      const z = mc?.zones
      setWalls(Array.isArray(w) ? w : [])
      setCustomZones(Array.isArray(z) ? z : [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [locationId])

  // Auto-refresh every 60 s
  useEffect(() => {
    if (!locationId) return
    const id = setInterval(fetchData, 3_000)
    return () => clearInterval(id)
  }, [locationId, fetchData])

  // Poll for ready items every 15s
  const fetchReadyItems = useCallback(async () => {
    if (!locationId) return
    try {
      const data = await ordersApi.getReadyItems(locationId)
      const items = Array.isArray(data) ? data : []
      // Filter out already dismissed
      const fresh = items.filter((n: any) => !dismissedReadyRef.current.has(n.tableId))
      setReadyNotifications(fresh)
      // Voice announce new ones (solo cajero/admin; mozo no escucha alerta por voz)
      if (!isMozo && fresh.length > 0 && typeof window !== "undefined" && window.speechSynthesis) {
        for (const n of fresh) {
          if (!dismissedReadyRef.current.has(`announced-${n.tableId}`)) {
            dismissedReadyRef.current.add(`announced-${n.tableId}`)
            const itemNames = n.items.map((i: any) => `${i.quantity} ${i.name}`).join(", ")
            const text = `¡${n.tableName} lista! ${itemNames}`
            const utt = new SpeechSynthesisUtterance(text)
            utt.lang = "es-AR"
            utt.rate = 1
            window.speechSynthesis.speak(utt)
          }
        }
      }
    } catch { /* silently fail */ }
  }, [locationId, isMozo])

  useEffect(() => {
    fetchReadyItems()
    if (!locationId) return
    const id = setInterval(fetchReadyItems, 3_000)
    return () => clearInterval(id)
  }, [locationId, fetchReadyItems])

  const dismissReady = async (tableId: string) => {
    // Immediately hide from UI
    dismissedReadyRef.current.add(tableId)
    const notification = readyNotifications.find((n) => n.tableId === tableId)
    setReadyNotifications((prev) => prev.filter((n) => n.tableId !== tableId))

    // Mark items as "served" in the backend so they never come back
    if (notification?.itemIds?.length) {
      try {
        await Promise.all(
          notification.itemIds.map((id: string) =>
            ordersApi.updateItemStatus(id, { status: "served" })
          )
        )
      } catch {
        // Already hidden from UI, no need to show error
      }
    }
  }

  /* ── position helpers ── */
  const getPos = (t: any) =>
    editedPositions[t.id] ?? { x: t.positionX, y: t.positionY }

  const getScale = (t: any) =>
    editedScales[t.id] ?? t.scale ?? 1.0

  /** Dimensiones (ancho, alto) de una mesa según forma y escala */
  const getTableSize = (t: any) => {
    const sc = getScale(t)
    const isRound = t?.shape === "round"
    const baseW = isRound ? 130 : 140
    const baseH = isRound ? 130 : 110
    return { w: Math.round(baseW * sc), h: Math.round(baseH * sc) }
  }

  const rectsOverlap = (
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number
  ) =>
    x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2

  /* ── resize (punto verde) ── */
  const startResize = (
    e: React.MouseEvent | React.TouchEvent,
    tableId: string
  ) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    const table = tables.find((tab) => tab.id === tableId)
    const currentScale = getScale(table ?? { id: tableId })
    resizeStartRef.current = { x: clientX, y: clientY, scale: currentScale }
    setResizeTarget(tableId)
  }

  const moveResize = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!resizeTarget) return
      e.preventDefault()
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
      const { x, y, scale } = resizeStartRef.current
      const delta = (clientX - x) + (clientY - y)
      const newScale = Math.max(
        0.5,
        Math.min(2,
          Math.round((scale + delta * 0.008) * 20) / 20
        )
      )
      setEditedScales((prev) => ({ ...prev, [resizeTarget]: newScale }))
    },
    [resizeTarget]
  )

  const endResize = useCallback(() => {
    if (!resizeTarget) {
      setResizeTarget(null)
      return
    }
    const table = tables.find((t) => t.id === resizeTarget)
    const scale = editedScales[resizeTarget] ?? table?.scale ?? 1.0
    const id = resizeTarget
    setResizeTarget(null)
    setEditedScales((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    tablesApi
      .update(id, { scale })
      .then(() => fetchData())
      .catch(() => setError("Error al guardar tamaño"))
  }, [resizeTarget, tables, editedScales, fetchData])

  useEffect(() => {
    if (!resizeTarget) return
    const opts: AddEventListenerOptions = { passive: false }
    document.addEventListener("mousemove", moveResize)
    document.addEventListener("mouseup", endResize)
    document.addEventListener("touchmove", moveResize, opts)
    document.addEventListener("touchend", endResize)
    return () => {
      document.removeEventListener("mousemove", moveResize)
      document.removeEventListener("mouseup", endResize)
      document.removeEventListener("touchmove", moveResize)
      document.removeEventListener("touchend", endResize)
    }
  }, [resizeTarget, moveResize, endResize])

  /* ── drag ── */
  const startDrag = (
    e: React.MouseEvent | React.TouchEvent,
    tableId: string
  ) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top }
    setDragTarget(tableId)
  }

  const moveDrag = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragTarget || !containerRef.current) return
      e.preventDefault()
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
      const cr = containerRef.current.getBoundingClientRect()
      const table = tables.find((t) => t.id === dragTarget)
      const prevPos = table
        ? (editedPositions[dragTarget] ?? { x: table.positionX, y: table.positionY })
        : { x: 0, y: 0 }
      const { w, h } = table ? getTableSize(table) : { w: 140, h: 110 }
      const maxX = Math.max(0, (cr.width ?? containerRef.current.scrollWidth) - w)
      const maxY = Math.max(0, (cr.height ?? containerRef.current.scrollHeight) - h)
      let newX = Math.max(0, Math.min(clientX - cr.left - dragOffset.current.x, maxX))
      let newY = Math.max(0, Math.min(clientY - cr.top - dragOffset.current.y, maxY))
      // No permitir superponer con otras mesas
      const overlaps = tables.some((t) => {
        if (t.id === dragTarget) return false
        const pos = getPos(t)
        const size = getTableSize(t)
        return rectsOverlap(newX, newY, w, h, pos.x, pos.y, size.w, size.h)
      })
      if (overlaps) {
        newX = prevPos.x
        newY = prevPos.y
      }
      setEditedPositions((prev) => ({
        ...prev,
        [dragTarget]: { x: Math.round(newX), y: Math.round(newY) },
      }))
    },
    [dragTarget, tables, editedPositions, editedScales]
  )

  const endDrag = useCallback(() => setDragTarget(null), [])

  useEffect(() => {
    if (!dragTarget) return
    const opts: AddEventListenerOptions = { passive: false }
    document.addEventListener("mousemove", moveDrag)
    document.addEventListener("mouseup", endDrag)
    document.addEventListener("touchmove", moveDrag, opts)
    document.addEventListener("touchend", endDrag)
    return () => {
      document.removeEventListener("mousemove", moveDrag)
      document.removeEventListener("mouseup", endDrag)
      document.removeEventListener("touchmove", moveDrag)
      document.removeEventListener("touchend", endDrag)
    }
  }, [dragTarget, moveDrag, endDrag])

  /* ── auto-save posición al soltar las mesas Tacho de basura y Errores de comandas ── */
  useEffect(() => {
    const previousId = prevDragTargetRef.current
    prevDragTargetRef.current = dragTarget

    if (previousId && !dragTarget) {
      const table = tables.find((t) => t.id === previousId)
      const pos = editedPositions[previousId]
      const isSystemTable =
        table?.tableType === "trash" || table?.tableType === "errors"
      if (isSystemTable && pos) {
        tablesApi
          .update(previousId, { positionX: pos.x, positionY: pos.y })
          .then(() => {
            setEditedPositions((prev) => {
              const next = { ...prev }
              delete next[previousId]
              return next
            })
            fetchData()
          })
          .catch(() => setError("Error al guardar posición"))
      }
    }
  }, [dragTarget, tables, editedPositions, fetchData])

  /* ── save positions ── */
  const savePositions = async () => {
    setSaving(true)
    try {
      await Promise.all(
        Object.entries(editedPositions).map(([id, pos]) =>
          tablesApi.update(id, { positionX: pos.x, positionY: pos.y })
        )
      )
      setEditMode(false)
      setEditedPositions({})
      await fetchData()
    } catch {
      setError("Error al guardar posiciones")
    } finally {
      setSaving(false)
    }
  }

  /* ── add table ── */
  const handleAddTable = async () => {
    if (!formData.name.trim()) return
    if (!locationId) {
      setError("Debes tener un local asignado para crear mesas.")
      return
    }
    setFormSaving(true)
    setError("")
    try {
      await tablesApi.create({
        locationId,
        name: formData.name.trim(),
        zone: (formData.zone || "Principal").trim(),
        capacity: Math.max(1, Math.floor(Number(formData.capacity) || 4)),
        shape: formData.shape || "square",
        scale: Number(formData.scale) || 1,
        positionX: 100,
        positionY: 100,
      })
      setShowAddModal(false)
      setFormData({ name: "", zone: "", capacity: 4, shape: "square", scale: 1.0 })
      await fetchData()
      sileo.success({ title: "Mesa creada correctamente" })
    } catch (err: any) {
      const msg = err?.message || "Error al crear mesa"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setFormSaving(false)
    }
  }

  /* ── edit table props ── */
  const handleEditTable = async () => {
    if (!editingTable || !formData.name.trim()) return
    setFormSaving(true)
    try {
      await tablesApi.update(editingTable.id, {
        name: formData.name,
        zone: formData.zone,
        capacity: Math.max(1, Math.floor(Number(formData.capacity) || 4)),
        shape: formData.shape || "square",
        scale: formData.scale ?? 1.0,
      })
      setEditingTable(null)
      setFormData({ name: "", zone: "", capacity: 4, shape: "square", scale: 1.0 })
      await fetchData()
      sileo.success({ title: "Mesa actualizada" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al editar mesa"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setFormSaving(false)
    }
  }

  /* ── delete table ── */
  const handleDeleteTable = async (id: string) => {
    if (!confirm("¿Eliminar esta mesa?")) return
    try {
      await tablesApi.delete(id)
      await fetchData()
      sileo.success({ title: "Mesa eliminada" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al eliminar mesa"
      setError(msg)
      sileo.error({ title: msg })
    }
  }

  /* ── click table in view mode ── */
  const handleTableClick = (table: any) => {
    if (editMode) return
    if (locationId && !loadingOpenRegister && !openRegister) {
      sileo.warning({ title: "Abra un turno para cargar mesas", message: "Vaya a Caja y abra el turno." })
      return
    }
    router.push(`/pos/tables/${table.id}` + posStationSuffix())
  }

  /* ── order lookup ── */
  const getOrderForTable = (t: any) =>
    t.currentOrderId ? orders.find((o) => o.id === t.currentOrderId) : null

  /* ── zones (de mesas + personalizadas) ── */
  const zonesFromTables = [...new Set(tables.map((t) => t.zone).filter(Boolean))]
  const allZones = [...new Set([...zonesFromTables, ...customZones])].sort((a, b) => a.localeCompare(b))
  /** Zonas que se muestran en "Gestionar zonas" (sin Especial, que no se edita ni elimina) */
  const zonesForManagement = allZones.filter((z) => z !== "Especial")

  /* ── filtered tables by active zone ── */
  const filteredTables = activeZone
    ? tables.filter((t) => t.zone === activeZone)
    : tables

  /* ── guardar paredes en backend (mantiene zonas en mapConfig) ── */
  const saveWalls = useCallback(async (newWalls: { x1: number; y1: number; x2: number; y2: number }[]) => {
    if (!locationId) {
      setError("Seleccioná un local para poder guardar las paredes.")
      return
    }
    setSavingWalls(true)
    setError("")
    try {
      await locationsApi.update(locationId, { mapConfig: { walls: newWalls, zones: customZones } })
      setWalls(newWalls)
      sileo.success({ title: "Paredes guardadas" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al guardar paredes"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setSavingWalls(false)
    }
  }, [locationId, customZones])

  /* ── canvas click para dibujar pared ── */
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!drawWallMode || !containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)
    if (!wallStart) {
      setWallStart({ x, y })
      return
    }
    const newWall = { x1: wallStart.x, y1: wallStart.y, x2: x, y2: y }
    setWalls((prev) => {
      const next = [...prev, newWall]
      saveWalls(next)
      return next
    })
    setWallStart(null)
  }, [drawWallMode, wallStart, saveWalls])

  /* ── eliminar última pared ── */
  const removeLastWall = () => {
    if (walls.length === 0) return
    const next = walls.slice(0, -1)
    setWalls(next)
    saveWalls(next)
  }

  /* ── arrastrar pared: mover, rotar o cambiar tamaño ── */
  const moveWallDrag = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!wallDrag) return
      e.preventDefault()
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
      const deltaX = Math.round(clientX - wallDrag.mouseStartX)
      const deltaY = Math.round(clientY - wallDrag.mouseStartY)
      setWalls((prev) => {
        const next = [...prev]
        const { wallIndex, kind, x1, y1, x2, y2 } = wallDrag
        if (wallIndex >= next.length) return prev
        if (kind === "body") {
          next[wallIndex] = {
            x1: x1 + deltaX,
            y1: y1 + deltaY,
            x2: x2 + deltaX,
            y2: y2 + deltaY,
          }
        } else if (kind === "end1") {
          next[wallIndex] = { x1: x1 + deltaX, y1: y1 + deltaY, x2, y2 }
        } else {
          next[wallIndex] = { x1, y1, x2: x2 + deltaX, y2: y2 + deltaY }
        }
        return next
      })
    },
    [wallDrag]
  )

  const endWallDrag = useCallback(() => {
    setWallDrag(null)
  }, [])

  useEffect(() => {
    if (!wallDrag) return
    const opts: AddEventListenerOptions = { passive: false }
    document.addEventListener("mousemove", moveWallDrag)
    document.addEventListener("mouseup", endWallDrag)
    document.addEventListener("touchmove", moveWallDrag, opts)
    document.addEventListener("touchend", endWallDrag)
    return () => {
      document.removeEventListener("mousemove", moveWallDrag)
      document.removeEventListener("mouseup", endWallDrag)
      document.removeEventListener("touchmove", moveWallDrag)
      document.removeEventListener("touchend", endWallDrag)
    }
  }, [wallDrag, moveWallDrag, endWallDrag])

  /* ── inicio de arrastre de pared (desde overlay) ── */
  const handleWallPointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent, wallIndex: number, kind: "end1" | "end2" | "body") => {
      if (!editMode || drawWallMode) return
      e.preventDefault()
      e.stopPropagation()
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
      const wall = walls[wallIndex]
      if (!wall) return
      setWallDrag({
        wallIndex,
        kind,
        mouseStartX: clientX,
        mouseStartY: clientY,
        x1: wall.x1,
        y1: wall.y1,
        x2: wall.x2,
        y2: wall.y2,
      })
    },
    [editMode, drawWallMode, walls]
  )

  /* ── guardar zonas en backend (mantiene paredes en mapConfig) ── */
  const saveZonesToBackend = useCallback(async (newZones: string[]) => {
    if (!locationId) return
    try {
      await locationsApi.update(locationId, { mapConfig: { walls, zones: newZones } })
    } catch {
      setError("Error al guardar zonas")
    }
  }, [locationId, walls])

  /* ── zonas: agregar ── */
  const handleAddZone = async () => {
    const name = newZoneName.trim()
    if (!name || allZones.includes(name)) return
    const next = [...customZones, name].sort()
    setCustomZones(next)
    setNewZoneName("")
    await saveZonesToBackend(next)
  }

  /* ── zonas: renombrar (actualizar todas las mesas de esa zona) ── */
  const handleRenameZone = async () => {
    if (!zoneToRename || !zoneRenameValue.trim() || zoneRenameValue.trim() === zoneToRename) {
      setZoneToRename(null)
      return
    }
    const newName = zoneRenameValue.trim()
    setZoneSaveLoading(true)
    setError("")
    try {
      const inZone = tables.filter((t) => t.zone === zoneToRename)
      await Promise.all(inZone.map((t) => tablesApi.update(t.id, { zone: newName })))
      const nextZones = customZones.map((z) => (z === zoneToRename ? newName : z))
      setCustomZones(nextZones)
      setZoneToRename(null)
      setZoneRenameValue("")
      await saveZonesToBackend(nextZones)
      await fetchData()
    } catch {
      setError("Error al renombrar zona")
    } finally {
      setZoneSaveLoading(false)
    }
  }

  /* ── zonas: eliminar (reasignar o borrar mesas) ── */
  const isSystemTable = (t: { tableType?: string }) =>
    t.tableType === "trash" || t.tableType === "errors"

  const handleDeleteZone = async (deleteTablesWithoutReassign?: boolean) => {
    if (!zoneToDelete) return
    const inZone = tables.filter((t) => t.zone === zoneToDelete)
    const useReassign = !deleteTablesWithoutReassign && zoneReassignTo && zoneReassignTo !== zoneToDelete
    if (useReassign) {
      setZoneSaveLoading(true)
      try {
        await Promise.all(inZone.map((t) => tablesApi.update(t.id, { zone: zoneReassignTo })))
        const nextZones = customZones.filter((z) => z !== zoneToDelete)
        setCustomZones(nextZones)
        setZoneToDelete(null)
        setZoneReassignTo("")
        await saveZonesToBackend(nextZones)
        await fetchData()
      } catch {
        setError("Error al reasignar mesas")
      } finally {
        setZoneSaveLoading(false)
      }
      return
    }
    const toDelete = inZone.filter((t) => !isSystemTable(t))
    const toReassign = inZone.filter(isSystemTable)
    const targetZone = zoneReassignTo && zoneReassignTo !== zoneToDelete
      ? zoneReassignTo
      : customZones.find((z) => z !== zoneToDelete) || "Principal"
    if (toDelete.length > 0 && !confirm(`¿Eliminar las ${toDelete.length} mesa(s) de la zona "${zoneToDelete}"? (Las mesas de sistema se reasignarán a "${targetZone}")`)) {
      return
    }
    setZoneSaveLoading(true)
    try {
      await Promise.all(toDelete.map((t) => tablesApi.delete(t.id)))
      if (toReassign.length > 0) {
        await Promise.all(toReassign.map((t) => tablesApi.update(t.id, { zone: targetZone })))
      }
      const nextZones = customZones.filter((z) => z !== zoneToDelete)
      setCustomZones(nextZones)
      setZoneToDelete(null)
      setZoneReassignTo("")
      await saveZonesToBackend(nextZones)
      await fetchData()
    } catch {
      setError("Error al eliminar mesas")
    } finally {
      setZoneSaveLoading(false)
    }
  }

  /* ── loading screen ── */
  if (loading && tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-3 text-sm text-gray-500">Cargando mesas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* ── Toolbar: móvil = título + tabs en fila scrollable; acciones debajo ── */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-start">
            <h1 className="text-lg font-semibold text-gray-800 dark:text-white shrink-0">
              Mapa de Mesas
            </h1>
            <div className="flex shrink-0 items-center gap-2 sm:hidden">
              {!editMode && (
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      await fetchData()
                    } finally {
                      setTimeout(() => setRefreshing(false), 500)
                    }
                  }}
                  disabled={refreshing}
                  title="Actualizar"
                  className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-70"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                </button>
              )}
              {!editMode && !isMozo && (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"
                >
                  <Edit3 className="h-4 w-4" />
                  Editar
                </button>
              )}
            </div>
          </div>
          {/* Tabs de zona: scroll horizontal en móvil con padding para que no se corte el último */}
          <div className="flex min-w-0 -mx-1 overflow-x-auto scrollbar-thin pb-1" style={{ scrollbarWidth: 'thin' }}>
            <div className="flex items-center gap-1.5 pl-1 pr-4 sm:pr-1">
              <button
                onClick={() => setActiveZone(null)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  activeZone === null
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                Todas
              </button>
              {allZones.map((z) => (
                <button
                  key={z}
                  onClick={() => setActiveZone(activeZone === z ? null : z)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    activeZone === z
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  )}
                >
                  {z}
                </button>
              ))}
              {!isMozo && (
                <button
                  onClick={() => setShowZonesModal(true)}
                  title="Gestionar zonas"
                  className="shrink-0 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-amber-400 hover:text-amber-600 dark:border-gray-600"
                >
                  <Settings2 className="inline h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

        <div className="hidden sm:flex items-center gap-2">
          {!editMode && (
            <button
              onClick={async () => {
                setRefreshing(true)
                try {
                  await fetchData()
                } finally {
                  setTimeout(() => setRefreshing(false), 500)
                }
              }}
              disabled={refreshing}
              title="Actualizar"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-70"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </button>
          )}

          {editMode ? (
            <>
              <button
                onClick={() => {
                  setShowAddModal(true)
                  setFormData({ name: "", zone: allZones[0] || "", capacity: 4, shape: "square", scale: 1.0 })
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Agregar Mesa</span>
              </button>
              <button
                onClick={() => {
                  setDrawWallMode(!drawWallMode)
                  setWallStart(null)
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  drawWallMode
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                <GripVertical className="h-4 w-4" />
                <span className="hidden sm:inline">Agregar pared</span>
              </button>
              {drawWallMode && (
                <button
                  onClick={removeLastWall}
                  disabled={walls.length === 0}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Quitar última pared
                </button>
              )}
              <button
                onClick={() => {
                  setEditMode(false)
                  setEditedPositions({})
                  setDrawWallMode(false)
                  setWallStart(null)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const hasPositionChanges = Object.keys(editedPositions).length > 0
                  try {
                    if (hasPositionChanges) await savePositions()
                    if (walls.length > 0) await saveWalls(walls)
                    setDrawWallMode(false)
                    setWallStart(null)
                    // Volver a la vista principal (filtros + Editar Plano + Actualizar)
                    setEditMode(false)
                    setEditedPositions({})
                  } catch {
                    // error ya mostrado por savePositions/saveWalls
                  }
                }}
                disabled={saving || savingWalls || (Object.keys(editedPositions).length === 0 && walls.length === 0)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-amber-600 disabled:opacity-50"
              >
                {(saving || savingWalls) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </button>
            </>
          ) : !isMozo ? (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              <Edit3 className="h-4 w-4" />
              Editar Plano
            </button>
          ) : null}
        </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button
            onClick={() => setError("")}
            title="Cerrar"
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Sin turno abierto: no se puede cargar ninguna mesa ── */}
      {locationId && !loadingOpenRegister && !openRegister && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="flex-1">
            No hay turno abierto. Abra un turno en <strong>Caja</strong> para poder cargar mesas.
          </span>
          <Link
            href={"/pos/caja" + posStationSuffix()}
            className="shrink-0 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
          >
            Ir a Caja
          </Link>
        </div>
      )}

      {/* ── Ready notifications ── */}
      {readyNotifications.length > 0 && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Bell className="h-4 w-4 shrink-0 text-emerald-600 animate-bounce" />
            <span className="shrink-0 text-xs font-semibold text-emerald-700">
              Comanda lista:
            </span>
            {readyNotifications.map((n) => (
              <div
                key={n.tableId}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-gray-800 px-3 py-1.5"
              >
                <span className="text-xs font-bold text-emerald-700">
                  {n.tableName}
                </span>
                <span className="text-[10px] text-gray-500">
                  {n.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
                </span>
                <button
                  onClick={() => dismissReady(n.tableId)}
                  title="Cerrar"
                  className="rounded p-0.5 text-emerald-500 hover:bg-emerald-100"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Floor plan: padding extra en móvil para que no se corten las mesas a la derecha ── */}
      <div className="flex-1 min-h-0 overflow-auto p-3 pb-6 sm:p-4">
        <div
          ref={containerRef}
          role={drawWallMode ? "button" : undefined}
          tabIndex={drawWallMode ? 0 : undefined}
          onClick={drawWallMode ? handleCanvasClick : undefined}
          onMouseMove={drawWallMode && wallStart && containerRef.current ? (e) => {
            const rect = containerRef.current!.getBoundingClientRect()
            setWallPreviewEnd({ x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) })
          } : undefined}
          onMouseLeave={drawWallMode && wallStart ? () => setWallPreviewEnd(null) : undefined}
          className={cn(
            "relative mx-auto rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800",
            drawWallMode && "cursor-crosshair"
          )}
          style={{
            width: "100%",
            maxWidth: 1200,
            minHeight: 600,
            height: Math.max(
              600,
              ...filteredTables.map((t) => (getPos(t).y || 0) + 160)
            ),
            backgroundImage:
              "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {/* Paredes (SVG): aspecto más realista con grosor, relleno y sombra */}
          {walls.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ left: 0, top: 0 }}
            >
              <defs>
                <filter id="wall-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.25" floodColor="#000" />
                </filter>
                <linearGradient id="wall-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e8e6e3" />
                  <stop offset="50%" stopColor="#d4d0c9" />
                  <stop offset="100%" stopColor="#c4bfb6" />
                </linearGradient>
              </defs>
              {walls.map((w, i) => {
                const halfWidth = 10
                const points = wallPolygonPoints(w.x1, w.y1, w.x2, w.y2, halfWidth)
                return (
                  <g key={i}>
                    <polygon
                      points={points}
                      fill="url(#wall-fill)"
                      stroke="#8b8685"
                      strokeWidth="1.5"
                      filter="url(#wall-shadow)"
                    />
                    {/* Línea de luz sutil en el borde superior de la pared */}
                    <line
                      x1={w.x1}
                      y1={w.y1}
                      x2={w.x2}
                      y2={w.y2}
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                )
              })}
            </svg>
          )}
          {/* Overlay para mover/rotar/redimensionar paredes (solo en edición, sin modo dibujo) */}
          {editMode && !drawWallMode && walls.length > 0 && (
            <svg
              className="absolute inset-0 h-full w-full"
              style={{ left: 0, top: 0, pointerEvents: "auto" }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {walls.map((w, i) => {
                const halfWidth = 14
                const points = wallPolygonPoints(w.x1, w.y1, w.x2, w.y2, halfWidth)
                const handleR = 10
                return (
                  <g key={i}>
                    {/* Área del cuerpo: arrastrar para mover toda la pared */}
                    <polygon
                      points={points}
                      fill="rgba(0,0,0,0.001)"
                      stroke="none"
                      style={{ cursor: "move" }}
                      onMouseDown={(e) => handleWallPointerDown(e, i, "body")}
                      onTouchStart={(e) => handleWallPointerDown(e, i, "body")}
                    />
                    {/* Asas en los extremos: arrastrar para rotar o cambiar tamaño */}
                    <circle
                      cx={w.x1}
                      cy={w.y1}
                      r={handleR}
                      fill="rgba(245, 158, 11, 0.5)"
                      stroke="#d97706"
                      strokeWidth="2"
                      style={{ cursor: "nwse-resize" }}
                      onMouseDown={(e) => handleWallPointerDown(e, i, "end1")}
                      onTouchStart={(e) => handleWallPointerDown(e, i, "end1")}
                    />
                    <circle
                      cx={w.x2}
                      cy={w.y2}
                      r={handleR}
                      fill="rgba(245, 158, 11, 0.5)"
                      stroke="#d97706"
                      strokeWidth="2"
                      style={{ cursor: "nwse-resize" }}
                      onMouseDown={(e) => handleWallPointerDown(e, i, "end2")}
                      onTouchStart={(e) => handleWallPointerDown(e, i, "end2")}
                    />
                  </g>
                )
              })}
            </svg>
          )}
          {/* Preview línea al dibujar pared */}
          {drawWallMode && wallStart && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ left: 0, top: 0 }}
            >
              <line
                x1={wallStart.x}
                y1={wallStart.y}
                x2={wallPreviewEnd?.x ?? wallStart.x}
                y2={wallPreviewEnd?.y ?? wallStart.y}
                stroke="#f59e0b"
                strokeWidth="8"
                strokeDasharray="8 4"
                strokeLinecap="round"
              />
            </svg>
          )}
          {/* Zone floating labels */}
          {editMode &&
            allZones.map((zone, i) => (
              <div
                key={zone}
                className="pointer-events-none absolute left-3 text-[11px] font-semibold uppercase tracking-wider text-gray-300"
                style={{ top: 8 + i * 20 }}
              >
                {zone}
              </div>
            ))}

          {/* Table cards */}
          {filteredTables.map((table) => {
            const pos = getPos(table)
            const cfg = STATUS_CONFIG[table.status] || DEFAULT_STATUS
            const order = getOrderForTable(table)
            const isDragging = dragTarget === table.id
            const isRound = table.shape === "round"
            const sc = getScale(table)
            const baseW = isRound ? 130 : 140
            const baseH = isRound ? 130 : 110
            const w = Math.round(baseW * sc)
            const h = Math.round(baseH * sc)
            const tableType = table.tableType || "normal"
            const typeOverlay =
              tableType === "trash"
                ? "bg-red-50 border-red-400 ring-1 ring-red-200"
                : tableType === "errors"
                  ? "bg-amber-50 border-amber-400 ring-1 ring-amber-200"
                  : ""

            return (
              <div
                key={table.id}
                className={cn(
                  "absolute flex flex-col items-center justify-center border-2 p-2 transition-shadow select-none",
                  isRound ? "rounded-full" : "rounded-xl",
                  tableType === "normal" ? cfg.bg : typeOverlay,
                  tableType === "normal" ? cfg.border : "",
                  editMode
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer hover:shadow-lg",
                  isDragging && "z-50 shadow-xl",
                  !editMode && "hover:shadow-md"
                )}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: w,
                  height: isRound ? h : undefined,
                  minHeight: isRound ? undefined : h,
                  fontSize: `${Math.max(0.7, sc)}rem`,
                  touchAction: editMode ? "none" : "auto",
                }}
                onClick={() => handleTableClick(table)}
                onMouseDown={(e) => startDrag(e, table.id)}
                onTouchStart={(e) => startDrag(e, table.id)}
              >
                {/* Status dot / resize handle (en modo edición) */}
                <div
                  className={cn(
                    "absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full ring-2 ring-white",
                    cfg.dot,
                    editMode && "cursor-nwse-resize"
                  )}
                  title={editMode ? "Arrastra para cambiar tamaño" : undefined}
                  onMouseDown={editMode ? (e) => startResize(e, table.id) : undefined}
                  onTouchStart={editMode ? (e) => startResize(e, table.id) : undefined}
                  onClick={editMode ? (e) => e.stopPropagation() : undefined}
                />

                {/* Shape icon (small) */}
                <div className="absolute left-1.5 top-1.5">
                  {isRound ? (
                    <Circle className="h-3 w-3 text-gray-300" />
                  ) : (
                    <Square className="h-3 w-3 text-gray-300" />
                  )}
                </div>

                {/* Table name */}
                <span className={cn("text-sm font-bold", tableType === "normal" ? cfg.text : tableType === "trash" ? "text-red-800" : "text-amber-800")}>
                  {/^\d+$/.test(String(table.name ?? "")) ? `Mesa ${table.name}` : table.name}
                </span>

                {/* Zone */}
                <span className="mt-0.5 text-[10px] text-gray-400">
                  {table.zone}
                </span>

                {/* Capacity */}
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3 w-3" />
                  <span>{table.capacity}</span>
                </div>

                {/* Time elapsed */}
                {table.occupiedMinutes > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    <span>{formatElapsed(table.occupiedMinutes)}</span>
                  </div>
                )}

                {/* Order total */}
                {order && (
                  <span className="mt-1 text-xs font-semibold text-gray-600">
                    {formatCurrency(order.total)}
                  </span>
                )}

                {/* Edit-mode controls (ocultos para mesas fijas y zona Especial) */}
                {editMode && tableType === "normal" && table.zone !== "Especial" && (
                  <div className="absolute -top-3 right-5 flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingTable(table)
                        setFormData({
                          name: table.name,
                          zone: table.zone,
                          capacity: table.capacity,
                          shape: table.shape || "square",
                          scale: table.scale ?? 1.0,
                        })
                      }}
                      title="Editar mesa"
                      className="rounded-full bg-blue-500 p-1 text-white shadow hover:bg-blue-600"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTable(table.id)
                      }}
                      title="Eliminar mesa"
                      className="rounded-full bg-red-500 p-1 text-white shadow hover:bg-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Empty state */}
          {filteredTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400">
                  {activeZone
                    ? `No hay mesas en "${activeZone}"`
                    : "No hay mesas configuradas"}
                </p>
                {!activeZone && (
                  <button
                    onClick={() => {
                      setEditMode(true)
                      setShowAddModal(true)
                      setFormData({ name: "", zone: "", capacity: 4, shape: "square", scale: 1.0 })
                    }}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar primera mesa
                  </button>
                )}
                {activeZone && (
                  <button
                    onClick={() => setActiveZone(null)}
                    className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    Ver todas las zonas
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Status legend: wrap en móvil y safe area ── */}
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-4 sm:gap-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 pb-[env(safe-area-inset-bottom,0.5rem)]">
        {(["available", "occupied", "ordering", "billing"] as const).map(
          (key) => {
            const c = STATUS_CONFIG[key]
            return (
              <div
                key={key}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
              >
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", c.dot)} />
                <span>{c.label}</span>
              </div>
            )
          }
        )}
      </div>

      {/* ── Modal Gestionar zonas ── */}
      {showZonesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowZonesModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">Gestionar zonas</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Agrega, edita o elimina zonas (Principal, Salón, etc.). La zona Especial es fija y no se puede modificar. Las pestañas del mapa se actualizan al guardar.</p>

            {/* Agregar zona */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddZone()}
                placeholder="Nueva zona (ej. Terraza)"
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => handleAddZone()}
                disabled={!newZoneName.trim() || allZones.includes(newZoneName.trim())}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                Agregar
              </button>
            </div>

            {/* Lista de zonas (sin Especial: no editable ni eliminable) */}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {zonesForManagement.length === 0 ? (
                <p className="text-sm text-gray-400">No hay zonas editables. Agrega una arriba o asígnala al crear una mesa. La zona Especial existe pero no se gestiona aquí.</p>
              ) : (
                zonesForManagement.map((zone) => (
                  <div key={zone} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    {zoneToRename === zone ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={zoneRenameValue}
                          onChange={(e) => setZoneRenameValue(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          autoFocus
                        />
                        <button type="button" onClick={handleRenameZone} disabled={zoneSaveLoading} className="text-sm font-medium text-amber-600 hover:underline disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => { setZoneToRename(null); setZoneRenameValue("") }} className="text-sm text-gray-500 hover:underline">Cancelar</button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-gray-800">{zone}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => { setZoneToRename(zone); setZoneRenameValue(zone) }}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title="Renombrar"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setZoneToDelete(zone)}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50"
                            title="Eliminar zona"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Eliminar: reasignar o confirmar */}
            {zoneToDelete && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-sm font-medium text-amber-800">Eliminar zona &quot;{zoneToDelete}&quot;</p>
                {tables.filter((t) => t.zone === zoneToDelete).length > 0 ? (
                  <>
                    <p className="mb-2 text-xs text-amber-700">Hay mesas en esta zona. Reasignar a:</p>
                    <select
                      aria-label="Reasignar mesas a zona"
                      value={zoneReassignTo}
                      onChange={(e) => setZoneReassignTo(e.target.value)}
                      className="mb-2 w-full rounded-lg border border-amber-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">— Elegir zona —</option>
                      {allZones.filter((z) => z !== zoneToDelete).map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleDeleteZone(false)} disabled={!zoneReassignTo || zoneSaveLoading} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">Reasignar y eliminar</button>
                      <button type="button" onClick={() => handleDeleteZone(true)} disabled={zoneSaveLoading} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">Eliminar mesas y zona</button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDeleteZone()} disabled={zoneSaveLoading} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">Eliminar zona</button>
                    <button type="button" onClick={() => setZoneToDelete(null)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">Cancelar</button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => { setShowZonesModal(false); setZoneToRename(null); setZoneToDelete(null); setZoneReassignTo("") }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add table modal ── */}
      {showAddModal && (
        <TableFormModal
          title="Agregar Mesa"
          formData={formData}
          setFormData={setFormData}
          onSave={handleAddTable}
          onCancel={() => {
            setShowAddModal(false)
            setFormData({ name: "", zone: "", capacity: 4, shape: "square", scale: 1.0 })
          }}
          saving={formSaving}
          zones={allZones.filter((z) => z !== "Especial")}
        />
      )}

      {/* ── Edit table modal ── */}
      {editingTable && (
        <TableFormModal
          title={`Editar ${/^\d+$/.test(String(editingTable.name ?? "")) ? `Mesa ${editingTable.name}` : editingTable.name}`}
          formData={formData}
          setFormData={setFormData}
          onSave={handleEditTable}
          onCancel={() => {
            setEditingTable(null)
            setFormData({ name: "", zone: "", capacity: 4, shape: "square", scale: 1.0 })
          }}
          saving={formSaving}
          zones={allZones.filter((z) => z !== "Especial")}
        />
      )}
    </div>
  )
}
