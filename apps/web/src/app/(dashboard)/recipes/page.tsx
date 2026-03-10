"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { sileo } from "sileo"
import {
  Search,
  Loader2,
  X,
  Plus,
  Edit3,
  Trash2,
  AlertCircle,
  ChevronDown,
} from "lucide-react"
import { recipesApi } from "@/lib/api/recipes"
import { productsApi } from "@/lib/api/products"
import { cn } from "@/lib/utils"

type ProductOption = { id: string; name: string; sku: string; unit?: string }

function SearchableProductSelect({
  value,
  onChange,
  options,
  placeholder = "Buscar producto...",
  className,
}: {
  value: string
  onChange: (id: string) => void
  options: ProductOption[]
  placeholder?: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.id === value)
  const filtered = search.trim()
    ? options.filter((o) =>
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (id: string) => {
    onChange(id)
    setIsOpen(false)
    setSearch("")
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-left text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className={selected ? "" : "text-gray-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Escribí para buscar..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700",
                  !value && "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                )}
              >
                {placeholder}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No se encontraron productos</li>
            ) : (
              filtered.slice(0, 100).map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700",
                      value === opt.id && "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    )}
                  >
                    {opt.name} {opt.sku ? <span className="text-gray-400">({opt.sku})</span> : ""}
                  </button>
                </li>
              ))
            )}
            {filtered.length > 100 && (
              <li className="px-3 py-2 text-xs text-gray-400 text-center">
                Mostrando 100 de {filtered.length} resultados. Escribí para filtrar más.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
type IngredientRow = { productId: string; qtyPerYield: number; unit: string }
type FormState = {
  name: string
  yieldQty: number
  yieldUnit: string
  productId: string
  ingredients: IngredientRow[]
}

const emptyForm: FormState = {
  name: "",
  yieldQty: 1,
  yieldUnit: "porción",
  productId: "",
  ingredients: [],
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<any[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await recipesApi.getAll({ limit: 500 })
      const data = (res as any).data ?? []
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" }))
        : []
      setRecipes(sorted)
    } catch (err: any) {
      const msg = err.message || "Error al cargar recetas"
      setError(msg)
      setRecipes([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    productsApi.getAll({ limit: 5000 }).then((r: any) => {
      const d = (r as any).data ?? []
      const mapped = Array.isArray(d)
        ? d.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku ?? "",
            unit: p.unit ?? "Und",
          }))
        : []
      mapped.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      setProducts(mapped)
    }).catch(() => {})
  }, [])

  const openCreate = () => {
    setModalMode("create")
    setEditingRecipeId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const openEdit = async (recipe: any) => {
    setEditingRecipeId(recipe.id)
    setModalMode(null)
    setFormLoading(true)
    setFormError(null)
    try {
      const full = await recipesApi.getById(recipe.id)
      setForm({
        name: full.name ?? "",
        yieldQty: full.yieldQty ?? 1,
        yieldUnit: full.yieldUnit ?? "porción",
        productId: full.productId ?? full.product?.id ?? "",
        ingredients: (full.ingredients ?? []).map((ing: any) => ({
          productId: ing.productId ?? ing.product?.id ?? "",
          qtyPerYield: ing.qtyPerYield ?? 0,
          unit: ing.unit ?? ing.product?.unit ?? "Und",
        })),
      })
      setModalMode("edit")
    } catch (err: any) {
      const msg = err.message || "Error al cargar la receta"
      setFormError(msg)
      sileo.error({ title: msg })
    } finally {
      setFormLoading(false)
    }
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingRecipeId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  const addIngredient = () => {
    setForm((f) => ({
      ...f,
      ingredients: [...f.ingredients, { productId: "", qtyPerYield: 0, unit: "Und" }],
    }))
  }

  const removeIngredient = (index: number) => {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.filter((_, i) => i !== index),
    }))
  }

  const updateIngredient = (index: number, field: keyof IngredientRow, value: string | number) => {
    setForm((f) => {
      const next = [...f.ingredients]
      const row = { ...next[index], [field]: value }
      if (field === "productId") {
        const prod = products.find((p) => p.id === value)
        if (prod) row.unit = prod.unit ?? "Und"
      }
      next[index] = row
      return { ...f, ingredients: next }
    })
  }

  const saveForm = async () => {
    if (!form.name.trim()) {
      setFormError("El nombre de la receta es obligatorio.")
      return
    }
    if (form.yieldQty <= 0) {
      setFormError("La cantidad de rendimiento debe ser mayor a 0.")
      return
    }
    setFormError(null)
    setFormLoading(true)
    try {
      const payload = {
        name: form.name.trim(),
        yieldQty: form.yieldQty,
        yieldUnit: form.yieldUnit.trim() || "porción",
        productId: form.productId || undefined,
        ingredients: form.ingredients
          .filter((i) => i.productId && i.qtyPerYield > 0)
          .map((i) => ({
            productId: i.productId,
            qtyPerYield: i.qtyPerYield,
            unit: i.unit || "Und",
          })),
      }
      if (modalMode === "create") {
        await recipesApi.create(payload)
      } else if (editingRecipeId) {
        await recipesApi.update(editingRecipeId, payload)
      }
      closeModal()
      fetchRecipes()
      sileo.success({ title: "Receta guardada correctamente" })
    } catch (err: any) {
      const msg = err.message || "Error al guardar"
      setFormError(msg)
      sileo.error({ title: msg })
    } finally {
      setFormLoading(false)
    }
  }

  const filtered = searchQuery
    ? recipes.filter(
        (r) =>
          r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.product?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recipes

  const isModalOpen = modalMode === "create" || modalMode === "edit"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recetas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Creá y editá recetas: nombre, producto de salida y cantidades de cada ingrediente por rendimiento.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva receta
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Buscar por nombre de receta o producto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:max-w-md"
          aria-label="Buscar recetas"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Receta</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-white">Producto de salida</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-white">Ingredientes</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-white">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No hay recetas
                  </td>
                </tr>
              ) : (
                filtered.map((recipe) => {
                  const hasOutput = !!(recipe.productId || recipe.product?.id)
                  const ingCount = recipe._count?.ingredients ?? recipe.ingredients?.length ?? 0
                  return (
                    <tr key={recipe.id} className="border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{recipe.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn(hasOutput ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-400")}>
                          {hasOutput ? recipe.product?.name ?? "—" : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{ingCount}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(recipe)}
                          disabled={detailLoading}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        >
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear / editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" aria-hidden onClick={closeModal} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {modalMode === "create" ? "Nueva receta" : "Editar receta"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Nombre de la receta *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Medialuna de Manteca"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Rendimiento (cantidad) *</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={form.yieldQty}
                    onChange={(e) => setForm((f) => ({ ...f, yieldQty: Number(e.target.value) || 0 }))}
                    aria-label="Cantidad de rendimiento"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Unidad</label>
                  <input
                    type="text"
                    value={form.yieldUnit}
                    onChange={(e) => setForm((f) => ({ ...f, yieldUnit: e.target.value }))}
                    placeholder="porción, unidad..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Producto de salida</label>
                <SearchableProductSelect
                  value={form.productId}
                  onChange={(id) => setForm((f) => ({ ...f, productId: id }))}
                  options={products}
                  placeholder="Sin producto de salida"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-white">Ingredientes (cantidad por rendimiento)</label>
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {form.ingredients.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-300">
                      Sin ingredientes. Clic en &quot;Agregar&quot; para cargar cantidades.
                    </p>
                  ) : (
                    form.ingredients.map((row, index) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 p-2"
                      >
                        <SearchableProductSelect
                          value={row.productId}
                          onChange={(id) => updateIngredient(index, "productId", id)}
                          options={products}
                          placeholder="Producto..."
                          className="min-w-[200px] flex-1"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.001}
                          value={row.qtyPerYield || ""}
                          onChange={(e) =>
                            updateIngredient(index, "qtyPerYield", parseFloat(e.target.value) || 0)
                          }
                          placeholder="Cant."
                          aria-label={`Cantidad por rendimiento ingrediente ${index + 1}`}
                          className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">{row.unit}</span>
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400"
                          aria-label="Quitar ingrediente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveForm}
                disabled={formLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {modalMode === "create" ? "Crear receta" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailLoading && modalMode === null && editingRecipeId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}
