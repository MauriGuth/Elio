"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  ArrowLeft,
  Factory,
  Clock,
  DollarSign,
  CheckCircle2,
  Circle,
  Play,
  Bot,
  AlertCircle,
  Loader2,
  QrCode,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { productionApi } from "@/lib/api/production"
import { cn, formatCurrency, formatNumber, formatDate, formatTime } from "@/lib/utils"
import type { ProductionStatus } from "@/types"

// ---------- helpers ----------

const statusConfig: Record<
  ProductionStatus,
  { label: string; dot?: string; bg: string; text: string; pulse?: boolean }
> = {
  draft: {
    label: "Borrador",
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-400",
  },
  pending: {
    label: "Pendiente",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-400",
  },
  in_progress: {
    label: "En Curso",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
    pulse: true,
  },
  completed: {
    label: "Completada",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  completed_adjusted: {
    label: "Completada (Ajustada)",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  cancelled: {
    label: "Cancelada",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
}

// Timeline steps
const timelineSteps = [
  { key: "draft", label: "Creada" },
  { key: "pending", label: "Pendiente" },
  { key: "in_progress", label: "En Curso" },
  { key: "completed", label: "Completada" },
]

const statusOrder: Record<string, number> = {
  draft: 0,
  pending: 1,
  in_progress: 2,
  completed: 3,
  completed_adjusted: 3,
  cancelled: -1,
}

function hasMissingStock(order: any): boolean {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.some((item: any) => {
    const needed = item.requiredQty ?? item.plannedQty ?? item.quantity ?? 0
    const available = item.availableQty ?? item.currentStock ?? 0
    return available < needed
  })
}

// ---------- skeleton ----------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="space-y-3">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
          <div className="flex gap-6 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
                <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="h-16 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- main page ----------

export default function ProductionDetailPage() {
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [qrBaseUrl, setQrBaseUrl] = useState("")
  useEffect(() => {
    if (typeof window !== "undefined") setQrBaseUrl(window.location.origin)
  }, [])
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const data = await productionApi.getById(orderId)
      setOrder(data)
    } catch (err: any) {
      const msg = err.message || "Error al cargar la orden"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (orderId) loadOrder()
  }, [orderId, loadOrder])

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#lote" && order && (order.status === "completed" || order.status === "completed_adjusted")) {
      const el = document.getElementById("lote")
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [order])

  const handleStart = useCallback(async () => {
    if (hasMissingStock(order)) {
      const msg = "No podés poner en curso esta producción porque faltan insumos."
      setActionError(msg)
      sileo.error({ title: msg })
      return
    }

    setActionError(null)
    setActionLoading(true)
    try {
      await productionApi.start(orderId)
      await loadOrder()
      sileo.success({ title: "Producción iniciada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al iniciar la producción"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }, [orderId, loadOrder, order])

  const handleComplete = useCallback(async () => {
    setActionError(null)
    setActionLoading(true)
    try {
      const plannedQty = order?.plannedQty ?? 0
      await productionApi.complete(orderId, { actualQty: plannedQty })
      const updated = await productionApi.getById(orderId)
      setOrder(updated)
      // Scroll al lote/QR para que vea el código generado
      setTimeout(() => {
        const el = document.getElementById("lote")
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 300)
      sileo.success({ title: "Producción completada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al completar la producción"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }, [orderId, order?.plannedQty])

  const handleCancel = useCallback(async () => {
    if (!confirm("¿Cancelar esta orden de producción?")) return
    setActionError(null)
    setActionLoading(true)
    try {
      await productionApi.cancel(orderId)
      await loadOrder()
      sileo.success({ title: "Orden cancelada" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al cancelar la orden"
      setActionError(msg)
      sileo.error({ title: msg })
    } finally {
      setActionLoading(false)
    }
  }, [orderId, loadOrder])

  if (loading) {
    return <DetailSkeleton />
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
          🏭
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
          {error ? "Error al cargar" : "Orden no encontrada"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {error || "La orden de producción que buscas no existe."}
        </p>
        <Link
          href="/production"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Producción
        </Link>
      </div>
    )
  }

  const status = (order.status || "draft") as ProductionStatus
  const cfg = statusConfig[status] || statusConfig.draft
  const currentStep = statusOrder[status] ?? -1

  // Extract data from API response, adapting from nested objects
  const recipeName = order.recipe?.name || order.recipeName || "—"
  const recipeVersion = order.recipe?.version || order.recipeVersion || ""
  const locationName = order.location?.name || order.locationName || "—"
  const createdByName =
    order.createdBy?.firstName && order.createdBy?.lastName
      ? `${order.createdBy.firstName} ${order.createdBy.lastName}`
      : typeof order.createdBy === "string"
      ? order.createdBy
      : "—"
  const plannedQty = order.plannedQty ?? 0
  const actualQty = order.actualQty
  const estimatedCost = order.estimatedCost ?? 0
  const actualCost = order.actualCost
  const aiSuggested = order.aiSuggested ?? false

  // Build ingredients from recipe ingredients or order items
  const ingredients: {
    name: string
    needed: number
    available: number
    unit: string
  }[] = []

  // Try to get from order.items (production order items with product info)
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      ingredients.push({
        name: item.product?.name || item.productName || "—",
        needed: item.requiredQty ?? item.plannedQty ?? item.quantity ?? 0,
        available: item.availableQty ?? item.currentStock ?? 0,
        unit: item.product?.unit || item.unit || "Und",
      })
    }
  }
  // Fallback: try recipe.ingredients
  else if (order.recipe?.ingredients && order.recipe.ingredients.length > 0) {
    for (const ing of order.recipe.ingredients) {
      const qtyPerYield = ing.qtyPerYield ?? ing.quantity ?? 0
      const scale = plannedQty / (order.recipe.yieldQty || 1)
      ingredients.push({
        name: ing.product?.name || ing.productName || "—",
        needed: ing.requiredQty ?? qtyPerYield * scale,
        available: ing.availableStock ?? 0,
        unit: ing.product?.unit || ing.unit || "Und",
      })
    }
  }

  // Unit cost calculation
  const unitCost =
    order.unitCost ?? (plannedQty > 0 ? Math.round(estimatedCost / plannedQty) : 0)
  const hasMissingIngredients = hasMissingStock(order)

  return (
    <div className="space-y-6">
      {/* -------- Back link -------- */}
      <Link
        href="/production"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-white transition-colors hover:text-gray-900 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Producción
      </Link>

      {/* -------- Order Header -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Orden {order.orderNumber}
              </h1>
              {aiSuggested && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/50 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-200">
                  <Bot className="h-3 w-3" />
                  Sugerida por IA
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-white">{recipeName}</span>
              {recipeVersion && (
                <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 dark:text-gray-200">
                  {recipeVersion}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  cfg.bg,
                  cfg.text
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {cfg.pulse && (
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                        cfg.dot
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative inline-flex h-1.5 w-1.5 rounded-full",
                      cfg.dot
                    )}
                  />
                </span>
                {cfg.label}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Ubicación</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {locationName}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Fecha Planificada</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {order.plannedDate ? formatDate(order.plannedDate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Cantidad</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
                {actualQty
                  ? `${formatNumber(actualQty)} / ${formatNumber(plannedQty)}`
                  : formatNumber(plannedQty)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Creado por</p>
              <p className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {createdByName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* -------- Lote y QR (siempre visible en órdenes completadas) -------- */}
      {(status === "completed" || status === "completed_adjusted") && (
        <div id="lote" className="rounded-xl border-2 border-blue-200 bg-white p-6 scroll-mt-4">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">
              Lote de producción y QR
            </h3>
          </div>

          {(order.batches ?? order.productionBatches)?.length > 0 ? (
            <div className="flex flex-wrap gap-6">
              {(order.batches ?? order.productionBatches ?? []).map((batch: any) => {
                const productName = batch.product?.name ?? "—"
                const producedByName = batch.producedBy
                  ? `${batch.producedBy.firstName ?? ""} ${batch.producedBy.lastName ?? ""}`.trim() || "—"
                  : "—"
                return (
                  <div
                    key={batch.id}
                    className="flex items-start gap-4 rounded-lg border-2 border-blue-100 bg-blue-50/50 p-4"
                  >
                    <div className="flex-shrink-0 rounded-lg border border-white bg-white p-2 shadow-sm">
                      <QRCodeSVG
                        value={qrBaseUrl ? `${qrBaseUrl}/batch/${batch.batchCode ?? batch.qrCode ?? ""}` : (batch.batchCode ?? batch.qrCode ?? "")}
                        size={140}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-mono text-sm font-semibold text-gray-900">
                        {batch.batchCode}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="text-gray-500">Producto:</span> {productName}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="text-gray-500">Cantidad:</span>{" "}
                        {formatNumber(batch.quantity)} {batch.unit ?? ""}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="text-gray-500">Producido por:</span> {producedByName}
                      </p>
                      {batch.createdAt && (
                        <p className="text-xs text-gray-400">
                          {formatDate(batch.createdAt)}
                          {formatTime(batch.createdAt) ? ` ${formatTime(batch.createdAt)}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mb-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
              <p className="font-medium">No se generó lote para esta orden.</p>
              <p>
                Esta receta no tiene <strong>producto de salida</strong>. Entrá a <Link href="/recipes" className="font-semibold text-amber-800 underline hover:text-amber-900">Recetas</Link>, asigná un producto de salida a esta receta y, en la próxima orden que completes con ella, se generará el lote con código y QR.
              </p>
              <p>
                El código (ej: BATCH-20250211-ABC12345) y el QR aparecen en esta misma sección cuando la receta tiene producto de salida.
              </p>
            </div>
          )}
        </div>
      )}

      {/* -------- Timeline -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400 dark:text-white" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Timeline de Producción
          </h3>
        </div>

        {status === "cancelled" ? (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm font-medium text-red-700">
              Esta orden fue cancelada
            </p>
          </div>
        ) : (
          <div className="relative flex items-center justify-between">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 dark:bg-gray-600" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-blue-500 transition-all"
              style={{
                width: `${Math.max(0, (currentStep / (timelineSteps.length - 1)) * 100)}%`,
              }}
            />

            {timelineSteps.map((step, i) => {
              const isFinalStatus = status === "completed" || status === "completed_adjusted"
              const isCompleted = i < currentStep || (i === currentStep && isFinalStatus)
              const isCurrent = i === currentStep && !isFinalStatus
              const isPending = i > currentStep

              return (
                <div key={step.key} className="relative z-10 flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                      isCompleted &&
                        "border-blue-500 bg-blue-500 text-white",
                      isCurrent &&
                        "border-blue-500 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 ring-4 ring-blue-100 dark:ring-blue-900/50",
                      isPending &&
                        "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isCurrent ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-xs font-medium",
                      isCurrent ? "text-blue-600 dark:text-blue-300" : isCompleted ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-400"
                    )}
                  >
                    {step.label}
                  </p>
                  {/* Show date under step if available */}
                  <p className="mt-0.5 text-[10px] tabular-nums text-gray-400 dark:text-white">
                    {i === 0 && order.plannedDate && formatDate(order.plannedDate)}
                    {i === 2 && order.startedAt && formatTime(order.startedAt)}
                    {i === 3 && order.completedAt && formatTime(order.completedAt)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* -------- Grid: Ingredients + Cost -------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Insumos Calculados */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Factory className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Insumos Calculados
            </h3>
          </div>

          {ingredients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Necesario
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Disponible
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((ing, idx) => {
                    const isOk = ing.available >= ing.needed
                    const deficit = ing.needed - ing.available

                    return (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {ing.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                          {formatNumber(ing.needed)} {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-white">
                          {formatNumber(ing.available)} {ing.unit}
                        </td>
                        <td className="px-4 py-3">
                          {isOk ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              FALTANTE
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-white">
              No hay información de insumos disponible
            </p>
          )}
        </div>

        {/* Costo */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400 dark:text-white" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Desglose de Costo
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <span className="text-sm text-gray-500 dark:text-white">Ingredientes</span>
              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(Math.round(estimatedCost * 0.72))}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <span className="text-sm text-gray-500 dark:text-white">Mano de obra</span>
              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(Math.round(estimatedCost * 0.18))}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <span className="text-sm text-gray-500 dark:text-white">Overhead</span>
              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(Math.round(estimatedCost * 0.10))}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Total Estimado
              </span>
              <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(estimatedCost)}
              </span>
            </div>
            {actualCost != null && (
              <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/40 px-3 py-2">
                <span className="text-sm font-medium text-green-700 dark:text-green-200">
                  Costo Real
                </span>
                <span className="text-base font-bold tabular-nums text-green-700 dark:text-green-200">
                  {formatCurrency(actualCost)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2">
              <span className="text-xs text-gray-500 dark:text-white">Costo por unidad</span>
              <span className="text-sm font-semibold tabular-nums text-gray-700 dark:text-white">
                {formatCurrency(unitCost)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* -------- Actions -------- */}
      {actionError && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>
      )}
      {hasMissingIngredients && (status === "draft" || status === "pending") && (
        <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
          No podés poner esta producción en curso mientras haya insumos con faltante.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {(status === "draft" || status === "pending") && (
          <button
            type="button"
            onClick={handleStart}
            disabled={actionLoading || hasMissingIngredients}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {status === "draft" ? "Poner en curso" : "Iniciar Producción"}
          </button>
        )}
        {status === "in_progress" && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Completar Producción
          </button>
        )}
        {(status === "draft" || status === "pending") && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancelar Orden
          </button>
        )}
      </div>
    </div>
  )
}
