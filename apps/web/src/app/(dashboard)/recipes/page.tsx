"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
  ChevronUp,
  MapPin,
} from "lucide-react"
import { recipesApi } from "@/lib/api/recipes"
import { productsApi } from "@/lib/api/products"
import { locationsApi } from "@/lib/api/locations"
import { cn } from "@/lib/utils"
import {
  RecipeModifierStockBlock,
  type ModifierStockRow,
} from "./RecipeModifierStockBlock"
import { ModifierGroupsManagerDialog } from "@/components/ModifierGroupsManagerDialog"

type ProductOption = { id: string; name: string; sku: string; unit?: string }
type IngredientRow = {
  productId: string
  productQuery: string
  qtyPerYield: number
  unit: string
  /** Grupo de variantes del plato (producto de salida): consumo por opción, no por cantidad fija de esta fila */
  modifierGroupId?: string
}
type FormState = {
  name: string
  yieldQty: number
  yieldUnit: string
  locationIds: string[]
  prepTimeByLocation: Record<string, number>
  productId: string
  ingredients: IngredientRow[]
}

const emptyForm: FormState = {
  name: "",
  yieldQty: 1,
  yieldUnit: "porción",
  locationIds: [],
  prepTimeByLocation: {},
  productId: "",
  ingredients: [],
}

