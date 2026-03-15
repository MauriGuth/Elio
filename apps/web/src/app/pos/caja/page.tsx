"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { authApi } from "@/lib/api/auth"
import { getLocationKey } from "@/lib/api"
import { cashMovementsApi } from "@/lib/api/cash-movements"
import { cashRegistersApi } from "@/lib/api/cash-registers"
import { productsApi } from "@/lib/api/products"
import { categoriesApi } from "@/lib/api/categories"
import { stockReconciliationsApi } from "@/lib/api/stock-reconciliations"
import { cn, formatCurrency, formatNumberInputDisplay, parseNumberInputInput } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { sileo } from "sileo"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Package,
  Plus,
  Pencil,
  Trash2,
  X,
  Banknote,
  Receipt,
  Lock,
  Unlock,
  ClipboardCheck,
  CreditCard,
  Building2,
  CheckCircle2,
} from "lucide-react"

const unitOptions = [
  { value: "unidad", label: "Unidad" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "litro", label: "Litro" },
  { value: "gramo", label: "Gramo" },
  { value: "ml", label: "Mililitro (ml)" },
]

type Tab = "movimientos" | "productos" | "caja" | "microbalance"

const SHIFT_OPTIONS = [
  { value: "morning", label: "Turno mañana" },
  { value: "afternoon", label: "Turno tarde" },
] as const

const SHIFT_LABEL: Record<string, string> = Object.fromEntries(
  SHIFT_OPTIONS.map((o) => [o.value, o.label])
)

/** Denominaciones para conteo (billetes y monedas) */
const DENOMINATIONS = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5]

/** Clave para guardar el borrador del micro balance por draft (para no perder cantidades al cambiar de pestaña). */
const MICRO_BALANCE_DRAFT_STORAGE_KEY = (draftId: string) =>
  `elio_micro_balance_draft_${draftId}`

/** Clave para guardar el borrador del formulario Cerrar caja (para no perder valores al ir a otra página). */
const CERRAR_CAJA_DRAFT_STORAGE_KEY = (registerId: string) =>
  `elio_cerrar_caja_draft_${registerId}`

interface ProductRow {
  id: string
  sku: string
  name: string
  unit: string
  avgCost: number
  salePrice: number
  imageUrl?: string | null
  category: { id: string; name: string; icon: string; color: string }
  stockQuantity: number
}

const defaultProductForm = {
  sku: "",
  name: "",
  categoryId: "",
  unit: "unidad" as const,
  avgCost: 0,
  salePrice: 0,
  isSellable: false,
  isIngredient: false,
  isPerishable: false,
}

interface ProductForCount {
  productId: string
  product: { id: string; name: string; sku: string; unit: string }
  unit: string
}

