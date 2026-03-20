"use client"

import { Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProductOption = { id: string; name: string; sku: string; unit?: string }
export type ModifierStockRow = {
  productId: string
  productQuery: string
  quantity: number
  unit: string
}

type ModifierGroup = {
  id: string
  name: string
  options: Array<{ id: string; label: string; priceDelta?: number }>
}

type Props = {
  loading: boolean
  groups: ModifierGroup[]
  linesByOption: Record<string, ModifierStockRow[]>
  products: ProductOption[]
  productsById: Map<string, ProductOption>
  productsByQuery: Map<string, ProductOption>
  productLabel: (p: ProductOption) => string
  openDropdownKey: string | null
  setOpenDropdownKey: (k: string | null) => void
  addRow: (optionId: string) => void
  removeRow: (optionId: string, index: number) => void
  updateRow: (
    optionId: string,
    index: number,
    field: keyof ModifierStockRow,
    value: string | number,
  ) => void
  updateRowQuery: (optionId: string, index: number, query: string) => void
  /** Prefijo para no chocar dropdowns si hay varios bloques en la página */
  dropdownKeyPrefix?: string
  optionPrices?: Record<string, number>
  onOptionPriceChange?: (optionId: string, price: number) => void
  /** Oculta títulos de grupo (una sola columna anidada bajo un ingrediente) */
  hideGroupTitles?: boolean
}

export function RecipeModifierStockBlock({
  loading,
  groups,
  linesByOption,
  products,
  productsById,
  productsByQuery,
  productLabel,
  openDropdownKey,
  setOpenDropdownKey,
  addRow,
  removeRow,
  updateRow,
  updateRowQuery,
  dropdownKeyPrefix = "",
  optionPrices,
  onOptionPriceChange,
  hideGroupTitles = false,
}: Props) {
  const keyP = dropdownKeyPrefix || ""
  if (loading) {
    return (
      <div className="rounded-lg border border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-4 text-sm text-amber-900 dark:text-amber-100">
        Cargando modificadores de carta…
      </div>
    )
  }

  const hasOptions = groups.some((g) => (g.options?.length ?? 0) > 0)
  if (!hasOptions) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
        No hay grupos con opciones en el catálogo global (Stock → Modificadores de carta). Creá grupos y
        opciones ahí; aparecerán en todas las recetas al asignar un grupo a un ingrediente. Luego cargá
        acá los insumos por cada opción.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.id}>
          {!hideGroupTitles ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {g.name}
            </p>
          ) : null}
          <div className="space-y-4">
            {(g.options || []).map((opt) => {
              const rows = linesByOption[opt.id] ?? []
              const displayPrice =
                optionPrices && optionPrices[opt.id] !== undefined
                  ? optionPrices[opt.id]
                  : Number(opt.priceDelta) || 0
              return (
                <div
                  key={opt.id}
                  className="rounded-lg border border-amber-100 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {opt.label}
                      </span>
                      {onOptionPriceChange ? (
                        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                          Δ precio venta
                          <input
                            type="number"
                            step="0.01"
                            value={displayPrice}
                            onChange={(e) =>
                              onOptionPriceChange(opt.id, parseFloat(e.target.value) || 0)
                            }
                            className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm tabular-nums"
                          />
                        </label>
                      ) : Number(opt.priceDelta) !== 0 ? (
                        <span className="text-xs font-normal text-gray-500">
                          Δ precio {Number(opt.priceDelta) > 0 ? "+" : ""}
                          {opt.priceDelta}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Cantidad por <strong>una</strong> unidad vendida con esta opción (mismo criterio que el
                    POS). Negativo = menos consumo respecto a la receta base.
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Sin insumos extra para esta opción.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((row, index) => {
                        const dk = `${keyP}${opt.id}:${index}`
                        const filteredProducts = products.filter(
                          (p) =>
                            !row.productQuery.trim() ||
                            productLabel(p)
                              .toLowerCase()
                              .includes(row.productQuery.trim().toLowerCase()) ||
                            p.name.toLowerCase().includes(row.productQuery.trim().toLowerCase()) ||
                            (p.sku && p.sku.toLowerCase().includes(row.productQuery.trim().toLowerCase())),
                        )
                        return (
                          <div
                            key={`${opt.id}-${index}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 p-2"
                          >
                            <div className="relative min-w-[220px] flex-1">
                              <input
                                type="text"
                                value={row.productQuery}
                                onChange={(e) => {
                                  updateRowQuery(opt.id, index, e.target.value)
                                  setOpenDropdownKey(dk)
                                }}
                                onFocus={() => setOpenDropdownKey(dk)}
                                onBlur={() =>
                                  setTimeout(() => setOpenDropdownKey(null), 150)
                                }
                                placeholder="Buscar producto / insumo…"
                                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 pr-8 text-sm"
                              />
                              <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
                              {openDropdownKey === dk && (
                                <ul className="absolute z-30 mt-1 max-h-48 w-full min-w-[280px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg">
                                  {filteredProducts.map((p) => (
                                    <li
                                      key={p.id}
                                      className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        updateRow(opt.id, index, "productId", p.id)
                                        setOpenDropdownKey(null)
                                      }}
                                    >
                                      {productLabel(p)}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <input
                              type="number"
                              step={0.0001}
                              value={row.quantity || ""}
                              onChange={(e) =>
                                updateRow(
                                  opt.id,
                                  index,
                                  "quantity",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              placeholder="Cant."
                              className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                            />
                            <span className="text-sm text-gray-500">
                              {row.unit ||
                                (row.productId ? productsById.get(row.productId)?.unit : null) ||
                                "Und"}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeRow(opt.id, index)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600"
                              aria-label="Quitar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
