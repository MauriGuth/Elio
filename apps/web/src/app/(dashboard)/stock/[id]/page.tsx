"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  ArrowLeft,
  MapPin,
  Clock,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  Package,
  Pencil,
  Trash2,
  Loader2,
  X,
} from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { productsApi } from "@/lib/api/products"
import { stockApi } from "@/lib/api/stock"
import { categoriesApi } from "@/lib/api/categories"
import { locationsApi } from "@/lib/api/locations"
import {
  cn,
  formatCurrency,
  formatNumber,
  formatDateTime,
  getStockStatus,
  getStockStatusLabel,
  getStockStatusColor,
  getCategoryBadgeStyle,
} from "@/lib/utils"
import type { StockStatus } from "@/types"

// ---------- helpers ----------

const statusBarColor: Record<string, string> = {
  critical: "bg-red-500",
  medium: "bg-yellow-500",
  normal: "bg-green-500",
  excess: "bg-purple-500",
}

const statusDotColor: Record<string, string> = {
  critical: "bg-red-500",
  medium: "bg-yellow-500",
  normal: "bg-green-500",
  excess: "bg-purple-500",
}

const movementTypeConfig: Record<string, { label: string; style: string }> = {
  goods_receipt: { label: "Ingreso", style: "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  production_in: { label: "Ingreso", style: "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  purchase: { label: "Compra", style: "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  shipment_in: { label: "Envío", style: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  shipment_out: { label: "Envío", style: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  transfer_in: { label: "Transferencia", style: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  transfer_out: { label: "Transferencia", style: "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  production_out: { label: "Egreso", style: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  sale: { label: "Egreso", style: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  waste: { label: "Merma", style: "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  correction: { label: "Corrección", style: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200" },
  adjustment: { label: "Ajuste", style: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200" },
}

/** Types whose quantity should display as negative (outflow) */
const outflowTypes = new Set([
  "shipment_out",
  "production_out",
  "sale",
  "waste",
  "transfer_out",
])

// Hardcoded AI alerts for products with critical stock
const aiAlerts = [
  {
    id: "ai-alert-1",
    severity: "warning" as const,
    title: "Stock bajo en sucursales",
    message:
      "Al ritmo actual de consumo, el stock en Café Norte se agota en aproximadamente 2 días. Se recomienda programar un envío desde Depósito Central.",
    action: "Programar envío",
  },
  {
    id: "ai-alert-2",
    severity: "info" as const,
    title: "Sugerencia de compra",
    message:
      "Basado en el consumo promedio semanal y el lead time del proveedor, se recomienda generar una orden de compra antes del viernes para evitar quiebre de stock.",
    action: "Ver sugerencia",
  },
  {
    id: "ai-alert-3",
    severity: "critical" as const,
    title: "Desviación de consumo detectada",
    message:
      "El consumo en Restaurante Sur es un 35% mayor al promedio histórico para este día de la semana. Verificar si hay una promoción activa o un posible error de registro.",
    action: "Investigar",
  },
]

const severityIcon: Record<string, string> = {
  warning: "⚡",
  info: "📈",
  critical: "🔴",
}

const severityBorder: Record<string, string> = {
  warning: "border-yellow-200 bg-yellow-50/40 dark:border-yellow-700 dark:bg-yellow-900/30",
  info: "border-gray-100 dark:border-gray-600 dark:bg-gray-700/50",
  critical: "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-900/30",
}

const unitOptions = [
  { value: "unidad", label: "Unidad" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "litro", label: "Litro" },
]

/** Quita prefijos "Tipo:", "Familia:", "Subfamilia:", "Agrupar:" del nombre de categoría para mostrar solo el valor. */
function getCategoryDisplayName(name: string | null | undefined): string {
  if (!name) return ""
  return name.replace(/^(Tipo|Familia|Subfamilia|Agrupar):\s*/i, "").trim() || name
}

const PREPARATION_SECTOR_FORM_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Automático (por categoría y nombre)" },
  { value: "kitchen", label: "Cocina" },
  { value: "coffee", label: "Cafetería / café" },
  { value: "bar", label: "Bar" },
  { value: "bakery", label: "Panadería" },
]

// ---------- API → UI mapping ----------

interface ApiStockLevel {
  id: string
  productId: string
  locationId: string
  quantity: number
  minQuantity: number
  maxQuantity: number
  salePrice?: number | null
  location: { id: string; name: string; slug: string; type: string }
}

interface ApiProduct {
  id: string
  sku: string
  name: string
  description?: string
  categoryId: string
  familia?: string | null
  subfamilia?: string | null
  unit: string
  imageUrl?: string | null
  avgCost: number
  lastCost: number
  salePrice: number
  isSellable: boolean
  isIngredient: boolean
  isProduced: boolean
  isPerishable: boolean
  consumeRecipeOnSale?: boolean
  preparationSector?: string | null
  isActive: boolean
  category: {
    id: string
    name: string
    slug: string
    icon: string
    color: string
  }
  stockLevels: ApiStockLevel[]
  productSuppliers?: Array<{
    supplier: { id: string; name: string }
  }>
}

interface ApiMovement {
  id: string
  productId: string
  locationId: string
  type: string
  quantity: number
  unitCost?: number
  notes?: string
  userId: string
  createdAt: string
  product: { name: string; sku: string }
  location: { name: string }
  user: { firstName: string; lastName: string }
}

interface ProcessedStockLevel {
  id: string
  locationId: string
  locationName: string
  quantity: number
  minQuantity: number
  maxQuantity?: number
  salePrice?: number | null
  status: StockStatus
}

interface ProcessedProduct {
  id: string
  sku: string
  name: string
  familia?: string | null
  subfamilia?: string | null
  unit: string
  imageUrl?: string | null
  avgCost: number
  lastCost: number
  salePrice: number
  isSellable: boolean
  isIngredient: boolean
  isPerishable: boolean
  consumeRecipeOnSale: boolean
  preparationSector?: string | null
  category: {
    id: string
    name: string
    slug: string
    icon: string
    color: string
  }
  stockByLocation: ProcessedStockLevel[]
  totalStock: number
  worstStatus: StockStatus
}

interface ProcessedMovement {
  id: string
  type: string
  quantity: number
  notes?: string
  userName: string
  createdAt: string
  /** Nombre del local donde ocurrió el movimiento (sumó o restó) */
  locationName?: string
}

function processProduct(p: ApiProduct): ProcessedProduct {
  const stockByLocation: ProcessedStockLevel[] = (p.stockLevels || []).map(
    (sl) => {
      const status = getStockStatus(
        sl.quantity,
        sl.minQuantity,
        sl.maxQuantity || undefined
      ) as StockStatus
      return {
        id: sl.id,
        locationId: sl.location?.id || sl.locationId,
        locationName: sl.location?.name || "Sin ubicación",
        quantity: sl.quantity,
        minQuantity: sl.minQuantity,
        maxQuantity: sl.maxQuantity || undefined,
        salePrice: sl.salePrice ?? undefined,
        status,
      }
    }
  )

  const totalStock = stockByLocation.reduce((sum, s) => sum + s.quantity, 0)

  const statusPriority: Record<string, number> = {
    critical: 0,
    medium: 1,
    excess: 2,
    normal: 3,
  }
  const worstStatus =
    stockByLocation.length > 0
      ? (stockByLocation.reduce(
          (worst, s) =>
            (statusPriority[s.status] ?? 3) < (statusPriority[worst] ?? 3)
              ? s.status
              : worst,
          "normal" as StockStatus
        ) as StockStatus)
      : ("normal" as StockStatus)

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    familia: p.familia ?? undefined,
    subfamilia: p.subfamilia ?? undefined,
    unit: p.unit,
    imageUrl: p.imageUrl ?? undefined,
    avgCost: p.avgCost ?? 0,
    lastCost: p.lastCost ?? 0,
    salePrice: p.salePrice ?? 0,
    isSellable: p.isSellable ?? false,
    isIngredient: p.isIngredient ?? false,
    isPerishable: p.isPerishable ?? false,
    consumeRecipeOnSale: p.consumeRecipeOnSale ?? false,
    preparationSector: p.preparationSector ?? null,
    category: p.category,
    stockByLocation,
    totalStock,
    worstStatus,
  }
}

function processMovement(m: ApiMovement): ProcessedMovement {
  const rawQty = m.quantity
  // Handle both signed and unsigned API responses
  const displayQty =
    outflowTypes.has(m.type) && rawQty > 0 ? -rawQty : rawQty

  return {
    id: m.id,
    type: m.type,
    quantity: displayQty,
    notes: m.notes,
    userName: m.user
      ? `${m.user.firstName} ${m.user.lastName}`.trim()
      : "Sistema",
    createdAt: m.createdAt,
    locationName: m.location?.name,
  }
}

// ---------- loading skeleton ----------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back link skeleton */}
      <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />

      {/* Header card skeleton */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100 animate-pulse" />
            <div className="space-y-3">
              <div className="h-6 w-48 rounded bg-gray-200 animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-20 rounded bg-gray-100 animate-pulse" />
                <div className="h-5 w-24 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                <div className="h-5 w-20 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stock per location skeleton */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
          <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
              <div className="h-2 flex-1 rounded-full bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom grid skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
            <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-28 rounded bg-gray-100 animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
            <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-gray-50 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- main page ----------

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.id as string

  const [product, setProduct] = useState<ProcessedProduct | null>(null)
  const [movements, setMovements] = useState<ProcessedMovement[]>([])
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; slug: string; icon: string; color: string; parentId?: string | null }>
  >([])
  const [locations, setLocations] = useState<Array<{ id: string; name: string; type?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    sku: "",
    name: "",
    categoryId: "",
    familia: "" as string,
    subfamilia: "" as string,
    locationIds: [] as string[],
    unit: "unidad",
    imageUrl: "" as string,
    avgCost: 0,
    salePrice: 0,
    salePriceByLocation: {} as Record<string, number>,
    isSellable: false,
    isIngredient: false,
    isPerishable: false,
    consumeRecipeOnSale: false,
    preparationSector: "" as string,
  })
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImageUploading, setEditImageUploading] = useState(false)
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [levelEditMin, setLevelEditMin] = useState<number>(0)
  const [levelEditMax, setLevelEditMax] = useState<number | "">(0)
  const [levelSaving, setLevelSaving] = useState(false)

  const [user, setUser] = useState<{ role?: string } | null>(null)
  useEffect(() => {
    setUser(authApi.getStoredUser())
  }, [])
  const isLogisticsRole =
    user?.role === "LOGISTICS" || user?.role === "logistics"

  const familias = useMemo(
    () =>
      categories
        .filter((c) => c.slug.startsWith("familia-") && !c.parentId)
        .sort((a, b) =>
          getCategoryDisplayName(a.name).localeCompare(getCategoryDisplayName(b.name), "es", { sensitivity: "base" })
        ),
    [categories]
  )

  const subfamiliasList = useMemo(() => {
    const ids = new Set(familias.map((f) => f.id))
    return categories
      .filter((c) => c.parentId && ids.has(c.parentId))
      .sort((a, b) =>
        getCategoryDisplayName(a.name).localeCompare(getCategoryDisplayName(b.name), "es", { sensitivity: "base" })
      )
  }, [categories, familias])

  const subfamiliasForEdit = useMemo(() => {
    const fam = familias.find((f) => getCategoryDisplayName(f.name) === editForm.familia)
    if (!fam) return []
    return subfamiliasList.filter((s) => s.parentId === fam.id)
  }, [editForm.familia, familias, subfamiliasList])

  /** Rubros: excluye familias, subfamilias y categorías hijas de familia */
  const stockRubroCategories = useMemo(() => {
    const rootFamiliaIds = new Set(familias.map((f) => f.id))
    return categories
      .filter(
        (c) =>
          !c.slug.startsWith("familia-") &&
          !c.slug.startsWith("subfamilia-") &&
          !(c.parentId && rootFamiliaIds.has(c.parentId))
      )
      .sort((a, b) =>
        getCategoryDisplayName(a.name).localeCompare(getCategoryDisplayName(b.name), "es", {
          sensitivity: "base",
        })
      )
  }, [categories, familias])

  /** Si el producto tenía otra categoría (legacy), mostrarla al final para no perder el valor. */
  const rubroCategoriesForEdit = useMemo(() => {
    const id = editForm.categoryId
    if (!id || stockRubroCategories.some((c) => c.id === id)) return stockRubroCategories
    const orphan = categories.find((c) => c.id === id)
    if (!orphan) return stockRubroCategories
    return [...stockRubroCategories, orphan]
  }, [stockRubroCategories, categories, editForm.categoryId])

  const fetchData = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const [productRes, movementsRes] = await Promise.all([
        productsApi.getById(productId, forceRefresh),
        stockApi.getMovements({ productId }),
      ])

      setProduct(processProduct(productRes as ApiProduct))

      // The API returns { data: Movement[], total } or an array directly
      const movementData = Array.isArray(movementsRes)
        ? movementsRes
        : ((movementsRes as Record<string, unknown>).data as ApiMovement[]) ||
          []
      setMovements(
        (movementData as ApiMovement[]).map(processMovement)
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar el producto"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!showEditModal) return

    if (categories.length === 0) {
      categoriesApi.getAll({ isActive: true }).then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? []
        const mapped = (list as Array<{ id: string; name: string; slug: string; icon?: string; color?: string; parentId?: string | null }>).map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon ?? "",
          color: c.color ?? "",
          parentId: c.parentId ?? null,
        }))
        mapped.sort((a, b) =>
          getCategoryDisplayName(a.name).localeCompare(getCategoryDisplayName(b.name), "es", { sensitivity: "base" })
        )
        setCategories(mapped)
      }).catch(() => {})
    }

    if (locations.length === 0) {
      locationsApi.getAll().then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? []
        setLocations(
          list.map((location: { id: string; name: string; type?: string }) => ({
            id: location.id,
            name: location.name,
            type: location.type,
          }))
        )
      }).catch(() => {})
    }
  }, [showEditModal, categories.length, locations.length])

  const openEditModal = useCallback(() => {
    if (!product) return
    const salePriceByLocation: Record<string, number> = {}
    product.stockByLocation.forEach((stock) => {
      const price = stock.salePrice ?? product.salePrice ?? 0
      salePriceByLocation[stock.locationId] = price
    })
    setEditForm({
      sku: product.sku,
      name: product.name,
      categoryId: product.category.id,
      familia: product.familia ?? "",
      subfamilia: product.subfamilia ?? "",
      locationIds: product.stockByLocation.map((stock) => stock.locationId),
      unit: product.unit,
      imageUrl: product.imageUrl ?? "",
      avgCost: product.avgCost,
      salePrice: product.salePrice,
      salePriceByLocation,
      isSellable: product.isSellable,
      isIngredient: product.isIngredient,
      isPerishable: product.isPerishable,
      consumeRecipeOnSale: product.consumeRecipeOnSale ?? false,
      preparationSector: product.preparationSector ?? "",
    })
    setEditImageFile(null)
    setEditError(null)
    setShowEditModal(true)
  }, [product])

  const handleSaveEdit = useCallback(async () => {
    if (!product) return
    setEditing(true)
    setEditError(null)
    try {
      if (editForm.locationIds.length === 0) {
        setEditError("Seleccioná al menos una ubicación para el producto")
        return
      }

      let imageUrl = editForm.imageUrl || undefined
      if (editImageFile) {
        setEditImageUploading(true)
        const res = await productsApi.uploadImage(editImageFile)
        imageUrl = (res as any)?.url ?? (res as any)?.data?.url ?? ""
        setEditImageUploading(false)
      }
      const salePriceByLocation: Record<string, number> = {}
      editForm.locationIds.forEach((locId) => {
        salePriceByLocation[locId] =
          editForm.salePriceByLocation[locId] ?? editForm.salePrice ?? 0
      })
      await productsApi.update(product.id, {
        sku: editForm.sku,
        name: editForm.name,
        categoryId: editForm.categoryId,
        familia: editForm.familia?.trim() ? editForm.familia.trim() : null,
        subfamilia: editForm.subfamilia?.trim() ? editForm.subfamilia.trim() : null,
        locationIds: editForm.locationIds,
        unit: editForm.unit,
        imageUrl,
        avgCost: editForm.avgCost,
        salePrice: editForm.salePrice,
        salePriceByLocation: editForm.locationIds.length > 0 ? salePriceByLocation : undefined,
        isSellable: editForm.isSellable,
        isIngredient: editForm.isIngredient,
        isPerishable: editForm.isPerishable,
        consumeRecipeOnSale: editForm.consumeRecipeOnSale,
        preparationSector: editForm.preparationSector
          ? editForm.preparationSector
          : null,
      })
      setShowEditModal(false)
      await fetchData(true)
      sileo.success({ title: "Producto actualizado correctamente" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setEditError(msg)
      sileo.error({ title: msg })
    } finally {
      setEditing(false)
      setEditImageUploading(false)
    }
  }, [product, editForm, editImageFile, fetchData])

  const handleDelete = useCallback(async () => {
    if (!product) return
    setDeleting(true)
    try {
      await productsApi.delete(product.id)
      sileo.success({ title: "Producto eliminado" })
      router.push("/stock")
    } catch (err: unknown) {
      sileo.error({ title: err instanceof Error ? err.message : "Error al eliminar" })
      setDeleting(false)
    }
  }, [product, router])

  // ---------- loading ----------

  if (loading) {
    return <DetailSkeleton />
  }

  // ---------- error ----------

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/stock"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Productos
        </Link>
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <Package className="h-7 w-7 text-red-400" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            Error al cargar producto
          </h2>
          <p className="mt-1 max-w-sm text-center text-sm text-gray-500">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void fetchData(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // ---------- not found ----------

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
          📦
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          Producto no encontrado
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          El producto que buscas no existe o fue eliminado.
        </p>
        <Link
          href="/stock"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Productos
        </Link>
      </div>
    )
  }

  // ---------- derived data ----------

  const totalStock = product.stockByLocation.reduce(
    (sum, s) => sum + s.quantity,
    0
  )

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* -------- Back link -------- */}
      <Link
        href="/stock"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-white transition-colors hover:text-gray-900 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Productos
      </Link>

      {/* -------- Product header -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {product.imageUrl ? (
              <img
                src={product.imageUrl.startsWith("http") ? product.imageUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${product.imageUrl}`}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 dark:border-gray-600 object-cover bg-gray-50 dark:bg-gray-700"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-2xl font-semibold text-gray-500 dark:text-gray-400">
                {product.category.name?.charAt(0)?.toUpperCase() ?? "📁"}
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {product.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-mono text-xs font-medium text-gray-600 dark:text-white">
                  {product.sku}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={getCategoryBadgeStyle(product.category.color)}
                >
                  {getCategoryDisplayName(product.category.name)}
                </span>
                {product.familia && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {product.familia}
                  </span>
                )}
                {product.subfamilia && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    {product.subfamilia}
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    getStockStatusColor(product.worstStatus)
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      statusDotColor[product.worstStatus]
                    )}
                  />
                  {getStockStatusLabel(product.worstStatus)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Unidad</p>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                  {product.unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Costo Promedio</p>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(product.avgCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Último Costo</p>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(product.lastCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-white">Stock Total</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
                  {formatNumber(product.totalStock)}
                </p>
              </div>
            </div>
            {!isLogisticsRole && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-red-900/40 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-300 transition-colors hover:bg-red-50 dark:hover:bg-red-900/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------- Modal Editar Producto -------- */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Editar producto
              </h3>
              <button
                type="button"
                onClick={() => !editing && setShowEditModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-4">
              {editError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-300">
                  {editError}
                </div>
              )}
              <div>
                <label htmlFor="edit-sku" className="block text-sm font-medium text-gray-700 dark:text-white">
                  SKU
                </label>
                <input
                  id="edit-sku"
                  type="text"
                  value={editForm.sku}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, sku: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="SKU del producto"
                />
              </div>
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Nombre
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Nombre del producto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Foto del artículo
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {editImageFile ? editImageFile.name : "Cambiar imagen (jpg, png, webp)"}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        setEditImageFile(f ?? null)
                        if (f) setEditForm((p) => ({ ...p, imageUrl: "" }))
                      }}
                    />
                  </label>
                  {(editForm.imageUrl || editImageFile) && (
                    <div className="flex items-center gap-2">
                      {editImageFile ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Se actualizará al guardar</span>
                      ) : editForm.imageUrl ? (
                        <img
                          src={editForm.imageUrl.startsWith("http") ? editForm.imageUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${editForm.imageUrl}`}
                          alt="Vista previa"
                          className="h-14 w-14 rounded border border-gray-200 object-cover"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setEditImageFile(null)
                          setEditForm((f) => ({ ...f, imageUrl: "" }))
                        }}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                  {editImageUploading && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Subiendo imagen...</span>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="edit-category" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Categoría (tipo)
                </label>
                <select
                  id="edit-category"
                  value={editForm.categoryId}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, categoryId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Categoría del producto"
                >
                  <option value="">Seleccionar categoría</option>
                  {rubroCategoriesForEdit.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryDisplayName(c.name)}
                      {!c.slug.startsWith("tipo-") ? " (reasignar a tipo)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-familia" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Familia
                </label>
                <select
                  id="edit-familia"
                  value={editForm.familia}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, familia: e.target.value, subfamilia: "" }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Familia del producto"
                >
                  <option value="">Seleccionar familia...</option>
                  {familias.map((fam) => (
                    <option key={fam.id} value={getCategoryDisplayName(fam.name)}>
                      {getCategoryDisplayName(fam.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-subfamilia" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Subfamilia
                </label>
                <select
                  id="edit-subfamilia"
                  value={editForm.subfamilia}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, subfamilia: e.target.value }))
                  }
                  disabled={!editForm.familia || subfamiliasForEdit.length === 0}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  aria-label="Subfamilia del producto"
                >
                  <option value="">
                    {!editForm.familia
                      ? "Elegí primero una familia"
                      : subfamiliasForEdit.length === 0
                        ? "Sin subfamilias en esta familia"
                        : "Opcional"}
                  </option>
                  {subfamiliasForEdit.map((sf) => (
                    <option key={sf.id} value={getCategoryDisplayName(sf.name)}>
                      {getCategoryDisplayName(sf.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-unit" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Unidad
                </label>
                <select
                  id="edit-unit"
                  value={editForm.unit}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, unit: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Unidad de medida"
                >
                  {unitOptions.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Ubicaciones
                </label>
                <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {locations
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                      .map((location) => {
                        const checked = editForm.locationIds.includes(location.id)
                        return (
                          <label
                            key={location.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setEditForm((current) => {
                                  const adding = e.target.checked
                                  const nextIds = adding
                                    ? [...current.locationIds, location.id]
                                    : current.locationIds.filter((id) => id !== location.id)
                                  const nextPrices = { ...current.salePriceByLocation }
                                  if (adding && nextPrices[location.id] == null)
                                    nextPrices[location.id] = current.salePrice ?? 0
                                  if (!adding) delete nextPrices[location.id]
                                  return {
                                    ...current,
                                    locationIds: nextIds,
                                    salePriceByLocation: nextPrices,
                                  }
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                              {location.name}
                              {location.type === "WAREHOUSE" ? " (Depósito)" : ""}
                            </span>
                          </label>
                        )
                      })}
                  </div>
                  {locations.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No hay ubicaciones disponibles.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="edit-avgCost" className="block text-sm font-medium text-gray-700 dark:text-white">
                  Costo promedio
                </label>
                <input
                  id="edit-avgCost"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Costo promedio"
                />
              </div>
              {editForm.locationIds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Precio por local
                  </label>
                  <p className="mt-1 mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Precio de venta en cada local.
                  </p>
                  <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                    {locations
                      .filter((loc) => editForm.locationIds.includes(loc.id))
                      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                      .map((location) => (
                        <div key={location.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <span className="text-sm text-gray-700 dark:text-gray-200">
                            {location.name}
                            {location.type === "WAREHOUSE" ? " (Depósito)" : ""}
                          </span>
                          <div className="flex min-w-[7rem] items-center justify-center">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editForm.salePriceByLocation[location.id] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value
                                const num = v === "" ? undefined : parseFloat(v)
                                setEditForm((f) => ({
                                  ...f,
                                  salePriceByLocation: {
                                    ...f.salePriceByLocation,
                                    [location.id]: num ?? 0,
                                  },
                                }))
                              }}
                              placeholder="0"
                              className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-center tabular-nums text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              aria-label={`Precio en ${location.name}`}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Destino de comanda
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Cafetería (POS) muestra café, bar y panadería; Cocina solo platos de cocina. Vacío = inferir por categoría/nombre.
                </p>
                <select
                  aria-label="Destino de comanda"
                  value={editForm.preparationSector}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, preparationSector: e.target.value }))
                  }
                  className="w-full max-w-md rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {PREPARATION_SECTOR_FORM_OPTIONS.map((o) => (
                    <option key={o.value || "auto"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-white">Vendible</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">(necesario para que aparezca en Mesas/comandas)</span>
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
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-white">Ingrediente</span>
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
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-white">Perecedero</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.consumeRecipeOnSale}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        consumeRecipeOnSale: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-white">Descontar insumos al vender</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    (receta activa; café/bar elaborado al momento — no descuenta el producto terminado)
                  </span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
              <button
                type="button"
                onClick={() => !editing && setShowEditModal(false)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={
                  editing ||
                  !editForm.sku.trim() ||
                  !editForm.name.trim() ||
                  !editForm.categoryId ||
                  editForm.locationIds.length === 0
                }
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editing && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Modal Confirmar Eliminar -------- */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Eliminar producto
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              ¿Eliminar &quot;{product.name}&quot;? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !deleting && setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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

      {product.isSellable ? (
        <div className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90">
          <p className="font-medium">Modificadores de carta (opciones en el POS)</p>
          <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/75">
            El catálogo de grupos y opciones es <strong>global</strong> (sirve para todas las recetas).
            Editá grupos acá o en{" "}
            <Link href="/recipes" className="font-semibold underline hover:no-underline">
              Recetas
            </Link>{" "}
            al abrir un plato; en cada receta asigná un grupo a un ingrediente y cargá insumos por opción.
          </p>
        </div>
      ) : null}

      {/* -------- Stock por Ubicación -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Stock por Ubicación
          </h3>
        </div>

        {product.stockByLocation.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Este producto no tiene stock registrado por ubicación
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Ubicación
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Mínimo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Máximo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Pedido
                  </th>
                  <th className="w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Nivel
                  </th>
                  <th className="w-32 min-w-32 shrink-0 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {product.stockByLocation.map((stock) => {
                  const maxRef =
                    stock.maxQuantity || stock.minQuantity * 2.5
                  const barPercent = Math.min(
                    100,
                    Math.max(2, (maxRef > 0 ? stock.quantity / maxRef : 0) * 100)
                  )
                  const isUrgent = stock.quantity <= stock.minQuantity
                  const toOrder =
                    stock.maxQuantity != null && stock.maxQuantity > stock.quantity
                      ? Math.ceil(stock.maxQuantity - stock.quantity)
                      : null
                  const isEditing = editingLevelId === stock.id

                  return (
                    <tr
                      key={stock.locationId}
                      className={cn(
                        "border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50",
                        isUrgent && "bg-red-50/50 dark:bg-red-900/20"
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          {stock.locationName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(stock.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-500 dark:text-white">
                        {isEditing ? (
                          <input
                            title="Mínimo"
                            type="number"
                            min={0}
                            step={1}
                            value={levelEditMin}
                            onChange={(e) =>
                              setLevelEditMin(parseFloat(e.target.value) || 0)
                            }
                            className="w-20 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-right text-sm dark:bg-gray-800 dark:text-white"
                          />
                        ) : (
                          formatNumber(stock.minQuantity)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-500 dark:text-white">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={levelEditMax}
                            onChange={(e) => {
                              const v = e.target.value
                              setLevelEditMax(v === "" ? "" : parseFloat(v) || 0)
                            }}
                            placeholder="—"
                            className="w-20 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-right text-sm dark:bg-gray-800 dark:text-white"
                            aria-label="Cantidad máxima"
                          />
                        ) : stock.maxQuantity ? (
                          formatNumber(stock.maxQuantity)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            getStockStatusColor(stock.status)
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              statusDotColor[stock.status]
                            )}
                          />
                          {getStockStatusLabel(stock.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isUrgent ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                            URGENTE
                            {toOrder != null && toOrder > 0 && (
                              <span>· Pedir {formatNumber(toOrder)}</span>
                            )}
                          </span>
                        ) : stock.quantity < stock.minQuantity * 1.5 ? (
                          <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                            Faltante
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                statusBarColor[stock.status]
                              )}
                              style={{ width: `${barPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="w-32 min-w-32 shrink-0 px-4 py-3">
                        {isLogisticsRole ? (
                          <span className="text-gray-400">—</span>
                        ) : isEditing ? (
                          <div className="flex gap-1 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={levelSaving}
                              onClick={async () => {
                                setLevelSaving(true)
                                try {
                                  await stockApi.updateLevel(stock.id, {
                                    minQuantity: levelEditMin,
                                    maxQuantity:
                                      levelEditMax === ""
                                        ? undefined
                                        : Number(levelEditMax),
                                  })
                                  setEditingLevelId(null)
                                  await fetchData()
                                } finally {
                                  setLevelSaving(false)
                                }
                              }}
                              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {levelSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Guardar"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLevelId(null)
                                setLevelEditMin(stock.minQuantity)
                                setLevelEditMax(stock.maxQuantity ?? "")
                              }}
                              className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLevelId(stock.id)
                              setLevelEditMin(stock.minQuantity)
                              setLevelEditMax(stock.maxQuantity ?? "")
                            }}
                            className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-600 dark:text-white hover:bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600"
                          >
                            Editar mín/máx
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {/* Total row */}
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                    {formatNumber(totalStock)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------- Bottom grid: Movements + Alerts -------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Historial de Movimientos */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Historial de Movimientos
            </h3>
          </div>

          {movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-white">
              No hay movimientos registrados para este producto
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Fecha / Hora
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Cantidad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Local que sumó / restó
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Referencia
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Usuario
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => {
                    const typeConfig = movementTypeConfig[movement.type] || {
                      label: movement.type,
                      style: "bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
                    }
                    const isPositive = movement.quantity > 0
                    const locationLabel = movement.locationName
                      ? isPositive
                        ? `Sumó: ${movement.locationName}`
                        : `Restó: ${movement.locationName}`
                      : null

                    return (
                      <tr
                        key={movement.id}
                        className="border-b border-gray-100 dark:border-gray-700"
                      >
                        <td className="px-4 py-3 text-sm tabular-nums text-gray-600 dark:text-white">
                          {formatDateTime(movement.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              typeConfig.style
                            )}
                          >
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums",
                              isPositive
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            )}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                            {isPositive ? "+" : ""}
                            {formatNumber(movement.quantity)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-white">
                          {locationLabel ?? (
                            <Minus className="h-3.5 w-3.5 text-gray-300 dark:text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-white">
                          {movement.notes ?? (
                            <Minus className="h-3.5 w-3.5 text-gray-300 dark:text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-white">
                          {movement.userName}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alertas Activas */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Alertas Activas
            </h3>
          </div>

          <div className="space-y-3">
            {product.worstStatus === "critical" ||
            product.worstStatus === "medium" ? (
              aiAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    severityBorder[alert.severity]
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-base leading-none">
                      {severityIcon[alert.severity]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {alert.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-300">
                        {alert.message}
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        {alert.action} &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/40">
                  <AlertTriangle className="h-5 w-5 text-green-500 dark:text-green-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                  Sin alertas activas
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">
                  El stock de este producto se encuentra en niveles normales
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
