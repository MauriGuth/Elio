"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import { Search, Plus, Package, RefreshCw, X, Loader2, Pencil, Trash2, CheckSquare, Download } from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { productsApi } from "@/lib/api/products"
import { categoriesApi } from "@/lib/api/categories"
import { locationsApi } from "@/lib/api/locations"
import { stockApi } from "@/lib/api/stock"
import {
  cn,
  formatCurrency,
  formatNumber,
  getStockStatus,
  getStockStatusLabel,
  getStockStatusColor,
  getCategoryBadgeStyle,
} from "@/lib/utils"
import type { StockStatus } from "@/types"
import { downloadCsv } from "@/lib/csv-download"

// ---------- helpers ----------

const statusDotColor: Record<string, string> = {
  critical: "bg-red-500",
  medium: "bg-yellow-500",
  normal: "bg-green-500",
  excess: "bg-purple-500",
}

const allStatuses: { value: StockStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "critical", label: "Crítico" },
  { value: "medium", label: "Medio" },
  { value: "normal", label: "Normal" },
  { value: "excess", label: "Exceso" },
]

/** Quita prefijos "Tipo:", "Familia:", "Subfamilia:", "Agrupar:" del nombre de categoría para mostrar solo el valor. */
function getCategoryDisplayName(name: string | null | undefined): string {
  if (!name) return ""
  return name.replace(/^(Tipo|Familia|Subfamilia|Agrupar):\s*/i, "").trim() || name
}

function renameCategoryPreservingPrefix(originalName: string, nextDisplayName: string): string {
  const prefixMatch = originalName.match(/^(Tipo|Familia|Subfamilia|Agrupar):\s*/i)
  return prefixMatch ? `${prefixMatch[1]}: ${nextDisplayName}` : nextDisplayName
}

// ---------- API → UI mapping ----------

interface ApiStockLevel {
  id: string
  productId: string
  locationId: string
  quantity: number
  minQuantity: number
  maxQuantity: number
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
  preparationSector?: string | null
  isActive: boolean
  category: {
    id: string
    name: string
    slug: string
    icon: string
    color: string
    isActive: boolean
  } | null
  stockLevels: ApiStockLevel[]
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
  category: {
    id: string
    name: string
    slug: string
    icon: string
    color: string
  } | null
  stockByLocation: Array<{
    locationId: string
    locationName: string
    quantity: number
    minQuantity: number
    maxQuantity?: number
    status: StockStatus
  }>
  totalStock: number
  worstStatus: StockStatus
  preparationSector?: string | null
  isSellable: boolean
}

type NewProductForm = {
  sku: string
  name: string
  categoryId: string
  familia: string
  subfamilia: string
  locationIds: string[]
  unit: string
  imageUrl: string
  avgCost: number
  salePrice: number
  /** Precio de venta por local (locationId -> precio). Si no se define, se usa salePrice. */
  salePriceByLocation: Record<string, number>
  isSellable: boolean
  isIngredient: boolean
  isPerishable: boolean
  /** "" = automático en POS */
  preparationSector: string
}

type ManagedCategoryGroup = {
  key: string
  displayName: string
  items: Array<{
    id: string
    name: string
    slug: string
    color: string
  }>
}

/** Comanda / KDS: cafetería POS muestra café + bar + panadería. */
const PREPARATION_SECTOR_FORM_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Automático (por categoría y nombre)" },
  { value: "kitchen", label: "Cocina" },
  { value: "coffee", label: "Cafetería / café" },
  { value: "bar", label: "Bar" },
  { value: "bakery", label: "Panadería" },
]

function processProduct(p: ApiProduct): ProcessedProduct {
  const stockByLocation = (p.stockLevels || []).map((sl) => {
    const status = getStockStatus(
      sl.quantity,
      sl.minQuantity,
      sl.maxQuantity || undefined
    ) as StockStatus
    return {
      locationId: sl.location?.id || sl.locationId,
      locationName: sl.location?.name || "Sin ubicación",
      quantity: sl.quantity,
      minQuantity: sl.minQuantity,
      maxQuantity: sl.maxQuantity || undefined,
      status,
    }
  })

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
    avgCost: p.avgCost,
    category: p.category,
    stockByLocation,
    totalStock,
    worstStatus,
    preparationSector: p.preparationSector ?? null,
    isSellable: p.isSellable ?? false,
  }
}

// ---------- loading skeleton ----------

