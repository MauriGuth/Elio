"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { sileo } from "sileo"
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Phone,
  Mail,
  FileText,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  MapPin,
  Package,
  Upload,
} from "lucide-react"
import { suppliersApi } from "@/lib/api/suppliers"
import { productsApi } from "@/lib/api/products"
import { cn } from "@/lib/utils"

// ---------- types ----------

const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Sin especificar" },
  { value: "CASH", label: "Efectivo" },
  { value: "CHECK", label: "Cheque" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "ACCOUNT", label: "Cuenta corriente" },
]

interface Supplier {
  id: string
  name: string
  legalName?: string
  taxId?: string
  rubro?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  paymentTerms?: string
  paymentMethod?: string | null
  notes?: string
  isActive: boolean
  products?: { id: string }[]
  productSuppliers?: Array<{
    id: string
    productId: string
    unitCost?: number | null
    supplierSku?: string | null
    product?: { id: string; name: string; sku?: string; unit: string }
  }>
  _count?: { productSuppliers: number }
}

interface SupplierForm {
  name: string
  legalName: string
  taxId: string
  rubro: string
  contactName: string
  contactPhone: string
  contactEmail: string
  address: string
  latitude: string
  longitude: string
  paymentTerms: string
  paymentMethod: string
  notes: string
}

interface Notification {
  id: number
  type: "success" | "error"
  message: string
}

const emptyForm: SupplierForm = {
  name: "",
  legalName: "",
  taxId: "",
  rubro: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  address: "",
  latitude: "",
  longitude: "",
  paymentTerms: "",
  paymentMethod: "",
  notes: "",
}

// ---------- sub-components ----------

function Toast({
  notification,
  onClose,
}: {
  notification: Notification
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all",
        notification.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      )}
    >
      {notification.type === "success" ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{notification.message}</span>
      <button
        onClick={onClose}
        className="rounded p-0.5 hover:bg-black/5 transition-colors"
        aria-label="Cerrar notificación"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
          <div className="h-4 w-36 rounded bg-gray-200" />
          <div className="h-4 w-28 rounded bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-4 w-36 rounded bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-8 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-2xl",
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          "relative mx-4 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl",
          maxWidth
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Body */}
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder-gray-400 transition-colors focus:outline-none focus:ring-1",
          error
            ? "border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500"
            : "border-gray-200 dark:border-gray-600 focus:border-emerald-500 focus:ring-emerald-500"
        )}
      />
      {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value?: string | null
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}

type ComparisonProduct = {
  id: string
  name: string
  sku: string | null
  unit: string
  suppliers: Array<{ supplierId: string; supplierName: string; unitCost: number | null }>
}

