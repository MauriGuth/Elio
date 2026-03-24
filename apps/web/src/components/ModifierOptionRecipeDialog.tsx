"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { ChevronDown, Loader2, Plus, Trash2, X, BookOpen } from "lucide-react"
import { sileo } from "sileo"
import { productsApi } from "@/lib/api/products"

export type StockLineFromApi = {
  id?: string
  quantity: number
  product: { id: string; name: string; sku: string; unit?: string }
}

type ModifierStockRow = {
  productId: string
  productQuery: string
  quantity: number
  unit: string
}

type ProductOption = { id: string; name: string; sku: string; unit?: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  optionId: string
  optionLabel: string
  initialLines: StockLineFromApi[]
  /** Grupo al que pertenece la opción (para textos de ayuda). */
  groupName?: string
  /** Regla POS del grupo; si existe, suele ser grupo condicional (ej. tipo de leche). */
  visibilityRule?: unknown | null
  onSaved: () => void
}

function stockDialogHint(
  groupName: string | undefined,
  visibilityRule: unknown | null | undefined,
): "milk-type" | "preparation" | "default" {
  const n = (groupName ?? "").toLowerCase()
  if (n.includes("tipo de leche") || visibilityRule != null) return "milk-type"
  if (n.includes("preparación") || n.includes("preparacion")) return "preparation"
  return "default"
}

function productLabel(p: ProductOption) {
  return `${p.name} (${p.sku})`
}

