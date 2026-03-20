"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Pencil, Plus, Trash2, Layers } from "lucide-react"
import { sileo } from "sileo"
import { productsApi } from "@/lib/api/products"
import { CreateModifierGroupPopover } from "@/components/CreateModifierGroupPopover"

export type ModifierGroup = {
  id: string
  name: string
  sortOrder: number
  required: boolean
  minSelect: number
  maxSelect: number
  options: Array<{
    id: string
    label: string
    sortOrder: number
    priceDelta: number
  }>
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

  const [optGroupId, setOptGroupId] = useState<string | null>(null)
  const [optLabel, setOptLabel] = useState("")
  const [optPrice, setOptPrice] = useState(0)
  const [creatingOpt, setCreatingOpt] = useState(false)

  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editPriceDelta, setEditPriceDelta] = useState(0)
  const [savingEdit, setSavingEdit] = useState(false)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState("")
  const [savingGroupEdit, setSavingGroupEdit] = useState(false)

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
    setOptGroupId(null)
    setOptLabel("")
    setOptPrice(0)
    cancelEditOption()
    setEditingGroupId(g.id)
    setEditGroupName(g.name)
  }

  const handleUpdateGroup = async () => {
    if (!editingGroupId) return
    const name = editGroupName.trim()
    if (!name) {
      sileo.warning({ title: "Ingresá un nombre para el grupo" })
      return
    }
    setSavingGroupEdit(true)
    try {
      await productsApi.updateModifierGroup(editingGroupId, { name })
      await load()
      cancelEditGroup()
      sileo.success({ title: "Grupo actualizado" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al guardar" })
    } finally {
      setSavingGroupEdit(false)
    }
  }

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
      setOptLabel("")
      setOptPrice(0)
      setOptGroupId(null)
      await load()
      sileo.success({ title: "Opción creada" })
    } catch (e: any) {
      sileo.error({ title: e?.message || "Error al crear opción" })
    } finally {
      setCreatingOpt(false)
    }
  }

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm("¿Eliminar esta opción?")) return
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

  const startEditOption = (o: { id: string; label: string; priceDelta: number }) => {
    cancelEditGroup()
    setOptGroupId(null)
    setOptLabel("")
    setOptPrice(0)
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
        Definí grupos con <strong>Crear grupo</strong> (nombre, obligatorio, máx. opciones) y añadí
        opciones con Δ precio. Los <strong>insumos que se descuentan del stock</strong> por cada opción
        cargalos en esta misma receta → cada ingrediente → variante del plato.
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

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          Sin grupos. Los platos sin modificadores se cargan directo en el POS.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-gray-100 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                {editingGroupId === g.id ? (
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
                      {savingGroupEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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
                ) : (
                  <>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{g.name}</p>
                      <p className="text-xs text-gray-500">
                        {g.required ? "Obligatorio" : "Opcional"} · max {g.maxSelect} · min{" "}
                        {g.minSelect}
                      </p>
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
                              onClick={() => startEditOption(o)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              title="Editar opción"
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
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
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
                      onClick={() => {
                        setOptGroupId(null)
                        setOptLabel("")
                        setOptPrice(0)
                      }}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      cancelEditOption()
                      cancelEditGroup()
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
    </div>
  )
}