function TableSkeleton() {
  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
        <div className="h-3 w-14 rounded bg-gray-200" />
        <div className="h-3 w-40 rounded bg-gray-200" />
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-3 w-12 rounded bg-gray-200" />
        <div className="ml-auto h-3 w-20 rounded bg-gray-200" />
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
      {/* Data rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-gray-100 px-4 py-3"
        >
          <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-36 rounded bg-gray-100 animate-pulse flex-1 min-w-0" />
          <div className="h-5 w-24 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-4 w-8 rounded bg-gray-100 animate-pulse" />
          <div className="ml-auto h-4 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-14 rounded bg-gray-100 animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function StatsBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
        </div>
      ))}
      <div className="ml-auto h-3 w-28 rounded bg-gray-200 animate-pulse" />
    </div>
  )
}

// ---------- unit options ----------

const unitOptions = [
  { value: "unidad", label: "Unidad" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "litro", label: "Litro" },
  { value: "gramo", label: "Gramo" },
  { value: "ml", label: "Mililitro (ml)" },
]

// ---------- main page ----------

export default function StockPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [selectedFamilia, setSelectedFamilia] = useState("")
  const [selectedSubfamilia, setSelectedSubfamilia] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<StockStatus | "">("")
  const [selectedLocation, setSelectedLocation] = useState("")

  // Data state
  const [products, setProducts] = useState<ProcessedProduct[]>([])
  const [productsTotal, setProductsTotal] = useState(0)
  const [categories, setCategories] = useState<
    Array<{
      id: string
      name: string
      slug: string
      icon: string
      color: string
      parentId?: string | null
    }>
  >([])
  const [locations, setLocations] = useState<
    Array<{ id: string; name: string; type?: string }>
  >([])
  const [summary, setSummary] = useState<{
    critical: number
    medium: number
    normal: number
    totalProducts: number
    totalValue: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Nueva categoría modal
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState("")
  // Gestionar categorías (editar / eliminar)
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ManagedCategoryGroup | null>(null)
  const [editCategoryName, setEditCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<ManagedCategoryGroup | null>(null)
  const [deletingCategory, setDeletingCategory] = useState(false)
  // Nueva familia / Gestionar familias (categorías con slug familia-*)
  const [showFamiliaModal, setShowFamiliaModal] = useState(false)
  const [newFamiliaName, setNewFamiliaName] = useState("")
  const [creatingFamilia, setCreatingFamilia] = useState(false)
  const [familiaError, setFamiliaError] = useState<string | null>(null)
  const [showManageFamiliasModal, setShowManageFamiliasModal] = useState(false)
  const [editingFamilia, setEditingFamilia] = useState<{ id: string; name: string } | null>(null)
  const [editFamiliaName, setEditFamiliaName] = useState("")
  const [savingFamilia, setSavingFamilia] = useState(false)
  const [deleteConfirmFamiliaId, setDeleteConfirmFamiliaId] = useState<string | null>(null)
  const [deletingFamilia, setDeletingFamilia] = useState(false)
  const [showSubfamiliaModal, setShowSubfamiliaModal] = useState(false)
  const [newSubfamiliaName, setNewSubfamiliaName] = useState("")
  const [newSubfamiliaParentId, setNewSubfamiliaParentId] = useState("")
  const [creatingSubfamilia, setCreatingSubfamilia] = useState(false)
  const [subfamiliaError, setSubfamiliaError] = useState<string | null>(null)
  const [showManageSubfamiliasModal, setShowManageSubfamiliasModal] = useState(false)
  const [editingSubfamilia, setEditingSubfamilia] = useState<{ id: string; name: string } | null>(null)
  const [editSubfamiliaName, setEditSubfamiliaName] = useState("")
  const [savingSubfamilia, setSavingSubfamilia] = useState(false)
  const [deleteConfirmSubfamiliaId, setDeleteConfirmSubfamiliaId] = useState<string | null>(null)
  const [deletingSubfamilia, setDeletingSubfamilia] = useState(false)

  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkEditField, setBulkEditField] = useState<"category" | "familia" | "subfamilia" | "unit" | null>(null)
  const [bulkEditValue, setBulkEditValue] = useState("")
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportIncludeSellable, setExportIncludeSellable] = useState(true)
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  const createEmptyProduct = useCallback(
    (sku = ""): NewProductForm => ({
      sku,
      name: "",
      categoryId: "",
      familia: "",
      subfamilia: "",
      locationIds: [],
      unit: "unidad",
      imageUrl: "",
      avgCost: 0,
      salePrice: 0,
      salePriceByLocation: {},
      isSellable: false,
      isIngredient: false,
      isPerishable: false,
      preparationSector: "",
    }),
    []
  )
  const [newProduct, setNewProduct] = useState<NewProductForm>(() => createEmptyProduct())
  const [newProductImageFile, setNewProductImageFile] = useState<File | null>(null)
  const [newProductImageUploading, setNewProductImageUploading] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)

  const [user, setUser] = useState<{ role?: string } | null>(null)
  useEffect(() => {
    setUser(authApi.getStoredUser())
  }, [])
  const isLogisticsRole =
    user?.role === "LOGISTICS" || user?.role === "logistics"

  // Familias raíz = categorías slug familia-* sin padre (gestión y filtro)
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
      .sort((a, b) => {
        const pa = familias.find((f) => f.id === a.parentId)
        const pb = familias.find((f) => f.id === b.parentId)
        const sa = `${getCategoryDisplayName(pa?.name)} ${getCategoryDisplayName(a.name)}`
        const sb = `${getCategoryDisplayName(pb?.name)} ${getCategoryDisplayName(b.name)}`
        return sa.localeCompare(sb, "es", { sensitivity: "base" })
      })
  }, [categories, familias])

  const filteredSubfamiliasForFilter = useMemo(() => {
    if (!selectedFamilia) return subfamiliasList
    const fam = familias.find((f) => getCategoryDisplayName(f.name) === selectedFamilia)
    if (!fam) return subfamiliasList
    return subfamiliasList.filter((s) => s.parentId === fam.id)
  }, [subfamiliasList, selectedFamilia, familias])

  /** Filtro categoría en grilla: excluye familias, subfamilias y categorías hijas de una familia */
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

  const managedCategoryGroups = useMemo(() => {
    const groups = new Map<string, ManagedCategoryGroup>()
    const rootFamiliaIds = new Set(familias.map((f) => f.id))

    for (const category of categories.filter(
      (c) =>
        !c.slug.startsWith("familia-") &&
        !c.slug.startsWith("subfamilia-") &&
        !(c.parentId && rootFamiliaIds.has(c.parentId))
    )) {
      const displayName = getCategoryDisplayName(category.name)
      const key = displayName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()

      const existing = groups.get(key)
      if (existing) {
        existing.items.push({
          id: category.id,
          name: category.name,
          slug: category.slug,
          color: category.color,
        })
        continue
      }

      groups.set(key, {
        key,
        displayName,
        items: [
          {
            id: category.id,
            name: category.name,
            slug: category.slug,
            color: category.color,
          },
        ],
      })
    }

    return [...groups.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" })
    )
  }, [categories, familias])

  const getNextProdSku = useCallback(async () => {
    const response = await productsApi.getAll({ limit: 5000 })
    const allProducts = Array.isArray((response as any)?.data) ? (response as any).data : []

    const maxProdNumber = allProducts.reduce((max: number, product: { sku?: string }) => {
      const match = product.sku?.match(/^PROD-(\d+)$/)
      const current = match ? Number(match[1]) : 0
      return Math.max(max, current)
    }, 0)

    return `PROD-${String(maxProdNumber + 1).padStart(3, "0")}`
  }, [])

  const closeCreateProductModal = useCallback(() => {
    setShowCreateModal(false)
    setCreateError(null)
    setSkuLoading(false)
    setNewProductImageFile(null)
    setNewProduct(createEmptyProduct())
  }, [createEmptyProduct])

  const openCreateProductModal = useCallback(async () => {
    setCreateError(null)
    setSkuLoading(true)
    setShowCreateModal(true)
    setNewProductImageFile(null)
    setNewProduct(createEmptyProduct())

    try {
      const nextSku = await getNextProdSku()
      setNewProduct(createEmptyProduct(nextSku))
    } catch {
      setCreateError("No se pudo generar el SKU automáticamente")
      setNewProduct(createEmptyProduct())
    } finally {
      setSkuLoading(false)
    }
  }, [createEmptyProduct, getNextProdSku])

  useEffect(() => {
    if (
      selectedCategory &&
      selectedCategory !== "__none__" &&
      !stockRubroCategories.some((category) => category.id === selectedCategory)
    ) {
      setSelectedCategory("")
    }
  }, [selectedCategory, stockRubroCategories])

  useEffect(() => {
    if (
      selectedSubfamilia &&
      selectedSubfamilia !== "__none__" &&
      !filteredSubfamiliasForFilter.some(
        (s) => getCategoryDisplayName(s.name) === selectedSubfamilia
      )
    ) {
      setSelectedSubfamilia("")
    }
  }, [selectedSubfamilia, filteredSubfamiliasForFilter])

  const subfamiliasForNewProduct = useMemo(() => {
    const fam = familias.find((f) => getCategoryDisplayName(f.name) === newProduct.familia)
    if (!fam) return []
    return subfamiliasList.filter((s) => s.parentId === fam.id)
  }, [newProduct.familia, familias, subfamiliasList])

  const hasActiveFilters =
    !!searchQuery ||
    !!selectedStatus ||
    !!selectedLocation ||
    !!selectedCategory ||
    !!selectedFamilia ||
    !!selectedSubfamilia

  const clearFilters = useCallback(() => {
    setSearchQuery("")
    setDebouncedSearch("")
    setSelectedStatus("")
    setSelectedLocation("")
    setSelectedCategory("")
    setSelectedFamilia("")
    setSelectedSubfamilia("")
  }, [])

  // Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteConfirmSubfamiliaId) setDeleteConfirmSubfamiliaId(null)
        else if (editingSubfamilia) setEditingSubfamilia(null)
        else if (deleteConfirmFamiliaId) setDeleteConfirmFamiliaId(null)
        else if (editingFamilia) setEditingFamilia(null)
        else if (deleteConfirmId) setDeleteConfirmId(null)
        else if (editingCategory) setEditingCategory(null)
        else {
          closeCreateProductModal()
          setShowCategoryModal(false)
          setShowManageCategoriesModal(false)
          setShowFamiliaModal(false)
          setShowManageFamiliasModal(false)
          setShowSubfamiliaModal(false)
          setShowManageSubfamiliasModal(false)
        }
      }
    }
    const open =
      showCreateModal ||
      showCategoryModal ||
      showManageCategoriesModal ||
      showFamiliaModal ||
      showManageFamiliasModal ||
      showSubfamiliaModal ||
      showManageSubfamiliasModal ||
      editingCategory ||
      editingFamilia ||
      editingSubfamilia ||
      deleteConfirmId ||
      deleteConfirmFamiliaId ||
      deleteConfirmSubfamiliaId
    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    showCreateModal,
    showCategoryModal,
    showManageCategoriesModal,
    showFamiliaModal,
    showManageFamiliasModal,
    showSubfamiliaModal,
    showManageSubfamiliasModal,
    editingCategory,
    editingFamilia,
    editingSubfamilia,
    deleteConfirmId,
    deleteConfirmFamiliaId,
    deleteConfirmSubfamiliaId,
    closeCreateProductModal,
  ])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const refreshCategories = useCallback(() => {
    categoriesApi
      .getAll({ isActive: true })
      .then((res: any) => {
        const data = Array.isArray(res) ? res : res?.data ?? []
        const mapped = data.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon ?? "",
          color: c.color ?? "",
          parentId: c.parentId ?? null,
        }))
        mapped.sort((a: { name: string }, b: { name: string }) =>
          getCategoryDisplayName(a.name).localeCompare(getCategoryDisplayName(b.name), "es", { sensitivity: "base" })
        )
        setCategories(mapped)
      })
      .catch(() => {})
  }, [])

  // Fetch categories and locations once on mount
  useEffect(() => {
    refreshCategories()

    locationsApi
      .getAll()
      .then((data) => {
        if (Array.isArray(data)) {
          setLocations(
            data.map((l: Record<string, string>) => ({
              id: l.id,
              name: l.name,
              type: l.type,
            }))
          )
        }
      })
      .catch(() => {})
  }, [refreshCategories])

  // Fetch summary (refresh when location filter changes)
  useEffect(() => {
    stockApi
      .getSummary(selectedLocation || undefined)
      .then(setSummary)
      .catch(() => {})
  }, [selectedLocation])

  // Fetch products when API-supported filters change
  const fetchProducts = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number | boolean> = { limit: 5000 }
      if (debouncedSearch) params.search = debouncedSearch
      if (selectedCategory === "__none__") params.categoryId = "none"
      else if (selectedCategory) params.categoryId = selectedCategory
      if (selectedFamilia === "__none__") params.familia = "none"
      else if (selectedFamilia) params.familia = selectedFamilia
      if (selectedSubfamilia === "__none__") params.subfamilia = "none"
      else if (selectedSubfamilia) params.subfamilia = selectedSubfamilia
      if (forceRefresh) params._refresh = Date.now()

      const response = await productsApi.getAll(params)
      const processed = (response.data || [])
        .map(processProduct)
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      setProducts(processed)
      setProductsTotal(response.total ?? processed.length)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar productos"
      setError(msg)
      setProductsTotal(0)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, selectedCategory, selectedFamilia, selectedSubfamilia])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Client-side filters (status, location — not supported as API params)
  const filteredProducts = useMemo(() => {
    const searchActive = Boolean(debouncedSearch?.trim())
    return products.filter((product) => {
      if (selectedStatus && product.worstStatus !== selectedStatus) return false
      // Con búsqueda por texto: no filtrar por local (si no, artículos sin fila en ese depósito no aparecen)
      if (
        selectedLocation &&
        !searchActive &&
        !product.stockByLocation.some(
          (s) => s.locationId === selectedLocation
        )
      ) {
        return false
      }
      return true
    })
  }, [products, selectedStatus, selectedLocation, debouncedSearch])

  const displayedProductsTotal =
    selectedStatus || selectedLocation ? filteredProducts.length : productsTotal

  // Stats: use API summary when no filters active, otherwise compute locally
  const stats = useMemo(() => {
    if (
      summary &&
      !selectedStatus &&
      !selectedLocation &&
      !debouncedSearch &&
      !selectedCategory &&
      !selectedFamilia &&
      !selectedSubfamilia
    ) {
      return {
        critical: summary.critical,
        medium: summary.medium,
        normal: summary.normal,
        excess: Math.max(
          0,
          summary.totalProducts -
            summary.critical -
            summary.medium -
            summary.normal
        ),
      }
    }
    const counts = { critical: 0, medium: 0, normal: 0, excess: 0 }
    for (const p of filteredProducts) {
      if (p.worstStatus in counts) {
        counts[p.worstStatus as keyof typeof counts]++
      }
    }
    return counts
  }, [
    summary,
    filteredProducts,
    selectedStatus,
    selectedLocation,
    debouncedSearch,
    selectedCategory,
    selectedFamilia,
    selectedSubfamilia,
  ])

  // Handle create product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      if (newProduct.locationIds.length === 0) {
        setCreateError("Seleccioná al menos una ubicación para el producto")
        setCreating(false)
        return
      }

      let imageUrl = newProduct.imageUrl || undefined
      if (newProductImageFile) {
        setNewProductImageUploading(true)
        const res = await productsApi.uploadImage(newProductImageFile)
        imageUrl = (res as any)?.url ?? (res as any)?.data?.url ?? ""
        setNewProductImageUploading(false)
      }
      const salePriceByLocation: Record<string, number> = {}
      newProduct.locationIds.forEach((locId) => {
        const custom = newProduct.salePriceByLocation[locId]
        salePriceByLocation[locId] =
          custom != null && Number(custom) >= 0 ? Number(custom) : (newProduct.salePrice || 0)
      })
      await productsApi.create({
        ...newProduct,
        imageUrl: imageUrl || undefined,
        familia: newProduct.familia || undefined,
        subfamilia: newProduct.subfamilia?.trim() || undefined,
        preparationSector: newProduct.preparationSector || undefined,
        salePriceByLocation: newProduct.locationIds.length > 0 ? salePriceByLocation : undefined,
      })
      closeCreateProductModal()
      await fetchProducts(true)
      sileo.success({ title: "Producto creado correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al crear el producto"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
      setNewProductImageUploading(false)
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name || name.length < 2) {
      setCategoryError("El nombre debe tener al menos 2 caracteres")
      return
    }
    setCreatingCategory(true)
    setCategoryError(null)
    try {
      await categoriesApi.create({ name })
      setShowCategoryModal(false)
      setNewCategoryName("")
      refreshCategories()
      sileo.success({ title: "Categoría creada" })
    } catch (err: any) {
      const msg = err.message || "Error al crear la categoría"
      setCategoryError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCategory) return
    const name = editCategoryName.trim()
    if (name.length < 2) return
    setSavingCategory(true)
    setCategoryError(null)
    try {
      await Promise.all(
        editingCategory.items.map((item) =>
          categoriesApi.update(item.id, {
            name: renameCategoryPreservingPrefix(item.name, name),
          })
        )
      )
      setEditingCategory(null)
      setEditCategoryName("")
      refreshCategories()
      sileo.success({
        title:
          editingCategory.items.length > 1
            ? "Categorías duplicadas unificadas"
            : "Categoría actualizada",
      })
    } catch (err: any) {
      const msg = err.message || "Error al actualizar"
      setCategoryError(msg)
      sileo.error({ title: msg })
    } finally {
      setSavingCategory(false)
    }
  }

  // ---------- Bulk selection handlers ----------

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback((filteredProducts: { id: string }[]) => {
    setSelectedIds((prev) => {
      const allIds = filteredProducts.map((p) => p.id)
      const allSelected = allIds.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(allIds)
    })
  }, [])

  const BULK_EDIT_PICK = "__pick__"

  const openBulkEdit = useCallback((field: "category" | "familia" | "subfamilia" | "unit") => {
    setBulkEditField(field)
    setBulkEditValue(BULK_EDIT_PICK)
    setShowBulkEditModal(true)
  }, [])

  const handleBulkEdit = async () => {
    if (!bulkEditField || bulkEditValue === BULK_EDIT_PICK) return
    if ((bulkEditField === "category" || bulkEditField === "unit") && !bulkEditValue) return
    setBulkProcessing(true)
    try {
      const payload: Record<string, string | null> =
        bulkEditField === "category"
          ? { categoryId: bulkEditValue }
          : bulkEditField === "familia"
          ? { familia: bulkEditValue.trim() || null }
          : bulkEditField === "subfamilia"
          ? { subfamilia: bulkEditValue.trim() || null }
          : { unit: bulkEditValue }

      await Promise.all([...selectedIds].map((id) => productsApi.update(id, payload)))
      sileo.success({ title: `${selectedIds.size} producto${selectedIds.size !== 1 ? "s" : ""} actualizado${selectedIds.size !== 1 ? "s" : ""}` })
      setShowBulkEditModal(false)
      fetchProducts(true)
    } catch (err: any) {
      sileo.error({ title: err.message || "Error al actualizar" })
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleBulkDelete = async () => {
    setBulkProcessing(true)
    try {
      await Promise.all([...selectedIds].map((id) => productsApi.delete(id)))
      sileo.success({ title: `${selectedIds.size} producto${selectedIds.size !== 1 ? "s" : ""} eliminado${selectedIds.size !== 1 ? "s" : ""}` })
      setBulkDeleteConfirm(false)
      setSelectedIds(new Set())
      fetchProducts(true)
    } catch (err: any) {
      sileo.error({ title: err.message || "Error al eliminar" })
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleBulkSellable = async (isSellable: boolean) => {
    setBulkProcessing(true)
    try {
      await Promise.all(
        [...selectedIds].map((id) => productsApi.update(id, { isSellable })),
      )
      sileo.success({
        title: `${selectedIds.size} producto${selectedIds.size !== 1 ? "s" : ""} ${isSellable ? "marcados como vendibles" : "marcados como no vendibles"}`,
      })
      fetchProducts(true)
    } catch (err: any) {
      sileo.error({ title: err.message || "Error al actualizar vendible" })
    } finally {
      setBulkProcessing(false)
    }
  }

  const runSelectedProductsExport = () => {
    const list = products.filter((p) => selectedIds.has(p.id))
    if (list.length === 0) return
    const headers = [
      "SKU",
      "Producto",
      ...(exportIncludeSellable ? ["Vendible"] : []),
      "Categoría",
      "Familia",
      "Subfamilia",
      "Unidad",
      "Costo promedio",
      "Stock total",
      "Estado",
    ]
    const rows = list.map((p) => {
      return [
        p.sku,
        p.name,
        ...(exportIncludeSellable ? [p.isSellable ? "Sí" : "No"] : []),
        getCategoryDisplayName(p.category?.name) || "",
        p.familia ?? "",
        p.subfamilia ?? "",
        p.unit,
        p.avgCost,
        p.totalStock,
        getStockStatusLabel(p.worstStatus),
      ]
    })
    const d = new Date()
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    downloadCsv(`productos-seleccionados-${ymd}.csv`, headers, rows)
    setShowExportModal(false)
    sileo.success({ title: `Listado descargado (${list.length} filas)` })
  }

  const handleDeleteCategory = async (group: ManagedCategoryGroup) => {
    setDeletingCategory(true)
    setCategoryError(null)
    try {
      await Promise.all(group.items.map((item) => categoriesApi.delete(item.id)))
      setDeleteConfirmId(null)
      refreshCategories()
      sileo.success({
        title:
          group.items.length > 1 ? "Categorías duplicadas eliminadas" : "Categoría eliminada",
      })
    } catch (err: any) {
      const msg = err.message || "Error al eliminar"
      setCategoryError(msg)
      sileo.error({ title: msg })
    } finally {
      setDeletingCategory(false)
    }
  }

  const handleCreateFamilia = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = newFamiliaName.trim()
    if (!value || value.length < 2) {
      setFamiliaError("El nombre debe tener al menos 2 caracteres")
      return
    }
    setCreatingFamilia(true)
    setFamiliaError(null)
    try {
      await categoriesApi.create({ name: `Familia: ${value}` })
      setShowFamiliaModal(false)
      setNewFamiliaName("")
      refreshCategories()
      sileo.success({ title: "Familia creada" })
    } catch (err: any) {
      const msg = err.message || "Error al crear la familia"
      setFamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreatingFamilia(false)
    }
  }

  const handleUpdateFamilia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingFamilia) return
    const value = editFamiliaName.trim()
    if (value.length < 2) return
    setSavingFamilia(true)
    setFamiliaError(null)
    try {
      await categoriesApi.update(editingFamilia.id, { name: `Familia: ${value}` })
      setEditingFamilia(null)
      setEditFamiliaName("")
      refreshCategories()
      sileo.success({ title: "Familia actualizada" })
    } catch (err: any) {
      const msg = err.message || "Error al actualizar"
      setFamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setSavingFamilia(false)
    }
  }

  const handleDeleteFamilia = async (id: string) => {
    setDeletingFamilia(true)
    setFamiliaError(null)
    try {
      await categoriesApi.delete(id)
      setDeleteConfirmFamiliaId(null)
      refreshCategories()
      sileo.success({ title: "Familia eliminada" })
    } catch (err: any) {
      const msg = err.message || "Error al eliminar"
      setFamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setDeletingFamilia(false)
    }
  }

  const handleCreateSubfamilia = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = newSubfamiliaName.trim()
    if (!value || value.length < 2) {
      setSubfamiliaError("El nombre debe tener al menos 2 caracteres")
      return
    }
    if (!newSubfamiliaParentId) {
      setSubfamiliaError("Seleccioná la familia padre")
      return
    }
    setCreatingSubfamilia(true)
    setSubfamiliaError(null)
    try {
      await categoriesApi.create({
        name: `Subfamilia: ${value}`,
        parentId: newSubfamiliaParentId,
      })
      setShowSubfamiliaModal(false)
      setNewSubfamiliaName("")
      setNewSubfamiliaParentId("")
      refreshCategories()
      sileo.success({ title: "Subfamilia creada" })
    } catch (err: any) {
      const msg = err.message || "Error al crear la subfamilia"
      setSubfamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreatingSubfamilia(false)
    }
  }

  const handleUpdateSubfamilia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSubfamilia) return
    const value = editSubfamiliaName.trim()
    if (value.length < 2) return
    setSavingSubfamilia(true)
    setSubfamiliaError(null)
    try {
      await categoriesApi.update(editingSubfamilia.id, { name: `Subfamilia: ${value}` })
      setEditingSubfamilia(null)
      setEditSubfamiliaName("")
      refreshCategories()
      sileo.success({ title: "Subfamilia actualizada" })
    } catch (err: any) {
      const msg = err.message || "Error al actualizar"
      setSubfamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setSavingSubfamilia(false)
    }
  }

  const handleDeleteSubfamilia = async (id: string) => {
    setDeletingSubfamilia(true)
    setSubfamiliaError(null)
    try {
      await categoriesApi.delete(id)
      setDeleteConfirmSubfamiliaId(null)
      refreshCategories()
      sileo.success({ title: "Subfamilia eliminada" })
    } catch (err: any) {
      const msg = err.message || "Error al eliminar"
      setSubfamiliaError(msg)
      sileo.error({ title: msg })
    } finally {
      setDeletingSubfamilia(false)
    }
  }

  // ---------- error state (no products loaded at all) ----------

  if (error && products.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Productos y Stock
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
              Gestiona el inventario de todos tus productos
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
            <Package className="h-7 w-7 text-red-400" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            Error al cargar productos
          </h2>
          <p className="mt-1 max-w-sm text-center text-sm text-gray-500 dark:text-gray-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void fetchProducts(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Productos y Stock
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">
            Gestiona el inventario de todos tus productos
          </p>
        </div>
        {!isLogisticsRole && (
          <button
            type="button"
            onClick={() => {
              void openCreateProductModal()
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        )}
      </div>

      {/* -------- Filters -------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white" />
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Status */}
        <select
          aria-label="Filtrar por estado de stock"
          value={selectedStatus}
          onChange={(e) =>
            setSelectedStatus(e.target.value as StockStatus | "")
          }
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {allStatuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Location */}
        <select
          aria-label="Filtrar por ubicación"
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las ubicaciones</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Category (al lado de ubicaciones) */}
        <select
          aria-label="Filtrar por categoría"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las categorías</option>
          <option value="__none__">— Sin categoría</option>
          {stockRubroCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {getCategoryDisplayName(cat.name)}
            </option>
          ))}
        </select>

        {/* Familia */}
        <select
          aria-label="Filtrar por familia"
          value={selectedFamilia}
          onChange={(e) => {
            setSelectedFamilia(e.target.value)
            setSelectedSubfamilia("")
          }}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las familias</option>
          <option value="__none__">— Sin familia</option>
          {familias.map((cat) => (
            <option key={cat.id} value={getCategoryDisplayName(cat.name)}>
              {getCategoryDisplayName(cat.name)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por subfamilia"
          value={selectedSubfamilia}
          onChange={(e) => setSelectedSubfamilia(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las subfamilias</option>
          <option value="__none__">— Sin subfamilia</option>
          {filteredSubfamiliasForFilter.map((cat) => {
            const parent = familias.find((f) => f.id === cat.parentId)
            const label = parent
              ? `${getCategoryDisplayName(parent.name)} · ${getCategoryDisplayName(cat.name)}`
              : getCategoryDisplayName(cat.name)
            return (
              <option key={cat.id} value={getCategoryDisplayName(cat.name)}>
                {label}
              </option>
            )
          })}
        </select>

        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Limpiar filtros
        </button>

        {!isLogisticsRole && (
          <>
            <button
              type="button"
              onClick={() => { setCategoryError(null); setShowCategoryModal(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
              Nueva categoría
            </button>
            <button
              type="button"
              onClick={() => { setCategoryError(null); setDeleteConfirmId(null); setEditingCategory(null); setShowManageCategoriesModal(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Pencil className="h-4 w-4" />
              Gestionar categorías
            </button>
            <button
              type="button"
              onClick={() => { setFamiliaError(null); setShowFamiliaModal(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
              Nueva familia
            </button>
            <button
              type="button"
              onClick={() => { setFamiliaError(null); setDeleteConfirmFamiliaId(null); setEditingFamilia(null); setShowManageFamiliasModal(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Pencil className="h-4 w-4" />
              Gestionar familias
            </button>
            <button
              type="button"
              onClick={() => {
                setSubfamiliaError(null)
                setNewSubfamiliaParentId(familias[0]?.id ?? "")
                setShowSubfamiliaModal(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
              Nueva subfamilia
            </button>
            <button
              type="button"
              onClick={() => {
                setSubfamiliaError(null)
                setDeleteConfirmSubfamiliaId(null)
                setEditingSubfamilia(null)
                setShowManageSubfamiliasModal(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Pencil className="h-4 w-4" />
              Gestionar subfamilias
            </button>
          </>
        )}
      </div>

      {selectedLocation && (
        <p className="text-sm text-gray-600 dark:text-white">
          Mostrando productos y stock en:{" "}
          <span className="font-medium text-gray-900 dark:text-white">
            {locations.find((l) => l.id === selectedLocation)?.name ?? "Ubicación"}
          </span>
        </p>
      )}

      {/* -------- Stats bar -------- */}
      {loading && !products.length ? (
        <StatsBarSkeleton />
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-600 dark:text-white">
          {(["critical", "medium", "normal", "excess"] as const).map(
            (status) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    statusDotColor[status]
                  )}
                />
                <span className="font-medium tabular-nums">
                  {stats[status]}
                </span>{" "}
                {getStockStatusLabel(status).toLowerCase()}
              </span>
            )
          )}
          <span className="ml-auto text-xs text-gray-400 dark:text-white">
            {displayedProductsTotal} producto
            {displayedProductsTotal !== 1 ? "s" : ""} en total
          </span>
        </div>
      )}

      {/* -------- Bulk action bar -------- */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-4 py-3">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap gap-2 ml-2">
            <button
              type="button"
              onClick={() => openBulkEdit("category")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50"
            >
              <Pencil className="h-3 w-3" /> Cambiar categoría
            </button>
            <button
              type="button"
              onClick={() => openBulkEdit("familia")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50"
            >
              <Pencil className="h-3 w-3" /> Cambiar familia
            </button>
            <button
              type="button"
              onClick={() => openBulkEdit("subfamilia")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50"
            >
              <Pencil className="h-3 w-3" /> Cambiar subfamilia
            </button>
            <button
              type="button"
              onClick={() => openBulkEdit("unit")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50"
            >
              <Pencil className="h-3 w-3" /> Cambiar unidad
            </button>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={bulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 disabled:opacity-50"
            >
              <Download className="h-3 w-3" /> Descargar listado
            </button>
            <button
              type="button"
              onClick={() => void handleBulkSellable(true)}
              disabled={bulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
            >
              Marcar vendible
            </button>
            <button
              type="button"
              onClick={() => void handleBulkSellable(false)}
              disabled={bulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
            >
              Marcar no vendible
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-500 dark:text-blue-400 hover:underline"
          >
            Deseleccionar todo
          </button>
        </div>
      )}

      {/* -------- Table -------- */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {loading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-blue-600 cursor-pointer"
                      checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))}
                      onChange={() => toggleSelectAll(filteredProducts)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th className="w-14 px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Foto
                  </th>
                  <th className="w-24 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    SKU
                  </th>
                  <th className="min-w-[200px] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Producto
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Categoría
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Familia
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Subfamilia
                  </th>
                  <th className="w-20 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Unidad
                  </th>
                  <th className="w-28 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Costo Prom.
                  </th>
                  <th className="w-24 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Stock
                  </th>
                  <th className="w-28 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const locStock = selectedLocation
                    ? product.stockByLocation.find(
                        (s) => s.locationId === selectedLocation
                      )
                    : null
                  const displayQty = locStock != null ? locStock.quantity : product.totalStock
                  const displayStatus = locStock != null ? locStock.status : product.worstStatus
                  return (
                  <tr
                    key={product.id}
                    onClick={() => router.push(`/stock/${product.id}`)}
                    className={cn(
                      "border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer",
                      selectedIds.has(product.id) && "bg-blue-50 dark:bg-blue-900/20"
                    )}
                  >
                      <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-blue-600 cursor-pointer"
                          checked={selectedIds.has(product.id)}
                          onChange={(e) => toggleSelect(product.id, e as any)}
                        />
                      </td>
                      <td className="px-2 py-3 align-middle">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl.startsWith("http") ? product.imageUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${product.imageUrl}`}
                            alt=""
                            className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-600 object-cover bg-gray-50 dark:bg-gray-700"
                          />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400">
                            {product.category?.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate block">
                          {product.sku}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">
                          {product.name}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {product.category ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                            style={getCategoryBadgeStyle(product.category.color)}
                          >
                            {getCategoryDisplayName(product.category.name)}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {product.familia && familias.some((f) => getCategoryDisplayName(f.name) === product.familia) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {product.familia}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {product.subfamilia &&
                        subfamiliasList.some((s) => getCategoryDisplayName(s.name) === product.subfamilia) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                            {product.subfamilia}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-sm text-gray-600 dark:text-gray-300">
                        {product.unit}
                      </td>
                      <td className="px-3 py-3 align-middle text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCurrency(product.avgCost)}
                      </td>
                      <td className="px-3 py-3 align-middle text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {formatNumber(displayQty)}
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                            getStockStatusColor(displayStatus)
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              statusDotColor[displayStatus]
                            )}
                          />
                          {getStockStatusLabel(displayStatus)}
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {filteredProducts.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-400"
                    >
                      <Package className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-500" />
                      No se encontraron productos con los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {filteredProducts.length > 0 && !loading && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Mostrando{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">1</span>-
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {filteredProducts.length}
              </span>{" "}
              de{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {displayedProductsTotal}
              </span>{" "}
              productos
            </p>
          </div>
        )}
      </div>

      {/* -------- Create Product Modal -------- */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCreateProductModal}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nuevo Producto
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeCreateProductModal}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateProduct}>
              <div className="space-y-4 px-6 py-5">
                {createError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {createError}
                  </div>
                )}

                {/* SKU */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    SKU <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.sku}
                    readOnly
                    placeholder={skuLoading ? "Generando SKU..." : "Ej: PROD-001"}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProduct.name}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, name: e.target.value })
                    }
                    placeholder="Nombre del producto"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Foto del artículo */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Foto del artículo
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <span className="sr-only">Elegir imagen</span>
                      {newProductImageFile ? newProductImageFile.name : "Elegir imagen (jpg, png, webp)"}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.gif"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          setNewProductImageFile(f ?? null)
                          if (f) setNewProduct((p) => ({ ...p, imageUrl: "" }))
                        }}
                      />
                    </label>
                    {(newProduct.imageUrl || newProductImageFile) && (
                      <div className="flex items-center gap-2">
                        {newProductImageFile ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Se subirá al crear
                          </span>
                        ) : newProduct.imageUrl ? (
                          <img
                            src={newProduct.imageUrl.startsWith("http") ? newProduct.imageUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${newProduct.imageUrl}`}
                            alt="Vista previa"
                            className="h-14 w-14 rounded border border-gray-200 object-cover"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setNewProductImageFile(null)
                            setNewProduct((p) => ({ ...p, imageUrl: "" }))
                          }}
                          className="text-xs text-red-600 dark:text-red-400 hover:underline"
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                  {newProductImageUploading && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Subiendo imagen...</p>
                  )}
                </div>

                {/* Category + Familia + Subfamilia + Unit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Categoría (tipo)
                    </label>
                    <select
                      aria-label="Categoría"
                      value={newProduct.categoryId}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, categoryId: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar...</option>
                      {stockRubroCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {getCategoryDisplayName(cat.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Familia
                    </label>
                    <select
                      aria-label="Familia"
                      value={newProduct.familia}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          familia: e.target.value,
                          subfamilia: "",
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar...</option>
                      {familias.map((familia) => (
                        <option key={familia.id} value={getCategoryDisplayName(familia.name)}>
                          {getCategoryDisplayName(familia.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Subfamilia
                    </label>
                    <select
                      aria-label="Subfamilia"
                      value={newProduct.subfamilia}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, subfamilia: e.target.value })
                      }
                      disabled={!newProduct.familia || subfamiliasForNewProduct.length === 0}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">
                        {!newProduct.familia
                          ? "Elegí primero una familia"
                          : subfamiliasForNewProduct.length === 0
                            ? "Sin subfamilias en esta familia"
                            : "Opcional"}
                      </option>
                      {subfamiliasForNewProduct.map((sf) => (
                        <option key={sf.id} value={getCategoryDisplayName(sf.name)}>
                          {getCategoryDisplayName(sf.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Unidad
                    </label>
                    <select
                      aria-label="Unidad"
                      value={newProduct.unit}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, unit: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {unitOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Destino de comanda (cocina / cafetería / bar / panadería)
                  </label>
                  <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                    La pantalla <strong>Cafetería</strong> del POS agrupa café, bar y panadería. <strong>Cocina</strong> solo muestra platos de cocina.
                  </p>
                  <select
                    aria-label="Destino de comanda"
                    value={newProduct.preparationSector}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, preparationSector: e.target.value })
                    }
                    className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {PREPARATION_SECTOR_FORM_OPTIONS.map((o) => (
                      <option key={o.value || "auto"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Locations */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Ubicaciones <span className="text-red-500">*</span>
                  </label>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {locations
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                        .map((location) => {
                          const checked = newProduct.locationIds.includes(location.id)
                          return (
                            <label
                              key={location.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setNewProduct((current) => ({
                                    ...current,
                                    locationIds: e.target.checked
                                      ? [...current.locationIds, location.id]
                                      : current.locationIds.filter((id) => id !== location.id),
                                  }))
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

                {/* Costo promedio */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Costo Promedio
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.avgCost || ""}
                    onChange={(e) =>
                      setNewProduct({
                        ...newProduct,
                        avgCost: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Precio por local */}
                {newProduct.locationIds.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                      Precio por local
                    </label>
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                      Precio de venta en cada local.
                    </p>
                    <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                      {locations
                        .filter((loc) => newProduct.locationIds.includes(loc.id))
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
                                min="0"
                                step="0.01"
                                value={newProduct.salePriceByLocation[location.id] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value
                                  const num = v === "" ? undefined : parseFloat(v)
                                  setNewProduct((prev) => ({
                                    ...prev,
                                    salePriceByLocation: {
                                      ...prev.salePriceByLocation,
                                      [location.id]: num ?? 0,
                                    },
                                  }))
                                }}
                                placeholder="0"
                                className="w-24 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-center tabular-nums text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                aria-label={`Precio en ${location.name}`}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Checkboxes */}
                <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={newProduct.isSellable}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, isSellable: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Vendible <span className="text-xs text-gray-500 dark:text-gray-400">(para que aparezca en Mesas/comandas)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={newProduct.isIngredient}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, isIngredient: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Ingrediente
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={newProduct.isPerishable}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, isPerishable: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Perecedero
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={closeCreateProductModal}
                  disabled={creating || skuLoading}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || skuLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {(creating || skuLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {skuLoading ? "Generando SKU..." : creating ? "Creando..." : "Crear Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Nueva Categoría Modal -------- */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCategoryModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Nueva Categoría
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowCategoryModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory}>
              <div className="space-y-4 px-6 py-5">
                {categoryError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {categoryError}
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Ej: Bebidas, Panadería"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    El icono y el color se asignan automáticamente.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  disabled={creatingCategory}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingCategory && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creatingCategory ? "Creando..." : "Crear Categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Gestionar categorías Modal -------- */}
      {showManageCategoriesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!editingCategory && !deleteConfirmId) setShowManageCategoriesModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Gestionar categorías
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowManageCategoriesModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {categoryError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {categoryError}
                </div>
              )}
              <ul className="space-y-1">
                {managedCategoryGroups.map((cat) => (
                  <li
                    key={cat.key}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-2 text-sm text-gray-900 dark:text-white truncate min-w-0"
                        style={getCategoryBadgeStyle(cat.items[0]?.color || "")}
                      >
                        <span className="truncate">{cat.displayName}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmId(null)
                            setEditingCategory(cat)
                            setEditCategoryName(cat.displayName)
                            setCategoryError(null)
                          }}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(null)
                            setEditCategoryName("")
                            setDeleteConfirmId(cat)
                            setCategoryError(null)
                          }}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-red-600 dark:hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {editingCategory?.key === cat.key ? (
                      <form onSubmit={handleUpdateCategory} className="mt-3 space-y-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-white">Editar categoría</p>
                        <input
                          type="text"
                          value={editCategoryName}
                          onChange={(e) => setEditCategoryName(e.target.value)}
                          placeholder="Nombre"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategory(null)
                              setEditCategoryName("")
                            }}
                            disabled={savingCategory}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingCategory || editCategoryName.trim().length < 2}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Guardar
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {deleteConfirmId?.key === cat.key ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
                        <span className="text-sm text-amber-800 dark:text-amber-200">
                          ¿Eliminar la categoría &quot;{cat.displayName}&quot;?
                          {cat.items.length > 1 ? ` Se eliminarán ${cat.items.length} entradas duplicadas.` : " Los productos quedarán sin esta categoría."}
                        </span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deletingCategory}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            disabled={deletingCategory}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {managedCategoryGroups.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  No hay categorías. Creá una desde &quot;Nueva categoría&quot;.
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowManageCategoriesModal(false)}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Nueva familia Modal -------- */}
      {showFamiliaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva familia</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowFamiliaModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFamilia}>
              <div className="space-y-4 px-6 py-5">
                {familiaError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {familiaError}
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newFamiliaName}
                    onChange={(e) => setNewFamiliaName(e.target.value)}
                    placeholder="Ej: ADICIONAL, TAPEOS"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowFamiliaModal(false)}
                  disabled={creatingFamilia}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingFamilia}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingFamilia && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creatingFamilia ? "Creando..." : "Crear familia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Gestionar familias Modal -------- */}
      {showManageFamiliasModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!editingFamilia && !deleteConfirmFamiliaId) setShowManageFamiliasModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Gestionar familias</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowManageFamiliasModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {familiaError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {familiaError}
                </div>
              )}
              <ul className="space-y-1">
                {familias.map((cat) => (
                  <li
                    key={cat.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300 truncate min-w-0">
                        {getCategoryDisplayName(cat.name)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmFamiliaId(null)
                            setEditingFamilia({ id: cat.id, name: cat.name })
                            setEditFamiliaName(getCategoryDisplayName(cat.name))
                            setFamiliaError(null)
                          }}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFamilia(null)
                            setEditFamiliaName("")
                            setDeleteConfirmFamiliaId(cat.id)
                            setFamiliaError(null)
                          }}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-red-600 dark:hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {editingFamilia?.id === cat.id ? (
                      <form onSubmit={handleUpdateFamilia} className="mt-3 space-y-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-white">Editar familia</p>
                        <input
                          type="text"
                          value={editFamiliaName}
                          onChange={(e) => setEditFamiliaName(e.target.value)}
                          placeholder="Nombre"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingFamilia(null); setEditFamiliaName("") }}
                            disabled={savingFamilia}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingFamilia || editFamiliaName.trim().length < 2}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingFamilia ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Guardar
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {deleteConfirmFamiliaId === cat.id ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
                        <span className="text-sm text-amber-800 dark:text-amber-200">
                          ¿Eliminar la familia &quot;{getCategoryDisplayName(cat.name)}&quot;?
                        </span>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmFamiliaId(null)}
                            disabled={deletingFamilia}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFamilia(cat.id)}
                            disabled={deletingFamilia}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingFamilia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {familias.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  No hay familias. Creá una desde &quot;Nueva familia&quot;.
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowManageFamiliasModal(false)}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Nueva subfamilia Modal -------- */}
      {showSubfamiliaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva subfamilia</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowSubfamiliaModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubfamilia}>
              <div className="space-y-4 px-6 py-5">
                {subfamiliaError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {subfamiliaError}
                  </div>
                )}
                {familias.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Primero creá una familia con &quot;Nueva familia&quot;.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                        Familia <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={newSubfamiliaParentId}
                        onChange={(e) => setNewSubfamiliaParentId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {familias.map((f) => (
                          <option key={f.id} value={f.id}>
                            {getCategoryDisplayName(f.name)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">
                        Nombre de la subfamilia <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newSubfamiliaName}
                        onChange={(e) => setNewSubfamiliaName(e.target.value)}
                        placeholder="Ej: Frutos secos, Pastas secas"
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowSubfamiliaModal(false)}
                  disabled={creatingSubfamilia}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingSubfamilia || familias.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingSubfamilia && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creatingSubfamilia ? "Creando..." : "Crear subfamilia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------- Gestionar subfamilias Modal -------- */}
      {showManageSubfamiliasModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!editingSubfamilia && !deleteConfirmSubfamiliaId) setShowManageSubfamiliasModal(false)
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Gestionar subfamilias</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowManageSubfamiliasModal(false)}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {subfamiliaError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {subfamiliaError}
                </div>
              )}
              <ul className="space-y-1">
                {subfamiliasList.map((cat) => {
                  const parent = familias.find((f) => f.id === cat.parentId)
                  return (
                    <li
                      key={cat.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 truncate max-w-full">
                            {getCategoryDisplayName(cat.name)}
                          </span>
                          {parent && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                              Familia: {getCategoryDisplayName(parent.name)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirmSubfamiliaId(null)
                              setEditingSubfamilia({ id: cat.id, name: cat.name })
                              setEditSubfamiliaName(getCategoryDisplayName(cat.name))
                              setSubfamiliaError(null)
                            }}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSubfamilia(null)
                              setEditSubfamiliaName("")
                              setDeleteConfirmSubfamiliaId(cat.id)
                              setSubfamiliaError(null)
                            }}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-red-600 dark:hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {editingSubfamilia?.id === cat.id ? (
                        <form
                          onSubmit={handleUpdateSubfamilia}
                          className="mt-3 space-y-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3"
                        >
                          <p className="text-sm font-medium text-gray-700 dark:text-white">Editar subfamilia</p>
                          <input
                            type="text"
                            value={editSubfamiliaName}
                            onChange={(e) => setEditSubfamiliaName(e.target.value)}
                            placeholder="Nombre"
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSubfamilia(null)
                                setEditSubfamiliaName("")
                              }}
                              disabled={savingSubfamilia}
                              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={savingSubfamilia || editSubfamiliaName.trim().length < 2}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingSubfamilia ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Guardar
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {deleteConfirmSubfamiliaId === cat.id ? (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3">
                          <span className="text-sm text-amber-800 dark:text-amber-200">
                            ¿Eliminar la subfamilia &quot;{getCategoryDisplayName(cat.name)}&quot;?
                          </span>
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmSubfamiliaId(null)}
                              disabled={deletingSubfamilia}
                              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubfamilia(cat.id)}
                              disabled={deletingSubfamilia}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingSubfamilia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              {subfamiliasList.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  No hay subfamilias. Creá una desde &quot;Nueva subfamilia&quot; (necesitás al menos una familia).
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowManageSubfamiliasModal(false)}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Bulk Edit Modal -------- */}
      {showBulkEditModal && bulkEditField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowBulkEditModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {bulkEditField === "category"
                  ? "Cambiar categoría"
                  : bulkEditField === "familia"
                    ? "Cambiar familia"
                    : bulkEditField === "subfamilia"
                      ? "Cambiar subfamilia"
                      : "Cambiar unidad"}
              </h2>
              <button type="button" onClick={() => setShowBulkEditModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Se aplicará a <span className="font-semibold text-gray-800 dark:text-white">{selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""}</span>.
              </p>
              {bulkEditField === "category" && (
                <select
                  value={bulkEditValue}
                  onChange={(e) => setBulkEditValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value={BULK_EDIT_PICK}>Seleccionar categoría...</option>
                  {stockRubroCategories.map((c) => (
                    <option key={c.id} value={c.id}>{getCategoryDisplayName(c.name)}</option>
                  ))}
                </select>
              )}
              {bulkEditField === "familia" && (
                <select
                  value={bulkEditValue}
                  onChange={(e) => setBulkEditValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value={BULK_EDIT_PICK}>Seleccionar...</option>
                  <option value="">Sin familia</option>
                  {familias.map((f) => (
                    <option key={f.id} value={getCategoryDisplayName(f.name)}>{getCategoryDisplayName(f.name)}</option>
                  ))}
                </select>
              )}
              {bulkEditField === "subfamilia" && (
                <select
                  value={bulkEditValue}
                  onChange={(e) => setBulkEditValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value={BULK_EDIT_PICK}>Seleccionar...</option>
                  <option value="">Sin subfamilia</option>
                  {subfamiliasList.map((s) => {
                    const parent = familias.find((f) => f.id === s.parentId)
                    const label = parent
                      ? `${getCategoryDisplayName(parent.name)} · ${getCategoryDisplayName(s.name)}`
                      : getCategoryDisplayName(s.name)
                    return (
                      <option key={s.id} value={getCategoryDisplayName(s.name)}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              )}
              {bulkEditField === "unit" && (
                <select
                  value={bulkEditValue}
                  onChange={(e) => setBulkEditValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value={BULK_EDIT_PICK}>Seleccionar unidad...</option>
                  {unitOptions.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
              <button type="button" onClick={() => setShowBulkEditModal(false)} disabled={bulkProcessing} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={handleBulkEdit} disabled={bulkProcessing || bulkEditValue === BULK_EDIT_PICK || ((bulkEditField === "category" || bulkEditField === "unit") && !bulkEditValue)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {bulkProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                {bulkProcessing ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- Bulk Delete Confirm -------- */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">¿Eliminar productos?</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Se eliminarán <span className="font-semibold text-gray-900 dark:text-white">{selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""}</span>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
              <button type="button" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkProcessing} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={handleBulkDelete} disabled={bulkProcessing} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {bulkProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                {bulkProcessing ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Descargar listado</h2>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Se exportarán{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""}
                </span>{" "}
                en CSV (separador punto y coma, compatible con Excel).
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/40">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-600"
                  checked={exportIncludeSellable}
                  onChange={(e) => setExportIncludeSellable(e.target.checked)}
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  Incluir columna <span className="font-medium">Vendible</span> (Sí / No)
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/80">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={runSelectedProductsExport}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Descargar CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