type LocationOption = { id: string; name: string; type: string }

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<any[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterLocationIds, setFilterLocationIds] = useState<string[]>([])
  const [locationFilterOpen, setLocationFilterOpen] = useState(false)
  const locationFilterRef = useRef<HTMLDivElement>(null)
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null)
  const [productOutputSearch, setProductOutputSearch] = useState("")
  const [productOutputDropdownOpen, setProductOutputDropdownOpen] = useState(false)
  const [openIngredientDropdownIndex, setOpenIngredientDropdownIndex] = useState<number | null>(null)
  const [openModifierGroupDropdownIndex, setOpenModifierGroupDropdownIndex] = useState<number | null>(null)
  /** Modificadores del producto de salida: insumos por opción (misma API que Stock → modificadores) */
  const [modifierGroupsData, setModifierGroupsData] = useState<any[]>([])
  const [modifierLinesByOption, setModifierLinesByOption] = useState<
    Record<string, ModifierStockRow[]>
  >({})
  const [modifiersLoading, setModifiersLoading] = useState(false)
  const [openModifierStockDropdownKey, setOpenModifierStockDropdownKey] = useState<string | null>(
    null,
  )
  const [optionPriceById, setOptionPriceById] = useState<Record<string, number>>({})
  /** Borradores para crear grupo/variante desde la receta (clave = índice de fila) */
  const [newOptionLabelByRow, setNewOptionLabelByRow] = useState<Record<string, string>>({})
  const [newOptionPriceDeltaByRow, setNewOptionPriceDeltaByRow] = useState<Record<string, string>>({})
  const [modifierGroupQueryByRow, setModifierGroupQueryByRow] = useState<Record<string, string>>({})
  const [modifierMutating, setModifierMutating] = useState(false)

  const productLabel = useCallback((product: ProductOption) => {
    return product.sku ? `${product.name} (${product.sku})` : product.name
  }, [])

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )

  const productsByQuery = useMemo(() => {
    const map = new Map<string, ProductOption>()
    for (const product of products) {
      map.set(productLabel(product).toLowerCase(), product)
      map.set(product.name.toLowerCase(), product)
      if (product.sku) {
        map.set(`${product.sku} - ${product.name}`.toLowerCase(), product)
        map.set(product.sku.toLowerCase(), product)
      }
    }
    return map
  }, [productLabel, products])

  const loadProductModifiers = useCallback(async () => {
    if (!modalMode || !form.productId) return
    setModifiersLoading(true)
    try {
      const data = await productsApi.getModifiers(form.productId)
      const groups = Array.isArray(data) ? data : []
      setModifierGroupsData(groups)
      const map: Record<string, ModifierStockRow[]> = {}
      for (const g of groups) {
        for (const o of g.options || []) {
          map[o.id] = (o.stockLines || []).map((sl: any) => ({
            productId: sl.product.id,
            productQuery: sl.product?.name
              ? productLabel({
                  id: sl.product.id,
                  name: sl.product.name,
                  sku: sl.product.sku ?? "",
                  unit: sl.product.unit,
                })
              : "",
            quantity: sl.quantity ?? 0,
            unit: sl.product?.unit ?? "Und",
          }))
        }
      }
      setModifierLinesByOption(map)
      const prices: Record<string, number> = {}
      for (const gr of groups) {
        for (const o of gr.options || []) {
          prices[o.id] = Number(o.priceDelta) || 0
        }
      }
      setOptionPriceById(prices)
    } catch {
      setModifierGroupsData([])
      setModifierLinesByOption({})
      setOptionPriceById({})
    } finally {
      setModifiersLoading(false)
    }
  }, [modalMode, form.productId, productLabel])

  useEffect(() => {
    if (!modalMode) {
      setModifierGroupsData([])
      setModifierLinesByOption({})
      setOptionPriceById({})
      setNewOptionLabelByRow({})
      setNewOptionPriceDeltaByRow({})
      setModifierGroupQueryByRow({})
      return
    }
    if (!form.productId) {
      setModifierGroupsData([])
      setModifierLinesByOption({})
      setOptionPriceById({})
      return
    }
    void loadProductModifiers()
  }, [modalMode, form.productId, loadProductModifiers])

  const handleCreateModifierOptionFromRecipe = async (ingredientIndex: number) => {
    const groupId = form.ingredients[ingredientIndex]?.modifierGroupId
    if (!groupId) return
    const label = (newOptionLabelByRow[String(ingredientIndex)] ?? "").trim()
    if (!label) {
      sileo.error({ title: "Ingresá el nombre de la variante (ej. Integral)" })
      return
    }
    const raw = newOptionPriceDeltaByRow[String(ingredientIndex)]
    const priceDelta =
      raw === undefined || raw === "" ? 0 : Number.parseFloat(String(raw).replace(",", ".")) || 0
    setModifierMutating(true)
    try {
      await productsApi.createModifierOption(groupId, { label, priceDelta })
      setNewOptionLabelByRow((prev) => {
        const next = { ...prev }
        delete next[String(ingredientIndex)]
        return next
      })
      setNewOptionPriceDeltaByRow((prev) => {
        const next = { ...prev }
        delete next[String(ingredientIndex)]
        return next
      })
      await loadProductModifiers()
      sileo.success({ title: "Variante agregada" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "No se pudo agregar la variante" })
    } finally {
      setModifierMutating(false)
    }
  }

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await recipesApi.getAll({
        limit: 1000,
        isActive: true,
        ...(filterLocationIds.length > 0 && {
          locationIds: filterLocationIds.join(","),
        }),
      })
      const data = (res as any).data ?? []
      setRecipes(
        Array.isArray(data)
          ? [...data].sort((a, b) =>
              (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" })
            )
          : []
      )
    } catch (err: any) {
      const msg = err.message || "Error al cargar recetas"
      setError(msg)
      setRecipes([])
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [filterLocationIds])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  // Cerrar menú de filtro por ubicación al hacer clic fuera
  useEffect(() => {
    if (!locationFilterOpen) return
    const handleClick = (e: MouseEvent) => {
      if (locationFilterRef.current && !locationFilterRef.current.contains(e.target as Node)) {
        setLocationFilterOpen(false)
      }
    }
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [locationFilterOpen])

  useEffect(() => {
    productsApi.getAll({ limit: 5000 }).then((r: any) => {
      const d = (r as any).data ?? []
      setProducts(
        Array.isArray(d)
          ? d
              .map((p: any) => ({
                id: p.id,
                name: p.name,
                sku: p.sku ?? "",
                unit: p.unit ?? "Und",
              }))
              .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
          : []
      )
    }).catch(() => {})
  }, [])

  useEffect(() => {
    locationsApi.getAll().then((res: any) => {
      const list = Array.isArray(res) ? res : res?.data ?? []
      setLocations(
        list
          .map((loc: any) => ({ id: loc.id, name: loc.name, type: loc.type ?? "" }))
          .sort((a: LocationOption, b: LocationOption) =>
            a.name.localeCompare(b.name, "es", { sensitivity: "base" })
          )
      )
    }).catch(() => {})
  }, [])

  const openCreate = () => {
    setModalMode("create")
    setEditingRecipeId(null)
    setForm(emptyForm)
    setFormError(null)
    setProductOutputSearch("")
    setProductOutputDropdownOpen(false)
    setModifierGroupsData([])
    setModifierLinesByOption({})
    setOptionPriceById({})
    setNewOptionLabelByRow({})
    setNewOptionPriceDeltaByRow({})
  }

  const openEdit = async (recipe: any) => {
    setEditingRecipeId(recipe.id)
    setModalMode(null)
    setFormLoading(true)
    setFormError(null)
    try {
      const full = await recipesApi.getById(recipe.id)
      const locIds = (full.recipeLocations ?? []).map((rl: any) => rl.locationId ?? rl.location?.id).filter(Boolean)
      const prepByLoc: Record<string, number> = {}
      for (const rl of full.recipeLocations ?? []) {
        const lid = rl.locationId ?? rl.location?.id
        if (lid != null && rl.prepTimeMin != null) prepByLoc[lid] = rl.prepTimeMin
      }
      setForm({
        name: full.name ?? "",
        yieldQty: full.yieldQty ?? 1,
        yieldUnit: full.yieldUnit ?? "porción",
        locationIds: locIds,
        prepTimeByLocation: prepByLoc,
        productId: full.productId ?? full.product?.id ?? "",
        ingredients: (full.ingredients ?? []).map((ing: any) => ({
          productId: ing.productId ?? ing.product?.id ?? "",
          productQuery: ing.product?.name
            ? productLabel({
                id: ing.productId ?? ing.product?.id ?? "",
                name: ing.product.name,
                sku: ing.product?.sku ?? "",
                unit: ing.product?.unit ?? ing.unit ?? "Und",
              })
            : "",
          qtyPerYield: ing.qtyPerYield ?? 0,
          unit: ing.unit ?? ing.product?.unit ?? "Und",
          modifierGroupId: ing.modifierGroupId ?? ing.modifierGroup?.id ?? "",
        })),
      })
      setNewOptionLabelByRow({})
      setNewOptionPriceDeltaByRow({})
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
    setProductOutputSearch("")
    setProductOutputDropdownOpen(false)
    setOpenIngredientDropdownIndex(null)
    setModifierGroupsData([])
    setModifierLinesByOption({})
    setOpenModifierStockDropdownKey(null)
    setOptionPriceById({})
    setNewOptionLabelByRow({})
    setNewOptionPriceDeltaByRow({})
  }

  const addIngredient = () => {
    setForm((f) => ({
      ...f,
      ingredients: [
        ...f.ingredients,
        { productId: "", productQuery: "", qtyPerYield: 0, unit: "Und", modifierGroupId: "" },
      ],
    }))
  }

  const groupsAvailableForIngredientRow = useCallback(
    (rowIndex: number) => {
      const taken = new Set(
        form.ingredients
          .map((ing, i) => (i !== rowIndex ? ing.modifierGroupId : null))
          .filter(Boolean) as string[],
      )
      return modifierGroupsData.filter(
        (g) => !taken.has(g.id) || form.ingredients[rowIndex]?.modifierGroupId === g.id,
      )
    },
    [form.ingredients, modifierGroupsData],
  )

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
        if (prod) {
          row.unit = prod.unit ?? "Und"
          row.productQuery = productLabel(prod)
        }
      }
      next[index] = row
      return { ...f, ingredients: next }
    })
  }

  const updateIngredientQuery = (index: number, query: string) => {
    setForm((f) => {
      const next = [...f.ingredients]
      const current = next[index]
      const match = productsByQuery.get(query.trim().toLowerCase())

      next[index] = {
        ...current,
        productQuery: query,
        productId: match?.id ?? "",
        unit: match?.unit ?? current.unit,
      }

      return { ...f, ingredients: next }
    })
  }

  const addModifierStockRow = (optionId: string) => {
    setModifierLinesByOption((prev) => ({
      ...prev,
      [optionId]: [
        ...(prev[optionId] ?? []),
        { productId: "", productQuery: "", quantity: 0, unit: "Und" },
      ],
    }))
  }

  const removeModifierStockRow = (optionId: string, index: number) => {
    setModifierLinesByOption((prev) => {
      const rows = [...(prev[optionId] ?? [])].filter((_, i) => i !== index)
      return { ...prev, [optionId]: rows }
    })
  }

  const updateModifierStockRow = (
    optionId: string,
    index: number,
    field: keyof ModifierStockRow,
    value: string | number,
  ) => {
    setModifierLinesByOption((prev) => {
      const rows = [...(prev[optionId] ?? [])]
      const row = { ...rows[index], [field]: value }
      if (field === "productId") {
        const prod = products.find((p) => p.id === value)
        if (prod) {
          row.unit = prod.unit ?? "Und"
          row.productQuery = productLabel(prod)
        }
      }
      rows[index] = row
      return { ...prev, [optionId]: rows }
    })
  }

  const updateModifierStockRowQuery = (optionId: string, index: number, query: string) => {
    setModifierLinesByOption((prev) => {
      const rows = [...(prev[optionId] ?? [])]
      const current = rows[index]
      const match = productsByQuery.get(query.trim().toLowerCase())
      rows[index] = {
        ...current,
        productQuery: query,
        productId: match?.id ?? "",
        unit: match?.unit ?? current.unit,
      }
      return { ...prev, [optionId]: rows }
    })
  }

  const persistModifierStockLines = async () => {
    if (!form.productId) return
    for (const g of modifierGroupsData) {
      for (const o of g.options || []) {
        const rows = modifierLinesByOption[o.id] ?? []
        const merged = new Map<string, number>()
        for (const r of rows) {
          if (!r.productId) continue
          merged.set(r.productId, (merged.get(r.productId) ?? 0) + r.quantity)
        }
        const lines = [...merged.entries()].map(([productId, quantity]) => ({
          productId,
          quantity,
        }))
        await productsApi.setModifierStockLines(o.id, lines)
      }
    }
  }

  const persistOptionPrices = async () => {
    for (const g of modifierGroupsData) {
      for (const o of g.options || []) {
        const p = optionPriceById[o.id]
        if (p === undefined) continue
        await productsApi.updateModifierOption(o.id, { priceDelta: p })
      }
    }
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
        locationIds: form.locationIds,
        prepTimeByLocation: form.prepTimeByLocation,
        productId: form.productId || undefined,
        ingredients: form.ingredients
          .filter((i) => i.productId && (i.modifierGroupId || i.qtyPerYield > 0))
          .map((i) => ({
            productId: i.productId,
            qtyPerYield: i.modifierGroupId ? i.qtyPerYield || 0 : i.qtyPerYield,
            unit: i.unit || "Und",
            modifierGroupId: i.modifierGroupId || undefined,
          })),
      }
      if (modalMode === "create") {
        await recipesApi.create(payload)
      } else if (editingRecipeId) {
        await recipesApi.update(editingRecipeId, payload)
      }
      if (form.productId) {
        try {
          await persistModifierStockLines()
          await persistOptionPrices()
        } catch (e: any) {
          const msg = e?.message || "Error al guardar opciones de carta (insumos o precios)"
          setFormError(msg)
          sileo.error({ title: msg })
          setFormLoading(false)
          return
        }
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

  const handleDeleteRecipe = useCallback(
    async (recipe: any) => {
      if (!confirm(`¿Eliminar la receta "${recipe.name}"?`)) return

      setDeletingRecipeId(recipe.id)
      try {
        await recipesApi.delete(recipe.id)
        await fetchRecipes()
        sileo.success({ title: "Receta eliminada correctamente" })
      } catch (err: any) {
        const msg = err.message || "Error al eliminar la receta"
        sileo.error({ title: msg })
      } finally {
        setDeletingRecipeId(null)
      }
    },
    [fetchRecipes]
  )

  const filtered = useMemo(() => {
    const base = searchQuery
      ? recipes.filter(
          (r) =>
            r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.product?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : recipes

    return [...base].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" })
    )
  }, [recipes, searchQuery])

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por nombre de receta o producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Buscar recetas"
          />
        </div>
        <div ref={locationFilterRef} className="relative sm:flex-1">
          <button
            type="button"
            onClick={() => setLocationFilterOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-expanded={locationFilterOpen}
            aria-haspopup="listbox"
          >
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              Filtrar por ubicación
              {filterLocationIds.length > 0 && (
                <span className="rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                  {filterLocationIds.length}
                </span>
              )}
            </span>
            {locationFilterOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            )}
          </button>
          {locationFilterOpen && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 shadow-lg">
              <p className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Mostrar solo recetas que se realizan en:
              </p>
              <div className="flex flex-col gap-0.5 px-2">
                {locations
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                  .map((loc) => {
                    const checked = filterLocationIds.includes(loc.id)
                    return (
                      <label
                        key={loc.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setFilterLocationIds((prev) =>
                              e.target.checked
                                ? [...prev, loc.id]
                                : prev.filter((id) => id !== loc.id)
                            )
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                          {loc.name}
                          {loc.type === "WAREHOUSE" ? " (Depósito)" : ""}
                        </span>
                      </label>
                    )
                  })}
              </div>
              {filterLocationIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterLocationIds([])}
                  className="mx-3 mt-2 w-[calc(100%-1.5rem)] text-left text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Quitar filtros de ubicación
                </button>
              )}
            </div>
          )}
        </div>
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
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
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
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(recipe)}
                              disabled={detailLoading || deletingRecipeId === recipe.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecipe(recipe)}
                              disabled={detailLoading || deletingRecipeId === recipe.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              {deletingRecipeId === recipe.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
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
                    value={form.yieldQty || ""}
                    onChange={(e) => setForm((f) => ({ ...f, yieldQty: Number(e.target.value) || 0 }))}
                    placeholder="1"
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
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">Ubicaciones</label>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Dónde se puede elaborar esta receta (depósito, locales, etc.).
                </p>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {locations
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                      .map((location) => {
                        const checked = form.locationIds.includes(location.id)
                        return (
                          <label
                            key={location.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  locationIds: e.target.checked
                                    ? [...f.locationIds, location.id]
                                    : f.locationIds.filter((id) => id !== location.id),
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">No hay ubicaciones disponibles.</p>
                  )}
                </div>
              </div>

              {form.locationIds.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white">Tiempo de elaboración por local</label>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Minutos estimados en cada ubicación. Se usa para comparar con el tiempo real al finalizar la producción.
                  </p>
                  <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                    {locations
                      .filter((loc) => form.locationIds.includes(loc.id))
                      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
                      .map((location) => (
                        <div key={location.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <span className="text-sm text-gray-700 dark:text-gray-200">
                            {location.name}
                            {location.type === "WAREHOUSE" ? " (Depósito)" : ""}
                          </span>
                          <div className="flex items-center justify-center gap-2 min-w-[7rem]">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={form.prepTimeByLocation[location.id] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value
                                const num = v === "" ? undefined : Math.max(0, parseInt(v, 10) || 0)
                                setForm((prev) => ({
                                  ...prev,
                                  prepTimeByLocation: {
                                    ...prev.prepTimeByLocation,
                                    [location.id]: num ?? 0,
                                  },
                                }))
                              }}
                              placeholder="Ej: 45"
                              className="w-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-center tabular-nums text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              aria-label={`Tiempo en ${location.name}`}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">Producto de salida</label>
                <div className="relative">
                  <input
                    type="text"
                    aria-label="Producto de salida"
                    aria-autocomplete="list"
                    aria-expanded={productOutputDropdownOpen}
                    role="combobox"
                    value={
                      form.productId
                        ? productLabel(productsById.get(form.productId) ?? { id: form.productId, name: "", sku: "" })
                        : productOutputSearch
                    }
                    onChange={(e) => {
                      setProductOutputSearch(e.target.value)
                      setProductOutputDropdownOpen(true)
                      if (form.productId) setForm((f) => ({ ...f, productId: "" }))
                    }}
                    onFocus={() => setProductOutputDropdownOpen(true)}
                    onBlur={() =>
                      setTimeout(() => setProductOutputDropdownOpen(false), 150)
                    }
                    placeholder="Escribí para buscar o Sin producto de salida..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <ChevronDown className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                </div>
                {productOutputDropdownOpen && (
                  <ul
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
                    role="listbox"
                  >
                    <li
                      role="option"
                      aria-selected={!form.productId && !productOutputSearch}
                      className={cn(
                        "cursor-pointer px-3 py-2 text-sm",
                        !form.productId && !productOutputSearch
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                          : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setForm((f) => ({ ...f, productId: "" }))
                        setProductOutputSearch("")
                        setProductOutputDropdownOpen(false)
                      }}
                    >
                      ✓ Sin producto de salida
                    </li>
                    {products
                      .filter(
                        (p) =>
                          !productOutputSearch.trim() ||
                          productLabel(p)
                            .toLowerCase()
                            .includes(productOutputSearch.trim().toLowerCase()) ||
                          p.name.toLowerCase().includes(productOutputSearch.trim().toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(productOutputSearch.trim().toLowerCase()))
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
                            setForm((f) => ({ ...f, productId: p.id }))
                            setProductOutputSearch("")
                            setProductOutputDropdownOpen(false)
                          }}
                        >
                          {productLabel(p)}
                        </li>
                      ))}
                    {productOutputSearch.trim() &&
                      products.filter(
                        (p) =>
                          productLabel(p)
                            .toLowerCase()
                            .includes(productOutputSearch.trim().toLowerCase()) ||
                          p.name.toLowerCase().includes(productOutputSearch.trim().toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(productOutputSearch.trim().toLowerCase()))
                      ).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No hay productos que coincidan
                        </li>
                      )}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-2 flex flex-col gap-2">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white">
                      Ingredientes (cantidad por rendimiento)
                    </label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Podés vincular <strong>variantes</strong> (ej. tipo de pan) en cada fila. Con{" "}
                      <strong>Ver variantes</strong> abrís el gestor completo (grupos, opciones, Δ precio)
                      del producto de salida.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end justify-end gap-2">
                    {form.productId ? (
                      <ModifierGroupsManagerDialog
                        productId={form.productId}
                        disabled={modifierMutating || modifiersLoading}
                        onAfterChange={() => void loadProductModifiers()}
                      />
                    ) : (
                      <p className="flex-1 text-right text-[11px] text-amber-800/90 dark:text-amber-200/80">
                        Elegí producto de salida arriba para crear grupos de opciones.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={addIngredient}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Plus className="h-3 w-3" />
                      Agregar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {form.ingredients.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-300">
                      Sin ingredientes. Clic en &quot;Agregar&quot; para cargar cantidades.
                    </p>
                  ) : (
                    form.ingredients.map((row, index) => {
                      const filteredProducts = products.filter(
                        (p) =>
                          !row.productQuery.trim() ||
                          productLabel(p)
                            .toLowerCase()
                            .includes(row.productQuery.trim().toLowerCase()) ||
                          p.name.toLowerCase().includes(row.productQuery.trim().toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(row.productQuery.trim().toLowerCase()))
                      )
                      return (
                        <div
                          key={index}
                          className="space-y-2 rounded-lg border border-slate-300/80 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40 p-2"
                        >
                          <div className="mb-1 inline-flex rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                            Ingrediente base
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                          <div className="relative min-w-[220px]">
                            <input
                              type="text"
                              value={row.productQuery}
                              onChange={(e) => {
                                updateIngredientQuery(index, e.target.value)
                                setOpenIngredientDropdownIndex(index)
                              }}
                              onFocus={() => setOpenIngredientDropdownIndex(index)}
                              onBlur={() =>
                                setTimeout(() => setOpenIngredientDropdownIndex(null), 150)
                              }
                              aria-label={`Ingrediente ${index + 1}, producto`}
                              aria-autocomplete="list"
                              aria-expanded={openIngredientDropdownIndex === index}
                              role="combobox"
                              placeholder="Escribí para buscar producto..."
                              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 pr-8 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                            {openIngredientDropdownIndex === index && (
                              <ul
                                className="absolute z-20 mt-1 max-h-48 w-full min-w-[280px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
                                role="listbox"
                              >
                                {filteredProducts.map((p) => (
                                  <li
                                    key={p.id}
                                    role="option"
                                    aria-selected={row.productId === p.id}
                                    className={cn(
                                      "cursor-pointer px-3 py-2 text-sm",
                                      row.productId === p.id
                                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    )}
                                    onMouseDown={(e) => {
                                      e.preventDefault()
                                      updateIngredient(index, "productId", p.id)
                                      setOpenIngredientDropdownIndex(null)
                                    }}
                                  >
                                    {productLabel(p)}
                                  </li>
                                ))}
                                {row.productQuery.trim() && filteredProducts.length === 0 && (
                                  <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    No hay productos que coincidan
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
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
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {row.unit || (row.productId ? productsById.get(row.productId)?.unit : null) || 'Und'}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeIngredient(index)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400"
                            aria-label="Quitar ingrediente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          </div>

                          {form.productId ? (
                            <div className="rounded-md border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/15 px-2 py-2">
                              <div className="mb-1 inline-flex rounded-full border border-amber-300 dark:border-amber-700 bg-amber-100/80 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                                Variantes (opcionales)
                              </div>
                              <label className="mb-1 block text-xs font-medium text-amber-900 dark:text-amber-100/90">
                                Variantes del plato (grupo de opciones)
                              </label>
                              <div className="relative mb-2 w-full max-w-lg">
                                {(() => {
                                  const selectedGroup = groupsAvailableForIngredientRow(index).find(
                                    (g) => g.id === row.modifierGroupId
                                  )
                                  const hasCustomQuery = Object.prototype.hasOwnProperty.call(
                                    modifierGroupQueryByRow,
                                    String(index)
                                  )
                                  const query = hasCustomQuery
                                    ? modifierGroupQueryByRow[String(index)] ?? ""
                                    : selectedGroup?.name ?? ""
                                  const filteredGroups = groupsAvailableForIngredientRow(index).filter((g) =>
                                    g.name.toLowerCase().includes(query.trim().toLowerCase())
                                  )
                                  return (
                                    <>
                                      <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setModifierGroupQueryByRow((prev) => ({
                                            ...prev,
                                            [String(index)]: v,
                                          }))
                                          setOpenModifierGroupDropdownIndex(index)
                                        }}
                                        onFocus={() => setOpenModifierGroupDropdownIndex(index)}
                                        onBlur={() =>
                                          setTimeout(
                                            () => setOpenModifierGroupDropdownIndex(null),
                                            150
                                          )
                                        }
                                        placeholder="Escribí para buscar o seleccionar grupo..."
                                        aria-autocomplete="list"
                                        aria-expanded={openModifierGroupDropdownIndex === index}
                                        role="combobox"
                                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 pr-8 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                                      {openModifierGroupDropdownIndex === index && (
                                        <ul
                                          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
                                          role="listbox"
                                        >
                                          <li
                                            role="option"
                                            aria-selected={!row.modifierGroupId}
                                            className={cn(
                                              "cursor-pointer px-3 py-2 text-sm",
                                              !row.modifierGroupId
                                                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                                                : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            )}
                                            onMouseDown={(e) => {
                                              e.preventDefault()
                                              setForm((f) => {
                                                const next = [...f.ingredients]
                                                next[index] = {
                                                  ...next[index],
                                                  modifierGroupId: undefined,
                                                }
                                                return { ...f, ingredients: next }
                                              })
                                              setModifierGroupQueryByRow((prev) => ({
                                                ...prev,
                                                [String(index)]:
                                                  "Sin variantes — descuenta la cantidad de arriba al cerrar venta",
                                              }))
                                              setOpenModifierGroupDropdownIndex(null)
                                            }}
                                          >
                                            Sin variantes — descuenta la cantidad de arriba al cerrar venta
                                          </li>
                                          {filteredGroups.map((g) => (
                                            <li
                                              key={g.id}
                                              role="option"
                                              aria-selected={row.modifierGroupId === g.id}
                                              className={cn(
                                                "cursor-pointer px-3 py-2 text-sm",
                                                row.modifierGroupId === g.id
                                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
                                                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                              )}
                                              onMouseDown={(e) => {
                                                e.preventDefault()
                                                setForm((f) => {
                                                  const next = [...f.ingredients]
                                                  next[index] = {
                                                    ...next[index],
                                                    modifierGroupId: g.id,
                                                  }
                                                  return { ...f, ingredients: next }
                                                })
                                                setModifierGroupQueryByRow((prev) => ({
                                                  ...prev,
                                                  [String(index)]: g.name,
                                                }))
                                                setOpenModifierGroupDropdownIndex(null)
                                              }}
                                            >
                                              {g.name}
                                            </li>
                                          ))}
                                          {query.trim() && filteredGroups.length === 0 && (
                                            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                              No hay grupos que coincidan
                                            </li>
                                          )}
                                        </ul>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>

                              {row.modifierGroupId ? (
                                <>
                                  <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-800/40 px-2 py-2">
                                    <div className="min-w-[120px] flex-1">
                                      <span className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                                        Nueva variante (opción)
                                      </span>
                                      <input
                                        type="text"
                                        value={newOptionLabelByRow[String(index)] ?? ""}
                                        onChange={(e) =>
                                          setNewOptionLabelByRow((prev) => ({
                                            ...prev,
                                            [String(index)]: e.target.value,
                                          }))
                                        }
                                        placeholder="Ej. Integral, sin gluten…"
                                        disabled={modifierMutating || modifiersLoading}
                                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white disabled:opacity-60"
                                      />
                                    </div>
                                    <div className="w-24">
                                      <span className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                                        Δ precio
                                      </span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={newOptionPriceDeltaByRow[String(index)] ?? ""}
                                        onChange={(e) =>
                                          setNewOptionPriceDeltaByRow((prev) => ({
                                            ...prev,
                                            [String(index)]: e.target.value,
                                          }))
                                        }
                                        placeholder="0"
                                        disabled={modifierMutating || modifiersLoading}
                                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm tabular-nums text-gray-900 dark:text-white disabled:opacity-60"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      disabled={modifierMutating || modifiersLoading}
                                      onClick={() => handleCreateModifierOptionFromRecipe(index)}
                                      className="inline-flex shrink-0 items-center rounded border border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                                    >
                                      Agregar variante
                                    </button>
                                  </div>

                                  <p className="mb-2 text-xs text-amber-900/90 dark:text-amber-100/80">
                                    Precio de venta extra y stock por cada variante. Al cerrar la mesa no se
                                    suma la cantidad fija de arriba para esta fila; solo lo que elijas acá
                                    según la opción en el POS.
                                  </p>
                                  <RecipeModifierStockBlock
                                    loading={modifiersLoading}
                                    groups={modifierGroupsData.filter(
                                      (g) => g.id === row.modifierGroupId,
                                    )}
                                    linesByOption={modifierLinesByOption}
                                    products={products}
                                    productsById={productsById}
                                    productsByQuery={productsByQuery}
                                    productLabel={productLabel}
                                    openDropdownKey={openModifierStockDropdownKey}
                                    setOpenDropdownKey={setOpenModifierStockDropdownKey}
                                    addRow={addModifierStockRow}
                                    removeRow={removeModifierStockRow}
                                    updateRow={updateModifierStockRow}
                                    updateRowQuery={updateModifierStockRowQuery}
                                    dropdownKeyPrefix={`ing${index}-`}
                                    optionPrices={optionPriceById}
                                    onOptionPriceChange={(oid, p) =>
                                      setOptionPriceById((s) => ({ ...s, [oid]: p }))
                                    }
                                    hideGroupTitles
                                  />
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
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
