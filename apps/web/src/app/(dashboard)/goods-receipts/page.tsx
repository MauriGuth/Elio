"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { sileo } from "sileo"
import {
  Search,
  Plus,
  ChevronDown,
  ClipboardList,
  ScanLine,
  FileText,
  Eye,
  Sparkles,
  AlertCircle,
  Loader2,
  X,
  Trash2,
  Check,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { goodsReceiptsApi } from "@/lib/api/goods-receipts"
import { suppliersApi } from "@/lib/api/suppliers"
import { locationsApi } from "@/lib/api/locations"
import { cn, formatCurrency, formatDate, formatTime, formatNumber, triggerContentUpdateAnimation } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"

// ---------- helpers ----------

type ReceiptStatus = "draft" | "pending_review" | "confirmed" | "cancelled"

const statusConfig: Record<
  ReceiptStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  draft: {
    label: "Borrador",
    dot: "bg-gray-400",
    bg: "bg-gray-100 dark:bg-gray-700/70",
    text: "text-gray-700 dark:text-gray-100",
  },
  pending_review: {
    label: "Pendiente",
    dot: "bg-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-200",
  },
  confirmed: {
    label: "Confirmado",
    dot: "bg-green-500",
    bg: "bg-green-50 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-200",
  },
  cancelled: {
    label: "Cancelado",
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-200",
  },
}

const allStatuses: { value: ReceiptStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "pending_review", label: "Pendiente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "cancelled", label: "Cancelado" },
]

/** Igual que el texto que genera `purchase-orders.service` al crear el ingreso desde OC. */
const DEFAULT_PO_RECEIPT_NOTE_RE =
  /^Generado desde orden de compra\s+PO-[\w-]+\s+\(pedido realizado\)\.\s*Controlar cuando llegue la mercadería al depósito\.?\s*$/i

/** Notas u observaciones a mostrar: no vacío y no solo el mensaje automático de la OC. */
function visibleGoodsReceiptNotes(notes: string | null | undefined): string | null {
  const raw = (notes ?? "").trim()
  if (!raw) return null
  if (DEFAULT_PO_RECEIPT_NOTE_RE.test(raw)) return null
  const rest = raw
    .replace(
      /^\s*Generado desde orden de compra\s+PO-[\w-]+\s+\(pedido realizado\)\.\s*Controlar cuando llegue la mercadería al depósito\.?\s*/i,
      "",
    )
    .trim()
  return rest.length > 0 ? rest : null
}

/** Texto inicial del campo opcional de observaciones al recibir (sin rellenar con el mensaje automático de la OC). */
function userEditableGoodsReceiptNotes(notes: string | null | undefined): string {
  return visibleGoodsReceiptNotes(notes) ?? ""
}

