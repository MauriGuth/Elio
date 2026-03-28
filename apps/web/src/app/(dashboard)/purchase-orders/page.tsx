"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { sileo } from "sileo"
import {
  PackagePlus,
  Loader2,
  Warehouse,
  ShoppingCart,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Building2,
  AlertTriangle,
  X,
} from "lucide-react"
import { locationsApi } from "@/lib/api/locations"
import { productsApi } from "@/lib/api/products"
import { purchaseOrdersApi } from "@/lib/api/purchase-orders"
import { suppliersApi } from "@/lib/api/suppliers"
import { stockApi } from "@/lib/api/stock"
import { categoriesApi } from "@/lib/api/categories"
import { cn, formatCurrency } from "@/lib/utils"

/** Igual que en Stock: nombre mostrado de categoría (sin prefijo Tipo:/Familia:). */
function getCategoryDisplayName(name: string | null | undefined): string {
  if (!name) return ""
  return name.replace(/^(Tipo|Familia|Agrupar):\s*/i, "").trim() || name
}

type StockSummaryRow = {
  id: string
  productId: string
  product: {
    id: string
    name: string
    sku: string | null
    unit: string
    avgCost: number
    familia?: string | null
    category?: { name: string; slug?: string } | null
    productSuppliers?: Array<{ supplier: { id: string; name: string } }>
  }
  locationId: string
  location: { id: string; name: string; type: string }
  quantity: number
  minQuantity: number
  maxQuantity: number | null
  status: "critical" | "medium" | "normal"
  suggestedOrderQty: number
  soldLast7Days: number
  soldLast30Days: number
  suggestedOrderQtyByDemand: number
}

const stockStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  critical: {
    label: "Crítico",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-800 dark:text-red-200",
    dot: "bg-red-500",
  },
  medium: {
    label: "Bajo",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  normal: {
    label: "Normal",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
}

const priceStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  ok: { label: "Precio OK", bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-300" },
  expensive: { label: "Más caro", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200" },
  cheap: { label: "Más barato", bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-800 dark:text-green-200" },
}

const statusLabel: Record<string, string> = {
  draft: "Borrador",
  placed: "Pedido realizado",
  confirmed: "Confirmado",
  received: "Recibido",
  approved_payment: "Aprobado / Pagado",
}

type ManualPedidoLine = {
  productId: string
  name: string
  sku: string | null
  unit: string
  quantity: number
  unitCost: number
}

function unitCostForSupplier(product: any, supplierId: string): number {
  const links =
    product?.productSuppliers?.filter(
      (ps: any) => ps.supplier?.isActive !== false,
    ) ?? []
  const linkForSupplier = links.find(
    (ps: any) => ps.supplier?.id === supplierId,
  )
  return Number(linkForSupplier?.unitCost ?? product?.avgCost ?? 0)
}

function parsePedidoQty(raw: string): number {
  return parseFloat(String(raw).replace(",", "."))
}

export default function PurchaseOrdersPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [depotId, setDepotId] = useState("")
  const [activeTab, setActiveTab] = useState<"demand" | "orders">("demand")
  const [demandSummary, setDemandSummary] = useState<any>(null)
  const [loadingDemand, setLoadingDemand] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [orders, setOrders] = useState<any[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [filterStatus, setFilterStatus] = useState("")
  const [supplierFilterId, setSupplierFilterId] = useState("")
  const [familiaFilter, setFamiliaFilter] = useState("")
  const [categoriesForFamilia, setCategoriesForFamilia] = useState<any[]>([])
  const [suppliersList, setSuppliersList] = useState<any[]>([])
  const [stockSummaryRows, setStockSummaryRows] = useState<StockSummaryRow[]>([])
  const [loadingStockSummary, setLoadingStockSummary] = useState(false)
  const [showFaltantesTable, setShowFaltantesTable] = useState(false)
  const [showGenerarPedidoModal, setShowGenerarPedidoModal] = useState(false)
  const [generarPedidoSearch, setGenerarPedidoSearch] = useState("")
  const [generarPedidoSearchLoading, setGenerarPedidoSearchLoading] = useState(false)
  const [generarPedidoResults, setGenerarPedidoResults] = useState<any[]>([])
  const [generarPedidoProduct, setGenerarPedidoProduct] = useState<any | null>(null)
  const [generarPedidoQty, setGenerarPedidoQty] = useState<string>("1")
  const [generarPedidoSupplierId, setGenerarPedidoSupplierId] = useState("")
  const [generarPedidoLines, setGenerarPedidoLines] = useState<ManualPedidoLine[]>(
    [],
  )
  const [generarPedidoSubmitting, setGenerarPedidoSubmitting] = useState(false)

  useEffect(() => {
    locationsApi.getAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as any)?.data ?? []
      setLocations(list)
      const depot = list.find((l: any) => l.type === "WAREHOUSE")
      if (depot && !depotId) setDepotId(depot.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    suppliersApi
      .getAll({ isActive: true, limit: 500 })
      .then((res) => {
        const list = (res as any)?.data ?? []
        setSuppliersList(
          [...list].sort((a: any, b: any) =>
            String(a.name ?? "").localeCompare(String(b.name ?? ""), "es"),
          ),
        )
      })
      .catch(() => setSuppliersList([]))
  }, [])

  useEffect(() => {
    categoriesApi
      .getAll({ isActive: true })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any)?.data ?? []
        setCategoriesForFamilia(list)
      })
      .catch(() => setCategoriesForFamilia([]))
  }, [])

  const loadStockSummary = useCallback(async () => {
    if (!depotId) return
    setLoadingStockSummary(true)
    try {
      const data = await stockApi.getLogisticsSummary(depotId, true)
      const rows = Array.isArray(data) ? data : []
      const bajoOCritico = rows.filter(
        (r: StockSummaryRow) => r.status === "critical" || r.status === "medium"
      )
      setStockSummaryRows(bajoOCritico)
    } catch {
      setStockSummaryRows([])
    } finally {
      setLoadingStockSummary(false)
    }
  }, [depotId])

  useEffect(() => {
    if (!depotId) return
    setShowFaltantesTable(false)
    setStockSummaryRows([])
    setDemandSummary(null)
    setFamiliaFilter("")
  }, [depotId])

  const handleVerFaltantesPorProveedor = useCallback(async () => {
    if (!depotId) return
    setShowFaltantesTable(true)
    setDemandSummary(null)
    setStockSummaryRows([])
    setLoadingStockSummary(true)
    setLoadingDemand(true)
    try {
      const [stockData, demandData] = await Promise.all([
        stockApi.getLogisticsSummary(depotId, true),
        purchaseOrdersApi.getDemandSummary(depotId).catch((err: any) => {
          sileo.error({ title: err?.message ?? "Error al cargar demanda" })
          return null
        }),
      ])
      const rows = Array.isArray(stockData) ? stockData : []
      setStockSummaryRows(rows.filter((r: StockSummaryRow) => r.status === "critical" || r.status === "medium"))
      if (demandData) setDemandSummary(demandData)
    } finally {
      setLoadingStockSummary(false)
      setLoadingDemand(false)
    }
  }, [depotId])

  const loadDemandSummary = useCallback(async () => {
    if (!depotId) return
    setLoadingDemand(true)
    setDemandSummary(null)
    try {
      const data = await purchaseOrdersApi.getDemandSummary(depotId)
      setDemandSummary(data)
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al cargar resumen de demanda" })
    } finally {
      setLoadingDemand(false)
    }
  }, [depotId])

  const placeholderSupplierId = useMemo(() => {
    const s = suppliersList.find((x: any) =>
      /sin asignar|pendiente/i.test(String(x.name ?? "")),
    )
    return (s?.id as string | undefined) ?? null
  }, [suppliersList])

  const familiaOptions = useMemo(() => {
    return categoriesForFamilia
      .filter((c: any) => String(c.slug ?? "").startsWith("familia-"))
      .sort((a: any, b: any) =>
        getCategoryDisplayName(a.name).localeCompare(
          getCategoryDisplayName(b.name),
          "es",
          { sensitivity: "base" },
        ),
      )
  }, [categoriesForFamilia])

  const productIdsInFullDemand = useMemo(
    () =>
      new Set(
        (demandSummary?.bySupplier ?? []).flatMap((g: any) =>
          g.items.map((i: any) => i.productId),
        ),
      ),
    [demandSummary],
  )

  const productFamiliaById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const r of stockSummaryRows) {
      m.set(r.productId, r.product.familia ?? null)
    }
    return m
  }, [stockSummaryRows])

  const familiaFilterTrim = familiaFilter.trim()

  const visibleDemandGroups = useMemo(() => {
    const groups = demandSummary?.bySupplier ?? []
    let next: typeof groups
    if (!supplierFilterId) {
      next = groups
    } else if (placeholderSupplierId && supplierFilterId === placeholderSupplierId) {
      next = []
    } else {
      next = groups.filter((g: any) => g.supplier.id === supplierFilterId)
    }
    if (!familiaFilterTrim) return next
    return next
      .map((g: any) => ({
        ...g,
        items: (g.items as any[]).filter(
          (it: any) =>
            (productFamiliaById.get(it.productId) ?? "").trim() ===
            familiaFilterTrim,
        ),
      }))
      .filter((g: any) => g.items.length > 0)
  }, [
    demandSummary,
    supplierFilterId,
    placeholderSupplierId,
    familiaFilterTrim,
    productFamiliaById,
  ])

  const rowsSinProveedorFiltered = useMemo(() => {
    const base = stockSummaryRows.filter(
      (r) => !productIdsInFullDemand.has(r.productId),
    )
    let rows: StockSummaryRow[]
    if (!supplierFilterId) {
      rows = base
    } else if (placeholderSupplierId && supplierFilterId === placeholderSupplierId) {
      rows = base
    } else {
      rows = []
    }
    if (!familiaFilterTrim) return rows
    return rows.filter(
      (r) => (r.product.familia ?? "").trim() === familiaFilterTrim,
    )
  }, [
    stockSummaryRows,
    productIdsInFullDemand,
    supplierFilterId,
    placeholderSupplierId,
    familiaFilterTrim,
  ])

  const hasVisibleDemandContent =
    visibleDemandGroups.length > 0 || rowsSinProveedorFiltered.length > 0

  const filteredDemandProductCount = useMemo(() => {
    let n = visibleDemandGroups.reduce(
      (acc: number, g: any) => acc + (g.items?.length ?? 0),
      0,
    )
    n += rowsSinProveedorFiltered.length
    return n
  }, [visibleDemandGroups, rowsSinProveedorFiltered])

  /** Si el proveedor elegido no aparece en el resumen de demanda, no hay filas para mostrar al filtrar. */
  const selectedSupplierInDemand = useMemo(() => {
    if (!supplierFilterId) return null
    if (!demandSummary?.bySupplier) return null
    if (placeholderSupplierId && supplierFilterId === placeholderSupplierId) {
      return rowsSinProveedorFiltered.length > 0
    }
    return (demandSummary.bySupplier as any[]).some(
      (g: any) => g.supplier?.id === supplierFilterId,
    )
  }, [
    supplierFilterId,
    demandSummary,
    placeholderSupplierId,
    rowsSinProveedorFiltered,
  ])

  const selectedSupplierName = useMemo(() => {
    if (!supplierFilterId) return null
    return (
      suppliersList.find((s: any) => s.id === supplierFilterId)?.name ?? null
    )
  }, [supplierFilterId, suppliersList])

  const handleGenerateOrders = async () => {
    if (!depotId) return
    const familiaTrim = familiaFilter.trim()
    setGenerating(true)
    try {
      let productIds: string[] | undefined
      if (!supplierFilterId && !familiaTrim) {
        productIds = undefined
      } else {
        const ids = new Set<string>()
        for (const g of visibleDemandGroups) {
          for (const it of g.items) ids.add(it.productId)
        }
        rowsSinProveedorFiltered.forEach((r) => ids.add(r.productId))
        productIds = [...ids]
        if (productIds.length === 0) {
          sileo.error({
            title: "No hay productos para generar con los filtros actuales",
          })
          return
        }
      }
      const created = await purchaseOrdersApi.generateFromDemand({
        locationId: depotId,
        ...(productIds ? { productIds } : {}),
      })
      sileo.success({ title: `Se generaron ${created?.length ?? 0} orden(es) de compra en borrador` })
      setActiveTab("orders")
      setDemandSummary(null)
      loadOrders()
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al generar órdenes" })
    } finally {
      setGenerating(false)
    }
  }

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const res = await purchaseOrdersApi.getAll({
        locationId: depotId || undefined,
        supplierId: supplierFilterId || undefined,
        status: filterStatus || undefined,
        limit: 50,
      })
      const data = (res as any)?.data ?? []
      const total = (res as any)?.total ?? 0
      setOrders(data)
      setOrdersTotal(total)
    } catch {
      setOrders([])
      setOrdersTotal(0)
    } finally {
      setLoadingOrders(false)
    }
  }, [depotId, filterStatus, supplierFilterId])

  useEffect(() => {
    if (activeTab === "orders" && (depotId || filterStatus !== undefined)) loadOrders()
  }, [activeTab, loadOrders])

  useEffect(() => {
    if (!showGenerarPedidoModal) return
    const q = generarPedidoSearch.trim()
    if (!generarPedidoSupplierId) {
      setGenerarPedidoResults([])
      setGenerarPedidoSearchLoading(false)
      return
    }
    if (q.length < 2) {
      setGenerarPedidoResults([])
      return
    }
    const t = setTimeout(() => {
      setGenerarPedidoSearchLoading(true)
      productsApi
        .getAll({
          search: q,
          limit: 20,
          isActive: true,
          supplierId: generarPedidoSupplierId,
        })
        .then((res) => {
          setGenerarPedidoResults((res as any)?.data ?? [])
        })
        .catch(() => setGenerarPedidoResults([]))
        .finally(() => setGenerarPedidoSearchLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [
    generarPedidoSearch,
    showGenerarPedidoModal,
    generarPedidoSupplierId,
  ])

  const handleAgregarLineaPedido = async () => {
    if (!generarPedidoSupplierId) {
      sileo.error({ title: "Elegí un proveedor" })
      return
    }
    if (!generarPedidoProduct) {
      sileo.error({ title: "Buscá y elegí un producto" })
      return
    }
    const qty = parsePedidoQty(generarPedidoQty)
    if (!Number.isFinite(qty) || qty < 0.001) {
      sileo.error({ title: "Ingresá una cantidad mayor a 0" })
      return
    }
    try {
      const product = await productsApi.getById(generarPedidoProduct.id)
      const unitCost = unitCostForSupplier(product, generarPedidoSupplierId)
      const unit = String((product as any).unit ?? generarPedidoProduct.unit ?? "")
      setGenerarPedidoLines((prev) => {
        const i = prev.findIndex((l) => l.productId === generarPedidoProduct.id)
        if (i >= 0) {
          const next = [...prev]
          const sum = Math.round((next[i].quantity + qty) * 1000) / 1000
          next[i] = { ...next[i], quantity: sum }
          return next
        }
        return [
          ...prev,
          {
            productId: generarPedidoProduct.id,
            name: generarPedidoProduct.name,
            sku: generarPedidoProduct.sku ?? null,
            unit,
            quantity: qty,
            unitCost,
          },
        ]
      })
      setGenerarPedidoProduct(null)
      setGenerarPedidoSearch("")
      setGenerarPedidoResults([])
      setGenerarPedidoQty("1")
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al agregar el producto" })
    }
  }

  const handleGenerarPedidoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!depotId) return
    if (!generarPedidoSupplierId) {
      sileo.error({ title: "Elegí un proveedor" })
      return
    }

    let lines: ManualPedidoLine[] = generarPedidoLines.map((l) => ({ ...l }))

    if (generarPedidoProduct) {
      const qty = parsePedidoQty(generarPedidoQty)
      if (Number.isFinite(qty) && qty >= 0.001) {
        try {
          const product = await productsApi.getById(generarPedidoProduct.id)
          const unitCost = unitCostForSupplier(product, generarPedidoSupplierId)
          const unit = String(
            (product as any).unit ?? generarPedidoProduct.unit ?? "",
          )
          const idx = lines.findIndex((l) => l.productId === generarPedidoProduct.id)
          if (idx >= 0) {
            lines[idx] = {
              ...lines[idx],
              quantity:
                Math.round((lines[idx].quantity + qty) * 1000) / 1000,
            }
          } else {
            lines.push({
              productId: generarPedidoProduct.id,
              name: generarPedidoProduct.name,
              sku: generarPedidoProduct.sku ?? null,
              unit,
              quantity: qty,
              unitCost,
            })
          }
        } catch (err: any) {
          sileo.error({ title: err?.message ?? "Error al armar la orden" })
          return
        }
      }
    }

    if (lines.length === 0) {
      sileo.error({
        title:
          "Indicá cantidad y tocá «Agregar a la lista», o dejá el producto con cantidad y creá la orden.",
      })
      return
    }

    setGenerarPedidoSubmitting(true)
    try {
      await purchaseOrdersApi.create({
        locationId: depotId,
        supplierId: generarPedidoSupplierId,
        notes:
          lines.length > 1
            ? `Pedido manual (${lines.length} productos).`
            : "Pedido manual (un producto).",
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          priceStatus: "ok",
        })),
      })
      sileo.success({ title: "Orden de compra creada en borrador" })
      setShowGenerarPedidoModal(false)
      setGenerarPedidoProduct(null)
      setGenerarPedidoSearch("")
      setGenerarPedidoQty("1")
      setGenerarPedidoSupplierId(supplierFilterId || "")
      setGenerarPedidoResults([])
      setGenerarPedidoLines([])
      setActiveTab("orders")
      loadOrders()
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al crear la orden" })
    } finally {
      setGenerarPedidoSubmitting(false)
    }
  }

  const depotOptions = locations.filter((l: any) => l.type === "WAREHOUSE")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pedidos/Compras
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Stock del depósito y sugerencia de pedido según mínimo y máximo. Base para reponer por demanda (como Resumen para logística). Solo depósito; no se incluyen locales. Si un producto aparece crítico en Stock pero no acá, revisá la categoría del producto (debe ser de insumos/producto o familia comprable); podés usar <strong className="font-medium text-gray-700 dark:text-gray-300">Generar pedido</strong> para forzar un ítem.
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generá una orden de pedido con detalle por <strong>rubro y artículos</strong> (faltantes a proveedores) e indicación si comprás <strong>caro o barato</strong>.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Proceso: 1) Generar orden de pedido → 2) Hacer el pedido → 3) Confirmación de pedido realizado → 4) Recepción de pedido → 5) Aprobación y pago.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-start justify-center gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Depósito
            </label>
            <select
              value={depotId}
              onChange={(e) => setDepotId(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm min-w-[200px]"
              aria-label="Seleccionar depósito"
            >
              <option value="">Seleccionar depósito</option>
              {depotOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="max-w-[min(100vw-2rem,320px)]">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Proveedor (faltantes)
            </label>
            <select
              value={supplierFilterId}
              onChange={(e) => setSupplierFilterId(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm min-w-[200px] w-full max-w-[min(100vw-2rem,280px)]"
              aria-label="Filtrar faltantes por proveedor"
            >
              <option value="">Todos los proveedores</option>
              {suppliersList.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {activeTab === "demand" && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Solo acota la tabla de <strong className="font-medium text-gray-600 dark:text-gray-300">faltantes</strong> (crítico/medio). No muestra todo el catálogo del proveedor. Los productos deben estar vinculados a ese proveedor y en nivel bajo en este depósito.
              </p>
            )}
            {activeTab === "orders" && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Filtra las órdenes de compra por proveedor.
              </p>
            )}
          </div>
          <div className="max-w-[min(100vw-2rem,280px)]">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Familia (faltantes)
            </label>
            <select
              value={familiaFilter}
              onChange={(e) => setFamiliaFilter(e.target.value)}
              disabled={activeTab !== "demand"}
              className={cn(
                "rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm min-w-[200px] w-full max-w-[min(100vw-2rem,280px)]",
                activeTab !== "demand" && "cursor-not-allowed opacity-60",
              )}
              aria-label="Filtrar faltantes por familia de producto"
            >
              <option value="">Todas las familias</option>
              {familiaOptions.map((c: any) => {
                const label = getCategoryDisplayName(c.name)
                return (
                  <option key={c.id} value={label}>
                    {label}
                  </option>
                )
              })}
            </select>
            {activeTab === "demand" && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Acota la tabla de <strong className="font-medium text-gray-600 dark:text-gray-300">faltantes</strong> al valor de familia del producto (mismo criterio que en Stock: categorías con slug <code className="text-[10px]">familia-*</code>).
              </p>
            )}
            {activeTab === "orders" && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                Solo aplica en la pestaña <strong className="font-medium text-gray-600 dark:text-gray-300">Por demanda</strong>.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("demand")}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "demand"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              Por demanda
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "orders"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              Órdenes
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGenerarPedidoModal(true)
                setGenerarPedidoProduct(null)
                setGenerarPedidoSearch("")
                setGenerarPedidoQty("1")
                setGenerarPedidoSupplierId(supplierFilterId || "")
                setGenerarPedidoResults([])
                setGenerarPedidoLines([])
              }}
              disabled={!depotId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generar pedido
            </button>
          </div>
          {activeTab === "orders" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Estado
              </label>
              <select
                aria-label="Filtrar por estado"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="draft">Borrador</option>
                <option value="placed">Pedido realizado</option>
                <option value="confirmed">Confirmado</option>
                <option value="received">Recibido</option>
                <option value="approved_payment">Aprobado / Pagado</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {activeTab === "demand" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
              Productos del depósito en nivel <strong>crítico o medio</strong>. Base para reponer por demanda.
            </p>
            <button
              type="button"
              onClick={handleVerFaltantesPorProveedor}
              disabled={!depotId || loadingStockSummary}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingStockSummary && showFaltantesTable ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Ver faltantes por proveedor
            </button>
          </div>

          {/* Una sola lista: stock (crítico/medio) + detalle por proveedor (rubro, artículos, caro/barato) */}
          {depotId && showFaltantesTable && (
            <>
              {(loadingStockSummary || loadingDemand) ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : stockSummaryRows.length > 0 && !hasVisibleDemandContent ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-8 text-left sm:p-10">
                  <Building2 className="mx-auto mb-3 h-10 w-10 text-amber-600/80 dark:text-amber-500/90 sm:mx-0" />
                  <p className="text-center text-sm font-semibold text-gray-900 dark:text-white sm:text-left">
                    {selectedSupplierName
                      ? `No hay faltantes para «${selectedSupplierName}» en este depósito`
                      : "No hay faltantes que coincidan con el filtro"}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    Esta vista no lista todos los productos del proveedor: solo los que están en{" "}
                    <strong>nivel crítico o medio</strong> en el depósito y entran en el cálculo de
                    demanda. Además, cada artículo debe tener{" "}
                    <strong>vínculo con ese proveedor</strong> en el producto (Stock &amp; Productos →
                    proveedores).
                  </p>
                  {supplierFilterId &&
                    selectedSupplierInDemand === false &&
                    !(
                      placeholderSupplierId &&
                      supplierFilterId === placeholderSupplierId
                    ) && (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        En el resumen cargado, <strong>ningún faltante</strong> quedó asignado a este
                        proveedor (puede que sus productos estén en stock normal o sin vínculo).
                      </p>
                    )}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setSupplierFilterId("")}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Ver todos los proveedores
                    </button>
                    {familiaFilterTrim ? (
                      <button
                        type="button"
                        onClick={() => setFamiliaFilter("")}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Todas las familias
                      </button>
                    ) : null}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      o usá <strong className="font-medium text-gray-700 dark:text-gray-300">Generar pedido</strong> para un producto puntual.
                    </span>
                  </div>
                </div>
              ) : stockSummaryRows.length > 0 ? (
                <div className="space-y-8">
                  {/* Productos con proveedor (demand summary) */}
                  {visibleDemandGroups.map((group: any) => {
                    const stockByProductId = new Map(stockSummaryRows.map((r) => [r.productId, r]))
                    return (
                      <div
                        key={group.supplier.id}
                        className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      >
                        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {group.supplier.name}
                              {group.supplier.rubro && (
                                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                  · {group.supplier.rubro}
                                </span>
                              )}
                            </h2>
                          </div>
                          <span className="rounded-full bg-gray-200 dark:bg-gray-600 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                            {group.items.length} producto{group.items.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1000px] text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                <th className="px-4 py-3">Rubro</th>
                                <th className="px-4 py-3">Artículo</th>
                                <th className="px-4 py-3 text-right">Actual</th>
                                <th className="px-4 py-3 text-right">Mín.</th>
                                <th className="px-4 py-3 text-right">Máx.</th>
                                <th className="px-4 py-3 text-right">Ventas 7d</th>
                                <th className="px-4 py-3 text-right">Ventas 30d</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Sug. (mín/máx)</th>
                                <th className="px-4 py-3 text-right">Sug. (por demanda)</th>
                                <th className="px-4 py-3 text-right">Cantidad</th>
                                <th className="px-4 py-3 text-right">Precio lista</th>
                                <th className="px-4 py-3 text-right">Último precio</th>
                                <th className="px-4 py-3">Comprando (caro/barato)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {group.items.map((item: any, idx: number) => {
                                const stock = stockByProductId.get(item.productId)
                                const config = stockStatusConfig[stock?.status ?? "normal"] ?? stockStatusConfig.normal
                                const ps = priceStatusConfig[item.priceStatus] ?? priceStatusConfig.ok
                                return (
                                  <tr key={`${item.productId}-${idx}`} className="text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.categoryName}</td>
                                    <td className="px-4 py-3">
                                      <p className="font-medium text-gray-900 dark:text-white">{item.productName}</p>
                                      {item.sku && <p className="text-xs text-gray-500 dark:text-gray-400">{item.sku} · {item.unit}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                                      {stock != null ? Number(stock.quantity).toLocaleString("es-AR") : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                      {stock != null ? Number(stock.minQuantity).toLocaleString("es-AR") : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                      {stock?.maxQuantity != null ? Number(stock.maxQuantity).toLocaleString("es-AR") : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                      {(stock?.soldLast7Days ?? 0) > 0 ? Number(stock?.soldLast7Days).toLocaleString("es-AR") : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                      {(stock?.soldLast30Days ?? 0) > 0 ? Number(stock?.soldLast30Days).toLocaleString("es-AR") : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                      {stock ? (
                                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", config.bg, config.text)}>
                                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
                                          {config.label}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {stock && stock.suggestedOrderQty > 0 ? (
                                        <span className="tabular-nums text-blue-700 dark:text-blue-300">
                                          {Number(stock.suggestedOrderQty).toLocaleString("es-AR")} {item.unit}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {stock && stock.suggestedOrderQtyByDemand > 0 ? (
                                        <span className="inline-flex items-center gap-1 tabular-nums text-violet-700 dark:text-violet-300" title="Por demanda">
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                          {Number(stock.suggestedOrderQtyByDemand).toLocaleString("es-AR")} {item.unit}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-medium">{item.quantity}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.unitCost)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                      {item.lastKnownCost != null ? formatCurrency(item.lastKnownCost) : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", ps.bg, ps.text)}>
                                        {item.priceStatus === "expensive" && <TrendingUp className="h-3 w-3" />}
                                        {item.priceStatus === "cheap" && <TrendingDown className="h-3 w-3" />}
                                        {item.priceStatus === "ok" && <Minus className="h-3 w-3" />}
                                        {ps.label}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}

                  {/* Todos los productos en crítico o medio: los que no tienen proveedor en la demanda */}
                  {rowsSinProveedorFiltered.length > 0 ? (() => {
                    const rowsSinProveedor = rowsSinProveedorFiltered
                    const esSoloBlock = rowsSinProveedor.length === stockSummaryRows.length
                    return (
                      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {esSoloBlock ? "Todos los productos del depósito (crítico o medio)" : "Resto del depósito (crítico o medio, sin proveedor en esta demanda)"}
                            </h2>
                          </div>
                          <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                            {rowsSinProveedor.length} producto{rowsSinProveedor.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1000px] text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                <th className="px-4 py-3">Rubro</th>
                                <th className="px-4 py-3">Artículo</th>
                                <th className="px-4 py-3 text-right">Actual</th>
                                <th className="px-4 py-3 text-right">Mín.</th>
                                <th className="px-4 py-3 text-right">Máx.</th>
                                <th className="px-4 py-3 text-right">Ventas 7d</th>
                                <th className="px-4 py-3 text-right">Ventas 30d</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-right">Sug. (mín/máx)</th>
                                <th className="px-4 py-3 text-right">Sug. (por demanda)</th>
                                <th className="px-4 py-3 text-right">Cantidad</th>
                                <th className="px-4 py-3 text-right">Precio lista</th>
                                <th className="px-4 py-3 text-right">Último precio</th>
                                <th className="px-4 py-3">Comprando (caro/barato)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {rowsSinProveedor.map((row) => {
                                const config = stockStatusConfig[row.status] ?? stockStatusConfig.normal
                                const categoryName = (row.product as any)?.category?.name ?? null
                                return (
                                  <tr key={row.id} className="text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{categoryName ?? "—"}</td>
                                    <td className="px-4 py-3">
                                      <p className="font-medium text-gray-900 dark:text-white">{row.product.name}</p>
                                      {row.product.sku && <p className="text-xs text-gray-500 dark:text-gray-400">{row.product.sku} · {row.product.unit}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-medium">{Number(row.quantity).toLocaleString("es-AR")}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{Number(row.minQuantity).toLocaleString("es-AR")}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{row.maxQuantity != null ? Number(row.maxQuantity).toLocaleString("es-AR") : "—"}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{(row.soldLast7Days ?? 0) > 0 ? Number(row.soldLast7Days).toLocaleString("es-AR") : "—"}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{(row.soldLast30Days ?? 0) > 0 ? Number(row.soldLast30Days).toLocaleString("es-AR") : "—"}</td>
                                    <td className="px-4 py-3">
                                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", config.bg, config.text)}>
                                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
                                        {config.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {row.suggestedOrderQty > 0 ? <span className="tabular-nums text-blue-700 dark:text-blue-300">{Number(row.suggestedOrderQty).toLocaleString("es-AR")} {row.product.unit}</span> : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {row.suggestedOrderQtyByDemand > 0 ? <span className="inline-flex items-center gap-1 tabular-nums text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3.5 w-3.5" />{Number(row.suggestedOrderQtyByDemand).toLocaleString("es-AR")} {row.product.unit}</span> : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                                    <td className="px-4 py-3 text-gray-400">—</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })() : null}

                  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Paso 1 del proceso ·{" "}
                      {supplierFilterId
                        ? `${filteredDemandProductCount} producto${filteredDemandProductCount !== 1 ? "s" : ""} (filtro)`
                        : `${stockSummaryRows.length} producto${stockSummaryRows.length !== 1 ? "s" : ""} en crítico o medio`}
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateOrders}
                      disabled={
                        generating ||
                        stockSummaryRows.length === 0 ||
                        !hasVisibleDemandContent
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Generar orden de pedido
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
                  <PackagePlus className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    No hay productos en bajo o crítico en este depósito.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "orders" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {loadingOrders ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              No hay órdenes de compra para los filtros seleccionados.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {orders.map((po: any) => (
                <li key={po.id}>
                  <Link
                    href={`/purchase-orders/${po.id}`}
                    className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                        <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{po.orderNumber}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {po.supplier?.name ?? "—"} · {po.location?.name ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {statusLabel[po.status] ?? po.status}
                      </span>
                      {po.totalAmount != null && (
                        <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                          {formatCurrency(po.totalAmount)}
                        </span>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showGenerarPedidoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="generar-pedido-title"
        >
          <div className="relative w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => {
                setShowGenerarPedidoModal(false)
                setGenerarPedidoLines([])
              }}
              className="absolute right-3 top-3 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <h2
              id="generar-pedido-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Generar pedido
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Se crea una orden en <strong>borrador</strong> para el depósito seleccionado. Al
              hacer el pedido (desde el detalle), el ingreso queda como hoy en{" "}
              <strong>Ingresos</strong>. Indicá la <strong>cantidad</strong> por producto; podés
              armar la orden con varios ítems antes de crearla.
            </p>
            <form onSubmit={handleGenerarPedidoSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Proveedor
                </label>
                <select
                  value={generarPedidoSupplierId}
                  onChange={(e) => {
                    setGenerarPedidoSupplierId(e.target.value)
                    setGenerarPedidoProduct(null)
                    setGenerarPedidoSearch("")
                    setGenerarPedidoResults([])
                    setGenerarPedidoLines([])
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  aria-label="Proveedor para la orden"
                  required
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliersList.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  El precio unitario usa el vínculo producto–proveedor si existe; si no, el costo
                  promedio del producto. La búsqueda solo lista productos vinculados a este
                  proveedor.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Buscar producto
                </label>
                <input
                  type="search"
                  value={generarPedidoSearch}
                  onChange={(e) => setGenerarPedidoSearch(e.target.value)}
                  placeholder={
                    generarPedidoSupplierId
                      ? "Nombre o SKU (mín. 2 caracteres)"
                      : "Primero elegí un proveedor"
                  }
                  disabled={!generarPedidoSupplierId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  autoComplete="off"
                />
                {!generarPedidoSupplierId && (
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Se muestran solo productos que tengan vínculo con el proveedor elegido (Stock &amp;
                    Productos → proveedores).
                  </p>
                )}
                {generarPedidoSearchLoading && (
                  <p className="mt-1 text-xs text-gray-500">Buscando…</p>
                )}
                {!generarPedidoSearchLoading &&
                  generarPedidoSupplierId &&
                  generarPedidoSearch.trim().length >= 2 &&
                  generarPedidoResults.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600">
                      {generarPedidoResults.map((p: any) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setGenerarPedidoProduct(p)
                              setGenerarPedidoSearch("")
                              setGenerarPedidoResults([])
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <span className="font-medium text-gray-900 dark:text-white">
                              {p.name}
                            </span>
                            {p.sku && (
                              <span className="ml-2 text-xs text-gray-500">
                                {p.sku}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                {!generarPedidoSearchLoading &&
                  generarPedidoSupplierId &&
                  generarPedidoSearch.trim().length >= 2 &&
                  generarPedidoResults.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      No hay productos de este proveedor que coincidan con la búsqueda. Revisá el
                      vínculo en el producto o probá otro término.
                    </p>
                  )}
              </div>
              {generarPedidoProduct && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                    Producto seleccionado
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {generarPedidoProduct.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => setGenerarPedidoProduct(null)}
                    className="mt-1 text-xs text-blue-700 underline dark:text-blue-300"
                  >
                    Cambiar
                  </button>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label
                          htmlFor="generar-pedido-qty"
                          className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-300"
                        >
                          Cantidad a pedir
                        </label>
                        <input
                          id="generar-pedido-qty"
                          type="number"
                          min={0.001}
                          step="any"
                          value={generarPedidoQty}
                          onChange={(e) => setGenerarPedidoQty(e.target.value)}
                          className="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      {generarPedidoProduct.unit ? (
                        <span className="pb-2 text-xs text-gray-600 dark:text-gray-400">
                          Unidad: <strong className="font-medium">{generarPedidoProduct.unit}</strong>
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAgregarLineaPedido()}
                      disabled={generarPedidoSubmitting}
                      className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/40"
                    >
                      Agregar a la lista
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                    Si agregás varios productos, aparecen abajo y podés corregir cantidades. También
                    podés crear la orden directamente con este producto y la cantidad indicada (sin
                    tocar «Agregar a la lista»).
                  </p>
                </div>
              )}
              {generarPedidoLines.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200">
                    Productos en esta orden ({generarPedidoLines.length})
                  </p>
                  <div className="max-h-52 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-3 py-2 text-right">Cantidad</th>
                          <th className="w-10 px-2 py-2" aria-label="Quitar" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {generarPedidoLines.map((line) => (
                          <tr key={line.productId}>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                              <span className="font-medium">{line.name}</span>
                              {line.sku ? (
                                <span className="ml-1 text-xs text-gray-500">{line.sku}</span>
                              ) : null}
                              {line.unit ? (
                                <span className="block text-[11px] text-gray-500">
                                  Unidad: {line.unit}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min={0.001}
                                step="any"
                                value={line.quantity}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value)
                                  if (!Number.isFinite(v) || v < 0.001) return
                                  setGenerarPedidoLines((prev) =>
                                    prev.map((x) =>
                                      x.productId === line.productId
                                        ? { ...x, quantity: v }
                                        : x,
                                    ),
                                  )
                                }}
                                className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                aria-label={`Cantidad ${line.name}`}
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setGenerarPedidoLines((prev) =>
                                    prev.filter((x) => x.productId !== line.productId),
                                  )
                                }
                                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
                                aria-label={`Quitar ${line.name}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowGenerarPedidoModal(false)
                    setGenerarPedidoLines([])
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    generarPedidoSubmitting ||
                    !generarPedidoSupplierId ||
                    !depotId ||
                    !(
                      generarPedidoLines.length > 0 ||
                      (generarPedidoProduct != null &&
                        Number.isFinite(parsePedidoQty(generarPedidoQty)) &&
                        parsePedidoQty(generarPedidoQty) >= 0.001)
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {generarPedidoSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4" />
                  )}
                  Crear orden en borrador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
