"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { sileo } from "sileo"
import {
  ArrowLeft,
  Loader2,
  FileText,
  Building2,
  MapPin,
  Truck,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { purchaseOrdersApi } from "@/lib/api/purchase-orders"
import { productsApi } from "@/lib/api/products"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { cn, formatCurrency, triggerContentUpdateAnimation } from "@/lib/utils"

const STEPS = [
  { key: "draft", label: "Generar orden de pedido", status: "draft", icon: FileText },
  { key: "placed", label: "Hacer el pedido", status: "placed", icon: Truck },
] as const

const priceStatusLabel: Record<string, string> = {
  ok: "Precio OK",
  expensive: "Más caro vs último",
  cheap: "Más barato vs último",
}

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [po, setPo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editingQuantities, setEditingQuantities] = useState<Record<string, number>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addSearch, setAddSearch] = useState("")
  const [addSearchLoading, setAddSearchLoading] = useState(false)
  const [addResults, setAddResults] = useState<any[]>([])
  const [addProduct, setAddProduct] = useState<any | null>(null)
  const [addQty, setAddQty] = useState("1")
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    purchaseOrdersApi
      .getById(id)
      .then((data) => setPo(data))
      .catch((err) => {
        setError(err?.message ?? "Error al cargar")
        sileo.error({ title: err?.message ?? "Error al cargar la orden" })
      })
      .finally(() => setLoading(false))
  }, [id])

  const isPlacedOrLater = po?.status === "placed" || po?.status === "confirmed" || po?.status === "received" || po?.status === "approved_payment"
  const canPlace = po?.status === "draft"

  const handlePlace = async () => {
    if (!po?.id) return
    setActionLoading(true)
    try {
      const updated = await purchaseOrdersApi.place(po.id)
      setPo(updated)
      triggerContentUpdateAnimation()
      sileo.success({ title: "Orden marcada como pedido realizado" })
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error" })
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (!showAddModal) return
    const q = addSearch.trim()
    if (q.length < 2) {
      setAddResults([])
      return
    }
    const t = setTimeout(() => {
      setAddSearchLoading(true)
      productsApi
        .getAll({ search: q, limit: 20, isActive: true })
        .then((res) => setAddResults((res as any)?.data ?? []))
        .catch(() => setAddResults([]))
        .finally(() => setAddSearchLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [addSearch, showAddModal])

  const handleRemoveItem = async (itemId: string) => {
    if (!po?.id || po.status !== "draft") return
    if (
      typeof window !== "undefined" &&
      !window.confirm("¿Quitar este producto de la orden?")
    )
      return
    setRemovingItemId(itemId)
    try {
      const updated = await purchaseOrdersApi.removeItem(po.id, itemId)
      setPo(updated)
      triggerContentUpdateAnimation()
      sileo.success({ title: "Producto quitado de la orden" })
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al quitar el producto" })
    } finally {
      setRemovingItemId(null)
    }
  }

  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!po?.id || !addProduct) return
    const qty = parseFloat(String(addQty).replace(",", "."))
    if (!Number.isFinite(qty) || qty < 0.001) {
      sileo.error({ title: "Ingresá una cantidad mayor a 0" })
      return
    }
    setAddSubmitting(true)
    try {
      const updated = await purchaseOrdersApi.addItem(po.id, {
        productId: addProduct.id,
        quantity: qty,
      })
      setPo(updated)
      triggerContentUpdateAnimation()
      sileo.success({ title: "Producto agregado" })
      setShowAddModal(false)
      setAddProduct(null)
      setAddSearch("")
      setAddQty("1")
      setAddResults([])
    } catch (err: any) {
      sileo.error({ title: err?.message ?? "Error al agregar" })
    } finally {
      setAddSubmitting(false)
    }
  }

  const saveQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (!id || !po?.id || po?.status !== "draft") return
      const item = (po.items || []).find((i: any) => i.id === itemId)
      const current = item?.quantity ?? 0
      if (Math.abs(quantity - current) < 1e-9) return
      setSavingItemId(itemId)
      try {
        const updated = await purchaseOrdersApi.updateItem(po.id, itemId, { quantity })
        setPo(updated)
        triggerContentUpdateAnimation()
        setEditingQuantities((prev) => {
          const next = { ...prev }
          delete next[itemId]
          return next
        })
      } catch (err: any) {
        sileo.error({ title: err?.message ?? "Error al guardar cantidad" })
      } finally {
        setSavingItemId(null)
      }
    },
    [id, po?.id, po?.status, po?.items]
  )

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-6 text-center">
        <p className="text-red-700 dark:text-red-200">{error ?? "Orden no encontrada"}</p>
        <Link
          href="/purchase-orders"
          className="mt-4 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Pedidos/Compras
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-4 py-3">
        <Link
          href="/purchase-orders"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Pedidos/Compras
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{po.orderNumber}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {po.supplier?.name ?? "—"}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {po.location?.name ?? "—"}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                po.status === "draft" && "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
                (po.status === "placed" || po.status === "confirmed" || po.status === "received" || po.status === "approved_payment") && "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200"
              )}
            >
              {po.status === "draft" && "Borrador"}
              {(po.status === "placed" || po.status === "confirmed" || po.status === "received" || po.status === "approved_payment") && "Pedido realizado"}
            </span>
          </div>
        </div>

        {/* Flujo: solo 2 pasos */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50/50 dark:bg-gray-800/30">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Flujo de la orden
          </h2>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((step, idx) => {
              const done = step.status === "draft" ? isPlacedOrLater : isPlacedOrLater
              const current = (step.status === "draft" && po?.status === "draft") || (step.status === "placed" && po?.status === "placed")
              const Icon = step.icon
              return (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    done && "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200",
                    current && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200",
                    !done && !current && "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{step.label}</span>
                  {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-400" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Acciones según estado */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          {canPlace && (
            <button
              type="button"
              onClick={handlePlace}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Marcar como pedido realizado
            </button>
          )}
          {(po?.status === "placed" || po?.status === "confirmed" || po?.status === "received" || po?.status === "approved_payment") && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pedido realizado. El ingreso de mercadería se generó en borrador; controlalo en Ingresos de mercadería cuando llegue al depósito.
            </p>
          )}
        </div>

        {/* Detalle de ítems: todos los artículos de la orden */}
        <div className="px-6 py-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                Detalle
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {Array.isArray(po.items) ? po.items.length : 0} artículo
                {(Array.isArray(po.items) ? po.items.length : 0) !== 1 ? "s" : ""} en esta orden
              </p>
            </div>
            {canPlace && (
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(true)
                  setAddProduct(null)
                  setAddSearch("")
                  setAddQty("1")
                  setAddResults([])
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2 text-right">Cantidad</th>
                  <th className="px-4 py-2 text-right">Precio unit.</th>
                  <th className="px-4 py-2 text-right">Subtotal</th>
                  <th className="px-4 py-2">Precio vs último</th>
                  {canPlace && (
                    <th className="px-4 py-2 w-14 text-right" aria-label="Acciones">
                      {" "}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(Array.isArray(po.items) ? po.items : []).map((item: any) => {
                  const displayQty = po?.status === "draft"
                    ? (editingQuantities[item.id] ?? item.quantity ?? 0)
                    : (item.quantity ?? 0)
                  return (
                  <tr key={item.id} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{item.product?.name ?? "—"}</p>
                      {item.product?.sku && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.product.sku} · {item.product?.unit ?? ""}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {po?.status === "draft" ? (
                        <span className="inline-flex items-center gap-1">
                          <FormattedNumberInput
                            value={editingQuantities[item.id] ?? item.quantity ?? 0}
                            onChange={(n) =>
                              setEditingQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, n) }))
                            }
                            onBlur={() => {
                              const q = editingQuantities[item.id] ?? item.quantity ?? 0
                              const prev = item.quantity ?? 0
                              if (q >= 0 && Math.abs(q - prev) > 1e-9) saveQuantity(item.id, q)
                            }}
                            className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-right text-sm tabular-nums"
                            disabled={savingItemId === item.id}
                            aria-label={`Cantidad ${item.product?.name ?? ""}`}
                          />
                          {savingItemId === item.id && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                          )}
                        </span>
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.unitCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency((displayQty ?? 0) * (item.unitCost ?? 0))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {priceStatusLabel[item.priceStatus] ?? "—"}
                        {item.lastKnownCost != null && ` (último: ${formatCurrency(item.lastKnownCost)})`}
                      </span>
                    </td>
                    {canPlace && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={removingItemId === item.id || (po.items?.length ?? 0) <= 1}
                          className="inline-flex rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                          title={
                            (po.items?.length ?? 0) <= 1
                              ? "Debe quedar al menos un producto"
                              : "Quitar de la orden"
                          }
                          aria-label={`Quitar ${item.product?.name ?? "producto"}`}
                        >
                          {removingItemId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {po.totalAmount != null && (
            <div className="mt-3 flex justify-end border-t border-gray-200 dark:border-gray-700 pt-3">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                Total: {formatCurrency(po.totalAmount)}
              </span>
            </div>
          )}
        </div>

        {po.notes && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Notas</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{po.notes}</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-po-item-title"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute right-3 top-3 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <h2
              id="add-po-item-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Agregar producto
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Proveedor de la orden: <strong>{po.supplier?.name ?? "—"}</strong>. El precio unitario se toma del vínculo con ese proveedor o del costo promedio del producto.
            </p>
            <form onSubmit={handleAddItemSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Buscar producto
                </label>
                <input
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Nombre o SKU (mín. 2 caracteres)"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  autoComplete="off"
                />
                {addSearchLoading && (
                  <p className="mt-1 text-xs text-gray-500">Buscando…</p>
                )}
                {!addSearchLoading &&
                  addSearch.trim().length >= 2 &&
                  addResults.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600">
                      {addResults.map((p: any) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setAddProduct(p)
                              setAddSearch("")
                              setAddResults([])
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <span className="font-medium text-gray-900 dark:text-white">
                              {p.name}
                            </span>
                            {p.sku && (
                              <span className="ml-2 text-xs text-gray-500">{p.sku}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              {addProduct && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/30">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                    Seleccionado
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {addProduct.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddProduct(null)}
                    className="mt-1 text-xs text-blue-700 underline dark:text-blue-300"
                  >
                    Cambiar
                  </button>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Cantidad
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-full max-w-[160px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting || !addProduct}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Agregar a la orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
