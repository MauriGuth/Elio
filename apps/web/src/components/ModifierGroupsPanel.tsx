"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Pencil, Plus, Trash2, Layers, Search, X, BookOpen } from "lucide-react"
import { sileo } from "sileo"
import { productsApi } from "@/lib/api/products"
import { recipesApi } from "@/lib/api/recipes"
import { CreateModifierGroupPopover } from "@/components/CreateModifierGroupPopover"
import {
  ModifierOptionRecipeDialog,
  type StockLineFromApi,
} from "@/components/ModifierOptionRecipeDialog"

export type ModifierGroup = {
  id: string
  name: string
  sortOrder: number
  required: boolean
  minSelect: number
  maxSelect: number
  /** Si existe, el POS puede mostrar u ocultar el grupo según otra elección (ej. tipo de leche). */
  visibilityRule?: unknown | null
  options: Array<{
    id: string
    label: string
    sortOrder: number
    priceDelta: number
    stockLines?: Array<{
      id: string
      quantity: number
      product: { id: string; name: string; sku: string; unit?: string }
    }>
  }>
}

type RecipePickRow = {
  id: string
  name: string
  product?: { id: string; name: string; sku: string } | null
}

type Props = {
  productId: string
  readOnly?: boolean
  /** Ocultar título principal (cuando va dentro de un modal que ya tiene título) */
  embedded?: boolean
  /** En recetas: no mostrar link “Ir a Recetas” */
  showRecipesLink?: boolean
}

