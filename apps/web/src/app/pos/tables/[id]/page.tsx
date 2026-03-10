"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { tablesApi } from "@/lib/api/tables"
import { ordersApi } from "@/lib/api/orders"
import { productsApi } from "@/lib/api/products"
import { customersApi } from "@/lib/api/customers"
import { authApi } from "@/lib/api/auth"
import { cashRegistersApi } from "@/lib/api/cash-registers"
import { getLocationKey, posStationSuffix } from "@/lib/api"
import { aiEventsApi } from "@/lib/api/ai-events"
import { sileo } from "sileo"
import { cn, formatCurrency } from "@/lib/utils"
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Pencil,
  Send,
  Receipt,
  Loader2,
  Search,
  X,
  MessageSquare,
  Users,
  CreditCard,
  Banknote,
  QrCode,
  ArrowRightLeft,
  AlertCircle,
  ChefHat,
  Coffee,
  Wine,
  Croissant,
  Check,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  SplitSquareVertical,
  FileCheck,
} from "lucide-react"

/* ── Types ── */
interface PendingItem {
  tempId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  sector: "kitchen" | "bar" | "coffee" | "bakery" | "delivery"
  notes: string
}

/* ── Constants ── */
const SECTORS: {
  value: PendingItem["sector"]
  label: string
  icon: any
  color: string
}[] = [
  {
    value: "kitchen",
    label: "Cocina",
    icon: ChefHat,
    color: "bg-orange-100 text-orange-700",
  },
  {
    value: "bar",
    label: "Bar",
    icon: Wine,
    color: "bg-purple-100 text-purple-700",
  },
  {
    value: "coffee",
    label: "Café",
    icon: Coffee,
    color: "bg-amber-100 text-amber-700",
  },
  {
    value: "bakery",
    label: "Panadería",
    icon: Croissant,
    color: "bg-yellow-100 text-yellow-700",
  },
]

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "qr", label: "QR", icon: QrCode },
  { value: "transfer", label: "Transferencia", icon: ArrowRightLeft },
]

/** Formatea solo dígitos a CUIT XX-XXXXXXXX-X (máx. 11 dígitos). */
function formatCuitDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

/** Auto-detect sector from product category */
function detectSector(product: any): PendingItem["sector"] {
  const catName = (product.category?.name || "").toLowerCase()
  // Café / bebida caliente
  if (
    catName.includes("cafe") ||
    catName.includes("café") ||
    catName.includes("bebida caliente") ||
    catName.includes("infusi")
  ) {
    return "coffee"
  }
  // Bar / bebidas frías / alcohol
  if (
    catName.includes("bebida") ||
    catName.includes("trago") ||
    catName.includes("cerveza") ||
    catName.includes("vino") ||
    catName.includes("cocktail") ||
    catName.includes("cóctel") ||
    catName.includes("gaseosa") ||
    catName.includes("jugo") ||
    catName.includes("agua") ||
    catName.includes("refresco")
  ) {
    return "bar"
  }
  // Panadería / pastelería / postres
  if (
    catName.includes("pan") ||
    catName.includes("pastel") ||
    catName.includes("postre") ||
    catName.includes("dulce") ||
    catName.includes("torta") ||
    catName.includes("brownie") ||
    catName.includes("galletita") ||
    catName.includes("repostería") ||
    catName.includes("panadería")
  ) {
    return "bakery"
  }
  // Default: cocina
  return "kitchen"
}

const ITEM_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  served: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600 line-through",
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "Preparando",
  ready: "Listo",
  served: "Servido",
  cancelled: "Cancelado",
}

/* ── Voice helpers ── */
const SPANISH_NUMBERS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, medio: 1, media: 1,
}

/** Separa "producto" y "notas" (ej. "latte con leche de almendras" → ["latte", "con leche de almendras"]) */
function splitProductAndNotes(productText: string): { productPart: string; notesPart: string } {
  const lower = productText.trim().toLowerCase()
  const noteMarkers = [
    /\s+con\s+/i,
    /\s+sin\s+/i,
    /\s+que\s+sea\s+/i,
    /\s+que\s+tenga\s+/i,
    /\s+en\s+/i,
    /\s+al\s+/i,
    /\s+bien\s+/i,
    /\s+extra\s+/i,
    /\s+doble\s+/i,
  ]
  for (const re of noteMarkers) {
    const idx = lower.search(re)
    if (idx > 0) {
      const before = productText.slice(0, idx).trim()
      const after = productText.slice(idx).trim()
      if (before.length >= 2) {
        return { productPart: before, notesPart: after }
      }
    }
  }
  return { productPart: productText.trim(), notesPart: "" }
}

