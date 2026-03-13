"use client"

import { useState, useEffect, useCallback } from "react"
import { sileo } from "sileo"
import {
  Search,
  Trash2,
  Plus,
  Loader2,
  X,
  Package,
  MapPin,
  ChevronDown,
} from "lucide-react"
import { wasteRecordsApi } from "@/lib/api/waste-records"
import { locationsApi } from "@/lib/api/locations"
import { productsApi } from "@/lib/api/products"
import { cn, formatDate, formatNumber } from "@/lib/utils"

const typeLabels: Record<string, string> = {
  expiry: "Vencimiento",
  damage: "Daño",
  production: "Producción",
  other: "Otro",
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100">
                {Array.from({ length: 6 }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-gray-100" style={{ width: "70%" }} />
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

export default function WasteRecordsPage() {
  const [records, setRecords] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; unit?: string; sku?: string }[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({
    locationId: "",
    productId: "",
    type: "other",
    reason: "",
    quantity: 1,
    unit: "",
    notes: "",
  })
  const [productSearch, setProductSearch] = useState("")
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (selectedLocation) params.locationId = selectedLocation
      const res = await wasteRecordsApi.getAll(params)
      const data = (res as any).data ?? []
      const tot = (res as any).total ?? data.length
      setRecords(data)
      setTotal(tot)
    } catch (err: any) {
      const msg = err.message || "Error al cargar mermas"
      setError(msg)
      setRecords([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [selectedLocation])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  useEffect(() => {
    Promise.all([
      locationsApi.getAll({ type: "WAREHOUSE" }),
      productsApi.getAll({ limit: 5000 }),
    ])
      .then(([locRes, prodRes]) => {
        const locs = Array.isArray(locRes) ? locRes : (locRes as any)?.data ?? []
        setLocations(locs.map((l: any) => ({ id: l.id, name: l.name })))
        const prods = (prodRes as any)?.data ?? []
        setProducts(prods.map((p: any) => ({ id: p.id, name: p.name, unit: p.unit, sku: p.sku })))
      })
      .catch(() => {})
  }, [])

  const filtered = searchQuery
    ? records.filter(
        (r) =>
          r.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (typeLabels[r.type] ?? r.type)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.reason?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : records

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.locationId || !form.productId || form.quantity <= 0) {
      setCreateError("Completa ubicación, producto y cantidad.")
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await wasteRecordsApi.create({
        locationId: form.locationId,
        productId: form.productId,
        type: form.type,
        reason: form.reason || undefined,
        quantity: form.quantity,
        unit: form.unit || undefined,
        notes: form.notes || undefined,
      })
      setShowCreateModal(false)
      setForm({ locationId: "", productId: "", type: "other", reason: "", quantity: 1, unit: "", notes: "" })
      setProductSearch("")
      setProductDropdownOpen(false)
      fetchRecords()
      sileo.success({ title: "Merma registrada correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al registrar la merma"
      setCreateError(msg)
      sileo.error({ title: msg })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mermas / Desperdicios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registro de mermas por local y producto
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva merma
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por producto, tipo, motivo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
          />
        </div>
        <select
          aria-label="Filtrar por local"
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los locales</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Local</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Producto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Tipo</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-white">Cantidad</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-white">
                      No hay registros de merma
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-600 dark:text-white">
                        {r.recordedAt ? formatDate(r.recordedAt) : r.createdAt ? formatDate(r.createdAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-white">
                        {r.location?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {r.product?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-900 dark:bg-gray-600 dark:text-white">
                          {typeLabels[r.type] ?? r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-white">
                        {formatNumber(r.quantity)} {r.unit ?? ""}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-white max-w-[12rem] truncate">
                        {r.reason ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal crear merma */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva merma</h2>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateModal(false)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
              )}
              <div>
                <label htmlFor="waste-location" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Local *</label>
                <select
                  id="waste-location"
                  aria-label="Local"
                  value={form.locationId}
                  onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Solo ubicaciones tipo depósito</p>
              </div>
              <div className="relative">
                <label htmlFor="waste-product" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Producto *</label>
                <div className="relative">
                  <input
                    id="waste-product"
                    type="text"
                    aria-label="Producto"
                    aria-autocomplete="list"
                    aria-expanded={productDropdownOpen}
                    role="combobox"
                    required={!form.productId}
                    value={
                      form.productId
                        ? (() => {
                            const p = products.find((x) => x.id === form.productId)
                            return p ? (p.sku ? `${p.name} (${p.sku})` : p.name) : productSearch
                          })()
                        : productSearch
                    }
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setProductDropdownOpen(true)
                      if (form.productId) setForm((f) => ({ ...f, productId: "", unit: "" }))
                    }}
                    onFocus={() => setProductDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
                    placeholder="Escribí para buscar producto..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                {productDropdownOpen && (
                  <ul
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
                    role="listbox"
                  >
                    {products
                      .filter(
                        (p) =>
                          !productSearch.trim() ||
                          (p.sku ? `${p.name} (${p.sku})` : p.name)
                            .toLowerCase()
                            .includes(productSearch.trim().toLowerCase()) ||
                          p.name.toLowerCase().includes(productSearch.trim().toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(productSearch.trim().toLowerCase()))
                      )
                      .map((p) => (
                        <li
                          key={p.id}
                          role="option"
                          aria-selected={form.productId === p.id}
                          className={cn(
                            "cursor-pointer px-3 py-2 text-sm",
                            form.productId === p.id
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                              : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setForm((f) => ({ ...f, productId: p.id, unit: p.unit ?? "" }))
                            setProductSearch("")
                            setProductDropdownOpen(false)
                          }}
                        >
                          {p.sku ? `${p.name} (${p.sku})` : p.name}
                        </li>
                      ))}
                    {productSearch.trim() &&
                      products.filter(
                        (p) =>
                          (p.sku ? `${p.name} (${p.sku})` : p.name)
                            .toLowerCase()
                            .includes(productSearch.trim().toLowerCase()) ||
                          p.name.toLowerCase().includes(productSearch.trim().toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(productSearch.trim().toLowerCase()))
                      ).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No hay productos que coincidan
                        </li>
                      )}
                  </ul>
                )}
              </div>
              <div>
                <label htmlFor="waste-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Tipo *</label>
                <select
                  id="waste-type"
                  aria-label="Tipo de merma"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="waste-quantity" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Cantidad *</label>
                <input
                  id="waste-quantity"
                  type="number"
                  min={0.001}
                  step="any"
                  value={form.quantity || ""}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                  placeholder="1"
                  required
                  aria-label="Cantidad"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="waste-unit" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Unidad</label>
                <input
                  id="waste-unit"
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="kg, L, und..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="waste-reason" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Motivo</label>
                <input
                  id="waste-reason"
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="waste-notes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Notas</label>
                <textarea
                  id="waste-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Notas opcionales"
                  aria-label="Notas"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 pt-4 mt-4 -mx-6 -mb-6 px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