export function ModifierGroupsPanel({
  productId,
  readOnly = false,
  embedded = false,
  showRecipesLink = true,
}: Props) {
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true
      return (g.options || []).some((o) => o.label.toLowerCase().includes(q))
    })
  }, [groups, searchQuery])

  const [optGroupId, setOptGroupId] = useState<string | null>(null)
  /** manual = nombre + Δ precio; recipe = elegir receta existente (copia insumos base a la opción). */
  const [addOptionMode, setAddOptionMode] = useState<"manual" | "recipe">("manual")
  const [optLabel, setOptLabel] = useState("")
  const [optPrice, setOptPrice] = useState(0)
  const [creatingOpt, setCreatingOpt] = useState(false)
  const [recipesForPick, setRecipesForPick] = useState<RecipePickRow[]>([])
  const [recipesPickLoading, setRecipesPickLoading] = useState(false)
  const [recipePickQuery, setRecipePickQuery] = useState("")
  const [selectedRecipeId, setSelectedRecipeId] = useState("")

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editPriceDelta, setEditPriceDelta] = useState(0)
  const [savingEdit, setSavingEdit] = useState(false)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState("")
  const [savingGroupEdit, setSavingGroupEdit] = useState(false)
  /** Regla POS: mostrar este grupo solo si en otro grupo se eligió una de estas etiquetas. */
  const [editUseVisibility, setEditUseVisibility] = useState(false)
  const [editPriorGroupIds, setEditPriorGroupIds] = useState<string[]>([])
  const [editPriorGroupQuery, setEditPriorGroupQuery] = useState("")
  const [editVisibilityLabels, setEditVisibilityLabels] = useState("")

  const [recipeDialog, setRecipeDialog] = useState<{
    optionId: string
    optionLabel: string
    lines: StockLineFromApi[]
    groupName: string
    visibilityRule: unknown | null | undefined
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await productsApi.getModifiers(productId)
      setGroups(Array.isArray(data) ? data : [])
    } catch {
      setGroups([])
      sileo.error({ title: "No se pudieron cargar los modificadores" })
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  const cancelEditGroup = () => {
    setEditingGroupId(null)
    setEditGroupName("")
    setEditUseVisibility(false)
    setEditPriorGroupIds([])
    setEditPriorGroupQuery("")
    setEditVisibilityLabels("")
  }

  const resetAddOptionForm = () => {
    setOptGroupId(null)
    setAddOptionMode("manual")
    setOptLabel("")
    setOptPrice(0)
    setRecipePickQuery("")
    setSelectedRecipeId("")
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("¿Eliminar este grupo y todas sus opciones?")) return
    try {
      await productsApi.deleteModifierGroup(groupId)
      if (editingGroupId === groupId) cancelEditGroup()
      await load()
      sileo.success({ title: "Grupo eliminado" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al eliminar" })
    }
  }

  const startEditGroup = (g: ModifierGroup) => {
    resetAddOptionForm()
    cancelEditOption()
    setEditingGroupId(g.id)
    setEditGroupName(g.name)
    const rule = g.visibilityRule as
      | { whenPriorGroupSortOrder?: unknown; whenSelectedOptionLabels?: unknown }
      | null
      | undefined
    const ok =
      rule &&
      typeof rule.whenPriorGroupSortOrder === "number" &&
      Array.isArray(rule.whenSelectedOptionLabels)
    if (ok) {
      setEditUseVisibility(true)
      const r = rule as {
        whenPriorGroupId?: string
        whenPriorGroupIds?: string[]
      }
      const fromRule = Array.isArray(r.whenPriorGroupIds)
        ? r.whenPriorGroupIds
        : typeof r.whenPriorGroupId === "string" && r.whenPriorGroupId
          ? [r.whenPriorGroupId]
          : []
      const valid = fromRule.filter((id) => groups.some((x) => x.id === id))
      if (valid.length > 0) {
        setEditPriorGroupIds(valid)
      } else {
        const prior = groups.find(
          (x) => x.sortOrder === rule.whenPriorGroupSortOrder
        )
        setEditPriorGroupIds(prior?.id ? [prior.id] : [])
      }
      setEditVisibilityLabels(
        (rule.whenSelectedOptionLabels as string[]).join("\n")
      )
    } else {
      setEditUseVisibility(false)
      setEditPriorGroupIds([])
      setEditPriorGroupQuery("")
      setEditVisibilityLabels("")
    }
  }

  const handleUpdateGroup = async () => {
    if (!editingGroupId) return
    const name = editGroupName.trim()
    if (!name) {
      sileo.warning({ title: "Ingresá un nombre para el grupo" })
      return
    }
    let visibilityRule: Record<string, unknown> | null = null
    if (editUseVisibility) {
      if (!editPriorGroupIds.length) {
        sileo.warning({
          title: "Elegí al menos un grupo de referencia (ej. Preparación)",
        })
        return
      }
      const priors = groups.filter((x) => editPriorGroupIds.includes(x.id))
      if (!priors.length) {
        sileo.warning({ title: "Grupo de referencia inválido" })
        return
      }
      const labels = editVisibilityLabels
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (labels.length === 0) {
        sileo.warning({
          title: "Indicá al menos una etiqueta de opción (ej. LATTE SABORIZADO DOBLE)",
        })
        return
      }
      visibilityRule = {
        whenPriorGroupSortOrder: priors[0]!.sortOrder,
        whenPriorGroupId: priors[0]!.id,
        whenPriorGroupIds: priors.map((p) => p.id),
        whenSelectedOptionLabels: labels,
      }
    }
    setSavingGroupEdit(true)
    try {
      await productsApi.updateModifierGroup(editingGroupId, {
        name,
        visibilityRule,
      })
      await load()
      cancelEditGroup()
      sileo.success({ title: "Grupo actualizado" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al guardar" })
    } finally {
      setSavingGroupEdit(false)
    }
  }

  const loadRecipesForPick = useCallback(async () => {
    setRecipesPickLoading(true)
    try {
      const res = await recipesApi.getAll({ limit: 2000, isActive: true })
      const data = (res as { data?: unknown }).data
      setRecipesForPick(Array.isArray(data) ? (data as RecipePickRow[]) : [])
    } catch {
      setRecipesForPick([])
      sileo.error({ title: "No se pudieron cargar las recetas" })
    } finally {
      setRecipesPickLoading(false)
    }
  }, [])

  const filteredRecipesForPick = useMemo(() => {
    const q = recipePickQuery.trim().toLowerCase()
    let list = [...recipesForPick]
    list.sort((a, b) => {
      const aSame = a.product?.id === productId ? 0 : 1
      const bSame = b.product?.id === productId ? 0 : 1
      if (aSame !== bSame) return aSame - bSame
      return (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" })
    })
    if (!q) return list
    return list.filter((r) => {
      const n = (r.name ?? "").toLowerCase()
      const pn = (r.product?.name ?? "").toLowerCase()
      const sku = (r.product?.sku ?? "").toLowerCase()
      return n.includes(q) || pn.includes(q) || sku.includes(q)
    })
  }, [recipesForPick, recipePickQuery, productId])

  const handleCreateOption = async (groupId: string) => {
    const label = optLabel.trim()
    if (!label) {
      sileo.warning({ title: "Ingresá el nombre de la opción" })
      return
    }
    setCreatingOpt(true)
    try {
      await productsApi.createModifierOption(groupId, {
        label,
        priceDelta: optPrice,
      })
      resetAddOptionForm()
      await load()
      sileo.success({ title: "Opción creada" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al crear opción" })
    } finally {
      setCreatingOpt(false)
    }
  }

  const handleCreateOptionFromRecipe = async (groupId: string) => {
    if (!selectedRecipeId) {
      sileo.warning({ title: "Elegí una receta de la lista" })
      return
    }
    setCreatingOpt(true)
    try {
      await productsApi.createModifierOptionFromRecipe(groupId, {
        recipeId: selectedRecipeId,
        ...(optLabel.trim() ? { label: optLabel.trim() } : {}),
        priceDelta: optPrice,
      })
      resetAddOptionForm()
      await load()
      sileo.success({ title: "Opción creada desde receta" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al crear desde receta" })
    } finally {
      setCreatingOpt(false)
    }
  }

  const handleDeleteOption = async (optionId: string) => {
    if (
      !confirm(
        "¿Eliminar esta opción del grupo? Se quitan también los insumos por venta de la opción. No se borra la receta del módulo Recetas.",
      )
    )
      return
    try {
      await productsApi.deleteModifierOption(optionId)
      if (editingOptionId === optionId) {
        setEditingOptionId(null)
        setEditLabel("")
        setEditPriceDelta(0)
      }
      await load()
      sileo.success({ title: "Opción eliminada" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al eliminar" })
    }
  }

  const startEditOption = (o: ModifierGroup["options"][number]) => {
    cancelEditGroup()
    resetAddOptionForm()
    setEditingOptionId(o.id)
    setEditLabel(o.label)
    setEditPriceDelta(Number(o.priceDelta) || 0)
  }

  const cancelEditOption = () => {
    setEditingOptionId(null)
    setEditLabel("")
    setEditPriceDelta(0)
  }

  const handleUpdateOption = async () => {
    if (!editingOptionId) return
    const label = editLabel.trim()
    if (!label) {
      sileo.warning({ title: "Ingresá un nombre para la opción" })
      return
    }
    setSavingEdit(true)
    try {
      await productsApi.updateModifierOption(editingOptionId, {
        label,
        priceDelta: editPriceDelta,
      })
      await load()
      cancelEditOption()
      sileo.success({ title: "Opción actualizada" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al guardar" })
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className={embedded ? "" : "mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"}>
      <div
        className={
          embedded
            ? "mb-4 flex flex-wrap items-center justify-end gap-2"
            : "mb-4 flex flex-wrap items-center justify-between gap-2"
        }
      >
        {!embedded ? (
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Modificadores de carta (opciones en el POS)
            </h3>
          </div>
        ) : null}
        <div className={embedded ? "flex flex-wrap items-center gap-2" : "ml-auto flex flex-wrap items-center gap-2"}>
          {!readOnly && (
            <CreateModifierGroupPopover
              disabled={loading}
              variant="blue"
              triggerSize="sm"
              onCreate={async (payload) => {
                try {
                  await productsApi.createModifierGroup(productId, {
                    name: payload.name,
                    required: payload.required,
                    maxSelect: payload.maxSelect,
                    minSelect: payload.required ? 1 : 0,
                  })
                  await load()
                  sileo.success({ title: "Grupo creado" })
                } catch (e: any) {
                  sileo.error({ title: e?.message || "No se pudo crear el grupo" })
                  throw e
                }
              }}
            />
          )}
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        El catálogo de grupos es <strong>global</strong>: lo que crees acá aparece en <strong>todas</strong>{" "}
        las recetas al elegir &quot;Grupo de modificadores&quot; en un ingrediente. Definí grupos con{" "}
        <strong>Crear grupo</strong> (nombre, obligatorio, máx. opciones) y añadí opciones con Δ precio.
        Con el ícono <strong className="inline-flex items-center gap-0.5">
          <BookOpen className="inline h-3 w-3 text-amber-600" aria-hidden />
        </strong>{" "}
        podés definir los <strong>insumos por venta</strong> de cada opción (café solo, cortado, etc.).
        También podés cargarlos desde Recetas → ingrediente → variante del plato.
      </p>
      {showRecipesLink ? (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          <Link
            href="/recipes"
            className="font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
          >
            Ir a listado de Recetas
          </Link>
        </p>
      ) : null}

      {!loading && groups.length > 0 ? (
        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="modifier-groups-search" className="sr-only">
            Buscar grupo u opción
          </label>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400"
              aria-hidden
            />
            <input
              id="modifier-groups-search"
              type="text"
              role="searchbox"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar grupo u opción…"
              autoComplete="off"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-gray-900"
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {searchQuery.trim() ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {filteredGroups.length === groups.length
                ? `${groups.length} grupos`
                : `${filteredGroups.length} de ${groups.length} grupos`}
            </p>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          Sin grupos. Los platos sin modificadores se cargan directo en el POS.
        </p>
      ) : filteredGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Ningún grupo u opción coincide con &quot;{searchQuery.trim()}&quot;. Probá otra palabra o{" "}
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
          >
            limpiá la búsqueda
          </button>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-gray-100 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                {editingGroupId === g.id ? (
                  <div className="flex w-full flex-col gap-3">
                    <div className="flex w-full flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="mb-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                          Nombre del grupo
                        </label>
                        <input
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm font-medium text-gray-900 dark:text-white"
                          autoFocus
                        />
                      </div>
                      <button
                        type="button"
                        disabled={savingGroupEdit}
                        onClick={() => void handleUpdateGroup()}
                        className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {savingGroupEdit ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Guardar
                      </button>
                      <button
                        type="button"
                        disabled={savingGroupEdit}
                        onClick={cancelEditGroup}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                    <div className="rounded-md border border-amber-200/80 bg-amber-50/90 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={editUseVisibility}
                          onChange={(e) => setEditUseVisibility(e.target.checked)}
                          className="rounded border-gray-400"
                        />
                        Mostrar este grupo en el POS solo si en otro grupo se elige…
                      </label>
                      <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                        Útil para syrup solo en lattes saborizados. Las etiquetas deben coincidir
                        con el nombre de la opción (sin importar mayúsculas o tildes).
                      </p>
                      {editUseVisibility ? (
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                              Grupos de referencia (podés elegir más de uno)
                            </label>
                            <input
                              type="text"
                              value={editPriorGroupQuery}
                              onChange={(e) => setEditPriorGroupQuery(e.target.value)}
                              placeholder="Buscar grupo por nombre..."
                              className="mb-2 w-full max-w-md rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                            />
                            <div className="w-full max-w-md rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-2 max-h-[160px] overflow-auto space-y-1">
                              {groups
                                .filter((x) => x.id !== g.id)
                                .filter((x) =>
                                  x.name
                                    .toLowerCase()
                                    .includes(editPriorGroupQuery.trim().toLowerCase())
                                )
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((x) => {
                                  const checked = editPriorGroupIds.includes(x.id)
                                  return (
                                    <label
                                      key={x.id}
                                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                          setEditPriorGroupIds((prev) =>
                                            e.target.checked
                                              ? [...prev, x.id]
                                              : prev.filter((id) => id !== x.id)
                                          )
                                        }
                                        className="h-4 w-4 rounded border-gray-400"
                                      />
                                      <span>
                                        {x.name} (orden {x.sortOrder})
                                      </span>
                                    </label>
                                  )
                                })}
                              {groups
                                .filter((x) => x.id !== g.id)
                                .filter((x) =>
                                  x.name
                                    .toLowerCase()
                                    .includes(editPriorGroupQuery.trim().toLowerCase())
                                ).length === 0 ? (
                                <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                                  No hay grupos que coincidan.
                                </p>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                              Podés seleccionar varios grupos.
                            </p>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                              Etiquetas de opción que muestran este grupo (una por línea)
                            </label>
                            <textarea
                              value={editVisibilityLabels}
                              onChange={(e) => setEditVisibilityLabels(e.target.value)}
                              rows={4}
                              placeholder={
                                "LATTE SABORIZADO TAZON\nLATTE SABORIZADO DOBLE"
                              }
                              className="w-full max-w-md rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 font-mono text-xs"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{g.name}</p>
                      <p className="text-xs text-gray-500">
                        {g.required ? "Obligatorio" : "Opcional"} · max {g.maxSelect} · min{" "}
                        {g.minSelect} · orden {g.sortOrder}
                      </p>
                      {(() => {
                        const rule = g.visibilityRule as
                          | {
                              whenPriorGroupSortOrder?: number
                              whenSelectedOptionLabels?: string[]
                              whenPriorGroupId?: string
                              whenPriorGroupIds?: string[]
                            }
                          | null
                          | undefined
                        if (
                          !rule ||
                          typeof rule.whenPriorGroupSortOrder !== "number" ||
                          !Array.isArray(rule.whenSelectedOptionLabels)
                        )
                          return null
                        const pids = Array.isArray(rule.whenPriorGroupIds)
                          ? rule.whenPriorGroupIds
                          : rule.whenPriorGroupId
                            ? [rule.whenPriorGroupId]
                            : []
                        const priors =
                          pids.length > 0
                            ? pids
                                .map((id) => groups.find((x) => x.id === id))
                                .filter((x): x is ModifierGroup => Boolean(x))
                            : [
                                groups.find(
                                  (x) => x.sortOrder === rule.whenPriorGroupSortOrder
                                ),
                              ].filter((x): x is ModifierGroup => Boolean(x))
                        return (
                          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200/90">
                            POS: visible si en{" "}
                            {priors.length > 0
                              ? priors.map((p) => `"${p.name}"`).join(" o ")
                              : '"?"'}{" "}
                            elegís:{" "}
                            {rule.whenSelectedOptionLabels.join(" · ")}
                          </p>
                        )
                      })()}
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEditGroup(g)}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                          title="Editar nombre del grupo"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(g.id)}
                          className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Eliminar grupo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <ul className="mt-3 space-y-2">
                {(g.options || []).map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/60 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  >
                    {editingOptionId === o.id ? (
                      <div className="flex w-full flex-wrap items-end gap-2">
                        <input
                          aria-label="Nombre de la opción"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="min-w-[8rem] flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <input
                          aria-label="Delta de precio"
                          type="number"
                          step="0.01"
                          value={editPriceDelta}
                          onChange={(e) =>
                            setEditPriceDelta(parseFloat(e.target.value) || 0)
                          }
                          placeholder="Δ precio"
                          className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => void handleUpdateOption()}
                          className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Guardar
                        </button>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={cancelEditOption}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="font-medium text-gray-800 dark:text-gray-100">{o.label}</span>
                          {Number(o.priceDelta) !== 0 ? (
                            <span className="ml-2 text-xs text-gray-500">
                              Δ precio {Number(o.priceDelta) > 0 ? "+" : ""}
                              {o.priceDelta}
                            </span>
                          ) : null}
                        </div>
                        {!readOnly && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setRecipeDialog({
                                  optionId: o.id,
                                  optionLabel: o.label,
                                  lines: (o.stockLines || []).map((sl) => ({
                                    id: sl.id,
                                    quantity: sl.quantity,
                                    product: sl.product,
                                  })),
                                  groupName: g.name,
                                  visibilityRule: g.visibilityRule,
                                })
                              }
                              className="rounded p-1 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                              title="Insumos / receta por venta"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditOption(o)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              title="Editar nombre y Δ precio"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOption(o.id)}
                              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Eliminar opción"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {!readOnly &&
                (optGroupId === g.id ? (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAddOptionMode("manual")}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          addOptionMode === "manual"
                            ? "bg-amber-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Opción manual
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddOptionMode("recipe")
                          setSelectedRecipeId("")
                          void loadRecipesForPick()
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          addOptionMode === "recipe"
                            ? "bg-amber-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        Desde receta existente
                      </button>
                    </div>
                    {addOptionMode === "manual" ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          placeholder="Nombre opción"
                          value={optLabel}
                          onChange={(e) => setOptLabel(e.target.value)}
                          className="min-w-[8rem] flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Δ precio"
                          value={optPrice || ""}
                          onChange={(e) => setOptPrice(parseFloat(e.target.value) || 0)}
                          className="w-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          disabled={creatingOpt}
                          onClick={() => handleCreateOption(g.id)}
                          className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {creatingOpt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={resetAddOptionForm}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Se copian los insumos <strong>base</strong> de la receta (sin grupo de variantes),
                          como cantidad por unidad vendida. No se crea otra receta en Recetas. Para sacar
                          esta opción del grupo (y evitar duplicados en el POS), usá la{" "}
                          <strong>papelera</strong> en la fila de la opción.
                        </p>
                        <input
                          type="search"
                          placeholder="Buscar receta por nombre o producto…"
                          value={recipePickQuery}
                          onChange={(e) => setRecipePickQuery(e.target.value)}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <div className="max-h-40 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900">
                          {recipesPickLoading ? (
                            <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Cargando recetas…
                            </div>
                          ) : filteredRecipesForPick.length === 0 ? (
                            <p className="p-3 text-xs text-gray-500">No hay recetas que coincidan.</p>
                          ) : (
                            filteredRecipesForPick.slice(0, 200).map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setSelectedRecipeId(r.id)}
                                className={`block w-full border-b border-gray-100 px-2 py-1.5 text-left text-sm last:border-b-0 dark:border-gray-700 ${
                                  selectedRecipeId === r.id
                                    ? "bg-amber-100 dark:bg-amber-950/50"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                              >
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {r.name}
                                </span>
                                {r.product?.name ? (
                                  <span className="ml-1 text-xs text-gray-500">
                                    · {r.product.name}
                                    {r.product.sku ? ` (${r.product.sku})` : ""}
                                  </span>
                                ) : null}
                              </button>
                            ))
                          )}
                        </div>
                        {filteredRecipesForPick.length > 200 ? (
                          <p className="text-[11px] text-gray-500">
                            Mostrando 200 de {filteredRecipesForPick.length}; afiná la búsqueda.
                          </p>
                        ) : null}
                        <input
                          placeholder="Nombre en el POS (opcional, por defecto el de la receta)"
                          value={optLabel}
                          onChange={(e) => setOptLabel(e.target.value)}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                        <div className="flex flex-wrap items-end gap-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Δ precio"
                            value={optPrice || ""}
                            onChange={(e) => setOptPrice(parseFloat(e.target.value) || 0)}
                            className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                          />
                          <button
                            type="button"
                            disabled={creatingOpt || !selectedRecipeId}
                            onClick={() => void handleCreateOptionFromRecipe(g.id)}
                            className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            {creatingOpt ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Añadir desde receta
                          </button>
                          <button
                            type="button"
                            onClick={resetAddOptionForm}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      cancelEditOption()
                      cancelEditGroup()
                      setAddOptionMode("manual")
                      setRecipePickQuery("")
                      setSelectedRecipeId("")
                      setOptLabel("")
                      setOptPrice(0)
                      setOptGroupId(g.id)
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    <Plus className="h-3 w-3" />
                    Añadir opción
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {recipeDialog ? (
        <ModifierOptionRecipeDialog
          open
          onOpenChange={(open) => {
            if (!open) setRecipeDialog(null)
          }}
          optionId={recipeDialog.optionId}
          optionLabel={recipeDialog.optionLabel}
          initialLines={recipeDialog.lines}
          groupName={recipeDialog.groupName}
          visibilityRule={recipeDialog.visibilityRule}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  )
}