function ComparisonTable({
  data,
}: {
  data: { products: ComparisonProduct[] }
}) {
  const supplierList = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{ id: string; name: string }> = []
    for (const p of data.products) {
      for (const s of p.suppliers) {
        if (!seen.has(s.supplierId)) {
          seen.add(s.supplierId)
          list.push({ id: s.supplierId, name: s.supplierName })
        }
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [data.products])

  const priceBySupplier = (product: ComparisonProduct, supplierId: string) => {
    const s = product.suppliers.find((x) => x.supplierId === supplierId)
    return s?.unitCost ?? null
  }

  const productsWithMultiple = data.products.filter((p) => p.suppliers.length > 1)
  const displayProducts = productsWithMultiple.length ? productsWithMultiple : data.products

  if (!displayProducts.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <th className="px-3 py-2 text-left font-medium text-gray-700">Producto</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Unidad</th>
            {supplierList.map((s) => (
              <th key={s.id} className="px-3 py-2 text-right font-medium text-gray-700">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayProducts.map((p) => {
            const prices = supplierList.map((sid) => priceBySupplier(p, sid.id))
            const min = prices.filter((n): n is number => n != null && Number.isFinite(n))
            const minVal = min.length ? Math.min(...min) : null
            return (
              <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-3 py-2 text-gray-900 dark:text-white">{p.name}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-white">{p.unit}</td>
                {supplierList.map((s) => {
                  const cost = priceBySupplier(p, s.id)
                  const isMin = cost != null && minVal != null && cost === minVal
                  return (
                    <td
                      key={s.id}
                      className={cn(
                        "px-3 py-2 text-right",
                        isMin ? "font-medium text-emerald-600" : "text-gray-600 dark:text-gray-300"
                      )}
                    >
                      {cost != null && Number.isFinite(cost)
                        ? cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------- main page ----------

export default function SuppliersPage() {
  // State
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  // Form
  const [form, setForm] = useState<SupplierForm>(emptyForm)
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof SupplierForm, string>>
  >({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [productsList, setProductsList] = useState<{ id: string; name: string; sku?: string; unit: string }[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonData, setComparisonData] = useState<Awaited<ReturnType<typeof suppliersApi.getPriceComparison>> | null>(null)
  const [loadingComparison, setLoadingComparison] = useState(false)
  const [showCompareProductModal, setShowCompareProductModal] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState("")
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  const [savedPriceLists, setSavedPriceLists] = useState<Array<{ id: string; fileName: string; createdAt: string }>>([])
  const [pendingPriceListFile, setPendingPriceListFile] = useState<File | null>(null)
  const [detailPriceLists, setDetailPriceLists] = useState<Array<{ id: string; fileName: string; createdAt: string }>>([])
  const [comparisonByRubro, setComparisonByRubro] = useState<Awaited<ReturnType<typeof suppliersApi.getPriceComparisonByRubro>> | null>(null)
  const [rubroForCompare, setRubroForCompare] = useState("")
  const [loadingRubroCompare, setLoadingRubroCompare] = useState(false)
  const [searchInListsQuery, setSearchInListsQuery] = useState("")
  const [searchInListsResult, setSearchInListsResult] = useState<Awaited<ReturnType<typeof suppliersApi.getPriceComparisonBySearchInLists>> | null>(null)
  const [loadingSearchInLists, setLoadingSearchInLists] = useState(false)
  const [linkedProducts, setLinkedProducts] = useState<Array<{
    id: string
    productId: string
    unitCost?: number | null
    product?: { id: string; name: string; sku?: string; unit: string }
  }>>([])
  const [addProductId, setAddProductId] = useState("")
  const [addProductCost, setAddProductCost] = useState("")
  const [addingProduct, setAddingProduct] = useState(false)
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notifCounter = useRef(0)

  const notify = useCallback((type: "success" | "error", message: string) => {
    const id = Date.now() + ++notifCounter.current
    setNotifications((prev) => [...prev, { id, type, message }])
  }, [])

  const removeNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // ---------- data fetching ----------

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await suppliersApi.getAll({ limit: 500 })
      setSuppliers(
        [...(response.data ?? [])].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" })
        )
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al cargar proveedores"
      setError(message)
      sileo.error({ title: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  // ---------- filtered list ----------

  const filtered = useMemo(
    () =>
      suppliers
        .filter((s) => {
          if (!search) return true
          const q = search.toLowerCase()
          return (
            s.name.toLowerCase().includes(q) ||
            (s.legalName && s.legalName.toLowerCase().includes(q)) ||
            (s.taxId && s.taxId.toLowerCase().includes(q))
          )
        })
        .sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" })
        ),
    [suppliers, search]
  )

  // ---------- form helpers ----------

  const updateForm = (field: keyof SupplierForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof SupplierForm, string>> = {}
    if (!form.name.trim()) {
      errors.name = "El nombre es obligatorio"
    }
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      errors.contactEmail = "Email no válido"
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ---------- CRUD handlers ----------

  const handleCreate = () => {
    setEditingSupplier(null)
    setForm(emptyForm)
    setFormErrors({})
    setPendingPriceListFile(null)
    setFormModalOpen(true)
  }

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name,
      legalName: supplier.legalName || "",
      taxId: supplier.taxId || "",
        rubro: supplier.rubro || "",
      contactName: supplier.contactName || "",
      contactPhone: supplier.contactPhone || "",
      contactEmail: supplier.contactEmail || "",
      address: supplier.address || "",
      latitude: supplier.latitude != null ? String(supplier.latitude) : "",
      longitude: supplier.longitude != null ? String(supplier.longitude) : "",
      paymentTerms: supplier.paymentTerms || "",
      paymentMethod: supplier.paymentMethod ?? "",
      notes: supplier.notes || "",
    })
    setFormErrors({})
    setLoadingDetail(true)
    setFormModalOpen(true)
  }

  const handleCloseForm = () => {
    if (saving) return
    setFormModalOpen(false)
    setLoadingDetail(false)
    setParseError(null)
    setSavedPriceLists([])
    setPendingPriceListFile(null)
    setLinkedProducts([])
    setAddProductId("")
    setAddProductCost("")
  }

  const handleAddProductToSupplier = async () => {
    if (!editingSupplier || !addProductId.trim()) return
    setAddingProduct(true)
    try {
      const payload: { productId: string; unitCost?: number } = { productId: addProductId.trim() }
      const cost = parseFloat(addProductCost.replace(",", "."))
      if (!Number.isNaN(cost) && cost >= 0) payload.unitCost = cost
      await suppliersApi.addProduct(editingSupplier.id, payload)
      const full = await suppliersApi.getById(editingSupplier.id) as Supplier
      setLinkedProducts(
        (full.productSuppliers ?? []).map((ps: { id: string; productId: string; unitCost?: number | null; product?: { id: string; name: string; sku?: string; unit: string } }) => ({
          id: ps.id,
          productId: ps.productId,
          unitCost: ps.unitCost,
          product: ps.product,
        }))
      )
      setAddProductId("")
      setAddProductCost("")
      notify("success", "Producto agregado al proveedor.")
      sileo.success({ title: "Producto agregado al proveedor" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al agregar producto"
      notify("error", msg)
      sileo.error({ title: msg })
    } finally {
      setAddingProduct(false)
    }
  }

  const handleRemoveProductLink = async (linkId: string) => {
    if (!editingSupplier) return
    setRemovingLinkId(linkId)
    try {
      await suppliersApi.removeProductLink(linkId)
      setLinkedProducts((prev) => prev.filter((p) => p.id !== linkId))
      notify("success", "Producto desvinculado.")
      sileo.success({ title: "Producto desvinculado" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al desvincular"
      notify("error", msg)
      sileo.error({ title: msg })
    } finally {
      setRemovingLinkId(null)
    }
  }

  const handlePriceListFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setUploadingFile(true)
    try {
      const isEdit = !!editingSupplier
      if (isEdit) {
        await suppliersApi.uploadPriceList(editingSupplier.id, file)
        const list = await suppliersApi.getPriceLists(editingSupplier.id)
        const arr = Array.isArray(list) ? list : []
        setSavedPriceLists(arr.map((l) => ({ id: l.id, fileName: l.fileName, createdAt: l.createdAt })))
        notify("success", "Listado de precios guardado.")
        sileo.success({ title: "Listado de precios guardado" })
      } else {
        setPendingPriceListFile(file)
        notify("success", `Archivo listo: ${file.name}. Se guardará al crear el proveedor.`)
        sileo.success({ title: "Archivo listo. Se guardará al crear el proveedor." })
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "La extracción tardó demasiado. Probá de nuevo o subí un archivo más corto."
            : err.message
          : "Error al subir el archivo"
      setParseError(msg)
      notify("error", msg)
      sileo.error({ title: msg })
    } finally {
      setUploadingFile(false)
      e.target.value = ""
    }
  }

  // Cargar lista de productos cuando se abre el modal
  useEffect(() => {
    if (!formModalOpen) return
    productsApi.getAll({ limit: 500 }).then((res) => {
      const list = res.data?.data ?? res.data ?? []
      setProductsList(Array.isArray(list) ? list : [])
    }).catch(() => setProductsList([]))
  }, [formModalOpen])

  // Al abrir detalle, cargar proveedor completo (productSuppliers) y listados de precios
  useEffect(() => {
    if (!detailSupplier) {
      setDetailPriceLists([])
      return
    }
    suppliersApi.getById(detailSupplier.id).then((s: Supplier) => {
      setDetailSupplier(s)
    }).catch(() => {})
    suppliersApi.getPriceLists(detailSupplier.id).then((list) => {
      const arr = Array.isArray(list) ? list : []
      setDetailPriceLists(arr.map((l: { id: string; fileName: string; createdAt: string }) => ({
        id: l.id,
        fileName: l.fileName,
        createdAt: l.createdAt,
      })))
    }).catch(() => setDetailPriceLists([]))
  }, [detailSupplier?.id])

  // Al editar, cargar detalle del proveedor (productSuppliers y listados)
  useEffect(() => {
    if (!formModalOpen || !editingSupplier || !loadingDetail) return
    suppliersApi.getById(editingSupplier.id).then((s: Supplier) => {
      setForm({
        name: s.name,
        legalName: s.legalName || "",
        taxId: s.taxId || "",
        rubro: s.rubro || "",
        contactName: s.contactName || "",
        contactPhone: s.contactPhone || "",
        contactEmail: s.contactEmail || "",
        address: s.address || "",
        latitude: s.latitude != null ? String(s.latitude) : "",
        longitude: s.longitude != null ? String(s.longitude) : "",
        paymentTerms: s.paymentTerms || "",
        paymentMethod: s.paymentMethod ?? "",
        notes: s.notes || "",
      })
      setLinkedProducts(
        (s.productSuppliers ?? []).map((ps: { id: string; productId: string; unitCost?: number | null; product?: { id: string; name: string; sku?: string; unit: string } }) => ({
          id: ps.id,
          productId: ps.productId,
          unitCost: ps.unitCost,
          product: ps.product,
        }))
      )
      setLoadingDetail(false)
      suppliersApi.getPriceLists(editingSupplier.id).then((list) => {
        const arr = Array.isArray(list) ? list : []
        setSavedPriceLists(arr.map((l: { id: string; fileName: string; createdAt: string }) => ({ id: l.id, fileName: l.fileName, createdAt: l.createdAt })))
      }).catch(() => setSavedPriceLists([]))
    }).catch(() => setLoadingDetail(false))
  }, [formModalOpen, editingSupplier?.id, loadingDetail])

  const handleSave = async () => {
    if (!validateForm()) return

    setSaving(true)
    try {
      const payload: Record<string, string | number | undefined> = {
        name: form.name.trim(),
        legalName: form.legalName.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        rubro: form.rubro.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        address: form.address.trim() || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        paymentMethod: form.paymentMethod || undefined,
        notes: form.notes.trim() || undefined,
      }
      const latRaw = form.latitude.trim().replace(",", ".")
      const lngRaw = form.longitude.trim().replace(",", ".")
      if (latRaw) {
        const lat = parseFloat(latRaw)
        if (!Number.isNaN(lat)) payload.latitude = lat
      }
      if (lngRaw) {
        const lng = parseFloat(lngRaw)
        if (!Number.isNaN(lng)) payload.longitude = lng
      }

      if (editingSupplier) {
        await suppliersApi.update(editingSupplier.id, payload)
        notify("success", "Proveedor actualizado correctamente")
        sileo.success({ title: "Proveedor actualizado correctamente" })
      } else {
        const created = await suppliersApi.create(payload)
        const createdId = (created as { id?: string })?.id
        if (createdId && pendingPriceListFile) {
          try {
            await suppliersApi.uploadPriceList(createdId, pendingPriceListFile)
            notify("success", "Proveedor creado y listado de precios guardado.")
            sileo.success({ title: "Proveedor creado y listado de precios guardado" })
          } catch (upErr) {
            const upMsg = "Proveedor creado pero no se pudo guardar el listado. Podés actualizarlo desde Editar."
            notify("error", upMsg)
            sileo.error({ title: upMsg })
          }
        } else {
          notify("success", "Proveedor creado correctamente")
          sileo.success({ title: "Proveedor creado correctamente" })
        }
      }

      handleCloseForm()
      setComparisonData(null)
      setComparisonByRubro(null)
      fetchSuppliers()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al guardar proveedor"
      notify("error", message)
      sileo.error({ title: message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    const idToDelete = deleteTarget.id
    setDeleting(true)
    try {
      await suppliersApi.delete(idToDelete)
      notify("success", `Proveedor "${deleteTarget.name}" eliminado`)
      sileo.success({ title: "Proveedor eliminado" })
      setDeleteTarget(null)
      setSuppliers((prev) => prev.filter((s) => s.id !== idToDelete))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al eliminar proveedor"
      notify("error", message)
      sileo.error({ title: message })
    } finally {
      setDeleting(false)
    }
  }

  const handleProductSearch = () => {
    const q = productSearchQuery.trim()
    if (!q) return
    setProductSearchLoading(true)
    suppliersApi.getPriceComparisonByProductSearch(q)
      .then((data) => {
        setComparisonData(data)
        setShowComparison(true)
        setShowCompareProductModal(false)
        if (!data.products.length) {
          notify("success", "No se encontraron productos que coincidan con tu búsqueda.")
          sileo.success({ title: "No se encontraron productos que coincidan con tu búsqueda." })
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Error al buscar productos"
        notify("error", msg)
        sileo.error({ title: msg })
      })
      .finally(() => setProductSearchLoading(false))
  }

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col gap-2">
        {notifications.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <Toast
              notification={n}
              onClose={() => removeNotification(n.id)}
            />
          </div>
        ))}
      </div>

      {/* -------- Header -------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Proveedores</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-white">
            Gestiona tus proveedores y sus datos de contacto
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCompareProductModal(true)
              setProductSearchQuery("")
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            Comparar precios
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* -------- Comparación de precios -------- */}
      {showComparison && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Comparación de precios entre proveedores</h2>
            <button
              type="button"
              onClick={() => setShowComparison(false)}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Ocultar comparación
            </button>
          </div>

          <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-4">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Buscar en listados subidos (foto o PDF)</p>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Escribí el producto o categoría (ej: malbec, harina, vino). La IA busca en los listados de precios que subiste por proveedor y muestra la comparación.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchInListsQuery}
                onChange={(e) => { setSearchInListsQuery(e.target.value); setSearchInListsResult(null); }}
                placeholder="Ej: malbec, harina, levadura"
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 w-56 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (!searchInListsQuery.trim()) return
                  setLoadingSearchInLists(true)
                  setSearchInListsResult(null)
                  suppliersApi.getPriceComparisonBySearchInLists(searchInListsQuery.trim())
                    .then((data) => {
                      setSearchInListsResult(data)
                      setLoadingSearchInLists(false)
                    })
                    .catch(() => setLoadingSearchInLists(false))
                }}
                disabled={loadingSearchInLists || !searchInListsQuery.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loadingSearchInLists ? "Buscando..." : "Buscar"}
              </button>
            </div>
            {searchInListsResult && (
              <div className="mt-4 overflow-x-auto">
                {searchInListsResult.items.length > 0 ? (
                  <>
                    <p className="mb-2 text-xs text-amber-700 dark:text-amber-200">
                      Si solo ves un precio por celda, volvé a subir el listado de precios (foto o PDF) del proveedor para ver el desglose (Caja Neto, Caja Final, Botella, etc.).
                    </p>
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Producto / ítem</th>
                        {searchInListsResult.suppliers.map((s) => (
                          <th key={s.id} className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-200" title="Precio por unidad">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {searchInListsResult.items.map((item, i) => {
                        const prices = searchInListsResult.suppliers.map((s) => item.prices.find((p) => p.supplierId === s.id)?.unitCost ?? null)
                        const minVal = prices.filter((n): n is number => n != null && Number.isFinite(n)).length ? Math.min(...prices.filter((n): n is number => n != null && Number.isFinite(n))) : null
                        return (
                          <tr key={i} className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-3 py-2 text-gray-900 dark:text-white">{item.description}</td>
                            {searchInListsResult.suppliers.map((s) => {
                              const p = item.prices.find((x) => x.supplierId === s.id)
                              const cost = p?.unitCost ?? null
                              const hasBreakdown = !!p?.priceBreakdown && Object.keys(p.priceBreakdown).length > 0
                              const isMin = cost != null && minVal != null && cost === minVal
                              const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              return (
                                <td
                                  key={s.id}
                                  className={cn("px-3 py-2 text-right tabular-nums align-top", isMin ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300")}
                                >
                                  <div className="flex flex-col gap-0.5">
                                    {cost != null && Number.isFinite(cost) && (
                                      <span className={cn("font-medium", hasBreakdown && "text-xs text-gray-500 dark:text-gray-400")}>
                                        {hasBreakdown ? `Precio: ${fmt(cost)}` : fmt(cost)}
                                      </span>
                                    )}
                                    {hasBreakdown && p && Object.entries(p.priceBreakdown).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => (
                                      <span key={key} className="text-xs opacity-90">{key}: {fmt(val)}</span>
                                    ))}
                                    {cost != null && Number.isFinite(cost) && !hasBreakdown && (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">Re-subir listado para desglose</span>
                                    )}
                                    {(!p || ((cost == null || !Number.isFinite(cost)) && !hasBreakdown)) && "—"}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </>
                ) : searchInListsResult.noListsWithData ? (
                  <p className="text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 rounded-lg px-3 py-3">
                    No hay listados con datos extraídos. Entrá a cada proveedor → Editar → subí de nuevo la foto o PDF del listado de precios (sin elegir &quot;Actualizar listado&quot; sin archivo). La IA tiene que procesar el archivo para que la búsqueda funcione.
                  </p>
                ) : (
                  <p className="py-4 text-sm text-gray-500 dark:text-white">No hay coincidencias para &quot;{searchInListsQuery}&quot;. Probá con otra palabra (ej: parte del nombre del producto).</p>
                )}
              </div>
            )}
          </div>

          <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 p-4">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Comparar por rubro (mismo rubro en el proveedor)</p>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Ingresá el rubro exacto del proveedor (ej: Vinos, Harinas). Los proveedores deben tener ese rubro asignado y listados con datos extraídos.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rubroForCompare}
                onChange={(e) => setRubroForCompare(e.target.value)}
                placeholder="Ej: Vinos, Harinas, Carnes"
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 w-48 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (!rubroForCompare.trim()) return
                  setLoadingRubroCompare(true)
                  suppliersApi.getPriceComparisonByRubro(rubroForCompare.trim()).then((data) => {
                    setComparisonByRubro(data)
                    setLoadingRubroCompare(false)
                  }).catch(() => setLoadingRubroCompare(false))
                }}
                disabled={loadingRubroCompare || !rubroForCompare.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loadingRubroCompare ? "Cargando..." : "Comparar por rubro"}
              </button>
            </div>
            {comparisonByRubro && (
              <div className="mt-4 overflow-x-auto">
                {comparisonByRubro.items.length > 0 ? (
                  <>
                    <p className="mb-2 text-xs text-amber-700 dark:text-amber-200">
                      Si solo ves un precio por celda, volvé a subir el listado de precios (foto o PDF) del proveedor para ver el desglose (Caja Neto, Caja Final, Botella, etc.).
                    </p>
                    <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Producto / ítem</th>
                        {comparisonByRubro.suppliers.map((s) => (
                          <th key={s.id} className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-200" title="Precio por unidad">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonByRubro.items.map((item, i) => {
                        const prices = comparisonByRubro.suppliers.map((s) => item.prices.find((p) => p.supplierId === s.id)?.unitCost ?? null)
                        const minVal = prices.filter((n): n is number => n != null && Number.isFinite(n)).length ? Math.min(...prices.filter((n): n is number => n != null && Number.isFinite(n))) : null
                        return (
                          <tr key={i} className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-3 py-2 text-gray-900 dark:text-white">{item.description}</td>
                            {comparisonByRubro.suppliers.map((s) => {
                              const p = item.prices.find((x) => x.supplierId === s.id)
                              const cost = p?.unitCost ?? null
                              const hasBreakdown = !!p?.priceBreakdown && Object.keys(p.priceBreakdown).length > 0
                              const isMin = cost != null && minVal != null && cost === minVal
                              const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              return (
                                <td
                                  key={s.id}
                                  className={cn("px-3 py-2 text-right tabular-nums align-top", isMin ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300")}
                                >
                                  <div className="flex flex-col gap-0.5">
                                    {cost != null && Number.isFinite(cost) && (
                                      <span className={cn("font-medium", hasBreakdown && "text-xs text-gray-500 dark:text-gray-400")}>
                                        {hasBreakdown ? `Precio: ${fmt(cost)}` : fmt(cost)}
                                      </span>
                                    )}
                                    {hasBreakdown && p && Object.entries(p.priceBreakdown).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => (
                                      <span key={key} className="text-xs opacity-90">{key}: {fmt(val)}</span>
                                    ))}
                                    {cost != null && Number.isFinite(cost) && !hasBreakdown && (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">Re-subir listado para desglose</span>
                                    )}
                                    {(!p || ((cost == null || !Number.isFinite(cost)) && !hasBreakdown)) && "—"}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </>
                ) : (
                  <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No hay proveedores de este rubro con listados cargados, o no hay ítems en común.</p>
                )}
              </div>
            )}
          </div>

          <p className="mb-4 text-sm text-gray-500 dark:text-white">
            Comparación por productos del catálogo (vínculos producto–proveedor):
          </p>
          {loadingComparison ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500 dark:text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando...
            </div>
          ) : comparisonData?.products?.length ? (
            <ComparisonTable data={comparisonData} />
          ) : (
            <p className="py-6 text-sm text-gray-500 dark:text-white">
              No hay productos con precios de varios proveedores. Cargá listas de precios por proveedor para comparar.
            </p>
          )}
        </div>
      )}

      {/* -------- Search -------- */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, razón social o CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        {!loading && (
          <span className="text-sm text-gray-400">
            {filtered.length} proveedor{filtered.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {/* -------- Error state -------- */}
      {error && !loading && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-10">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <div className="text-center">
            <p className="font-medium text-red-800">Error al cargar datos</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
          <button
            onClick={fetchSuppliers}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Table -------- */}
      {!error && (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {loading ? (
            <TableSkeleton />
          ) : filtered.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center gap-3 px-6 py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Building2 className="h-7 w-7 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-900 dark:text-white">
                  {search
                    ? "No se encontraron proveedores"
                    : "Aún no hay proveedores"}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-white">
                  {search
                    ? "Intenta con otros términos de búsqueda"
                    : "Comienza agregando tu primer proveedor"}
                </p>
              </div>
              {!search && (
                <button
                  onClick={handleCreate}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nuevo Proveedor
                </button>
              )}
            </div>
          ) : (
            /* Data table */
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Razón Social
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      CUIT
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Contacto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Teléfono
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Cond. de Pago
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Medio de pago
                    </th>
                    <th className="w-28 min-w-28 shrink-0 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      {/* Nombre */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-gray-700 text-emerald-600 dark:text-emerald-400">
                            <Building2 className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {supplier.name}
                          </span>
                        </div>
                      </td>
                      {/* Razón Social */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-white">
                        {supplier.legalName || (
                          <span className="text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* CUIT */}
                      <td className="px-4 py-3.5">
                        {supplier.taxId ? (
                          <span className="font-mono text-xs text-gray-600 dark:text-white">
                            {supplier.taxId}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* Contacto */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-white">
                        {supplier.contactName || (
                          <span className="text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3.5">
                        {supplier.contactEmail ? (
                          <span className="text-sm text-gray-600 dark:text-white">
                            {supplier.contactEmail}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* Teléfono */}
                      <td className="px-4 py-3.5">
                        {supplier.contactPhone ? (
                          <span className="text-sm text-gray-600 dark:text-white">
                            {supplier.contactPhone}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* Condición de Pago */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-white">
                        {supplier.paymentTerms || (
                          <span className="text-gray-300 dark:text-gray-400">—</span>
                        )}
                      </td>
                      {/* Medio de pago */}
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-white">
                        {PAYMENT_METHOD_OPTIONS.find((o) => o.value === supplier.paymentMethod)?.label ?? (supplier.paymentMethod ? supplier.paymentMethod : <span className="text-gray-300 dark:text-gray-400">—</span>)}
                      </td>
                      {/* Acciones */}
                      <td className="w-28 min-w-28 shrink-0 px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <button
                            onClick={() => setDetailSupplier(supplier)}
                            className="rounded-lg p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(supplier)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(supplier)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {!loading && filtered.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-3">
              <p className="text-sm text-gray-500 dark:text-white">
                Mostrando{" "}
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {filtered.length}
                </span>{" "}
                de{" "}
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {suppliers.length}
                </span>{" "}
                proveedores
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------- Create / Edit Modal -------- */}
      <Modal
        open={formModalOpen}
        onClose={handleCloseForm}
        title={editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
      >
        <div className="space-y-6 p-6">
          {/* Basic info */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Información General
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField
                  label="Nombre"
                  value={form.name}
                  onChange={(v) => updateForm("name", v)}
                  error={formErrors.name}
                  required
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div className="sm:col-span-2">
                <FormField
                  label="Razón Social"
                  value={form.legalName}
                  onChange={(v) => updateForm("legalName", v)}
                  placeholder="Razón social (opcional)"
                />
              </div>
              <FormField
                label="CUIT"
                value={form.taxId}
                onChange={(v) => updateForm("taxId", v)}
                placeholder="XX-XXXXXXXX-X"
              />
              <FormField
                label="Rubro"
                value={form.rubro}
                onChange={(v) => updateForm("rubro", v)}
                placeholder="Ej: Carnes, Lácteos, Verduras"
              />
              <FormField
                label="Condición de Pago"
                value={form.paymentTerms}
                onChange={(v) => updateForm("paymentTerms", v)}
                placeholder="Ej: 30 días, contado"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
                  Medio de pago
                </label>
                <select
                  aria-label="Medio de pago"
                  value={form.paymentMethod}
                  onChange={(e) => updateForm("paymentMethod", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Datos de Contacto
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Nombre de Contacto"
                value={form.contactName}
                onChange={(v) => updateForm("contactName", v)}
                placeholder="Nombre del contacto"
              />
              <FormField
                label="Teléfono"
                value={form.contactPhone}
                onChange={(v) => updateForm("contactPhone", v)}
                placeholder="+54 11 1234-5678"
                type="tel"
              />
              <div className="sm:col-span-2">
                <FormField
                  label="Email"
                  value={form.contactEmail}
                  onChange={(v) => updateForm("contactEmail", v)}
                  error={formErrors.contactEmail}
                  placeholder="contacto@proveedor.com"
                  type="email"
                />
              </div>
              <div className="sm:col-span-2">
                <FormField
                  label="Dirección"
                  value={form.address}
                  onChange={(v) => updateForm("address", v)}
                  placeholder="Dirección del proveedor (para Google Maps / retiro logística)"
                />
              </div>
              <div>
                <FormField
                  label="Latitud"
                  value={form.latitude}
                  onChange={(v) => updateForm("latitude", v)}
                  placeholder="-34.6037"
                />
              </div>
              <div>
                <FormField
                  label="Longitud"
                  value={form.longitude}
                  onChange={(v) => updateForm("longitude", v)}
                  placeholder="-58.3816"
                />
              </div>
              <p className="sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                Si cargás latitud y longitud, las rutas de logística las usan como en Locales (más preciso
                que solo texto).
              </p>
            </div>
          </div>

          {/* Artículos y precios */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Package className="h-4 w-4" />
              Artículos y precios
            </h3>
            {loadingDetail ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-6 text-sm text-gray-500 dark:text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando artículos...
              </div>
            ) : (
              <>
                {/* Agregar producto manualmente (solo al editar) */}
                {editingSupplier && (
                  <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30 p-4">
                    <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">
                      Agregar producto manualmente
                    </p>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-300">
                      Vinculá productos del catálogo a este proveedor para usarlos en ingresos manuales.
                    </p>
                    {linkedProducts.length > 0 && (
                      <ul className="mb-3 space-y-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 max-h-32 overflow-y-auto">
                        {linkedProducts.map((link) => (
                          <li
                            key={link.id}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50"
                          >
                            <span className="truncate">
                              {link.product?.name ?? link.productId}
                              {link.unitCost != null && (
                                <span className="ml-1.5 text-gray-500 dark:text-gray-400">
                                  ${Number(link.unitCost).toLocaleString("es-AR")}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveProductLink(link.id)}
                              disabled={removingLinkId === link.id}
                              className="shrink-0 rounded p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                              aria-label="Quitar producto"
                            >
                              {removingLinkId === link.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={addProductId}
                        onChange={(e) => setAddProductId(e.target.value)}
                        className="min-w-[180px] rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        aria-label="Seleccionar producto"
                      >
                        <option value="">Elegir producto...</option>
                        {productsList
                          .filter((p) => !linkedProducts.some((lp) => lp.productId === p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.sku ? `(${p.sku})` : ""}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={addProductCost}
                        onChange={(e) => setAddProductCost(e.target.value)}
                        placeholder="Costo unit. (opc.)"
                        className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                        aria-label="Costo unitario opcional"
                      />
                      <button
                        type="button"
                        onClick={handleAddProductToSupplier}
                        disabled={addingProduct || !addProductId.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {addingProduct ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Agregar
                      </button>
                    </div>
                  </div>
                )}

                {/* Cargar listado de precios (crear y editar) */}
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 p-4">
                  {editingSupplier && savedPriceLists.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        Listado guardado: <strong>{savedPriceLists[0].fileName}</strong>
                        {" "}({new Date(savedPriceLists[0].createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })})
                      </span>
                    </div>
                  )}
                  <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {editingSupplier && savedPriceLists.length > 0 ? "Actualizar listado" : "Cargar listado de precios"}
                  </p>
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-300">
                    PDF, imagen o Excel. La IA extrae los productos y precios para que puedas buscar y comparar después.
                    {!editingSupplier && " Al crear el proveedor se guardará el archivo que elijas."}
                    {" "}La extracción puede tardar 1–2 minutos; no cierres la ventana.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xls,image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handlePriceListFile}
                    className="hidden"
                    aria-label="Seleccionar archivo de lista de precios"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-60"
                  >
                    {uploadingFile ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extrayendo con IA... (puede tardar 1–2 min)
                      </>
                    ) : editingSupplier && savedPriceLists.length > 0 ? (
                      <>
                        <Upload className="h-4 w-4" />
                        Actualizar listado
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Elegir archivo (PDF, foto o Excel)
                      </>
                    )}
                  </button>
                  {!editingSupplier && pendingPriceListFile && (
                    <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                      Archivo listo: <strong>{pendingPriceListFile.name}</strong>
                    </p>
                  )}
                  {parseError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                      {parseError}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Notas
            </h3>
            <textarea
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              placeholder="Notas adicionales sobre el proveedor..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4">
          <button
            type="button"
            onClick={handleCloseForm}
            disabled={saving}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {!editingSupplier && pendingPriceListFile ? "Guardando... (extracción del listado puede tardar 1–2 min)" : "Guardando..."}
              </>
            ) : editingSupplier ? (
              "Guardar Cambios"
            ) : (
              "Crear Proveedor"
            )}
          </button>
        </div>
      </Modal>

      {/* -------- Detail Modal -------- */}
      <Modal
        open={!!detailSupplier}
        onClose={() => setDetailSupplier(null)}
        title="Detalle del Proveedor"
        maxWidth="max-w-lg"
      >
        {detailSupplier && (
          <>
            <div className="p-6">
              {/* Header with name and status */}
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {detailSupplier.name}
                    </h3>
                    {detailSupplier.legalName && (
                      <p className="text-sm text-gray-500 dark:text-white">
                        {detailSupplier.legalName}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
                <DetailRow
                  icon={FileText}
                  label="CUIT"
                  value={detailSupplier.taxId}
                />
                <DetailRow
                  icon={Building2}
                  label="Condición de Pago"
                  value={detailSupplier.paymentTerms}
                />
                <DetailRow
                  label="Medio de pago"
                  value={PAYMENT_METHOD_OPTIONS.find((o) => o.value === detailSupplier.paymentMethod)?.label ?? detailSupplier.paymentMethod ?? "—"}
                />
                <DetailRow
                  label="Contacto"
                  value={detailSupplier.contactName}
                />
                <DetailRow
                  icon={Phone}
                  label="Teléfono"
                  value={detailSupplier.contactPhone}
                />
                <DetailRow
                  icon={Mail}
                  label="Email"
                  value={detailSupplier.contactEmail}
                />
                <DetailRow
                  icon={MapPin}
                  label="Dirección"
                  value={detailSupplier.address}
                />
                {(detailSupplier.address?.trim() ||
                  (detailSupplier.latitude != null &&
                    detailSupplier.longitude != null)) && (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={
                        detailSupplier.latitude != null &&
                        detailSupplier.longitude != null
                          ? `https://www.google.com/maps/search/?api=1&query=${detailSupplier.latitude},${detailSupplier.longitude}`
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailSupplier.address!.trim())}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      Ver en Google Maps
                    </a>
                  </div>
                )}
                <DetailRow
                  icon={FileText}
                  label="Notas"
                  value={detailSupplier.notes}
                />
              </div>

              {/* Productos vinculados */}
              <div className="mt-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                  Productos vinculados
                </p>
                {(detailSupplier.productSuppliers?.length ?? 0) > 0 ? (
                  <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                    {detailSupplier.productSuppliers?.map((ps) => (
                      <li
                        key={ps.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-white dark:bg-gray-700/50 px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200"
                      >
                        <span className="truncate">
                          {ps.product?.name ?? ps.productId}
                        </span>
                        {ps.unitCost != null && (
                          <span className="shrink-0 text-gray-500 dark:text-gray-400">
                            ${Number(ps.unitCost).toLocaleString("es-AR")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {detailSupplier.products?.length ?? 0} productos vinculados
                  </p>
                )}
              </div>

              {/* Última lista de precios */}
              <div className="mt-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">
                  Última lista de precios
                </p>
                {detailPriceLists.length > 0 ? (
                  <p className="text-sm text-gray-700 dark:text-white">
                    {detailPriceLists[0].fileName}
                    <span className="ml-1.5 text-gray-400 dark:text-gray-300">
                      ({new Date(detailPriceLists[0].createdAt).toLocaleDateString("es-AR")})
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-white">Sin listado cargado</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailSupplier(null)
                    handleEdit(detailSupplier)
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <Edit className="h-4 w-4" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailSupplier(null)
                    handleEdit(detailSupplier)
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/40 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Actualizar listado de precios
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDetailSupplier(null)}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* -------- Modal: ¿Qué producto estás buscando? -------- */}
      <Modal
        open={showCompareProductModal}
        onClose={() => !productSearchLoading && setShowCompareProductModal(false)}
        title="Comparar precios"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            ¿Qué producto estás buscando? La IA buscará productos con el mismo nombre o similares en el catálogo y mostrará la comparación de precios entre proveedores.
          </p>
          <input
            type="text"
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (productSearchQuery.trim() && !productSearchLoading) handleProductSearch()
              }
            }}
            placeholder="Ej: Levadura, Margarina, Harina"
            className="mb-4 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCompareProductModal(false)}
              disabled={productSearchLoading}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleProductSearch}
              disabled={!productSearchQuery.trim() || productSearchLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {productSearchLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                "Buscar"
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* -------- Delete Confirmation Modal -------- */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Eliminar Proveedor"
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <>
            <div className="p-6">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                ¿Estás seguro de que deseas eliminar al proveedor{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {deleteTarget.name}
                </span>
                ? Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar"
                )}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