export function ModifierOptionRecipeDialog({
  open,
  onOpenChange,
  optionId,
  optionLabel,
  initialLines,
  groupName,
  visibilityRule,
  onSaved,
}: Props) {
  const hint = stockDialogHint(groupName, visibilityRule)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [rows, setRows] = useState<ModifierStockRow[]>([])
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  useEffect(() => {
    if (!open) return
    setRows(
      initialLines.length
        ? initialLines.map((sl) => ({
            productId: sl.product.id,
            productQuery: productLabel(sl.product as ProductOption),
            quantity: sl.quantity,
            unit: sl.product.unit ?? "Und",
          }))
        : [{ productId: "", productQuery: "", quantity: 0, unit: "Und" }],
    )
  }, [open, optionId, initialLines])

  useEffect(() => {
    if (!open) return
    setLoadingProducts(true)
    productsApi
      .getAll({ limit: 8000, isActive: true })
      .then((res) => {
        const list = (res.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
        }))
        setProducts(list)
      })
      .catch(() => {
        setProducts([])
        sileo.error({ title: "No se pudieron cargar productos" })
      })
      .finally(() => setLoadingProducts(false))
  }, [open])

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { productId: "", productQuery: "", quantity: 0, unit: "Und" },
    ])
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const updateRow = (
    index: number,
    field: keyof ModifierStockRow,
    value: string | number,
  ) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[index], [field]: value }
      if (field === "productId") {
        const prod = productsById.get(String(value))
        if (prod) {
          row.unit = prod.unit ?? "Und"
          row.productQuery = productLabel(prod)
        }
      }
      next[index] = row
      return next
    })
  }

  const updateRowQuery = (index: number, query: string) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        productQuery: query,
        productId: "",
      }
      return next
    })
  }

  const handleSave = async () => {
    const merged = new Map<string, number>()
    for (const r of rows) {
      if (!r.productId) continue
      merged.set(r.productId, (merged.get(r.productId) ?? 0) + Number(r.quantity))
    }
    const lines = [...merged.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    }))
    setSaving(true)
    try {
      await productsApi.setModifierStockLines(optionId, lines)
      sileo.success({ title: "Insumos guardados" })
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al guardar" })
    } finally {
      setSaving(false)
    }
  }

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && saving) return
      onOpenChange(next)
    },
    [onOpenChange, saving],
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/50 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[211] max-h-[min(90vh,640px)] w-[min(calc(100vw-1.5rem),28rem)] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-600">
            <div>
              <Dialog.Title className="flex items-center gap-2 pr-8 text-base font-semibold text-gray-900 dark:text-white">
                <BookOpen className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                Insumos por venta
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {groupName ? (
                  <>
                    Grupo: <strong>{groupName}</strong>
                    {" · "}
                  </>
                ) : null}
                Opción: <strong>{optionLabel}</strong>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          {hint === "milk-type" ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-semibold">Cantidades de leche (ml) — no se cargan acá</p>
              <p className="mt-1.5 leading-relaxed">
                Cada preparación lleva <strong>otra cantidad</strong> de leche (café con leche ≠ lágrima ≠
                cortado, etc.). Esos <strong>ml</strong> se definen en el grupo{" "}
                <strong>Preparación — …</strong> de <strong>este mismo producto</strong>, abriendo el
                ícono de libro en cada opción (ej. «Café con leche», «Lágrima»).
              </p>
              <p className="mt-2 leading-relaxed">
                Cada <strong>formato</strong> (Pocillo, Jarrito, Doble, Tazón) es un <strong>producto
                distinto</strong> en el sistema: cada uno tiene su propia grilla de preparación con sus
                ml. El grupo «Tipo de leche» solo indica si el cliente elige leche entera, descremada o
                de almendras; el sistema aplica el mismo volumen que ya figura en la preparación.
              </p>
              <p className="mt-2 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                Podés dejar esta lista vacía: el descuento de stock se arma desde la preparación + el tipo
                de leche elegido en el POS.
              </p>
            </div>
          ) : hint === "preparation" ? (
            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
              <p className="font-semibold">Acá van los ml por preparación y por formato</p>
              <p className="mt-1.5 leading-relaxed">
                Esta opción es <strong>una preparación concreta</strong> (ej. café con leche) en{" "}
                <strong>este</strong> formato (Jarrito, Tazón…). Los insumos que cargues acá aplican solo
                a esta combinación. Otro formato = otro producto POS = otra grilla «Preparación» con sus
                propias cantidades.
              </p>
            </div>
          ) : null}

          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Cantidad por <strong>una</strong> unidad vendida con esta opción (mismo criterio que el POS).
            Negativo = menos consumo respecto a la receta base.
          </p>

          {loadingProducts ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row, index) => {
                const dk = `${optionId}:${index}`
                const filtered = products.filter(
                  (p) =>
                    !row.productQuery.trim() ||
                    productLabel(p).toLowerCase().includes(row.productQuery.trim().toLowerCase()) ||
                    p.name.toLowerCase().includes(row.productQuery.trim().toLowerCase()) ||
                    p.sku.toLowerCase().includes(row.productQuery.trim().toLowerCase()),
                )
                return (
                  <div
                    key={`${optionId}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 p-2"
                  >
                    <div className="relative min-w-[200px] flex-1">
                      <input
                        type="text"
                        value={row.productQuery}
                        onChange={(e) => {
                          updateRowQuery(index, e.target.value)
                          setOpenDropdown(dk)
                        }}
                        onFocus={() => setOpenDropdown(dk)}
                        onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
                        placeholder="Buscar insumo…"
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 pr-8 text-sm"
                      />
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      {openDropdown === dk && (
                        <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                          {filtered.slice(0, 80).map((p) => (
                            <li
                              key={p.id}
                              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                updateRow(index, "productId", p.id)
                                setOpenDropdown(null)
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
                        updateRow(index, "quantity", parseFloat(e.target.value) || 0)
                      }
                      placeholder="Cant."
                      className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                    />
                    <span className="text-xs text-gray-500">
                      {row.unit
                        ? row.unit
                        : row.productId
                          ? productsById.get(row.productId)?.unit
                          : undefined}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      aria-label="Quitar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                <Plus className="h-3 w-3" />
                Añadir insumo
              </button>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600"
              >
                Cancelar
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={saving || loadingProducts}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar insumos
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