// ---------- skeleton ----------

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {Array.from({ length: 9 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100">
                {Array.from({ length: 9 }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-3">
                    <div
                      className="h-4 animate-pulse rounded bg-gray-100"
                      style={{ width: `${50 + Math.random() * 50}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- main page ----------

export default function GoodsReceiptsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<ReceiptStatus | "">("")
  const [selectedSupplier, setSelectedSupplier] = useState("")
  const [selectedMethod, setSelectedMethod] = useState<"" | "manual" | "ocr">(
    ""
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Data state
  const [receipts, setReceipts] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter options from API
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string; type?: string }[]>([])
  const [selectedLocation, setSelectedLocation] = useState("")

  // Products for create modal
  const [productsList, setProductsList] = useState<{ id: string; name: string; sku: string }[]>([])

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newReceipt, setNewReceipt] = useState({
    supplierId: "",
    locationId: "",
    invoiceNumber: "",
    invoiceDate: "",
    notes: "",
  })
  const [receiptItems, setReceiptItems] = useState<
    Array<{ productId: string; receivedQty: number; unitCost: number }>
  >([{ productId: "", receivedQty: 1, unitCost: 0 }])

  // OCR modal state
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [ocrStep, setOcrStep] = useState<"capture" | "processing" | "review">("capture")
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<any>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ver detalle de ingreso
  const [viewReceiptId, setViewReceiptId] = useState<string | null>(null)
  const [viewReceipt, setViewReceipt] = useState<any | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [editReceivedByName, setEditReceivedByName] = useState("")
  const [editReceivedBySignature, setEditReceivedBySignature] = useState("")
  const [editReceptionNotes, setEditReceptionNotes] = useState("")
  const [savingReceipt, setSavingReceipt] = useState(false)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [editingReceivedQty, setEditingReceivedQty] = useState<Record<string, number>>({})
  const [priceComparison, setPriceComparison] = useState<{
    items: Array<{
      itemId: string
      change?: "up" | "down" | "same"
      changePercent?: number | null
      previousUnitCost?: number | null
    }>
  } | null>(null)

  useEffect(() => {
    if (!viewReceiptId) {
      setViewReceipt(null)
      setPriceComparison(null)
      setConfirmError(null)
      return
    }
    let cancelled = false
    setViewLoading(true)
    setConfirmError(null)
    goodsReceiptsApi
      .getById(viewReceiptId)
      .then((data) => {
        if (!cancelled) setViewReceipt(data)
      })
      .catch(() => {
        if (!cancelled) setViewReceipt(null)
      })
      .finally(() => {
        if (!cancelled) setViewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewReceiptId])

  // Comparación de precios (cuando hay detalle cargado)
  useEffect(() => {
    if (!viewReceiptId || !viewReceipt) {
      setPriceComparison(null)
      return
    }
    let cancelled = false
    goodsReceiptsApi
      .getPriceComparison(viewReceiptId)
      .then((res: any) => {
        if (!cancelled && res?.items) setPriceComparison({ items: res.items })
      })
      .catch(() => {
        if (!cancelled) setPriceComparison(null)
      })
    return () => {
      cancelled = true
    }
  }, [viewReceiptId, viewReceipt])

  // Sincronizar campos editables de recepción cuando cambia el ingreso
  useEffect(() => {
    if (viewReceipt) {
      setEditReceivedByName(viewReceipt.receivedByName ?? "")
      setEditReceivedBySignature(viewReceipt.receivedBySignature ?? "")
      setEditReceptionNotes(userEditableGoodsReceiptNotes(viewReceipt.notes))
    }
  }, [viewReceipt?.id, viewReceipt?.receivedByName, viewReceipt?.receivedBySignature, viewReceipt?.notes])

  const saveReceiptReceivedBy = useCallback(async (payload?: { receivedByName?: string; receivedBySignature?: string; notes?: string }) => {
    if (!viewReceiptId || viewReceipt?.status !== "draft") return
    setSavingReceipt(true)
    try {
      await goodsReceiptsApi.update(viewReceiptId, {
        receivedByName: payload?.receivedByName ?? (editReceivedByName || undefined),
        receivedBySignature: payload?.receivedBySignature !== undefined ? payload.receivedBySignature : (editReceivedBySignature || undefined),
        notes: payload?.notes !== undefined ? payload.notes : (editReceptionNotes || undefined),
      })
      const updated = await goodsReceiptsApi.getById(viewReceiptId)
      setViewReceipt(updated)
      triggerContentUpdateAnimation()
    } finally {
      setSavingReceipt(false)
    }
  }, [viewReceiptId, viewReceipt?.status, editReceivedByName, editReceivedBySignature, editReceptionNotes])

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

  const clearReceiptSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setEditReceivedBySignature("")
    }
  }, [])

  const getReceiptCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const initReceiptCanvasContext = useCallback(() => {
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

  const handleReceiptSignatureMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getReceiptCanvasPoint(e)
    if (!p) return
    const ctx = initReceiptCanvasContext()
    if (!ctx) return
    lastPointRef.current = p
    isDrawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, 1, 0, Math.PI * 2)
    ctx.fillStyle = "#111827"
    ctx.fill()
  }

  const handleReceiptSignatureMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const p = getReceiptCanvasPoint(e)
    if (!p) return
    const ctx = initReceiptCanvasContext()
    if (!ctx || !lastPointRef.current) return
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPointRef.current = p
  }

  const handleReceiptSignatureMouseUp = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPointRef.current = null
    const dataUrl = getSignatureDataUrl()
    if (dataUrl) {
      setEditReceivedBySignature(dataUrl)
      saveReceiptReceivedBy({ receivedBySignature: dataUrl })
    }
  }

  const saveItemReceivedQty = useCallback(
    async (itemId: string, receivedQty: number) => {
      if (!viewReceiptId || viewReceipt?.status !== "draft") return
      setSavingItemId(itemId)
      try {
        await goodsReceiptsApi.updateItem(itemId, { receivedQty })
        const updated = await goodsReceiptsApi.getById(viewReceiptId)
        setViewReceipt(updated)
        triggerContentUpdateAnimation()
        setEditingReceivedQty((prev) => {
          const next = { ...prev }
          delete next[itemId]
          return next
        })
      } finally {
        setSavingItemId(null)
      }
    },
    [viewReceiptId, viewReceipt?.status]
  )

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreateModal(false)
        if (viewReceiptId) setViewReceiptId(null)
      }
    }
    if (showCreateModal || viewReceiptId) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showCreateModal, viewReceiptId])

  // Load filter options on mount
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [suppliersRes, locationsRes] = await Promise.all([
          suppliersApi.getAll({ limit: 100 }),
          locationsApi.getAll(),
        ])
        setSuppliers(
          (suppliersRes.data || suppliersRes as any).map((s: any) => ({
            id: s.id,
            name: s.name,
          }))
        )
        const locs = Array.isArray(locationsRes)
          ? locationsRes
          : (locationsRes as any).data || []
        setLocations(locs.map((l: any) => ({ id: l.id, name: l.name, type: l.type })))
      } catch {
        // Non-critical — filters just won't show options
      }
    }
    loadFilterOptions()
  }, [])

  // Cargar solo los productos del proveedor seleccionado en el modal de nuevo ingreso
  useEffect(() => {
    if (!showCreateModal || !newReceipt.supplierId) {
      setProductsList([])
      return
    }
    let cancelled = false
    suppliersApi
      .getProducts(newReceipt.supplierId)
      .then((res: any) => {
        if (cancelled) return
        const data = Array.isArray(res) ? res : (res?.data ?? [])
        setProductsList(Array.isArray(data) ? data.map((p: any) => ({ id: p.id, name: p.name, sku: p.sku ?? "" })) : [])
      })
      .catch(() => {
        if (!cancelled) setProductsList([])
      })
    return () => { cancelled = true }
  }, [showCreateModal, newReceipt.supplierId])

  // Fetch receipts
  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = {}
      if (selectedStatus) params.status = selectedStatus
      if (selectedSupplier) params.supplierId = selectedSupplier
      if (selectedLocation) params.locationId = selectedLocation
      if (selectedMethod) params.method = selectedMethod

      const res = await goodsReceiptsApi.getAll(params)
      setReceipts(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch (err: any) {
      const msg = err.message || "Error al cargar los ingresos"
      setError(msg)
      setReceipts([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [selectedStatus, selectedSupplier, selectedLocation, selectedMethod])

  const handleConfirmReceipt = useCallback(async () => {
    if (!viewReceiptId || viewReceipt?.status !== "draft") return
    setConfirmError(null)
    setConfirmLoading(true)
    try {
      await goodsReceiptsApi.confirm(viewReceiptId)
      const updated = await goodsReceiptsApi.getById(viewReceiptId)
      setViewReceipt(updated)
      fetchReceipts()
      triggerContentUpdateAnimation()
      sileo.success({ title: "Ingreso confirmado correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al confirmar el ingreso"
      setConfirmError(msg)
      sileo.error({ title: msg })
    } finally {
      setConfirmLoading(false)
    }
  }, [viewReceiptId, viewReceipt?.status, fetchReceipts])

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  // Client-side search filter (API may not support text search)
  const filteredReceipts = searchQuery
    ? receipts.filter((receipt) => {
        const q = searchQuery.toLowerCase()
        return (
          receipt.receiptNumber?.toLowerCase().includes(q) ||
          receipt.supplier?.name?.toLowerCase().includes(q) ||
          receipt.invoiceNumber?.toLowerCase().includes(q)
        )
      })
    : receipts

  // Handle create goods receipt
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      if (!newReceipt.invoiceDate?.trim()) {
        setCreateError("La fecha de factura es obligatoria.")
        setCreating(false)
        return
      }
      const validItems = receiptItems.filter((item) => item.productId && item.receivedQty > 0)
      if (validItems.length === 0) {
        setCreateError("Debes agregar al menos un ítem al ingreso")
        setCreating(false)
        return
      }
      await goodsReceiptsApi.create({
        supplierId: newReceipt.supplierId,
        locationId: newReceipt.locationId,
        invoiceNumber: newReceipt.invoiceNumber || undefined,
        invoiceDate: newReceipt.invoiceDate || undefined,
        method: "manual",
        notes: newReceipt.notes || undefined,
        items: validItems.map((item) => ({
          productId: item.productId,
          orderedQty: item.receivedQty,
          receivedQty: item.receivedQty,
          unitCost: item.unitCost,
        })),
      })
      setShowCreateModal(false)
      setNewReceipt({
        supplierId: "",
        locationId: "",
        invoiceNumber: "",
        invoiceDate: "",
        notes: "",
      })
      setReceiptItems([{ productId: "", receivedQty: 1, unitCost: 0 }])
      fetchReceipts()
      sileo.success({ title: "Ingreso creado correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al crear el ingreso"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  // Items helpers
  const addReceiptItem = () =>
    setReceiptItems([...receiptItems, { productId: "", receivedQty: 1, unitCost: 0 }])
  const removeReceiptItem = (index: number) => {
    if (receiptItems.length > 1) {
      setReceiptItems(receiptItems.filter((_, i) => i !== index))
    }
  }
  const updateReceiptItem = (index: number, field: string, value: string | number) => {
    setReceiptItems(
      receiptItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  // ---- OCR / Camera functions ----
  const startCamera = async () => {
    setOcrError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err: any) {
      const msg = "No se pudo acceder a la cámara. Intenta subir una imagen."
      setOcrError(msg)
      sileo.error({ title: msg })
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
    setCapturedImage(dataUrl)
    // Convert to File
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `invoice-${Date.now()}.jpg`, { type: "image/jpeg" })
        setCapturedFile(file)
      }
    }, "image/jpeg", 0.9)
    stopCamera()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturedFile(file)
    const reader = new FileReader()
    reader.onload = () => setCapturedImage(reader.result as string)
    reader.readAsDataURL(file)
    stopCamera()
  }

  const processOcr = async () => {
    if (!capturedFile) return
    setOcrStep("processing")
    setOcrProcessing(true)
    setOcrError(null)
    try {
      const result = await goodsReceiptsApi.ocrScan(capturedFile)
      setOcrResult(result)
      setOcrStep("review")
    } catch (err: any) {
      const msg = err.message || "Error procesando la imagen"
      setOcrError(msg)
      setOcrStep("capture")
      sileo.error({ title: msg })
    } finally {
      setOcrProcessing(false)
    }
  }

  const applyOcrResult = () => {
    if (!ocrResult?.parsed) return
    const p = ocrResult.parsed
    // Pre-fill receipt
    setNewReceipt({
      supplierId: p.matchedSupplierId || "",
      locationId: newReceipt.locationId || (locations.find((l) => l.type === "WAREHOUSE")?.id ?? locations[0]?.id ?? ""),
      invoiceNumber: p.invoiceNumber || "",
      invoiceDate: p.invoiceDate || "",
      notes: `OCR (${ocrResult.confidence}% confianza)`,
    })
    // Pre-fill items
    if (p.items && p.items.length > 0) {
      setReceiptItems(
        p.items.map((item: any) => ({
          productId: item.matchedProduct?.id || "",
          receivedQty: item.quantity || 1,
          unitCost: item.unitCost || 0,
        }))
      )
    }
    // Close OCR modal, open create modal
    closeOcrModal()
    setShowCreateModal(true)
  }

  const closeOcrModal = () => {
    stopCamera()
    setShowOcrModal(false)
    setOcrStep("capture")
    setOcrResult(null)
    setCapturedImage(null)
    setCapturedFile(null)
    setOcrError(null)
  }

  const openOcrModal = () => {
    setShowDropdown(false)
    setShowOcrModal(true)
    setOcrStep("capture")
    setOcrError(null)
    setCapturedImage(null)
    setCapturedFile(null)
    setOcrResult(null)
    // Automatically start camera
    setTimeout(() => startCamera(), 300)
  }

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Ingresos de Mercadería
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Registra y gestiona los ingresos de proveedores
          </p>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Ingreso
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showDropdown && (
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false)
                  setCreateError(null)
                  const depotCentral = locations.find(
                    (loc) =>
                      loc.type === "WAREHOUSE" &&
                      /dep[oó]sito\s+central/i.test((loc.name || "").trim())
                  )
                  setNewReceipt((prev) => ({
                    ...prev,
                    locationId: prev.locationId || depotCentral?.id || "",
                  }))
                  setShowCreateModal(true)
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <ClipboardList className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <div className="text-left">
                  <p className="font-medium">Manual</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ingreso ítem por ítem
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={openOcrModal}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-900 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <ScanLine className="h-4 w-4 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">
                    OCR IA{" "}
                    <span className="ml-1 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                      IA
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Escanear factura con IA
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------- Filters -------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, proveedor o factura..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Status */}
        <select
          aria-label="Filtrar por estado"
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as ReceiptStatus | "")
          }
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {allStatuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Supplier */}
        <select
          aria-label="Filtrar por proveedor"
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((sup) => (
            <option key={sup.id} value={sup.id}>
              {sup.name}
            </option>
          ))}
        </select>

        {/* Location */}
        <select
          aria-label="Filtrar por ubicación"
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las ubicaciones</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Method */}
        <select
          aria-label="Filtrar por método"
          value={selectedMethod}
          onChange={(e) =>
            setSelectedMethod(e.target.value as "" | "manual" | "ocr")
          }
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los métodos</option>
          <option value="manual">Manual</option>
          <option value="ocr">OCR IA</option>
        </select>
      </div>

      {/* -------- Error -------- */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchReceipts}
            className="ml-auto text-sm font-medium text-red-700 underline hover:text-red-800"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Table -------- */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    # Ingreso
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Factura
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Método
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Fecha
                  </th>
                  <th className="w-24 min-w-24 shrink-0 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((receipt) => {
                  const status = (receipt.status || "draft") as ReceiptStatus
                  const sCfg = statusConfig[status] || statusConfig.draft
                  const itemsCount =
                    receipt._count?.items ?? receipt.itemsCount ?? 0
                  const supplierName =
                    receipt.supplier?.name ?? "—"
                  const invoiceNumber =
                    receipt.invoiceNumber ?? "—"
                  const method = receipt.method ?? "manual"

                  return (
                    <tr
                      key={receipt.id}
                      className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                          {receipt.receiptNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {supplierName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500 dark:text-white">
                          {invoiceNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {method === "ocr" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200">
                            <Sparkles className="h-3 w-3" />
                            OCR
                            {receipt.ocrConfidence != null && (
                              <span className="ml-0.5 text-blue-500 dark:text-blue-300">
                                {receipt.ocrConfidence}%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700/70 px-2.5 py-0.5 text-xs font-medium text-gray-900 dark:text-gray-100">
                            <ClipboardList className="h-3 w-3" />
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            sCfg.bg,
                            sCfg.text
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              sCfg.dot
                            )}
                          />
                          {sCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(receipt.totalAmount ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm tabular-nums text-gray-700 dark:text-white">
                          {itemsCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700 dark:text-white">
                          {formatDate(receipt.createdAt)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatTime(receipt.createdAt)}
                        </div>
                      </td>
                      <td className="w-24 min-w-24 shrink-0 px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setViewReceiptId(receipt.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {filteredReceipts.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500"
                    >
                      <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                      No se encontraron ingresos con los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredReceipts.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-gray-300">
                Mostrando{" "}
                <span className="font-medium text-gray-700 dark:text-white">
                  {filteredReceipts.length}
                </span>{" "}
                de{" "}
                <span className="font-medium text-gray-700 dark:text-white">{total}</span>{" "}
                ingreso{total !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------- Modal Ver detalle del ingreso -------- */}
      {viewReceiptId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewReceiptId(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Detalle del ingreso
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setViewReceiptId(null)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {viewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : viewReceipt ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Nº Ingreso
                      </p>
                      <p className="mt-0.5 font-mono font-semibold text-gray-900 dark:text-white">
                        {viewReceipt.receiptNumber}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Estado
                      </p>
                      <p className="mt-0.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            (statusConfig[viewReceipt.status as ReceiptStatus] || statusConfig.draft).bg,
                            (statusConfig[viewReceipt.status as ReceiptStatus] || statusConfig.draft).text
                          )}
                        >
                          {(statusConfig[viewReceipt.status as ReceiptStatus] || statusConfig.draft).label}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Proveedor
                      </p>
                      <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
                        {viewReceipt.supplier?.name ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Ubicación
                      </p>
                      <p className="mt-0.5 text-gray-700 dark:text-white">
                        {viewReceipt.location?.name ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Factura
                      </p>
                      <p className="mt-0.5 font-mono text-sm text-gray-700 dark:text-white">
                        {viewReceipt.invoiceNumber ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Fecha
                      </p>
                      <p className="mt-0.5 text-gray-700 dark:text-white">
                        {viewReceipt.invoiceDate
                          ? formatDate(viewReceipt.invoiceDate)
                          : formatDate(viewReceipt.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Datos de recepción
                    </h3>
                    {viewReceipt.status === "draft" ? (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                            Nombre de quien recibe <span className="text-red-500">*</span>
                          </label>
                          <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                            Obligatorio para registrar la entrega
                          </p>
                          <input
                            type="text"
                            value={editReceivedByName}
                            onChange={(e) => setEditReceivedByName(e.target.value)}
                            onBlur={() => saveReceiptReceivedBy({ receivedByName: editReceivedByName })}
                            disabled={savingReceipt}
                            placeholder="Ej: Juan Pérez"
                            className="w-full max-w-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-white">
                            Firma <span className="text-red-500">*</span>
                          </label>
                          <p className="mb-2 text-[10px] text-gray-500 dark:text-gray-400">
                            Obligatoria para registrar la entrega
                          </p>
                          {editReceivedBySignature && editReceivedBySignature.startsWith("data:") ? (
                            <div className="flex flex-col gap-2">
                              <img
                                src={editReceivedBySignature}
                                alt="Firma"
                                className="max-h-24 w-auto rounded border border-gray-200 dark:border-gray-600 bg-white object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  clearReceiptSignature()
                                  saveReceiptReceivedBy({ receivedBySignature: "" })
                                }}
                                className="w-fit rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                              >
                                Limpiar firma
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <canvas
                                ref={signatureCanvasRef}
                                width={300}
                                height={120}
                                className="cursor-crosshair touch-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white"
                                onMouseDown={handleReceiptSignatureMouseDown}
                                onMouseMove={handleReceiptSignatureMouseMove}
                                onMouseUp={handleReceiptSignatureMouseUp}
                                onMouseLeave={handleReceiptSignatureMouseUp}
                              />
                              <button
                                type="button"
                                onClick={clearReceiptSignature}
                                className="w-fit rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                              >
                                Limpiar firma
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            ¿Faltó algo o llegó algo roto/dañado? (opcional)
                          </label>
                          <textarea
                            value={editReceptionNotes}
                            onChange={(e) => setEditReceptionNotes(e.target.value)}
                            onBlur={() => saveReceiptReceivedBy({ notes: editReceptionNotes })}
                            disabled={savingReceipt}
                            placeholder="Ej: Faltaban 2 unidades de agua, una caja llegó golpeada..."
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-600 dark:placeholder:text-gray-400"
                          />
                        </div>
                        {savingReceipt && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Nombre de quien recibe</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {viewReceipt.receivedByName ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Firma</p>
                          {viewReceipt.receivedBySignature?.startsWith("data:") ? (
                            <img
                              src={viewReceipt.receivedBySignature}
                              alt="Firma"
                              className="mt-1 max-h-20 w-auto rounded border border-gray-200 dark:border-gray-600 bg-white object-contain"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white">
                              {viewReceipt.receivedBySignature ?? "—"}
                            </p>
                          )}
                        </div>
                        {(() => {
                          const obs = visibleGoodsReceiptNotes(viewReceipt.notes)
                          if (!obs) return null
                          return (
                            <div className="sm:col-span-2">
                              <p className="text-xs text-gray-400 dark:text-gray-500">Observaciones</p>
                              <p className="text-sm whitespace-pre-wrap text-gray-900 dark:text-white">
                                {obs}
                              </p>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                    <div>
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                        Detalle de Items
                      </p>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {(viewReceipt.items || []).length} producto{(viewReceipt.items || []).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
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
                          {(viewReceipt.items || []).map((item: any) => {
                            const orderedQty = item.orderedQty ?? 0
                            const receivedQtyVal =
                              viewReceipt.status === "draft"
                                ? (editingReceivedQty[item.id] ?? item.receivedQty ?? item.orderedQty ?? 0)
                                : (item.receivedQty ?? item.orderedQty ?? 0)
                            const diff = orderedQty - receivedQtyVal
                            const hasDiff = Math.abs(diff) > 1e-9
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                              >
                                <td className="px-4 py-3 text-gray-900 dark:text-white">
                                  {item.product?.name ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                  {formatNumber(orderedQty)} {item.product?.unit ? ` ${item.product.unit}` : ""}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                                  {viewReceipt.status === "draft" ? (
                                    <span className="inline-flex items-center gap-1">
                                      <FormattedNumberInput
                                        value={
                                          editingReceivedQty[item.id] ??
                                          item.receivedQty ??
                                          item.orderedQty ??
                                          0
                                        }
                                        onChange={(n) =>
                                          setEditingReceivedQty((prev) => ({ ...prev, [item.id]: n }))
                                        }
                                        onBlur={() => {
                                          const q =
                                            editingReceivedQty[item.id] ??
                                            item.receivedQty ??
                                            item.orderedQty ??
                                            0
                                          const prev = item.receivedQty ?? item.orderedQty ?? 0
                                          if (q >= 0 && Math.abs(q - prev) > 1e-9) {
                                            saveItemReceivedQty(item.id, q)
                                          }
                                        }}
                                        className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-right text-sm tabular-nums"
                                        disabled={savingItemId === item.id}
                                      />
                                      {item.product?.unit ?? ""}
                                      {savingItemId === item.id && (
                                        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                                      )}
                                    </span>
                                  ) : (
                                    <>
                                      {formatNumber(receivedQtyVal)}
                                      {item.product?.unit ? ` ${item.product.unit}` : ""}
                                    </>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span
                                    className={cn(
                                      "text-sm font-medium tabular-nums",
                                      hasDiff ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                                    )}
                                  >
                                    {hasDiff ? diff : "0"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {hasDiff ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Diferencia
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      OK
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex justify-between text-base font-semibold text-gray-900 dark:text-white">
                      <span>Total</span>
                      <span>{formatCurrency(viewReceipt.totalAmount ?? 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-white">
                  No se pudo cargar el detalle del ingreso.
                </p>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-3">
              {confirmError && (
                <p className="mb-3 text-center text-sm text-red-600 dark:text-red-400">
                  {confirmError}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {viewReceipt?.status === "draft" && (
                  <button
                    type="button"
                    onClick={handleConfirmReceipt}
                    disabled={confirmLoading || (viewReceipt?.items?.length ?? 0) === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    {confirmLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Confirmar ingreso
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewReceiptId(null)}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 sm:min-w-[6rem]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------- Create Goods Receipt Modal -------- */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nuevo Ingreso Manual
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateReceipt}>
              <div className="space-y-4 px-6 py-5">
                {createError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {createError}
                  </div>
                )}

                {/* Supplier */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Proveedor <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    aria-label="Proveedor"
                    value={newReceipt.supplierId}
                    onChange={(e) => {
                      const supplierId = e.target.value
                      setNewReceipt({ ...newReceipt, supplierId })
                      setReceiptItems((prev) => prev.map((item) => ({ ...item, productId: "" })))
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar proveedor...</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Ubicación <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    aria-label="Ubicación"
                    value={newReceipt.locationId}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, locationId: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar ubicación...</option>
                    {locations
                      .filter(
                        (loc) =>
                          loc.type === "WAREHOUSE" &&
                          /dep[oó]sito\s+central/i.test((loc.name || "").trim())
                      )
                      .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Invoice Number + Date row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      N° Factura
                    </label>
                    <input
                      type="text"
                      value={newReceipt.invoiceNumber}
                      onChange={(e) =>
                        setNewReceipt({ ...newReceipt, invoiceNumber: e.target.value })
                      }
                      placeholder="Ej: FAC-001"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Fecha Factura <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      aria-label="Fecha de factura"
                      min={new Date().toISOString().slice(0, 10)}
                      value={newReceipt.invoiceDate}
                      onChange={(e) =>
                        setNewReceipt({ ...newReceipt, invoiceDate: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Solo desde el día actual en adelante</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Notas
                  </label>
                  <textarea
                    value={newReceipt.notes}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, notes: e.target.value })
                    }
                    rows={2}
                    placeholder="Notas adicionales..."
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Items */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-white">
                      Ítems <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addReceiptItem}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar ítem
                    </button>
                  </div>
                  <div className="space-y-2">
                    {receiptItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          aria-label="Producto"
                          value={item.productId}
                          onChange={(e) => updateReceiptItem(index, "productId", e.target.value)}
                          disabled={!newReceipt.supplierId}
                          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="">
                            {newReceipt.supplierId ? "Producto..." : "Seleccioná un proveedor primero"}
                          </option>
                          {productsList.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} - {p.name}
                            </option>
                          ))}
                        </select>
                        <FormattedNumberInput
                          value={item.receivedQty}
                          onChange={(n) =>
                            updateReceiptItem(index, "receivedQty", n)
                          }
                          placeholder="1"
                          className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost || ""}
                          onChange={(e) =>
                            updateReceiptItem(
                              index,
                              "unitCost",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="Costo"
                          className="w-24 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          aria-label="Eliminar ítem"
                          onClick={() => removeReceiptItem(index)}
                          disabled={receiptItems.length <= 1}
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? "Creando..." : "Crear Ingreso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- OCR Camera Modal -------- */}
      {showOcrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeOcrModal}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <ScanLine className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Escanear Factura con IA
                  </h2>
                  <p className="text-xs text-gray-500">
                    {ocrStep === "capture" && "Captura o sube una imagen de la factura"}
                    {ocrStep === "processing" && "Procesando imagen con OCR..."}
                    {ocrStep === "review" && "Revisa los datos extraídos"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeOcrModal}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5">
              {ocrError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {ocrError}
                </div>
              )}

              {/* Step 1: Capture */}
              {ocrStep === "capture" && (
                <div className="space-y-4">
                  {!capturedImage ? (
                    <>
                      {/* Camera viewfinder */}
                      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-900">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full aspect-[4/3] object-cover"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                        {/* Viewfinder overlay */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="h-[80%] w-[85%] rounded-lg border-2 border-white/40" />
                        </div>
                      </div>

                      {/* Camera controls */}
                      <div className="flex items-center justify-center gap-4">
                        <button
                          type="button"
                          title="Capturar foto"
                          aria-label="Capturar foto de la factura"
                          onClick={capturePhoto}
                          className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95"
                        >
                          <div className="h-12 w-12 rounded-full border-4 border-white" />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs font-medium text-gray-400 uppercase">o</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>

                      {/* File upload */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        aria-label="Subir imagen de factura"
                        title="Subir imagen de factura"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <FileText className="h-4 w-4" />
                        Subir imagen desde galería
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Preview captured image */}
                      <div className="relative overflow-hidden rounded-xl border border-gray-200">
                        <img
                          src={capturedImage}
                          alt="Factura capturada"
                          className="w-full object-contain max-h-[400px]"
                        />
                        <div className="absolute top-3 right-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500 px-3 py-1 text-xs font-medium text-white shadow-sm">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Capturada
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedImage(null)
                            setCapturedFile(null)
                            startCamera()
                          }}
                          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Volver a capturar
                        </button>
                        <button
                          type="button"
                          onClick={processOcr}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          <Sparkles className="h-4 w-4" />
                          Procesar con IA
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Processing */}
              {ocrStep === "processing" && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-blue-100">
                      <div className="h-full w-full rounded-full border-4 border-t-blue-600 animate-spin" />
                    </div>
                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">Procesando factura...</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Extrayendo datos con inteligencia artificial
                    </p>
                  </div>
                  {capturedImage && (
                    <div className="mt-4 w-32 h-32 overflow-hidden rounded-lg border border-gray-200 opacity-50">
                      <img src={capturedImage} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Review */}
              {ocrStep === "review" && ocrResult && (
                <div className="space-y-4">
                  {/* Confidence badge */}
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                        ocrResult.confidence >= 70
                          ? "bg-green-100 text-green-700"
                          : ocrResult.confidence >= 40
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Confianza: {ocrResult.confidence}%
                    </div>
                    {capturedImage && (
                      <button
                        type="button"
                        onClick={() => {
                          setCapturedImage(null)
                          setCapturedFile(null)
                          setOcrStep("capture")
                          setOcrResult(null)
                          startCamera()
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Volver a escanear
                      </button>
                    )}
                  </div>

                  {/* Extracted Data Summary */}
                  <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {ocrResult.parsed.invoiceNumber && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-500">N° Factura</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                          {ocrResult.parsed.invoiceNumber}
                        </span>
                      </div>
                    )}
                    {ocrResult.parsed.invoiceDate && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-500">Fecha</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {ocrResult.parsed.invoiceDate}
                        </span>
                      </div>
                    )}
                    {ocrResult.parsed.supplierName && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-500">Proveedor detectado</span>
                        <div className="text-right">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {ocrResult.parsed.supplierName}
                          </span>
                          {ocrResult.parsed.matchedSupplierId && (
                            <span className="ml-2 inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                              Coincide
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {ocrResult.parsed.total != null && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-gray-500">Total</span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(ocrResult.parsed.total)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Extracted Items */}
                  {ocrResult.parsed.items && ocrResult.parsed.items.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-white">
                        Ítems detectados ({ocrResult.parsed.items.length})
                      </h4>
                      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                        {ocrResult.parsed.items.map((item: any, idx: number) => (
                          <div key={idx} className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {item.description}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {item.quantity} x {formatCurrency(item.unitCost)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-gray-900">
                                  {formatCurrency(item.total)}
                                </p>
                                {item.matchedProduct ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                                    {item.matchedProduct.sku} ({item.matchConfidence}%)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                    Sin coincidencia
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ocrResult.parsed.items?.length === 0 && (
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                      <p className="font-medium">No se detectaron ítems</p>
                      <p className="mt-1 text-xs">
                        Intenta con una imagen más clara o ingresa los ítems manualmente.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {ocrStep === "review" && (
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeOcrModal}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={applyOcrResult}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Sparkles className="h-4 w-4" />
                  Aplicar y editar ingreso
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