export default function PosCajaPage() {
  const [tab, setTab] = useState<Tab>("movimientos")

  const user = authApi.getStoredUser()
  const isAdmin = user?.role === "admin" || user?.role === "ADMIN"

  // Location
  const [locationId, setLocationId] = useState("")
  // Micro balance (cierre de jornada)
  const [productsForCount, setProductsForCount] = useState<ProductForCount[]>([])
  const [draftReconciliation, setDraftReconciliation] = useState<any | null>(null)
  const [countByProductId, setCountByProductId] = useState<Record<string, string>>({})
  const [loadingMicroBalance, setLoadingMicroBalance] = useState(false)
  const [submittingReconciliation, setSubmittingReconciliation] = useState(false)
  const [reconciliationError, setReconciliationError] = useState<string | null>(null)
  const [reconciliationSuccess, setReconciliationSuccess] = useState(false)
  /** Si en turno tarde ya se envió el micro balance hoy (para habilitar cierre de caja). */
  const [afternoonMicroBalanceSubmitted, setAfternoonMicroBalanceSubmitted] = useState<boolean | null>(null)
  /** Micro balance ya realizado hoy (una sola vez por turno): mostrar mensaje y no permitir otro. */
  const [microBalanceAlreadyDoneToday, setMicroBalanceAlreadyDoneToday] = useState(false)
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
    if (loc?.id) setLocationId(loc.id)
  }, [])

  // -------- Movimientos --------
  const [movements, setMovements] = useState<any[]>([])
  const [loadingMov, setLoadingMov] = useState(true)
  const [error, setError] = useState("")
  const [type, setType] = useState<"in" | "out">("in")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchMovements = useCallback(async () => {
    if (!locationId) return
    setLoadingMov(true)
    try {
      const data = await cashMovementsApi.getAll(locationId, 50)
      setMovements(
        Array.isArray(data) ? data : (data as { data?: unknown[] })?.data ?? []
      )
      setError("")
    } catch (err: any) {
      setError(err?.message ?? "Error al cargar movimientos")
    } finally {
      setLoadingMov(false)
    }
  }, [locationId])

  useEffect(() => {
    if (tab === "movimientos") fetchMovements()
  }, [tab, fetchMovements])

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentRegister) return
    const num = parseFloat(amount.replace(",", "."))
    if (!locationId || !num || num <= 0) return
    setSubmitting(true)
    setError("")
    try {
      await cashMovementsApi.create({
        locationId,
        type,
        amount: num,
        reason: reason.trim() || undefined,
        cashRegisterId: currentRegister.id,
      })
      setAmount("")
      setReason("")
      await fetchMovements()
      await fetchCurrentRegister(true)
      sileo.success({ title: type === "in" ? "Ingreso registrado" : "Egreso registrado" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al registrar movimiento"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setSubmitting(false)
    }
  }

  // -------- Productos --------
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loadingProd, setLoadingProd] = useState(false)
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; slug: string; icon: string; color: string }>
  >([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [productToEdit, setProductToEdit] = useState<ProductRow | null>(null)
  const [productToDelete, setProductToDelete] = useState<ProductRow | null>(null)
  const [createForm, setCreateForm] = useState(defaultProductForm)
  const [editForm, setEditForm] = useState(defaultProductForm)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)
  const [productSearch, setProductSearch] = useState("")

  // -------- Caja (apertura/cierre) --------
  const [currentRegister, setCurrentRegister] = useState<any | null>(null)
  const [loadingCaja, setLoadingCaja] = useState(false)
  const [cajaError, setCajaError] = useState<string | null>(null)
  const [openAmount, setOpenAmount] = useState(0)
  const [openShift, setOpenShift] = useState<string>("morning")
  const [opening, setOpening] = useState(false)
  const [closeAmount, setCloseAmount] = useState(0)
  const [closeDenominations, setCloseDenominations] = useState<Record<string, string>>({})
  const [closeCardsTotal, setCloseCardsTotal] = useState(0)
  const [closeTransferQrTotal, setCloseTransferQrTotal] = useState(0)
  const [closeNotes, setCloseNotes] = useState("")
  const [closeShift, setCloseShift] = useState<string>("afternoon")
  const [closing, setClosing] = useState(false)
  /** Resultado del último cierre (sobrante/faltante), solo visible después de cerrar */
  const [lastCloseResult, setLastCloseResult] = useState<{ diff: number; closure?: any } | null>(null)
  const [shiftMovements, setShiftMovements] = useState<any[]>([])
  const [loadingShiftMovements, setLoadingShiftMovements] = useState(false)

  const fetchCurrentRegister = useCallback(async (silent = false) => {
    if (!locationId) {
      if (!silent) setLoadingCaja(false)
      return
    }
    if (!silent) {
      setLoadingCaja(true)
      setCajaError(null)
    }
    try {
      const reg = await cashRegistersApi.getCurrentOpen(locationId)
      if (!reg || typeof reg !== "object" || Array.isArray(reg)) {
        setCurrentRegister(null)
        return
      }
      const r = reg as Record<string, unknown>
      const id = r.id ?? (r.data as Record<string, unknown>)?.id ?? (r.register as Record<string, unknown>)?.id
      if (id == null || id === "") {
        setCurrentRegister(null)
        return
      }
      setCurrentRegister({ ...r, id } as any)
    } catch (err: any) {
      const msg = err?.message ?? ""
      const isNotFound = msg.includes("Not Found") || msg.includes("404") || err?.status === 404
      if (isNotFound) {
        setCurrentRegister(null)
        if (!silent) setCajaError(null)
      } else if (!silent) {
        setCajaError(msg || "Error al cargar estado de caja")
        setCurrentRegister(null)
      }
    } finally {
      if (!silent) setLoadingCaja(false)
    }
  }, [locationId])

  // Carga inicial al entrar en Caja o Movimientos
  useEffect(() => {
    if (tab === "caja" || tab === "movimientos") fetchCurrentRegister()
  }, [tab, fetchCurrentRegister])

  // Sincronización entre usuarios: polling cada 4s y al volver a la pestaña
  const POLL_INTERVAL_MS = 4000
  useEffect(() => {
    if (!locationId || (tab !== "caja" && tab !== "movimientos")) return
    const interval = setInterval(() => {
      fetchCurrentRegister(true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [locationId, tab, fetchCurrentRegister])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && locationId && (tab === "caja" || tab === "movimientos")) {
        fetchCurrentRegister(true)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [locationId, tab, fetchCurrentRegister])

  // Movimientos de caja de este turno (desde apertura)
  useEffect(() => {
    if (tab !== "caja" || !currentRegister?.openedAt || !locationId) {
      setShiftMovements([])
      return
    }
    const openedAt = new Date(currentRegister.openedAt).getTime()
    setLoadingShiftMovements(true)
    cashMovementsApi
      .getAll(locationId, 200)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { data?: any[] })?.data ?? []
        const inShift = (list as any[]).filter(
          (m) => new Date(m.createdAt).getTime() >= openedAt
        )
        setShiftMovements(inShift)
      })
      .catch(() => setShiftMovements([]))
      .finally(() => setLoadingShiftMovements(false))
  }, [tab, locationId, currentRegister?.id, currentRegister?.openedAt])

  const registerIdForStorage =
    currentRegister?.id ??
    (currentRegister as any)?.data?.id ??
    (currentRegister as any)?.register?.id

  const lastRestoredCerrarCajaRegisterIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!registerIdForStorage || typeof localStorage === "undefined") return
    if (lastRestoredCerrarCajaRegisterIdRef.current === registerIdForStorage) return
    lastRestoredCerrarCajaRegisterIdRef.current = registerIdForStorage
    try {
      const saved = localStorage.getItem(CERRAR_CAJA_DRAFT_STORAGE_KEY(registerIdForStorage))
      if (!saved) return
      const parsed = JSON.parse(saved) as {
        closeAmount?: number
        closeDenominations?: Record<string, string>
        closeCardsTotal?: number
        closeTransferQrTotal?: number
        closeShift?: string
        closeNotes?: string
      }
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.closeAmount === "number") setCloseAmount(parsed.closeAmount)
        if (parsed.closeDenominations && typeof parsed.closeDenominations === "object")
          setCloseDenominations(parsed.closeDenominations)
        if (typeof parsed.closeCardsTotal === "number") setCloseCardsTotal(parsed.closeCardsTotal)
        if (typeof parsed.closeTransferQrTotal === "number")
          setCloseTransferQrTotal(parsed.closeTransferQrTotal)
        if (typeof parsed.closeShift === "string" && parsed.closeShift)
          setCloseShift(parsed.closeShift)
        if (typeof parsed.closeNotes === "string") setCloseNotes(parsed.closeNotes)
      }
    } catch {
      // ignore
    }
  }, [registerIdForStorage])

  const cerrarCajaSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!registerIdForStorage || typeof localStorage === "undefined") return
    cerrarCajaSaveTimeoutRef.current = setTimeout(() => {
      cerrarCajaSaveTimeoutRef.current = null
      try {
        const payload = {
          closeAmount,
          closeDenominations,
          closeCardsTotal,
          closeTransferQrTotal,
          closeShift,
          closeNotes,
        }
        const hasAny =
          closeAmount > 0 ||
          Object.values(closeDenominations).some((v) => v !== "" && v !== "0") ||
          closeCardsTotal > 0 ||
          closeTransferQrTotal > 0 ||
          (closeNotes && closeNotes.trim() !== "")
        if (hasAny) {
          localStorage.setItem(
            CERRAR_CAJA_DRAFT_STORAGE_KEY(registerIdForStorage),
            JSON.stringify(payload)
          )
        } else {
          localStorage.removeItem(CERRAR_CAJA_DRAFT_STORAGE_KEY(registerIdForStorage))
        }
      } catch {
        // ignore
      }
    }, 500)
    return () => {
      if (cerrarCajaSaveTimeoutRef.current) {
        clearTimeout(cerrarCajaSaveTimeoutRef.current)
        cerrarCajaSaveTimeoutRef.current = null
      }
    }
  }, [
    registerIdForStorage,
    closeAmount,
    closeDenominations,
    closeCardsTotal,
    closeTransferQrTotal,
    closeShift,
    closeNotes,
  ])

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!locationId || openAmount < 0) return
    setOpening(true)
    setCajaError(null)
    try {
      await cashRegistersApi.open({
        locationId,
        openingAmount: openAmount,
        shift: openShift,
      })
      setOpenAmount(0)
      setLastCloseResult(null)
      await fetchCurrentRegister()
      sileo.success({ title: "Caja abierta correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al abrir caja"
      setCajaError(msg)
      sileo.error({ title: msg })
    } finally {
      setOpening(false)
    }
  }

  const closeTotalFromDenominations = DENOMINATIONS.reduce(
    (sum, d) => sum + d * (parseInt(closeDenominations[String(d)] ?? "0", 10) || 0),
    0
  )
  const closeUseDenominations = closeTotalFromDenominations > 0
  const effectiveCloseAmount = closeUseDenominations
    ? closeTotalFromDenominations
    : closeAmount
  // Misma fórmula que detalle de cierre: Saldo inicial + Tarjetas + Transferencias y QR + Efectivo − Gastos − Retiros + Ingresos extra
  const salesCards =
    (currentRegister?.salesDebit ?? 0) + (currentRegister?.salesCredit ?? 0) + (currentRegister?.salesCard ?? 0)
  const salesTransfQr = (currentRegister?.salesTransfer ?? 0) + (currentRegister?.salesQr ?? 0)
  const expectedAtClose =
    (currentRegister?.openingAmount ?? 0) +
    salesCards +
    salesTransfQr +
    (currentRegister?.salesCash ?? 0) -
    (currentRegister?.totalCashExpenses ?? 0) -
    (currentRegister?.totalWithdrawals ?? 0) +
    (currentRegister?.totalExtraIncome ?? 0)

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentRegister) return
    const num = closeUseDenominations ? closeTotalFromDenominations : closeAmount
    if (Number.isNaN(num) || num < 0) return
    setClosing(true)
    setCajaError(null)
    try {
      let registerId =
        currentRegister.id ??
        (currentRegister as any)?.data?.id ??
        (currentRegister as any)?.register?.id
      if (!registerId && locationId) {
        const fresh = await cashRegistersApi.getCurrentOpen(locationId)
        const raw = fresh && (fresh as any)
        registerId = raw?.id ?? raw?.data?.id ?? raw?.register?.id
      }
      if (!registerId) {
        setCajaError("No se pudo obtener la caja abierta. Recarga la página e intenta de nuevo.")
        setClosing(false)
        return
      }
      const denominationsPayload: Record<string, number> = {}
      if (closeUseDenominations) {
        DENOMINATIONS.forEach((d) => {
          const qty = parseInt(closeDenominations[String(d)] ?? "0", 10) || 0
          if (qty > 0) denominationsPayload[String(d)] = qty
        })
      }
      const closed = await cashRegistersApi.close(registerId, {
        closingAmount: Math.round(num * 100) / 100,
        ...(Object.keys(denominationsPayload).length > 0 ? { denominations: denominationsPayload } : {}),
        closingCardsTotal: closeCardsTotal > 0 ? closeCardsTotal : undefined,
        closingTransferTotal: closeTransferQrTotal > 0 ? closeTransferQrTotal : undefined,
        closingQrTotal: 0,
        notes: closeNotes.trim() || undefined,
        shift: closeShift,
      })
      const diff = Math.round((num - expectedAtClose) * 100) / 100
      const closureData = (closed as any)?.data ?? closed
      setLastCloseResult({ diff, closure: closureData })
      if (typeof localStorage !== "undefined" && registerId) {
        try {
          localStorage.removeItem(CERRAR_CAJA_DRAFT_STORAGE_KEY(registerId))
        } catch {
          // ignore
        }
      }
      lastRestoredCerrarCajaRegisterIdRef.current = null
      setCloseAmount(0)
      setCloseDenominations({})
      setCloseCardsTotal(0)
      setCloseTransferQrTotal(0)
      setCloseNotes("")
      setCurrentRegister(null)
      await fetchCurrentRegister()
      sileo.success({ title: "Caja cerrada correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al cerrar caja"
      setCajaError(msg)
      sileo.error({ title: msg })
    } finally {
      setClosing(false)
    }
  }

  const fetchProducts = useCallback(async () => {
    if (!locationId) {
      setProducts([])
      return
    }

    setLoadingProd(true)
    try {
      const res = await productsApi.getAll({ limit: 5000, isActive: true })
      const list = res?.data ?? []
      setProducts(
        list
          .map((p: any) => {
            const stockForLocation = Array.isArray(p.stockLevels)
              ? p.stockLevels.find((level: any) => level.locationId === locationId)
              : null

            if (!stockForLocation) return null

            return {
              id: p.id,
              sku: p.sku,
              name: p.name,
              unit: p.unit,
              avgCost: p.avgCost ?? 0,
              salePrice: stockForLocation.salePrice ?? p.salePrice ?? 0,
              stockQuantity: stockForLocation.quantity ?? 0,
              imageUrl: p.imageUrl ?? null,
              category: p.category ?? {
                id: "",
                name: "Sin categoría",
                icon: "📦",
                color: "#6b7280",
              },
            }
          })
          .filter(Boolean)
      )
    } catch {
      setProducts([])
    } finally {
      setLoadingProd(false)
    }
  }, [locationId])

  useEffect(() => {
    if (tab === "productos") {
      fetchProducts()
      categoriesApi.getAll({ isActive: true }).then((data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? []
        setCategories(list)
      }).catch(() => {})
    }
  }, [tab, fetchProducts])

  // Micro balance solo en turno tarde: si no es turno tarde, volver a Cierre de caja
  useEffect(() => {
    if (tab === "microbalance" && currentRegister?.shift !== "afternoon") {
      setTab("caja")
    }
  }, [tab, currentRegister?.shift])

  // En turno tarde, consultar si ya se envió el micro balance hoy (para habilitar/deshabilitar cierre de caja)
  useEffect(() => {
    if (currentRegister?.shift !== "afternoon" || !locationId) {
      setAfternoonMicroBalanceSubmitted(null)
      return
    }
    stockReconciliationsApi
      .hasAfternoonSubmittedToday(locationId)
      .then((res) => {
        const value = res === true || (res as any)?.data === true
        setAfternoonMicroBalanceSubmitted((prev) => (value ? true : prev === true ? true : false))
      })
      .catch(() => setAfternoonMicroBalanceSubmitted((prev) => (prev === true ? true : false)))
  }, [currentRegister?.shift, locationId, reconciliationSuccess])

  // Micro balance: solo en turno tarde. Si ya se envió hoy, mostrar "ya lo completaste" sin cargar borrador (aunque vuelvas de Mesas).
  useEffect(() => {
    if (tab !== "microbalance" || !locationId || currentRegister?.shift !== "afternoon") {
      setProductsForCount([])
      setDraftReconciliation(null)
      return
    }
    if (afternoonMicroBalanceSubmitted === true) {
      setMicroBalanceAlreadyDoneToday(true)
      setProductsForCount([])
      setDraftReconciliation(null)
      setReconciliationError(null)
      return
    }
    setLoadingMicroBalance(true)
    setReconciliationError(null)
    setReconciliationSuccess(false)
    stockReconciliationsApi
      .hasAfternoonSubmittedToday(locationId)
      .then((alreadySubmitted) => {
        const value = alreadySubmitted === true || (alreadySubmitted as any)?.data === true
        if (value) {
          setAfternoonMicroBalanceSubmitted(true)
          setMicroBalanceAlreadyDoneToday(true)
          setProductsForCount([])
          setDraftReconciliation(null)
          setLoadingMicroBalance(false)
          return
        }
        return Promise.all([
          stockReconciliationsApi.getProductsForCount(locationId),
          stockReconciliationsApi.getOrCreateDraft({ locationId, shiftLabel: "afternoon" }),
        ])
      })
      .then((result) => {
        if (!result) return
        const [products, draft] = result
        setProductsForCount(Array.isArray(products) ? products : [])
        setDraftReconciliation(draft)
        let initialCounts: Record<string, string> = {}
        if (draft?.id && typeof localStorage !== "undefined") {
          try {
            const saved = localStorage.getItem(MICRO_BALANCE_DRAFT_STORAGE_KEY(draft.id))
            if (saved) {
              const parsed = JSON.parse(saved) as Record<string, string>
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                initialCounts = parsed
              }
            }
          } catch {
            // ignore
          }
        }
        setCountByProductId(initialCounts)
        setMicroBalanceAlreadyDoneToday(false)
      })
      .catch((err) => {
        const msg = err?.message ?? "Error al cargar datos para el micro balance"
        setReconciliationError(msg)
        setProductsForCount([])
        setDraftReconciliation(null)
        if (msg.includes("ya fue realizado hoy") || msg.includes("ya realizaste")) {
          setAfternoonMicroBalanceSubmitted(true)
          setMicroBalanceAlreadyDoneToday(true)
          setReconciliationError(null)
        }
      })
      .finally(() => setLoadingMicroBalance(false))
  }, [tab, locationId, currentRegister?.shift])

  // Refs con el último estado del micro balance para guardar al salir de la página o desmontar
  const microBalanceCountsRef = useRef<Record<string, string>>({})
  const microBalanceDraftIdRef = useRef<string | null>(null)
  useEffect(() => {
    microBalanceCountsRef.current = countByProductId
    microBalanceDraftIdRef.current = draftReconciliation?.id ?? null
  }, [countByProductId, draftReconciliation?.id])

  const flushMicroBalanceToStorage = useCallback(() => {
    const draftId = microBalanceDraftIdRef.current
    const counts = microBalanceCountsRef.current
    if (!draftId || typeof localStorage === "undefined") return
    try {
      const hasAny = counts && Object.keys(counts).some((k) => counts[k] !== "" && counts[k] != null)
      if (hasAny) {
        localStorage.setItem(MICRO_BALANCE_DRAFT_STORAGE_KEY(draftId), JSON.stringify(counts || {}))
      } else {
        localStorage.removeItem(MICRO_BALANCE_DRAFT_STORAGE_KEY(draftId))
      }
    } catch {
      // ignore
    }
  }, [])

  // Guardar cantidades del micro balance en localStorage (debounced y al salir/desmontar)
  const microBalanceSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftReconciliation?.id || typeof localStorage === "undefined") return
    microBalanceSaveTimeoutRef.current = setTimeout(() => {
      microBalanceSaveTimeoutRef.current = null
      flushMicroBalanceToStorage()
    }, 400)
    return () => {
      if (microBalanceSaveTimeoutRef.current) {
        clearTimeout(microBalanceSaveTimeoutRef.current)
        microBalanceSaveTimeoutRef.current = null
      }
      flushMicroBalanceToStorage()
    }
  }, [countByProductId, draftReconciliation?.id, flushMicroBalanceToStorage])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushMicroBalanceToStorage()
    }
    const onBeforeUnload = () => flushMicroBalanceToStorage()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [flushMicroBalanceToStorage])

  const handleSubmitMicroBalance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draftReconciliation?.id) return
    const items = productsForCount
      .map((p) => {
        const raw = countByProductId[p.productId] ?? ""
        const counted = parseFloat(String(raw).replace(",", "."))
        if (Number.isNaN(counted) || counted < 0) return null
        return { productId: p.productId, countedQuantity: counted }
      })
      .filter((x): x is { productId: string; countedQuantity: number } => x !== null)
    if (items.length === 0) {
      setReconciliationError("Ingresá al menos una cantidad contada")
      return
    }
    setSubmittingReconciliation(true)
    setReconciliationError(null)
    try {
      await stockReconciliationsApi.submit(draftReconciliation.id, { items })
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.removeItem(MICRO_BALANCE_DRAFT_STORAGE_KEY(draftReconciliation.id))
        } catch {
          // ignore
        }
      }
      setReconciliationSuccess(true)
      setAfternoonMicroBalanceSubmitted(true)
      setMicroBalanceAlreadyDoneToday(true)
      sileo.success({ title: "Micro balance enviado correctamente" })
      setDraftReconciliation(null)
      setCountByProductId({})
      setProductsForCount([])
    } catch (err: any) {
      const msg = err?.message ?? "Error al enviar el micro balance"
      setReconciliationError(msg)
      sileo.error({ title: msg })
    } finally {
      setSubmittingReconciliation(false)
    }
  }

  const filteredProducts = productSearch.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase())
      )
    : products

  const openEditModal = useCallback(async (p: ProductRow) => {
    setProductToEdit(p)
    setProductError(null)
    try {
      const full = await productsApi.getById(p.id)
      setEditForm({
        sku: full.sku,
        name: full.name,
        categoryId: full.category?.id ?? "",
        unit: full.unit ?? "unidad",
        avgCost: full.avgCost ?? 0,
        salePrice: full.salePrice ?? 0,
        isSellable: full.isSellable ?? false,
        isIngredient: full.isIngredient ?? false,
        isPerishable: full.isPerishable ?? false,
      })
      setShowEditModal(true)
    } catch {
      setProductError("Error al cargar el producto")
    }
  }, [])

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setProductError(null)
    try {
      await productsApi.create(createForm)
      setShowCreateModal(false)
      setCreateForm(defaultProductForm)
      await fetchProducts()
      sileo.success({ title: "Producto creado correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al crear el producto"
      setProductError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productToEdit) return
    setEditing(true)
    setProductError(null)
    try {
      await productsApi.update(productToEdit.id, editForm)
      setShowEditModal(false)
      setProductToEdit(null)
      await fetchProducts()
      sileo.success({ title: "Producto actualizado correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al guardar"
      setProductError(msg)
      sileo.error({ title: msg })
    } finally {
      setEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!productToDelete) return
    setDeleting(true)
    try {
      await productsApi.delete(productToDelete.id)
      setShowDeleteConfirm(false)
      setProductToDelete(null)
      await fetchProducts()
      sileo.success({ title: "Producto eliminado" })
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al eliminar el producto" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 p-4">
      <h1 className="shrink-0 mb-4 text-xl font-bold text-gray-800">
        Caja
      </h1>

      {/* Tabs */}
      <div className="shrink-0 mb-4 flex gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("movimientos")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
            tab === "movimientos"
              ? "bg-amber-500 text-white shadow"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          <Banknote className="h-4 w-4" />
          Movimientos
        </button>
        <button
          type="button"
          onClick={() => setTab("productos")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
            tab === "productos"
              ? "bg-amber-500 text-white shadow"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          <Package className="h-4 w-4" />
          Productos
        </button>
        <button
          type="button"
          onClick={() => setTab("caja")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
            tab === "caja"
              ? "bg-amber-500 text-white shadow"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          <Receipt className="h-4 w-4" />
          Cierre de caja
        </button>
        {currentRegister?.shift === "afternoon" && (
          <button
            type="button"
            onClick={() => setTab("microbalance")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
              tab === "microbalance"
                ? "bg-amber-500 text-white shadow"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <ClipboardCheck className="h-4 w-4" />
            Micro balance
          </button>
        )}
      </div>

      {/* -------- Tab: Movimientos -------- */}
      {tab === "movimientos" && (
        <div className="flex min-h-0 flex-1 flex-col">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!currentRegister ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-amber-500" />
              <p className="mt-2 text-sm font-medium text-amber-800">
                Abra la caja para registrar ingresos y egresos
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Vaya a la pestaña &quot;Cierre de caja&quot; e ingrese el monto de apertura para abrir el turno.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitMovement}
              className="form-nuevo-movimiento mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
            >
              <p className="mb-3 text-sm font-medium text-gray-700">
                Nuevo movimiento
              </p>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("in")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all",
                    type === "in"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <ArrowDownCircle className="h-5 w-5" />
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setType("out")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all",
                    type === "out"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <ArrowUpCircle className="h-5 w-5" />
                  Egreso
                </button>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Monto ($)
                </label>
                <FormattedNumberInput
                  value={parseNumberInputInput(amount) || 0}
                  onChange={(n) => setAmount(String(Math.max(0, n)))}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-medium text-gray-900 placeholder:text-gray-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Apertura de caja, retiro, etc."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={
                  submitting ||
                  !amount ||
                  parseFloat(amount.replace(",", ".")) <= 0
                }
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : type === "in" ? (
                  "Registrar ingreso"
                ) : (
                  "Registrar egreso"
                )}
              </button>
            </form>
          )}

          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Últimos movimientos
              </h2>
              {currentRegister?.openedAt && (
                <p className="mt-0.5 text-xs text-gray-500">
                  Solo de este turno (desde{" "}
                  {new Date(currentRegister.openedAt).toLocaleString("es-CL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </p>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {loadingMov ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
              ) : !currentRegister ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Abra la caja para ver movimientos del turno
                </p>
              ) : (() => {
                const openedAt = new Date(currentRegister.openedAt).getTime()
                const turnMovements = movements.filter(
                  (m: any) => new Date(m.createdAt).getTime() >= openedAt
                )
                return turnMovements.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">
                    Aún no hay movimientos en este turno
                  </p>
                ) : (
                  <>
                    {turnMovements.map((m: any) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          {m.type === "in" ? (
                            <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <ArrowUpCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {m.type === "in" ? "Ingreso" : "Egreso"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {m.reason || "—"} ·{" "}
                              {m.createdAt
                                ? new Date(m.createdAt).toLocaleString("es-AR")
                                : ""}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            m.type === "in"
                              ? "text-emerald-600"
                              : "text-red-600"
                          )}
                        >
                          {m.type === "in" ? "+" : "-"}
                          {formatCurrency(m.amount)}
                        </span>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* -------- Tab: Productos -------- */}
      {tab === "productos" && (
        <div className="pos-productos-section flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-600 dark:placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              aria-label="Buscar productos por nombre o SKU"
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setProductError(null)
                  setCreateForm(defaultProductForm)
                  setShowCreateModal(true)
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600"
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Productos ({filteredProducts.length})
              </h2>
            </div>
            {loadingProd ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                {productSearch.trim()
                  ? "No hay productos que coincidan con la búsqueda"
                  : locationId
                    ? "No hay productos cargados para este local."
                    : "Seleccioná un local para ver sus productos."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredProducts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl.startsWith("http") ? p.imageUrl : p.imageUrl.startsWith("/") ? p.imageUrl : `/${p.imageUrl}`}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover bg-gray-50 dark:border-gray-600 dark:bg-gray-700"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm font-medium text-gray-500 dark:bg-gray-600 dark:text-gray-400">
                          {p.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {p.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.sku} · {p.category.name} · {p.unit}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-gray-900">
                        {formatCurrency(p.salePrice)}
                      </p>
                      <p className="text-xs text-gray-500 tabular-nums">
                        Precio en mesas
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
                          aria-label="Editar producto"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductToDelete(p)
                            setShowDeleteConfirm(true)
                          }}
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* -------- Tab: Cierre de caja -------- */}
      {tab === "caja" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {cajaError && (
            <div className="mb-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {cajaError}
              <button
                type="button"
                onClick={() => fetchCurrentRegister()}
                className="ml-2 font-medium underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {!locationId ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
              <Lock className="h-10 w-10 text-amber-500" />
              <p className="mt-2 text-sm font-medium text-amber-800">
                No hay ubicación seleccionada
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Seleccione un local en el POS para poder abrir la caja.
              </p>
            </div>
          ) : loadingCaja ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
            </div>
          ) : !currentRegister ? (
            /* Sin caja abierta: resultado del último cierre (si hay) y formulario Abrir caja */
            <div className="space-y-4">
              {lastCloseResult !== null && (
                <>
                  <div
                    className={cn(
                      "rounded-2xl border px-4 py-4 shadow-sm",
                      Math.abs(lastCloseResult.diff) < 0.01
                        ? "border-gray-200 bg-gray-50 text-gray-800"
                        : lastCloseResult.diff > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-red-200 bg-red-50 text-red-800"
                    )}
                  >
                    <p className="font-semibold">Cierre realizado</p>
                    <p className="mt-1 text-sm">
                      {Math.abs(lastCloseResult.diff) < 0.01
                        ? "Cuadre correcto."
                        : lastCloseResult.diff > 0
                          ? `Sobrante: ${formatCurrency(lastCloseResult.diff)}`
                          : `Faltante: ${formatCurrency(Math.abs(lastCloseResult.diff))}`}
                    </p>
                  </div>
                  {lastCloseResult.closure && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="mb-3 font-semibold text-gray-800">Informe de cierre — Ventas por medio de pago</p>
                      <div className="space-y-2 text-sm">
                        {(() => {
                          const c = lastCloseResult.closure
                          const rec = (c.closingReconciliation || {}) as Record<string, number>
                          const salesCards = (c.salesDebit ?? 0) + (c.salesCredit ?? 0) + (c.salesCard ?? 0)
                          const salesTransfQr = (c.salesTransfer ?? 0) + (c.salesQr ?? 0)
                          const declaredCards = rec.cards ?? 0
                          const declaredTransfQr = (rec.transfer ?? 0) + (rec.qr ?? 0)
                          const declaredCash = c.closingAmount ?? 0
                          const match = (a: number, b: number) => Math.abs(a - b) < 0.02
                          return (
                            <>
                              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
                                <CreditCard className="h-4 w-4 text-gray-500" />
                                <span className="text-gray-700">Tarjetas</span>
                                <span className="tabular-nums">Vendido: {formatCurrency(salesCards)}</span>
                                <span className="text-gray-400">·</span>
                                <span className="tabular-nums text-gray-600">Declarado: {formatCurrency(declaredCards)}</span>
                                {match(salesCards, declaredCards) ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Coincide
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-700">Diferencia: {formatCurrency(declaredCards - salesCards)}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
                                <Banknote className="h-4 w-4 text-gray-500" />
                                <span className="text-gray-700">Efectivo</span>
                                <span className="tabular-nums">Vendido: {formatCurrency(c.salesCash ?? 0)}</span>
                                <span className="text-gray-400">·</span>
                                <span className="tabular-nums text-gray-600">Conteo: {formatCurrency(declaredCash)}</span>
                                {match(c.salesCash ?? 0, declaredCash) ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Coincide
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-700">Diferencia: {formatCurrency(declaredCash - (c.salesCash ?? 0))}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
                                <Building2 className="h-4 w-4 text-gray-500" />
                                <span className="text-gray-700">Transferencias + QR</span>
                                <span className="tabular-nums">Vendido: {formatCurrency(salesTransfQr)}</span>
                                <span className="text-gray-400">·</span>
                                <span className="tabular-nums text-gray-600">Declarado: {formatCurrency(declaredTransfQr)}</span>
                                {match(salesTransfQr, declaredTransfQr) ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Coincide
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-700">Diferencia: {formatCurrency(declaredTransfQr - salesTransfQr)}</span>
                                )}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                  {lastCloseResult.closure?.comparisonReport && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm">
                      <p className="mb-2 flex items-center gap-2 font-semibold text-blue-900">
                        <Receipt className="h-4 w-4" />
                        Comparación con el mismo día de la semana anterior
                      </p>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-blue-900">
                        {lastCloseResult.closure.comparisonReport}
                      </div>
                    </div>
                  )}
                  {lastCloseResult.closure?.shiftMetrics && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                      <p className="mb-3 font-semibold text-gray-800">Métricas del turno (demoras vs incidentes)</p>
                      <div className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-4">
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="font-medium text-amber-900">Errores comanda:</span>{" "}
                            {lastCloseResult.closure.shiftMetrics.errorsTable.orderCount} órdenes,{" "}
                            {formatCurrency(lastCloseResult.closure.shiftMetrics.errorsTable.totalAmount)}
                          </div>
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                            <span className="font-medium text-red-900">Tacho:</span>{" "}
                            {lastCloseResult.closure.shiftMetrics.trashTable.orderCount} órdenes,{" "}
                            {formatCurrency(lastCloseResult.closure.shiftMetrics.trashTable.totalAmount)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="font-medium text-gray-800">Demoras comandas:</span>{" "}
                          prom. {lastCloseResult.closure.shiftMetrics.comandaDelays.avgMinutes != null ? `${lastCloseResult.closure.shiftMetrics.comandaDelays.avgMinutes} min` : "—"}, máx.{" "}
                          {lastCloseResult.closure.shiftMetrics.comandaDelays.maxMinutes != null ? `${lastCloseResult.closure.shiftMetrics.comandaDelays.maxMinutes} min` : "—"} ·{" "}
                          &gt;15 min: {lastCloseResult.closure.shiftMetrics.comandaDelays.countOver15Minutes ?? 0} ítems
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <span className="font-medium text-gray-800">Facturación:</span>{" "}
                          {formatCurrency(lastCloseResult.closure.shiftMetrics.billing.total)} (normal:{" "}
                          {formatCurrency(lastCloseResult.closure.shiftMetrics.billing.normal)})
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-gray-700">
                  <Unlock className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-semibold">Abrir caja</h2>
                </div>
                <p className="mb-4 text-sm text-gray-500">
                  Ingresa el monto con el que abres el turno (efectivo inicial).
                </p>
              <form onSubmit={handleOpenRegister} className="form-abrir-caja space-y-4">
                <div>
                  <label htmlFor="open-amount" className="mb-1 block text-sm font-medium text-gray-700">
                    Monto de apertura ($)
                  </label>
                  <FormattedNumberInput
                    id="open-amount"
                    value={openAmount}
                    onChange={setOpenAmount}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-medium text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div>
                  <label htmlFor="open-shift" className="mb-1 block text-sm font-medium text-gray-700">
                    Turno
                  </label>
                  <select
                    id="open-shift"
                    value={openShift}
                    onChange={(e) => setOpenShift(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base font-medium text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    aria-label="Turno del día"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={opening || openAmount <= 0}
                  className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
                >
                  {opening ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Abrir caja"
                  )}
                </button>
              </form>
              </div>
            </div>
          ) : (
            /* Caja abierta: resumen y cierre */
            <div className="min-h-0 space-y-4 pb-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 text-emerald-800">
                  <Lock className="h-5 w-5" />
                  <span className="font-semibold">Caja abierta</span>
                  {currentRegister.shift && (
                    <span className="rounded-full bg-emerald-300 px-3 py-1 text-sm font-semibold text-emerald-900">
                      {SHIFT_LABEL[currentRegister.shift] ?? currentRegister.shift}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-emerald-700">
                  Abierta el{" "}
                  {currentRegister.openedAt
                    ? new Date(currentRegister.openedAt).toLocaleString("es-CL")
                    : ""}
                </p>
              </div>

              {isAdmin && (
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">
                    Resumen del turno
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Apertura</dt>
                      <dd className="font-medium tabular-nums text-gray-900">
                        {formatCurrency(currentRegister.openingAmount ?? 0)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Ventas totales</dt>
                      <dd className="font-medium tabular-nums text-gray-900">
                        {formatCurrency(currentRegister.totalSales ?? 0)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Efectivo</dt>
                      <dd className="tabular-nums text-gray-900">{formatCurrency(currentRegister.salesCash ?? 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Tarjeta</dt>
                      <dd className="tabular-nums text-gray-900">{formatCurrency(currentRegister.salesCard ?? 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">QR / Transferencia</dt>
                      <dd className="tabular-nums text-gray-900">
                        {formatCurrency((currentRegister.salesQr ?? 0) + (currentRegister.salesTransfer ?? 0))}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Nº de órdenes</dt>
                      <dd className="font-medium text-gray-900">{currentRegister.totalOrders ?? 0}</dd>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-2 font-medium">
                      <dt className="text-gray-700">Efectivo esperado al cierre</dt>
                      <dd className="tabular-nums text-gray-900">
                        {formatCurrency(expectedAtClose)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-xs text-gray-500">
                    Apertura + ventas efectivo − gastos − retiros + ingresos extra
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <p>
                  Las mesas que sigan abiertas al cerrar no se incluyen en este turno; quedan para el turno siguiente.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  Movimientos del turno
                </h3>
                {loadingShiftMovements ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : shiftMovements.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">
                    No hay movimientos en este turno.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto">
                    {shiftMovements.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 px-3 py-2 text-sm"
                      >
                        {m.type === "in" ? (
                          <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4 shrink-0 text-red-600" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-gray-700">
                          {m.reason || (m.type === "in" ? "Ingreso" : "Egreso")}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-medium tabular-nums",
                            m.type === "in" ? "text-emerald-700" : "text-red-700"
                          )}
                        >
                          {m.type === "in" ? "+" : "-"}
                          {formatCurrency(m.amount ?? 0)}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {m.createdAt
                            ? new Date(m.createdAt).toLocaleString("es-CL", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  Cerrar caja
                </h3>
                {currentRegister.shift === "afternoon" && afternoonMicroBalanceSubmitted === false && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">
                      Para cerrar la caja del turno tarde primero tenés que completar y enviar el micro balance.
                    </p>
                    <p className="mt-1 text-amber-800">
                      Andá a la pestaña <strong>Micro balance</strong>, ingresá las cantidades contadas y hacé clic en &quot;Enviar micro balance al sistema de gestión&quot;.
                    </p>
                  </div>
                )}
                <form onSubmit={handleCloseRegister} className="form-cerrar-caja space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-600">Conteo de efectivo por denominación</p>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                      {DENOMINATIONS.map((d) => (
                        <div key={d} className="flex items-center gap-0.5">
                          <label htmlFor={`pos-denom-${d}`} className="w-8 shrink-0 text-right text-xs text-gray-600">
                            {d >= 1000 ? `$${d / 1000}k` : `$${d}`}
                          </label>
                          <input
                            id={`pos-denom-${d}`}
                            type="number"
                            min="0"
                            step="1"
                            value={closeDenominations[String(d)] ?? ""}
                            onChange={(e) =>
                              setCloseDenominations((prev) => ({ ...prev, [String(d)]: e.target.value }))
                            }
                            className="w-12 rounded border border-gray-200 px-1 py-1 text-sm tabular-nums !text-gray-900 placeholder:text-gray-500"
                          />
                        </div>
                      ))}
                    </div>
                    {closeUseDenominations && (
                      <p className="mt-1.5 text-sm font-medium text-amber-800">
                        Total efectivo: {formatCurrency(closeTotalFromDenominations)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="close-amount" className="mb-1 block text-sm font-medium text-gray-700">
                      {closeUseDenominations ? "Total efectivo (calculado arriba)" : "Monto contado al cierre ($) *"}
                    </label>
                    {closeUseDenominations ? (
                      <input
                        id="close-amount"
                        type="text"
                        readOnly
                        value={formatNumberInputDisplay(closeTotalFromDenominations)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-medium !text-gray-900"
                      />
                    ) : (
                      <FormattedNumberInput
                        id="close-amount"
                        value={closeAmount}
                        onChange={setCloseAmount}
                        placeholder="0"
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-medium !text-gray-900 placeholder:text-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-600">Totales declarados al cierre</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor="close-cards" className="block text-xs text-gray-500">Total tarjetas</label>
                        <FormattedNumberInput
                          id="close-cards"
                          value={closeCardsTotal}
                          onChange={setCloseCardsTotal}
                          placeholder={formatCurrency(
                            (currentRegister?.salesDebit ?? 0) + (currentRegister?.salesCredit ?? 0) + (currentRegister?.salesCard ?? 0)
                          )}
                          className="totales-declarados-input w-full rounded-lg border border-gray-200 px-2 py-2 text-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        />
                      </div>
                      <div>
                        <label htmlFor="close-transfer-qr" className="block text-xs text-gray-500">Total Transferencias + QR</label>
                        <FormattedNumberInput
                          id="close-transfer-qr"
                          value={closeTransferQrTotal}
                          onChange={setCloseTransferQrTotal}
                          placeholder={formatCurrency((currentRegister?.salesTransfer ?? 0) + (currentRegister?.salesQr ?? 0))}
                          className="totales-declarados-input w-full rounded-lg border border-gray-200 px-2 py-2 text-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="close-shift" className="mb-1 block text-sm font-medium text-gray-700">
                      Turno al cerrar
                    </label>
                    <select
                      id="close-shift"
                      value={closeShift}
                      onChange={(e) => setCloseShift(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base font-medium !text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      aria-label="Turno al cerrar"
                    >
                      {SHIFT_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="close-notes" className="mb-1 block text-sm font-medium text-gray-700">
                      Notas (opcional)
                    </label>
                    <input
                      id="close-notes"
                      type="text"
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      placeholder="Observaciones del cierre"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm !text-gray-900 placeholder:text-gray-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      closing ||
                      effectiveCloseAmount <= 0 ||
                      (currentRegister?.shift === "afternoon" && afternoonMicroBalanceSubmitted !== true)
                    }
                    className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
                  >
                    {closing ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    ) : (
                      "Cerrar caja"
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------- Tab: Micro balance (cierre de jornada) -------- */}
      {tab === "microbalance" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {reconciliationError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {reconciliationError}
            </div>
          )}
          {reconciliationSuccess && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Micro balance enviado correctamente. El stock del local se actualizó con lo contado y el informe de faltantes/sobrantes fue enviado al sistema de gestión para que el auditor y los responsables de turno lo revisen.
            </div>
          )}
          {!locationId ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center">
              <ClipboardCheck className="h-10 w-10 text-amber-500" />
              <p className="mt-2 text-sm font-medium text-amber-800">
                No hay ubicación seleccionada
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Seleccioná un local en el POS para hacer el micro balance.
              </p>
            </div>
          ) : loadingMicroBalance ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
            </div>
          ) : microBalanceAlreadyDoneToday || afternoonMicroBalanceSubmitted === true ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-sm font-semibold text-emerald-900">
                Micro balance del turno tarde ya realizado hoy
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Solo se puede hacer un micro balance por turno por día. Podés ir a Cierre de caja para cerrar.
              </p>
            </div>
          ) : productsForCount.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-700">
                No hay productos con stock en este local
              </p>
              <p className="mt-1 text-xs text-gray-500">
                No es necesario hacer micro balance si no hay productos cargados en esta ubicación.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitMicroBalance} className="form-micro-balance space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <p className="text-sm font-medium text-amber-900">
                  Cierre de jornada – Micro balance
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Contá físicamente lo que hay en el local (ej. en la heladera). No se muestra la cantidad del sistema para no influir en el conteo. Al enviar, se actualiza el stock del local y se genera un informe de faltantes/sobrantes para el auditor.
                </p>
                <p className="mt-3 text-sm font-semibold text-amber-900">
                  Turno tarde
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Cantidad contada por producto
                  </h2>
                  <p className="text-xs text-gray-500">
                    Ingresá la cantidad que contaste (dejá 0 o vacío si no hay)
                  </p>
                </div>
                <ul className="divide-y divide-gray-100">
                  {productsForCount.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{p.product.name}</p>
                        <p className="text-xs text-gray-500">
                          {p.product.sku} · {p.unit}
                        </p>
                      </div>
                      <div className="w-24 shrink-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={countByProductId[p.productId] ?? ""}
                          onChange={(e) =>
                            setCountByProductId((prev) => ({
                              ...prev,
                              [p.productId]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-right text-sm tabular-nums placeholder:text-gray-500 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
                          aria-label={`Cantidad contada: ${p.product.name}`}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="submit"
                disabled={submittingReconciliation}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all hover:bg-amber-600 disabled:opacity-50"
              >
                {submittingReconciliation ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  "Enviar micro balance al sistema de gestión"
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* -------- Modal Crear Producto -------- */}
      {showCreateModal && (
        <div className="pos-modal-producto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Nuevo producto
              </h3>
              <button
                type="button"
                onClick={() => !creating && setShowCreateModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <div className="space-y-4 px-6 py-4">
                {productError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {productError}
                  </div>
                )}
                <div>
                  <label htmlFor="pos-create-sku" className="block text-sm font-medium text-gray-700">
                    SKU <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="pos-create-sku"
                    type="text"
                    required
                    value={createForm.sku}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="SKU del producto"
                  />
                </div>
                <div>
                  <label htmlFor="pos-create-name" className="block text-sm font-medium text-gray-700">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="pos-create-name"
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Nombre del producto"
                  />
                </div>
                <div>
                  <label htmlFor="pos-create-category" className="block text-sm font-medium text-gray-700">
                    Categoría
                  </label>
                  <select
                    id="pos-create-category"
                    value={createForm.categoryId}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        categoryId: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Categoría del producto"
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pos-create-unit" className="block text-sm font-medium text-gray-700">
                    Unidad
                  </label>
                  <select
                    id="pos-create-unit"
                    value={createForm.unit}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        unit: e.target.value as "unidad",
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Unidad de medida"
                  >
                    {unitOptions.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pos-create-avgCost" className="block text-sm font-medium text-gray-700">
                      Costo promedio
                    </label>
                    <input
                      id="pos-create-avgCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.avgCost || ""}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          avgCost: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      aria-label="Costo promedio"
                    />
                  </div>
                  <div>
                    <label htmlFor="pos-create-salePrice" className="block text-sm font-medium text-gray-700">
                      Precio de venta
                    </label>
                    <input
                      id="pos-create-salePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.salePrice || ""}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          salePrice: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      aria-label="Precio de venta"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.isSellable}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          isSellable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Vendible</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.isIngredient}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          isIngredient: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Ingrediente</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.isPerishable}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          isPerishable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Perecedero</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => !creating && setShowCreateModal(false)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !createForm.sku.trim() || !createForm.name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Modal Editar Producto -------- */}
      {showEditModal && productToEdit && (
        <div className="pos-modal-producto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Editar producto
              </h3>
              <button
                type="button"
                onClick={() => !editing && setShowEditModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="space-y-4 px-6 py-4">
                {productError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {productError}
                  </div>
                )}
                <div>
                  <label htmlFor="pos-edit-sku" className="block text-sm font-medium text-gray-700">
                    SKU
                  </label>
                  <input
                    id="pos-edit-sku"
                    type="text"
                    value={editForm.sku}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="SKU del producto"
                  />
                </div>
                <div>
                  <label htmlFor="pos-edit-name" className="block text-sm font-medium text-gray-700">
                    Nombre
                  </label>
                  <input
                    id="pos-edit-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Nombre del producto"
                  />
                </div>
                <div>
                  <label htmlFor="pos-edit-category" className="block text-sm font-medium text-gray-700">
                    Categoría
                  </label>
                  <select
                    id="pos-edit-category"
                    value={editForm.categoryId}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, categoryId: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Categoría del producto"
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pos-edit-unit" className="block text-sm font-medium text-gray-700">
                    Unidad
                  </label>
                  <select
                    id="pos-edit-unit"
                    value={editForm.unit}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        unit: e.target.value as "unidad",
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    aria-label="Unidad de medida"
                  >
                    {unitOptions.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pos-edit-avgCost" className="block text-sm font-medium text-gray-700">
                      Costo promedio
                    </label>
                    <input
                      id="pos-edit-avgCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.avgCost || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          avgCost: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      aria-label="Costo promedio"
                    />
                  </div>
                  <div>
                    <label htmlFor="pos-edit-salePrice" className="block text-sm font-medium text-gray-700">
                      Precio de venta
                    </label>
                    <input
                      id="pos-edit-salePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.salePrice || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          salePrice: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      aria-label="Precio de venta"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isSellable}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          isSellable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Vendible</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isIngredient}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          isIngredient: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Ingrediente</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isPerishable}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          isPerishable: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Perecedero</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => !editing && setShowEditModal(false)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    editing ||
                    !editForm.sku.trim() ||
                    !editForm.name.trim() ||
                    !editForm.categoryId
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {editing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Modal Confirmar Eliminar -------- */}
      {showDeleteConfirm && productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Eliminar producto
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              ¿Eliminar &quot;{productToDelete.name}&quot;? Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !deleting && setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