function parseVoiceCommand(
  transcript: string,
  products: any[]
): { product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[] {
  const results: { product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[] = []
  const text = transcript.toLowerCase().trim()

  // Split by "y", commas, or "más"
  const parts = text.split(/(?:\s+y\s+|,\s*|\s+más\s+)/).filter(Boolean)

  const normalize = (s: string) =>
    (s || "")
      .replace(/[áàä]/g, "a")
      .replace(/[éèë]/g, "e")
      .replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o")
      .replace(/[úùü]/g, "u")
      .replace(/[ñ]/g, "n")
      .toLowerCase()
      .trim()

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    let quantity = 1
    let productText = trimmed

    const numMatch = trimmed.match(/^(\d+)\s+(.+)/)
    if (numMatch) {
      quantity = parseInt(numMatch[1], 10)
      productText = numMatch[2]
    } else {
      const words = trimmed.split(/\s+/)
      if (words.length > 1 && SPANISH_NUMBERS[words[0]] !== undefined) {
        quantity = SPANISH_NUMBERS[words[0]]
        productText = words.slice(1).join(" ")
      }
    }

    const normalizedFull = normalize(productText)
    if (normalizedFull.length < 2) continue

    let bestMatch: any = null
    let bestScore = 0
    let notes = ""

    const scoreProduct = (search: string, pName: string) => {
      if (pName === search) return 100
      if (search.startsWith(pName)) return 95
      if (pName.startsWith(search)) return Math.min(search.length, pName.length) / Math.max(search.length, pName.length) * 90
      if (pName.includes(search) || search.includes(pName)) return Math.min(search.length, pName.length) / Math.max(search.length, pName.length) * 90
      const searchWords = search.split(/\s+/).filter(Boolean)
      const productWords = pName.split(/\s+/).filter(Boolean)
      const matchingWords = searchWords.filter((w) => productWords.some((pw) => pw.includes(w) || w.includes(pw)))
      return (matchingWords.length / Math.max(searchWords.length, 1)) * 80
    }

    for (const p of products) {
      const pName = normalize(p.name || "")
      const s = scoreProduct(normalizedFull, pName)
      if (s > bestScore) {
        bestScore = s
        bestMatch = p
        notes = ""
      }
    }

    if (bestMatch && bestScore >= 40) {
      const sector = detectSector(bestMatch)
      results.push({ product: bestMatch, quantity, sector, notes })
      continue
    }

    const { productPart, notesPart } = splitProductAndNotes(productText)
    const normalizedSearch = normalize(productPart)
    if (normalizedSearch.length < 2) continue

    bestMatch = null
    bestScore = 0
    for (const p of products) {
      const pName = normalize(p.name || "")
      const s = scoreProduct(normalizedSearch, pName)
      if (s > bestScore) {
        bestScore = s
        bestMatch = p
      }
    }

    if (bestMatch && bestScore >= 40) {
      const sector = detectSector(bestMatch)
      results.push({ product: bestMatch, quantity, sector, notes: notesPart })
    }
  }

  return results
}

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
export default function TableOrderPage() {
  const params = useParams()
  const router = useRouter()
  const tableId = params.id as string

  /* ── core data ── */
  const [table, setTable] = useState<any>(null)
  const [order, setOrder] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [locationId, setLocationId] = useState("")

  const user = authApi.getStoredUser()
  const canCloseAccount = useMemo(
    () => user && ["cashier", "CASHIER", "admin", "ADMIN"].includes(user.role),
    [user?.role]
  )

  /* ── turno abierto (sin turno no se puede cargar la mesa) ── */
  const [openRegister, setOpenRegister] = useState<any | null>(null)
  const [loadingOpenRegister, setLoadingOpenRegister] = useState(true)

  /* ── pending (local) items ── */
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])

  /* ── UI ── */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [customerCount, setCustomerCount] = useState(1)
  const [splitMode, setSplitMode] = useState(false)
  /** Por ítem: comensal (1-based) → cantidad. Valor puede ser number (todo a ese comensal) o Record<number, number>. */
  const [itemPayer, setItemPayer] = useState<Record<string, number | Record<number, number>>>({})

  /* ── payment modal ── */
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("")
  /** Cuando la cuenta está dividida: método de pago por comensal (1-based) */
  const [paymentByDiner, setPaymentByDiner] = useState<Record<number, string>>({})
  const [discount, setDiscount] = useState(0)
  const [paymentNotes, setPaymentNotes] = useState("")
  /* ── cambio de mesa (solo cajero/admin) ── */
  const [showChangeTableModal, setShowChangeTableModal] = useState(false)
  const [changeTableMode, setChangeTableMode] = useState<"full" | "items">("full")
  const [tablesForChange, setTablesForChange] = useState<any[]>([])
  const [newTableIdForChange, setNewTableIdForChange] = useState("")
  const [selectedItemIdsForMove, setSelectedItemIdsForMove] = useState<string[]>([])
  const [changingTable, setChangingTable] = useState(false)
  const [changeTableError, setChangeTableError] = useState<string | null>(null)
  const [invoiceType, setInvoiceType] = useState<"consumidor" | "factura_a">("consumidor")
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [cuitSearchResult, setCuitSearchResult] = useState<any>(null)
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
  const [customerSearchEmpty, setCustomerSearchEmpty] = useState(false)
  const [cuitSearching, setCuitSearching] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerCuit, setNewCustomerCuit] = useState("")
  const [addingCustomer, setAddingCustomer] = useState(false)

  /** Después de "Pre cierre de control" (impresión), se muestra Cerrar Cuenta para esta orden. */
  const [preCierreOrderId, setPreCierreOrderId] = useState<string | null>(null)
  /** Modal con el comprobante de pre cierre para imprimir en la misma página. */
  const [showPreCierreModal, setShowPreCierreModal] = useState(false)

  /* ── notes modal ── */
  const [notesTarget, setNotesTarget] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState("")

  /* ── edit order item modal ── */
  const [editingOrderItem, setEditingOrderItem] = useState<{
    id: string
    productName: string
    quantity: number
    notes: string
  } | null>(null)
  const [updatingItem, setUpdatingItem] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)

  /* ── sector selector ── */
  const [sectorTarget, setSectorTarget] = useState<string | null>(null)

  /* ── voice commanding (OpenAI Whisper) ── */
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState("")
  const [voiceMatches, setVoiceMatches] = useState<{ product: any; quantity: number; sector: PendingItem["sector"]; notes: string }[]>([])
  const [voiceConfirming, setVoiceConfirming] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Pick a supported mimeType (webm for Chrome/Firefox, mp4 for Safari)
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "",
      ]
      let mimeType = ""
      for (const t of preferredTypes) {
        if (!t || MediaRecorder.isTypeSupported(t)) {
          mimeType = t
          break
        }
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {}
      const mediaRecorder = new MediaRecorder(stream, options)
      const actualMime = mediaRecorder.mimeType || "audio/webm"
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())

        if (audioChunksRef.current.length === 0) {
          setVoiceTranscript("No se grabó audio. Intentá de nuevo.")
          return
        }

        setVoiceProcessing(true)
        setVoiceTranscript("Procesando con IA...")

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: actualMime })

          // Convert to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              const b64 = result.split(",")[1]
              if (b64) resolve(b64)
              else reject(new Error("Failed to encode audio"))
            }
            reader.onerror = () => reject(new Error("FileReader error"))
            reader.readAsDataURL(audioBlob)
          })

          // Determine file extension for Whisper
          const ext = actualMime.includes("mp4") ? "mp4"
            : actualMime.includes("ogg") ? "ogg"
            : "webm"

          const response = await aiEventsApi.transcribeAudio(base64, "es", ext)
          const transcript = response.transcript?.trim() || ""

          if (!transcript) {
            setVoiceTranscript("No se detectó audio. Intentá de nuevo.")
            setVoiceProcessing(false)
            return
          }

          const minLength = 6
          const wordCount = transcript.split(/\s+/).filter(Boolean).length
          if (transcript.length < minLength || wordCount < 2) {
            setVoiceTranscript("No se entendió una orden clara. Hablá más cerca del micrófono y repetí (ej: \"Un latte con leche de almendras\").")
            setVoiceProcessing(false)
            return
          }

          setVoiceTranscript(transcript)
          const matches = parseVoiceCommand(transcript, products)
          setVoiceMatches(matches)

          if (matches.length > 0) {
            setVoiceConfirming(true)
          } else {
            setVoiceTranscript(`"${transcript}" — No encontré productos que coincidan.`)
          }
        } catch (err) {
          console.error("Voice transcription error:", err)
          setVoiceTranscript("Error al transcribir. Intentá de nuevo.")
        } finally {
          setVoiceProcessing(false)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(250) // Collect data every 250ms for reliability
      setVoiceActive(true)
      setVoiceTranscript("Grabando...")
      setVoiceMatches([])
      setVoiceConfirming(false)
    } catch (err) {
      console.error("Microphone access error:", err)
      setError("No se pudo acceder al micrófono. Verificá los permisos del navegador.")
    }
  }, [products])

  const stopVoice = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    setVoiceActive(false)
  }, [])

  const confirmVoiceItems = useCallback(() => {
    for (const match of voiceMatches) {
      const existing = !match.notes ? pendingItems.find((i) => i.productId === match.product.id) : null
      if (existing) {
        setPendingItems((prev) =>
          prev.map((i) =>
            i.tempId === existing.tempId
              ? { ...i, quantity: i.quantity + match.quantity }
              : i
          )
        )
      } else {
        setPendingItems((prev) => [
          ...prev,
          {
            tempId: crypto.randomUUID(),
            productId: match.product.id,
            productName: match.product.name,
            quantity: match.quantity,
            unitPrice: getEffectivePrice(match.product),
            sector: match.sector,
            notes: match.notes || "",
          },
        ])
      }
    }
    // Voice confirmation
    const synth = window.speechSynthesis
    const itemNames = voiceMatches.map((m) => {
      const base = `${m.quantity} ${m.product.name}`
      return m.notes ? `${base} (${m.notes})` : base
    }).join(", ")
    const utt = new SpeechSynthesisUtterance(`Agregado: ${itemNames}`)
    utt.lang = "es-AR"
    utt.rate = 1.1
    synth.speak(utt)

    setVoiceConfirming(false)
    setVoiceMatches([])
    setVoiceTranscript("")
  }, [voiceMatches, pendingItems])

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

  const hasOpenShift = !!openRegister && !loadingOpenRegister

  /* ── fetch data ── */
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const tableData = await tablesApi.getById(tableId)
      setTable(tableData)
      const locationId = tableData?.locationId ?? tableData?.location?.id ?? ""
      if (!locationId) {
        setProducts([])
        setError("Mesa sin local asignado")
      } else {
        const productsData = await productsApi.getAll({
          locationId,
          limit: 5000,
        })
        setProducts(productsData?.data ?? productsData ?? [])
      }

      // load existing order (división de mesa viene del backend para mozo y cajero)
      if (tableData.currentOrderId) {
        try {
          const orderData = await ordersApi.getById(tableData.currentOrderId)
          setOrder(orderData)
          if (typeof orderData?.customerCount === "number" && orderData.customerCount >= 1)
            setCustomerCount(Math.min(orderData.customerCount, 20))
          if (typeof orderData?.splitMode === "boolean") setSplitMode(orderData.splitMode)
          if (orderData?.itemPayer && typeof orderData.itemPayer === "object" && !Array.isArray(orderData.itemPayer))
            setItemPayer(orderData.itemPayer as Record<string, number | Record<number, number>>)
          else
            setItemPayer({})
        } catch {
          setOrder(null)
        }
      } else {
        setOrder(null)
      }
    } catch {
      setError("Error al cargar datos de la mesa")
    } finally {
      setLoading(false)
    }
  }, [tableId])

  useEffect(() => {
    if (tableId) fetchData()
  }, [tableId, fetchData])

  const orderId = order?.id

  /* ── persistir división en el backend (visible para mozo y cajero en cualquier dispositivo) ── */
  const saveSplitMeta = useCallback(async () => {
    if (!orderId || !order || order.status !== "open") return
    try {
      await ordersApi.updateSplit(orderId, { customerCount, splitMode })
    } catch {}
  }, [orderId, order?.status, customerCount, splitMode])

  useEffect(() => {
    if (!orderId || !order || order.status !== "open") return
    saveSplitMeta()
  }, [orderId, order?.status, customerCount, splitMode, saveSplitMeta])

  const itemPayerSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!orderId || !order || order.status !== "open") return
    const orderItemIds = new Set((order?.items ?? []).map((i: any) => i.id))
    const itemPayerForApi = Object.fromEntries(
      Object.entries(itemPayer).filter(([key]) => orderItemIds.has(key))
    )
    if (Object.keys(itemPayerForApi).length === 0) return
    if (itemPayerSaveTimeoutRef.current) clearTimeout(itemPayerSaveTimeoutRef.current)
    itemPayerSaveTimeoutRef.current = setTimeout(() => {
      itemPayerSaveTimeoutRef.current = null
      ordersApi.updateSplit(orderId, { itemPayer: itemPayerForApi }).catch(() => {})
    }, 600)
    return () => {
      if (itemPayerSaveTimeoutRef.current) clearTimeout(itemPayerSaveTimeoutRef.current)
    }
  }, [orderId, order?.status, order?.items, itemPayer])

  /* ── precio efectivo en este local (StockLevel.salePrice o product.salePrice) ── */
  const currentLocationId = table?.locationId ?? table?.location?.id ?? locationId
  const getEffectivePrice = useCallback(
    (p: any) => {
      const level = p.stockLevels?.find((s: any) => s.locationId === currentLocationId)
      return level?.salePrice ?? p.salePrice ?? 0
    },
    [currentLocationId]
  )

  /* ── derived: familias solo de productos con precio > 0 ── */
  const familias = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      const f = (p.familia ?? "").trim()
      if (f) set.add(f)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
  }, [products])

  /* ── derived: filtered products ── */
  const filteredProducts = useMemo(() => {
    let list = [...products]
    if (activeCategory !== "all") {
      list = list.filter((p) => (p.familia ?? "").trim() === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    return list
  }, [products, activeCategory, searchQuery])

  /* ── derived: totals ── */
  const pendingSubtotal = pendingItems.reduce(
    (s, i) => s + i.unitPrice * i.quantity,
    0
  )
  const existingSubtotal = order?.subtotal ?? 0
  const orderTotal = existingSubtotal + pendingSubtotal - discount

  const getDistribution = useCallback(
    (id: string, quantity: number): Record<number, number> => {
      const val = itemPayer[id]
      if (val == null) return { 1: quantity }
      if (typeof val === "number") return { [val]: quantity }
      return val
    },
    [itemPayer]
  )

  const splitTotals = useMemo(() => {
    const perPerson: Record<number, number> = {}
    if (!splitMode || customerCount < 2) return perPerson
    for (let n = 1; n <= customerCount; n++) perPerson[n] = 0
    const unitPrice = (item: any) => item.unitPrice ?? (item.totalPrice ?? 0) / (item.quantity || 1)
    order?.items?.forEach((item: any) => {
      const dist = getDistribution(item.id, item.quantity ?? 0)
      const up = unitPrice(item)
      Object.entries(dist).forEach(([n, qty]) => {
        const who = parseInt(n, 10)
        if (perPerson[who] !== undefined && qty > 0) perPerson[who] += up * qty
      })
    })
    pendingItems.forEach((item) => {
      const dist = getDistribution(item.tempId, item.quantity)
      Object.entries(dist).forEach(([n, qty]) => {
        const who = parseInt(n, 10)
        if (perPerson[who] !== undefined && qty > 0) perPerson[who] += item.unitPrice * qty
      })
    })
    return perPerson
  }, [splitMode, customerCount, order?.items, pendingItems, itemPayer, getDistribution])

  /* ── solo se puede cerrar cuando todos los ítems están servidos ── */
  const allItemsServed =
    !order?.items?.length ||
    order.items.every((i: any) => i.status === "served")

  /* ── add product ── */
  const addProduct = (product: any) => {
    if (locationId && !hasOpenShift) {
      sileo.warning({ title: "Abra un turno para cargar la mesa", message: "Vaya a Caja y abra el turno." })
      return
    }
    const existing = pendingItems.find((i) => i.productId === product.id)
    if (existing) {
      setPendingItems((prev) =>
        prev.map((i) =>
          i.tempId === existing.tempId ? { ...i, quantity: i.quantity + 1 } : i
        )
      )
    } else {
      setPendingItems((prev) => [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: getEffectivePrice(product),
          sector: detectSector(product),
          notes: "",
        },
      ])
    }
  }

  /* ── quantity helpers ── */
  const changeQty = (tempId: string, delta: number) => {
    setPendingItems((prev) =>
      prev
        .map((i) =>
          i.tempId === tempId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }

  const removePending = (tempId: string) => {
    setPendingItems((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  /* ── set sector ── */
  const setSector = (tempId: string, sector: PendingItem["sector"]) => {
    setPendingItems((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, sector } : i))
    )
    setSectorTarget(null)
  }

  /* ── save note ── */
  const saveNote = () => {
    if (!notesTarget) return
    setPendingItems((prev) =>
      prev.map((i) =>
        i.tempId === notesTarget ? { ...i, notes: notesDraft } : i
      )
    )
    setNotesTarget(null)
    setNotesDraft("")
  }

  /* ── update order item (cantidad / notas) ── */
  const saveOrderItemEdit = async () => {
    if (!editingOrderItem) return
    setUpdatingItem(true)
    setError("")
    try {
      await ordersApi.updateOrderItem(editingOrderItem.id, {
        quantity: editingOrderItem.quantity,
        notes: editingOrderItem.notes || undefined,
      })
      setEditingOrderItem(null)
      await fetchData()
      sileo.success({ title: "Ítem actualizado" })
    } catch {
      setError("Error al actualizar ítem")
      sileo.error({ title: "Error al actualizar ítem" })
    } finally {
      setUpdatingItem(false)
    }
  }

  /* ── remove order item ── */
  const removeOrderItem = async (itemId: string) => {
    if (!confirm("¿Eliminar este ítem del pedido?")) return
    setRemovingItemId(itemId)
    setError("")
    try {
      await ordersApi.removeOrderItem(itemId)
      await fetchData()
      sileo.success({ title: "Ítem eliminado" })
    } catch {
      setError("Error al eliminar ítem")
      sileo.error({ title: "Error al eliminar ítem" })
    } finally {
      setRemovingItemId(null)
    }
  }

  /* ── send to kitchen ── */
  const sendToKitchen = async () => {
    if (pendingItems.length === 0) return
    setSending(true)
    setError("")
    try {
      const items = pendingItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        sector: i.sector,
        notes: i.notes || undefined,
      }))

      if (!order) {
        // Create new order
        await ordersApi.create({
          locationId,
          type: "dine_in",
          tableId,
          customerCount,
          items,
        })
      } else {
        // Add items to existing order (la alerta de voz "se le agregó" solo suena en Cocina/Cafetería)
        for (const item of items) {
          await ordersApi.addItem(order.id, item)
        }
      }

      setPendingItems([])
      await fetchData()
      sileo.success({ title: "Pedido enviado a cocina" })
    } catch {
      setError("Error al enviar pedido")
      sileo.error({ title: "Error al enviar pedido" })
    } finally {
      setSending(false)
    }
  }

  /* ── close order ── */
  const closeOrder = async () => {
    const isErrorsOrTrashTable = table?.tableType === "errors" || table?.tableType === "trash"
    const effectiveMethod = paymentMethod || "cash"
    if (!order) return
    if (!isErrorsOrTrashTable) {
      if (!splitMode || Object.keys(splitTotals).length === 0) {
        if (!effectiveMethod) return
      }
      if (invoiceType === "factura_a" && !customerId) {
        setError("Para Factura A seleccioná o agregá un cliente por CUIT")
        return
      }
    }
    setClosing(true)
    setError("")
    try {
      const hasSplitPayments = !isErrorsOrTrashTable && splitMode && Object.keys(splitTotals).length > 0
      const payload: {
        paymentMethod: string
        discountAmount?: number
        notes?: string
        invoiceType?: string
        customerId?: string
        payments?: { diner: number; method: string; amount: number }[]
      } = isErrorsOrTrashTable
        ? {
            paymentMethod: "cash",
            notes: paymentNotes || undefined,
          }
        : {
            paymentMethod: effectiveMethod,
            discountAmount: discount > 0 ? discount : undefined,
            notes: paymentNotes || undefined,
            invoiceType: invoiceType === "factura_a" ? "factura_a" : undefined,
            customerId: customerId || undefined,
          }
      if (hasSplitPayments) {
        payload.payments = Object.entries(splitTotals).map(([num, amount]) => ({
          diner: parseInt(String(num), 10) || 1,
          method: String(paymentByDiner[Number(num)] || effectiveMethod).trim() || "cash",
          amount: Math.round(Number(amount) * 100) / 100,
        }))
      }
      await ordersApi.close(order.id, payload)
      setShowPayment(false)
      sileo.success({ title: "Cuenta cerrada correctamente" })
      router.push("/pos/tables" + posStationSuffix())
    } catch {
      setError("Error al cerrar la cuenta")
      sileo.error({ title: "Error al cerrar la cuenta" })
      setClosing(false)
    }
  }

  /** Abre el modal de pre cierre para que el cliente verifique la cuenta e imprima en la misma página. */
  const handlePreCierreControl = () => {
    if (!order || !table) return
    setShowPreCierreModal(true)
  }

  /* ── loading ── */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
          <p className="mt-3 text-sm text-gray-500">Cargando mesa...</p>
        </div>
      </div>
    )
  }

  if (!table) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-3 text-sm text-gray-500">Mesa no encontrada</p>
          <button
            onClick={() => router.push("/pos/tables" + posStationSuffix())}
            className="mt-3 text-sm text-amber-600 hover:underline"
          >
            Volver a mesas
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col lg:flex-row">
      {/* ═══════════════════════════════════
          IZQUIERDA — Comanda, total y Enviar a Cocina (estilo anterior + adaptable)
          ═══════════════════════════════════ */}
      <div className="flex w-full min-w-0 flex-col border-b border-gray-200 bg-white lg:max-w-[420px] lg:min-w-[360px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push("/pos/tables" + posStationSuffix())}
              title="Volver a mesas"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-gray-800">
                {/^\d+$/.test(String(table.name ?? "")) ? `Mesa ${table.name}` : table.name}
              </h2>
              <p className="truncate text-xs text-gray-400">
                {table.zone} · {table.capacity} asientos
              </p>
            </div>
          </div>

          {/* Customer count + Dividir cuenta */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <div className="flex items-center rounded-lg border border-gray-200">
                <button
                  onClick={() => setCustomerCount(Math.max(1, customerCount - 1))}
                  title="Reducir comensales"
                  className="px-2 py-1 text-gray-400 hover:text-gray-600"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[28px] text-center text-sm font-medium text-gray-700">
                  {customerCount}
                </span>
                <button
                  onClick={() => setCustomerCount(customerCount + 1)}
                  title="Aumentar comensales"
                  className="px-2 py-1 text-gray-400 hover:text-gray-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {customerCount > 1 && (
              <button
                type="button"
                onClick={() => setSplitMode((prev) => !prev)}
                title={splitMode ? "Dejar de dividir cuenta" : "Dividir cuenta por comensal"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  splitMode
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                <SplitSquareVertical className="h-3.5 w-3.5" />
                {splitMode ? "Dividido" : "Dividir cuenta"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError("")}
              title="Cerrar"
              className="ml-auto text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Sin turno abierto: no se puede cargar la mesa */}
        {locationId && !loadingOpenRegister && !openRegister && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1">
              No hay turno abierto. Abra un turno en <strong>Caja</strong> para poder cargar esta mesa.
            </span>
            <button
              type="button"
              onClick={() => router.push("/pos/caja" + posStationSuffix())}
              className="shrink-0 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
            >
              Ir a Caja
            </button>
          </div>
        )}

        {/* Scrollable order list */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Cliente (Factura A) en detalle de la comanda */}
          {invoiceType === "factura_a" && cuitSearchResult && typeof cuitSearchResult === "object" && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Cliente (Factura A)
              </p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">
                {cuitSearchResult.name ?? cuitSearchResult.razonSocial ?? "—"}
              </p>
              <p className="text-xs text-gray-600">
                CUIT {cuitSearchResult.cuit ?? cuitSearchResult.CUIT ?? "—"}
              </p>
            </div>
          )}

          {/* Existing order items */}
          {order && order.items && order.items.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Pedido actual #{order.orderNumber}
              </p>
              <div className="space-y-2">
                {order.items.map((item: any) => {
                  const sectorInfo = SECTORS.find(
                    (s) => s.value === item.sector
                  )
                  const isRemoving = removingItemId === item.id
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {item.productName}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              ITEM_STATUS_STYLES[item.status] ||
                                ITEM_STATUS_STYLES.pending
                            )}
                          >
                            {ITEM_STATUS_LABELS[item.status] || item.status}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                          <span className="text-gray-900 font-medium">x{item.quantity}</span>
                          <span className="text-gray-500">
                            {formatCurrency((item.unitPrice ?? item.totalPrice / (item.quantity || 1)))}{" "}
                            c/u
                          </span>
                          {sectorInfo && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px]",
                                sectorInfo.color
                              )}
                            >
                              {sectorInfo.label}
                            </span>
                          )}
                          {item.notes && (
                            <span className="italic text-gray-400 truncate max-w-[120px]">
                              {item.notes}
                            </span>
                          )}
                        </div>
                        {splitMode && (
                          <div className="mt-1.5 space-y-1">
                            {item.quantity === 1 ? (
                              <select
                                aria-label={`Asignar ${item.productName} a comensal`}
                                value={(() => {
                                  const val = itemPayer[item.id]
                                  if (typeof val === "number") return val
                                  if (val && typeof val === "object") {
                                    const k = Object.keys(val).find((n) => (val as Record<number, number>)[Number(n)] > 0)
                                    return k ? parseInt(k, 10) : 1
                                  }
                                  return 1
                                })()}
                                onChange={(e) =>
                                  setItemPayer((prev) => ({
                                    ...prev,
                                    [item.id]: parseInt(e.target.value, 10),
                                  }))
                                }
                                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                              >
                                {Array.from({ length: customerCount }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>
                                    Comensal {n}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs text-gray-500">Por unidad:</span>
                                {Array.from({ length: customerCount }, (_, i) => {
                                  const n = i + 1
                                  const dist = getDistribution(item.id, item.quantity ?? 0)
                                  const q = typeof dist[n] === "number" ? dist[n] : 0
                                  const qty = item.quantity ?? 0
                                  return (
                                    <label key={n} className="flex items-center gap-1 text-xs">
                                      <span className="text-gray-500">C{n}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={qty}
                                        value={q}
                                        onChange={(e) => {
                                          const v = Math.max(0, Math.min(qty, parseInt(e.target.value, 10) || 0))
                                          setItemPayer((prev) => {
                                            const current = getDistribution(item.id, qty)
                                            const next: Record<number, number> = {}
                                            for (let i = 1; i <= customerCount; i++) next[i] = i === n ? v : (current[i] ?? 0)
                                            const sumExcept1 = Object.entries(next)
                                              .filter(([k]) => k !== "1")
                                              .reduce((a, [, b]) => a + b, 0)
                                            next[1] = Math.max(0, qty - sumExcept1)
                                            if (next[1] < 0) {
                                              next[n] += next[1]
                                              next[1] = 0
                                            }
                                            return { ...prev, [item.id]: next }
                                          })
                                        }}
                                        className="w-10 rounded border border-gray-200 px-1 py-0.5 text-center text-xs"
                                        aria-label={`Comensal ${n} cantidad`}
                                      />
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm font-medium text-gray-700">
                          {formatCurrency(item.totalPrice)}
                        </span>
                        {order.status === "open" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrderItem({
                                  id: item.id,
                                  productName: item.productName,
                                  quantity: item.quantity,
                                  notes: item.notes || "",
                                })
                              }
                              title="Editar cantidad o notas"
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOrderItem(item.id)}
                              disabled={isRemoving}
                              title="Eliminar del pedido"
                              className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                            >
                              {isRemoving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending items (local) */}
          {pendingItems.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
                Nuevos ítems
              </p>
              <div className="space-y-2">
                {pendingItems.map((item) => {
                  const sectorInfo = SECTORS.find(
                    (s) => s.value === item.sector
                  )
                  return (
                    <div
                      key={item.tempId}
                      className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                          {item.productName}
                        </span>
                        <span className="shrink-0 text-sm font-medium text-gray-700">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        <span className="font-medium text-gray-900">x{item.quantity}</span>
                        {" · "}
                        {formatCurrency(item.unitPrice)} c/u
                      </div>
                      {splitMode && (
                        <div className="mt-1.5 space-y-1">
                          {item.quantity === 1 ? (
                            <select
                              aria-label={`Asignar ${item.productName} a comensal`}
                              value={(() => {
                                const val = itemPayer[item.tempId]
                                if (typeof val === "number") return val
                                if (val && typeof val === "object") {
                                  const k = Object.keys(val).find((n) => (val as Record<number, number>)[Number(n)] > 0)
                                  return k ? parseInt(k, 10) : 1
                                }
                                return 1
                              })()}
                              onChange={(e) =>
                                setItemPayer((prev) => ({
                                  ...prev,
                                  [item.tempId]: parseInt(e.target.value, 10),
                                }))
                              }
                              className="rounded border border-amber-200 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              {Array.from({ length: customerCount }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  Comensal {n}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs text-gray-500">Por unidad:</span>
                              {Array.from({ length: customerCount }, (_, i) => {
                                const n = i + 1
                                const dist = getDistribution(item.tempId, item.quantity)
                                const q = typeof dist[n] === "number" ? dist[n] : 0
                                const qty = item.quantity
                                return (
                                  <label key={n} className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500">C{n}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={qty}
                                      value={q}
                                      onChange={(e) => {
                                        const v = Math.max(0, Math.min(qty, parseInt(e.target.value, 10) || 0))
                                        setItemPayer((prev) => {
                                          const current = getDistribution(item.tempId, qty)
                                          const next: Record<number, number> = {}
                                          for (let i = 1; i <= customerCount; i++) next[i] = i === n ? v : (current[i] ?? 0)
                                          const sumExcept1 = Object.entries(next)
                                            .filter(([k]) => k !== "1")
                                            .reduce((a, [, b]) => a + b, 0)
                                          next[1] = Math.max(0, qty - sumExcept1)
                                          if (next[1] < 0) {
                                            next[n] += next[1]
                                            next[1] = 0
                                          }
                                          return { ...prev, [item.tempId]: next }
                                        })
                                      }}
                                      className="w-10 rounded border border-amber-200 px-1 py-0.5 text-center text-xs"
                                      aria-label={`Comensal ${n} cantidad`}
                                    />
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        {/* Quantity */}
                        <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                          <button
                            onClick={() => changeQty(item.tempId, -1)}
                            title="Reducir cantidad"
                            className="px-2 py-1 text-gray-400 hover:text-gray-600"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[24px] text-center text-sm font-medium text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => changeQty(item.tempId, 1)}
                            title="Aumentar cantidad"
                            className="px-2 py-1 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Sector */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setSectorTarget(
                                sectorTarget === item.tempId
                                  ? null
                                  : item.tempId
                              )
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                              sectorInfo?.color || "bg-gray-100 text-gray-600"
                            )}
                          >
                            {sectorInfo && (
                              <sectorInfo.icon className="h-3 w-3" />
                            )}
                            {sectorInfo?.label || item.sector}
                          </button>
                          {sectorTarget === item.tempId && (
                            <div className="absolute left-0 top-full z-30 mt-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                              {SECTORS.map((s) => (
                                <button
                                  key={s.value}
                                  onClick={() =>
                                    setSector(item.tempId, s.value)
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-gray-50",
                                    item.sector === s.value && "bg-gray-50"
                                  )}
                                >
                                  <s.icon className="h-3.5 w-3.5" />
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Notes */}
                        <button
                          onClick={() => {
                            setNotesTarget(item.tempId)
                            setNotesDraft(item.notes)
                          }}
                          className={cn(
                            "rounded-lg p-1 transition-colors",
                            item.notes
                              ? "text-amber-500 hover:bg-amber-50"
                              : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
                          )}
                          title="Notas"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex-1" />

                        {/* Remove */}
                        <button
                          onClick={() => removePending(item.tempId)}
                          title="Eliminar ítem"
                          className="rounded-lg p-1 text-red-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {item.notes && (
                        <p className="mt-1.5 text-xs italic text-gray-400">
                          Nota: {item.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!order || !order.items?.length) && pendingItems.length === 0 && (
            <div className="flex min-h-[200px] flex-1 items-center justify-center py-8 text-center">
              <div>
                <Receipt className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-4 text-sm text-gray-500">
                  Mesa vacía. Agrega productos del menú.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Order summary + actions ── */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-4">
          {/* Totals */}
          <div className="mb-4 space-y-1 text-sm">
            {order && (
              <div className="flex justify-between text-gray-500">
                <span>Pedido actual</span>
                <span>{formatCurrency(existingSubtotal)}</span>
              </div>
            )}
            {pendingItems.length > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Nuevos ítems</span>
                <span>{formatCurrency(pendingSubtotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Descuento</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-bold text-gray-800">
              <span>Total</span>
              <span>{formatCurrency(Math.max(0, orderTotal))}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push("/pos/tables" + posStationSuffix())}
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Volver
            </button>

            {canCloseAccount && order?.tableId && (
              <button
                type="button"
                onClick={async () => {
                  setShowChangeTableModal(true)
                  setChangeTableMode("full")
                  setNewTableIdForChange("")
                  setSelectedItemIdsForMove([])
                  setChangeTableError(null)
                  if (locationId) {
                    try {
                      const list = await tablesApi.getAll(locationId)
                      setTablesForChange(Array.isArray(list) ? list : [])
                    } catch {
                      setTablesForChange([])
                    }
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-500 bg-white px-4 py-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Cambiar mesa
              </button>
            )}

            {pendingItems.length > 0 && (
              <button
                onClick={sendToKitchen}
                disabled={sending || !hasOpenShift}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar a Cocina
              </button>
            )}

            {canCloseAccount && order && pendingItems.length === 0 && (
              allItemsServed ? (
                preCierreOrderId === order.id ||
                table?.tableType === "errors" ||
                table?.tableType === "trash" ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <Receipt className="h-4 w-4" />
                    Cerrar Cuenta
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePreCierreControl}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 py-3 text-sm font-semibold text-amber-800 transition-all hover:bg-amber-100 active:scale-[0.98]"
                  >
                    <FileCheck className="h-4 w-4" />
                    Pre cierre de control
                  </button>
                )
              ) : (
                <button
                  disabled
                  title="Todos los productos deben estar servidos"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-200 py-3 text-sm font-semibold text-gray-500 cursor-not-allowed"
                >
                  <Receipt className="h-4 w-4" />
                  Cerrar Cuenta (falta servir)
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════
          DERECHA — Buscar producto, Voz y grilla de productos
          ═══════════════════════════════════ */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
        {/* Search + Voice */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm transition-colors focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  title="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Voice button */}
            <button
              onClick={voiceActive ? stopVoice : startVoice}
              disabled={voiceProcessing}
              title={voiceActive ? "Detener grabación" : "Comandar por voz (OpenAI)"}
              className={cn(
                "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 transition-all",
                voiceActive
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                  : voiceProcessing
                    ? "bg-amber-100 text-amber-600 border border-amber-300"
                    : "border border-gray-200 bg-gray-50 text-gray-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600"
              )}
            >
              {voiceProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : voiceActive ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              <span className="hidden sm:inline text-xs font-medium">
                {voiceProcessing ? "IA..." : voiceActive ? "Parar" : "Voz"}
              </span>
            </button>
          </div>

          {/* Voice transcript display */}
          {(voiceActive || voiceTranscript) && !voiceConfirming && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600 mb-1">
                <Volume2 className="h-3.5 w-3.5" />
                {voiceActive ? "Escuchando..." : "Escuchado:"}
              </div>
              <p className="text-sm text-gray-700">
                {voiceTranscript || (
                  <span className="italic text-gray-400">Decí lo que querés agregar, por ejemplo: &quot;dos cafés con leche y una medialuna&quot;</span>
                )}
              </p>
            </div>
          )}

          {/* Voice confirmation panel */}
          {voiceConfirming && voiceMatches.length > 0 && (
            <div className="mt-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-3">
                <Sparkles className="h-4 w-4" />
                Confirmá la comanda por voz
              </div>
              <div className="space-y-2 mb-3">
                {voiceMatches.map((m, i) => {
                  const sectorInfo = SECTORS.find((s) => s.value === m.sector)
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 border border-amber-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-bold text-amber-700">
                        {m.quantity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">
                          {m.product.name}
                        </span>
                        {m.notes && (
                          <p className="mt-0.5 text-xs text-gray-500 truncate" title={m.notes}>
                            {m.notes}
                          </p>
                        )}
                      </div>
                      {sectorInfo && (
                        <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-medium", sectorInfo.color)}>
                          {sectorInfo.label}
                        </span>
                      )}
                      <span className="shrink-0 text-sm font-medium text-gray-600">
                        {formatCurrency(getEffectivePrice(m.product) * m.quantity)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setVoiceConfirming(false)
                    setVoiceMatches([])
                    setVoiceTranscript("")
                  }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={startVoice}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Reintentar
                </button>
                <button
                  onClick={confirmVoiceItems}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  <Check className="h-4 w-4" />
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Familia: filtro por familia en lugar de categoría */}
        <div className="flex shrink-0 flex-col overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-white scrollbar-thin -mx-1 dark:border-gray-700 dark:bg-gray-800">
          <p className="px-4 pt-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Familia
          </p>
          <div className="flex gap-2 px-4 py-2.5 pr-6 sm:pr-4 min-w-max">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === "all"
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              )}
            >
              Todos
            </button>
            {familias.map((fam) => (
              <button
                key={fam}
                onClick={() => setActiveCategory(fam)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  activeCategory === fam
                    ? "bg-amber-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                {fam}
              </button>
            ))}
          </div>
        </div>

        {/* Product grid: padding con safe area en móvil */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-4">
          {filteredProducts.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-gray-400">
                No se encontraron productos
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const qty = pendingItems.find(
                  (i) => i.productId === product.id
                )?.quantity
                return (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={!hasOpenShift}
                    className={cn(
                      "relative flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left transition-all hover:border-amber-300 hover:shadow-sm active:scale-[0.97]",
                      !hasOpenShift && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <span className="mb-2 flex h-16 w-full shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl.startsWith("http") ? product.imageUrl : product.imageUrl.startsWith("/") ? product.imageUrl : `/${product.imageUrl}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-gray-400">
                          {product.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-gray-800 line-clamp-2">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs text-gray-400">
                      {product.familia ?? "—"}
                    </span>
                    <span className="mt-auto pt-2 text-sm font-bold text-amber-600">
                      {formatCurrency(getEffectivePrice(product))}
                    </span>
                    {qty && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-white">
                        {qty}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════
          MODAL CAMBIO DE MESA (solo cajero/admin)
          ═══════════════════════════════════ */}
      {showChangeTableModal && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 dark:border dark:border-gray-700">
            <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Cambiar mesa</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Pedido actual en {table?.name ?? "esta mesa"}. Elige la mesa de destino.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {changeTableError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {changeTableError}
                </div>
              )}

              <div className="mb-4">
                <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mover</span>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="changeTableMode"
                      checked={changeTableMode === "full"}
                      onChange={() => setChangeTableMode("full")}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Mesa completa</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="changeTableMode"
                      checked={changeTableMode === "items"}
                      onChange={() => setChangeTableMode("items")}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Por artículo</span>
                  </label>
                </div>
              </div>

              {changeTableMode === "items" && (order.items?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Seleccionar ítems</span>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                    {(order.items ?? []).map((item: any) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIdsForMove.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIdsForMove((prev) => [...prev, item.id])
                            } else {
                              setSelectedItemIdsForMove((prev) => prev.filter((id) => id !== item.id))
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                          {item.quantity > 1 ? `${item.quantity}× ` : ""}
                          {item.productName ?? item.product?.name}
                          {item.notes ? ` — ${item.notes}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nueva mesa</label>
              <select
                value={newTableIdForChange}
                onChange={(e) => setNewTableIdForChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">Seleccionar mesa</option>
                {tablesForChange
                  .filter((t) => t.id !== order.tableId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.status === "available" ? "(disponible)" : "(ocupada)"}
                    </option>
                  ))}
              </select>
            </div>
            <div className="shrink-0 flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowChangeTableModal(false)
                  setChangeTableError(null)
                }}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !newTableIdForChange ||
                  changingTable ||
                  (changeTableMode === "items" && selectedItemIdsForMove.length === 0)
                }
                onClick={async () => {
                  if (!newTableIdForChange || changingTable) return
                  if (changeTableMode === "items" && selectedItemIdsForMove.length === 0) return
                  setChangingTable(true)
                  setChangeTableError(null)
                  try {
                    if (changeTableMode === "full") {
                      await ordersApi.changeTable(order.id, newTableIdForChange)
                    } else {
                      await ordersApi.moveItems(order.id, selectedItemIdsForMove, newTableIdForChange)
                    }
                    setShowChangeTableModal(false)
                    setNewTableIdForChange("")
                    setSelectedItemIdsForMove([])
                    await fetchData()
                  } catch (e: any) {
                    setChangeTableError(e?.message ?? "Error al cambiar la mesa")
                  } finally {
                    setChangingTable(false)
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {changingTable ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          MODAL PRE CIERRE DE CONTROL (comprobante para imprimir)
          ═══════════════════════════════════ */}
      {showPreCierreModal && order && table && (
        <>
          <style dangerouslySetInnerHTML={{ __html: `@media print { body * { visibility: hidden; } .pre-cierre-print-content, .pre-cierre-print-content * { visibility: visible; } .pre-cierre-print-content { position: absolute; left: 0; top: 0; width: 100%; max-width: 100%; background: white; padding: 24px; } .no-print { display: none !important; } }` }} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="pre-cierre-print-content max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
              <h1 className="text-lg font-bold text-gray-900">Pre cierre de control</h1>
              <p className="mt-1 text-sm text-gray-500">
                {/^\d+$/.test(String(table.name ?? "")) ? `Mesa ${table.name}` : table.name} · Pedido #{order.orderNumber ?? order.id}
              </p>
              <p className="text-sm text-gray-500">
                {new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <p className="mb-4 text-sm text-gray-600">Verifique la cuenta antes del pago.</p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="pb-2">Producto</th>
                    <th className="pb-2 w-12">Cant.</th>
                    <th className="pb-2 w-20">P.unit</th>
                    <th className="pb-2 text-right w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map((i: any) => {
                    const qty = i.quantity ?? 1
                    const up = i.unitPrice ?? (i.totalPrice ?? 0) / qty
                    const total = i.totalPrice ?? up * qty
                    return (
                      <tr key={i.id} className="border-b border-gray-100">
                        <td className="py-2">{i.productName ?? i.product?.name ?? "Ítem"}</td>
                        <td className="py-2">{qty}</td>
                        <td className="py-2">{formatCurrency(up)}</td>
                        <td className="py-2 text-right">{formatCurrency(total)}</td>
                      </tr>
                    )
                  })}
                  {pendingItems.map((p) => (
                    <tr key={p.tempId} className="border-b border-gray-100">
                      <td className="py-2">{p.productName}</td>
                      <td className="py-2">{p.quantity}</td>
                      <td className="py-2">{formatCurrency(p.unitPrice)}</td>
                      <td className="py-2 text-right">{formatCurrency(p.unitPrice * p.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {discount > 0 && (
                <p className="mt-2 text-sm text-amber-700">Descuento: -{formatCurrency(discount)}</p>
              )}
              <p className="mt-3 text-base font-bold text-gray-900">
                Total: {formatCurrency(Math.max(0, orderTotal))}
              </p>
              <p className="mt-4 text-xs text-gray-500">Documento de verificación. No es ticket de pago.</p>
              <div className="no-print mt-6">
                <button
                  type="button"
                  onClick={() => {
                    window.print()
                    setPreCierreOrderId(order.id)
                    setShowPreCierreModal(false)
                    sileo.success({ title: "Impreso. Ya podés cerrar la cuenta." })
                  }}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Imprimir
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════
          PAYMENT MODAL
          ═══════════════════════════════════ */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="shrink-0 border-b border-gray-100 px-6 py-4">
              <h2 className="mb-1 text-lg font-semibold text-gray-800">
                Cerrar Cuenta
              </h2>
              <p className="text-sm text-gray-500">
                {/^\d+$/.test(String(table?.name ?? "")) ? `Mesa ${table.name}` : table?.name} · Pedido #{order?.orderNumber}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">

            {(table?.tableType !== "errors" && table?.tableType !== "trash") && (
            <>
            {/* Método de pago: único o por comensal */}
            {splitMode && Object.keys(splitTotals).length > 0 ? (
              <div className="mb-5 w-full">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Medio de pago por comensal
                </p>
                <div className="space-y-3">
                  {Object.entries(splitTotals).map(([num, total]) => (
                    <div
                      key={num}
                      className="flex w-full flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3"
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          Comensal {num}
                        </span>
                        <span className="text-sm tabular-nums text-gray-600">
                          {formatCurrency(total)}
                        </span>
                      </div>
                      <div className="flex w-full flex-wrap gap-2">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() =>
                              setPaymentByDiner((prev) => ({
                                ...prev,
                                [Number(num)]: m.value,
                              }))
                            }
                            className={cn(
                              "flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all sm:flex-initial",
                              (paymentByDiner[Number(num)] ?? (paymentMethod || "cash")) === m.value
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100"
                            )}
                            title={m.label}
                          >
                            <m.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Método de pago
                </p>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setPaymentMethod(m.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                        paymentMethod === m.value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <m.icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Tipo de comprobante / Factura A */}
            <p className="mb-2 text-sm font-medium text-gray-700">
              Comprobante
            </p>
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("consumidor")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "consumidor"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Consumidor
              </button>
              <button
                type="button"
                onClick={() => {
                  setInvoiceType("factura_a")
                  setCustomerId(null)
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className={cn(
                  "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  invoiceType === "factura_a"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Factura A
              </button>
            </div>

            {/* Cliente (Factura A) — igual que en la segunda foto */}
            {invoiceType === "factura_a" && cuitSearchResult && typeof cuitSearchResult === "object" && (
              <div className="mb-4 overflow-hidden rounded-xl bg-[#3d4a3d] shadow-inner">
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Cliente (Factura A)
                  </p>
                  <p className="mt-1 text-base font-semibold text-gray-100">
                    {cuitSearchResult.name ?? cuitSearchResult.razonSocial ?? "—"}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-400">
                    CUIT {cuitSearchResult.cuit ?? cuitSearchResult.CUIT ?? "—"}
                  </p>
                </div>
                <div className="h-px bg-emerald-600/50" />
                <button
                  type="button"
                  onClick={() => {
                    setCuitSearchResult(null)
                    setCustomerId(null)
                    setCustomerSearch("")
                    setCustomerSearchResults([])
                    setCustomerSearchEmpty(false)
                  }}
                  className="w-full py-2 text-center text-xs font-medium text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300"
                >
                  Cambiar cliente
                </button>
              </div>
            )}

            {invoiceType === "factura_a" && locationId && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-3">
                {!cuitSearchResult && !showAddCustomer ? (
                  <>
                    <label className="mb-1.5 block text-xs font-medium text-gray-600">
                      Buscar cliente por nombre o CUIT
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value)
                          setCustomerSearchResults([])
                          setCustomerSearchEmpty(false)
                        }}
                        placeholder="Nombre o CUIT (ej. 20-12345678-9)"
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!customerSearch.trim()) return
                          setCuitSearching(true)
                          setCustomerSearchResults([])
                          setCustomerSearchEmpty(false)
                          try {
                            const listRaw = await customersApi.getAll(
                              locationId,
                              customerSearch.trim()
                            )
                            const list = Array.isArray(listRaw) ? listRaw : listRaw?.data ?? []
                            if (list.length === 0) {
                              setCuitSearchResult(null)
                              setCustomerId(null)
                              setCustomerSearchResults([])
                              setCustomerSearchEmpty(true)
                            } else if (list.length === 1) {
                              const c = list[0]
                              setCuitSearchResult(c)
                              setCustomerId(c?.id ?? null)
                              setCustomerSearchResults([])
                            } else {
                              setCuitSearchResult(null)
                              setCustomerId(null)
                              setCustomerSearchResults(list)
                              setCustomerSearchEmpty(false)
                            }
                          } catch {
                            setCuitSearchResult(null)
                            setCustomerId(null)
                            setCustomerSearchResults([])
                            setCustomerSearchEmpty(true)
                          } finally {
                            setCuitSearching(false)
                          }
                        }}
                        disabled={cuitSearching || !customerSearch.trim()}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {cuitSearching ? "Buscando…" : "Buscar"}
                      </button>
                    </div>
                    {customerSearchEmpty && (
                      <p className="mt-2 text-sm text-amber-700">
                        El cliente no está cargado.
                      </p>
                    )}
                    {customerSearchResults.length > 1 && (
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                        <p className="mb-1.5 text-xs font-medium text-gray-500">
                          Varios resultados, elegí uno:
                        </p>
                        {customerSearchResults.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCuitSearchResult(c)
                              setCustomerId(c?.id ?? null)
                              setCustomerSearchResults([])
                            }}
                            className="flex w-full justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            <span className="font-medium text-gray-800 truncate">{c.name ?? "—"}</span>
                            <span className="shrink-0 text-gray-500">{c.cuit ?? ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {customerSearchResults.length === 0 && cuitSearchResult === null && customerSearch.trim() && !cuitSearching && /[\d-]/.test(customerSearch.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCustomer(true)
                          setNewCustomerCuit(customerSearch.trim())
                          setNewCustomerName("")
                        }}
                        className="mt-2 text-sm text-emerald-600 hover:underline"
                      >
                        + Agregar cliente con este CUIT
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCustomer(true)
                        setNewCustomerName("")
                        setNewCustomerCuit(customerSearch.trim() && /[\d-]/.test(customerSearch.trim()) ? customerSearch.trim() : "")
                      }}
                      className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      + Agregar nuevo cliente
                    </button>
                  </>
                ) : showAddCustomer ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">
                      Nuevo cliente (Factura A)
                    </p>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Razón social o nombre"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={newCustomerCuit}
                      onChange={(e) => setNewCustomerCuit(formatCuitDisplay(e.target.value))}
                      placeholder="CUIT (ej. 20-12345678-9)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCustomer(false)
                          setNewCustomerName("")
                          setNewCustomerCuit("")
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newCustomerName.trim() || !newCustomerCuit.trim()) return
                          setAddingCustomer(true)
                          try {
                            const created = await customersApi.create({
                              locationId,
                              name: newCustomerName.trim(),
                              cuit: newCustomerCuit.trim(),
                            })
                            const c = created?.data ?? created
                            setCustomerId(c?.id ?? null)
                            setCuitSearchResult(c)
                            setShowAddCustomer(false)
                            setNewCustomerName("")
                            setNewCustomerCuit("")
                            sileo.success({ title: "Cliente creado" })
                          } catch (e) {
                            setError("No se pudo crear el cliente. ¿CUIT duplicado?")
                            sileo.error({ title: "No se pudo crear el cliente. ¿CUIT duplicado?" })
                          } finally {
                            setAddingCustomer(false)
                          }
                        }}
                        disabled={addingCustomer || !newCustomerName.trim() || !newCustomerCuit.trim()}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {addingCustomer ? "Creando…" : "Crear y usar"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Discount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Descuento ($)
              </label>
              <input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) =>
                  setDiscount(parseInt(e.target.value) || 0)
                }
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            </>
            )}

            {/* Notes */}
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Notas
              </label>
              <textarea
                rows={2}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Observaciones opcionales..."
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Total */}
            <div className="mb-5 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-600">Total</span>
              <span className="text-xl font-bold text-gray-800">
                {formatCurrency(Math.max(0, orderTotal))}
              </span>
            </div>

            {/* Resumen por comensal (dividir cuenta) */}
            {(table?.tableType !== "errors" && table?.tableType !== "trash") && splitMode && Object.keys(splitTotals).length > 0 && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Resumen por comensal
                </p>
                <div className="space-y-1">
                  {Object.entries(splitTotals).map(([num, total]) => (
                    <div key={num} className="flex justify-between text-sm">
                      <span className="text-gray-600">Comensal {num}</span>
                      <span className="font-medium text-gray-800">{formatCurrency(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowPayment(false)
                  setPaymentMethod("")
                  setPaymentByDiner({})
                  setDiscount(0)
                  setPaymentNotes("")
                  setInvoiceType("consumidor")
                  setCustomerId(null)
                  setCustomerSearch("")
                  setCuitSearchResult(null)
                  setCustomerSearchResults([])
                  setCustomerSearchEmpty(false)
                  setShowAddCustomer(false)
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={closeOrder}
                disabled={
                  ((table?.tableType !== "errors" && table?.tableType !== "trash") &&
                    !paymentMethod &&
                    !(splitMode && Object.keys(splitTotals).length > 0)) ||
                  closing
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Confirmar Pago
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          EDIT ORDER ITEM MODAL
          ═══════════════════════════════════ */}
      {editingOrderItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">
              Editar ítem · {editingOrderItem.productName}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingOrderItem.quantity}
                  onChange={(e) =>
                    setEditingOrderItem((prev) =>
                      prev
                        ? {
                            ...prev,
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          }
                        : null
                    )
                  }
                  title="Cantidad"
                  placeholder="1"
                  aria-label="Cantidad"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Notas
                </label>
                <textarea
                  rows={2}
                  value={editingOrderItem.notes}
                  onChange={(e) =>
                    setEditingOrderItem((prev) =>
                      prev ? { ...prev, notes: e.target.value } : null
                    )
                  }
                  placeholder="Opcional"
                  className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditingOrderItem(null)}
                className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={saveOrderItemEdit}
                disabled={updatingItem}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {updatingItem && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          NOTES MODAL
          ═══════════════════════════════════ */}
      {notesTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">
              Notas del ítem
            </h3>
            <textarea
              autoFocus
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Sin cebolla, extra queso..."
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setNotesTarget(null)
                  setNotesDraft("")
                }}
                className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={saveNote}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
