"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import {
  ArrowLeft,
  Receipt,
  Loader2,
  Calendar,
  User,
  DollarSign,
  CreditCard,
  Banknote,
  Building2,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Clock,
  TrendingUp,
  X,
  ExternalLink,
} from "lucide-react"
import { cashRegistersApi } from "@/lib/api/cash-registers"
import { ordersApi } from "@/lib/api/orders"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

const DIFF_PERCENT_YELLOW = 1
const DIFF_PERCENT_RED = 5

function diffColor(difference: number, expectedAmount: number) {
  if (Math.abs(difference) < 0.01) return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30"
  const expected = Math.abs(expectedAmount) < 0.01 ? 1 : expectedAmount
  const pct = (Math.abs(difference) / expected) * 100
  if (pct >= DIFF_PERCENT_RED) return "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30"
  if (pct >= DIFF_PERCENT_YELLOW) return "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30"
  return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30"
}

export default function CashClosureDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [closure, setClosure] = useState<any>(null)
  const [shiftMetrics, setShiftMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [orderPeek, setOrderPeek] = useState<{
    order: any
    highlightItemId: string | null
  } | null>(null)
  const [orderPeekLoading, setOrderPeekLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    cashRegistersApi
      .getById(id)
      .then(setClosure)
      .catch((err) => {
        const msg = err?.message ?? "Error al cargar"
        setError(msg)
        sileo.error({ title: msg })
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id || !closure?.closedAt) return
    cashRegistersApi
      .getShiftMetrics(id)
      .then((data) => data && setShiftMetrics(data))
      .catch(() => setShiftMetrics(null))
  }, [id, closure?.closedAt])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !closure) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error ?? "Cierre no encontrado"}</p>
        <Link
          href="/cash-registers"
          className="mt-4 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Cierres de caja
        </Link>
      </div>
    )
  }

  const diff = closure.difference ?? 0
  const expected = closure.expectedAmount ?? 0
  const diffLabel =
    Math.abs(diff) < 0.01
      ? "Cuadre ($0)"
      : diff > 0
        ? `Sobrante ${formatCurrency(diff)}`
        : `Faltante ${formatCurrency(Math.abs(diff))}`
  // Ingresos Totales = Efectivo + Tarjetas (débito + crédito + card) + Transferencias + QR
  const ingresosTotales =
    (closure.salesCash ?? 0) +
    (closure.salesDebit ?? 0) +
    (closure.salesCredit ?? 0) +
    (closure.salesCard ?? 0) +
    (closure.salesTransfer ?? 0) +
    (closure.salesQr ?? 0)
  // Gastos Totales = gastos en efectivo + retiros
  const gastosTotales = (closure.totalCashExpenses ?? 0) + (closure.totalWithdrawals ?? 0)
  // Resultado Diario = Ingresos Totales − Gastos Totales
  const resultadoDiario = ingresosTotales - gastosTotales

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-4 py-3">
        <Link
          href="/cash-registers"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a Cierres de caja
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Detalle del cierre de caja</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-white">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {closure.closedAt
                ? formatDate(closure.closedAt) + " " + new Date(closure.closedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </span>
            {closure.shift && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-900">
                {closure.shift === "morning" ? "Mañana" : "Tarde"}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {closure.location?.name ?? "—"}
            </span>
            {closure.closedBy && (
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {closure.closedBy.firstName} {closure.closedBy.lastName}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Ventas por medio de pago: Tarjetas, Efectivo, Transferencias + QR con comparación vendido vs declarado */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white">
              Ventas por medio de pago
            </h2>
            <div className="space-y-3">
              {(() => {
                const rec = (closure.closingReconciliation || {}) as Record<string, number>
                const salesCards = (closure.salesDebit ?? 0) + (closure.salesCredit ?? 0) + (closure.salesCard ?? 0)
                const salesTransfQr = (closure.salesTransfer ?? 0) + (closure.salesQr ?? 0)
                const declaredCards = rec.cards ?? 0
                const declaredTransfQr = (rec.transfer ?? 0) + (rec.qr ?? 0)
                const declaredCash = closure.closingAmount ?? 0
                const match = (sold: number, declared: number) => Math.abs((sold ?? 0) - (declared ?? 0)) < 0.02
                const opening = closure.openingAmount ?? 0
                const expenses = (closure.totalCashExpenses ?? 0) + (closure.totalWithdrawals ?? 0)
                const extraIncome = closure.totalExtraIncome ?? 0
                const expectedCash = Math.round((opening + (closure.salesCash ?? 0) - expenses + extraIncome) * 100) / 100
                const row = (
                  label: string,
                  sold: number,
                  declared: number,
                  Icon: React.ComponentType<{ className?: string }>
                ) => {
                  const ok = match(sold, declared)
                  return (
                    <div key={label} className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 dark:text-white">{label}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="tabular-nums text-gray-900 dark:text-white">
                            Vendido: {formatCurrency(sold)}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">·</span>
                          <span className="tabular-nums text-gray-700 dark:text-gray-300">
                            Declarado por cajero: {formatCurrency(declared)}
                          </span>
                          {ok ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Coincide
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                              Diferencia: {formatCurrency(Math.round((declared - sold) * 100) / 100)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <>
                    {row("Tarjetas", salesCards, declaredCards, CreditCard)}
                    {(() => {
                      const ok = match(declaredCash, expectedCash)
                      return (
                        <div key="efectivo" className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                          <Banknote className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-300" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-500 dark:text-white">Efectivo</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                              <span className="tabular-nums text-gray-900 dark:text-white">Vendido: {formatCurrency(closure.salesCash ?? 0)}</span>
                              <span className="text-gray-400 dark:text-gray-500">·</span>
                              <span className="tabular-nums text-gray-700 dark:text-gray-300">Conteo: {formatCurrency(declaredCash)}</span>
                              <span className="text-gray-400 dark:text-gray-500">·</span>
                              <span className="tabular-nums text-gray-500 dark:text-gray-400 text-xs">Esperado: {formatCurrency(expectedCash)}</span>
                              {ok ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Coincide
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                                  Diferencia: {formatCurrency(Math.round((declaredCash - expectedCash) * 100) / 100)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    {row("Transferencias + QR", salesTransfQr, declaredTransfQr, Building2)}
                  </>
                )
              })()}
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
              <span className="text-sm font-medium text-gray-600 dark:text-white">Ingresos totales</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(ingresosTotales)}</span>
            </div>
          </section>

          {/* Caja esperada / real / diferencia */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white">
              Cierre de caja (fórmulas)
            </h2>
            <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4">
              <p className="mb-2 text-xs text-gray-500 dark:text-white">
                Caja esperada = Saldo inicial + Tarjetas + Transferencias y QR + Efectivo − Gastos efectivo − Retiros + Ingresos extra
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">Saldo inicial</span>
                <span className="tabular-nums text-gray-900 dark:text-white">{formatCurrency(closure.openingAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">+ Tarjetas</span>
                <span className="tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(
                    (closure.salesDebit ?? 0) + (closure.salesCredit ?? 0) + (closure.salesCard ?? 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">+ Transferencias y QR</span>
                <span className="tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency((closure.salesTransfer ?? 0) + (closure.salesQr ?? 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">+ Ventas efectivo</span>
                <span className="tabular-nums text-gray-900 dark:text-white">{formatCurrency(closure.salesCash ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">− Gastos en efectivo</span>
                <span className="tabular-nums text-gray-900 dark:text-white">−{formatCurrency(closure.totalCashExpenses ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">− Retiros</span>
                <span className="tabular-nums text-gray-900 dark:text-white">−{formatCurrency(closure.totalWithdrawals ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">+ Ingresos extra</span>
                <span className="tabular-nums text-gray-900 dark:text-white">+{formatCurrency(closure.totalExtraIncome ?? 0)}</span>
              </div>
              {(closure as any).totalCuentaCorriente > 0 && (
                <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                  <span>Ventas a cuenta corriente (no cobradas en el turno)</span>
                  <span className="tabular-nums">{formatCurrency((closure as any).totalCuentaCorriente)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-medium text-gray-900 dark:text-white">
                <span>Caja esperada</span>
                <span className="tabular-nums">{formatCurrency(expected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-white">Caja real (conteo físico efectivo)</span>
                <span className="tabular-nums text-gray-900 dark:text-white">{formatCurrency(closure.closingAmount ?? 0)}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-white">Diferencia = Caja real − Caja esperada (negativo = faltante, positivo = sobrante)</p>
              <div className={cn("flex justify-between rounded-lg px-3 py-2 font-semibold tabular-nums", diffColor(diff, expected))}>
                <span className="text-gray-900 dark:text-white">{Math.abs(diff) < 0.01 ? "Resultado" : diff > 0 ? "Sobrante" : "Faltante"}</span>
                <span>
                  {Math.abs(diff) < 0.01 ? <Minus className="inline h-4 w-4" /> : diff > 0 ? <ArrowUpRight className="inline h-4 w-4" /> : <ArrowDownRight className="inline h-4 w-4" />}
                  {" "}{diffLabel}
                </span>
              </div>
              {closure.closingDenominations && typeof closure.closingDenominations === "object" && Object.keys(closure.closingDenominations as object).length > 0 && (
                <div className="mt-3 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                  <p className="mb-2 text-xs font-medium text-gray-500 dark:text-white">Conteo por denominación</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-900 dark:text-white">
                    {Object.entries(closure.closingDenominations as Record<string, number>)
                      .filter(([, qty]) => qty > 0)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([denom, qty]) => (
                        <span key={denom} className="tabular-nums">
                          {qty} × ${Number(denom).toLocaleString("es-CL")}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {(closure.closingReconciliation as Record<string, number> | null) && (
                <div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs text-gray-600 dark:text-white">
                  <span className="font-medium">Totales declarados al cierre: </span>
                  Tarjetas {formatCurrency((closure.closingReconciliation as any)?.cards ?? 0)}, Transferencias + QR {formatCurrency(((closure.closingReconciliation as any)?.transfer ?? 0) + ((closure.closingReconciliation as any)?.qr ?? 0))}
                </div>
              )}
            </div>
          </section>

          {/* Resultado diario */}
          <section>
            <p className="mb-1 text-xs text-gray-500 dark:text-white">Ingresos totales = Efectivo + Tarjetas + Transferencias + QR</p>
            <p className="mb-2 text-xs text-gray-500 dark:text-white">Resultado diario = Ingresos totales − Gastos totales</p>
            <div className="flex justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3">
              <span className="font-medium text-gray-700 dark:text-white">Resultado diario</span>
              <span className="font-bold tabular-nums text-gray-900 dark:text-white">{formatCurrency(resultadoDiario)}</span>
            </div>
          </section>

          {/* Informe comparativo con el mismo día de la semana anterior (IA) */}
          {closure.comparisonReport && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white">
                Comparación con el mismo día de la semana anterior
              </h2>
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {closure.comparisonReport}
                </p>
              </div>
            </section>
          )}

          {/* Métricas del turno: errores, tacho, demoras, facturación */}
          {shiftMetrics && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white">
                Métricas del turno (demoras vs incidentes)
              </h2>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 p-4">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Mesas errores de comanda</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      {shiftMetrics.errorsTable.orderCount} órdenes, {shiftMetrics.errorsTable.itemCount} ítems
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(shiftMetrics.errorsTable.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 p-4">
                    <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                      <Trash2 className="h-4 w-4" />
                      <span className="font-medium">Tacho de basura</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      {shiftMetrics.trashTable.orderCount} órdenes, {shiftMetrics.trashTable.itemCount} ítems
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(shiftMetrics.trashTable.totalAmount)}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4">
                  <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Demoras de comandas</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span>
                      Promedio:{" "}
                      {shiftMetrics.comandaDelays.avgMinutes != null
                        ? `${shiftMetrics.comandaDelays.avgMinutes} min`
                        : "—"}
                    </span>
                    <span>
                      Máximo:{" "}
                      {shiftMetrics.comandaDelays.maxMinutes != null
                        ? `${shiftMetrics.comandaDelays.maxMinutes} min`
                        : "—"}
                    </span>
                    <span>
                      Superaron tiempo de elaboración (receta):{" "}
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {shiftMetrics.comandaDelays.countExceededExpected ?? 0}
                      </span>
                    </span>
                    <span>
                      Demora &gt;15 min: {shiftMetrics.comandaDelays.countOver15Minutes ?? 0}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      ({shiftMetrics.comandaDelays.itemCount} ítems con tiempo registrado)
                    </span>
                  </div>
                  {shiftMetrics.comandaDelays.details?.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400">
                        Ver detalle de demoras
                      </summary>
                      <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs">
                        {shiftMetrics.comandaDelays.details.map((d: any) => {
                          const over =
                            d.exceededExpected === true ||
                            (d.expectedPrepMinutes != null &&
                              d.expectedPrepMinutes > 0 &&
                              d.delayMinutes > d.expectedPrepMinutes)
                          const labelExtra =
                            d.expectedPrepMinutes != null && d.expectedPrepMinutes > 0
                              ? ` · objetivo ${d.expectedPrepMinutes} min`
                              : ""
                          return (
                            <li key={`${d.orderId}-${d.itemId}`}>
                              <button
                                type="button"
                                onClick={async () => {
                                  setOrderPeekLoading(true)
                                  setOrderPeek(null)
                                  try {
                                    const order = await ordersApi.getById(d.orderId)
                                    setOrderPeek({
                                      order,
                                      highlightItemId: d.itemId,
                                    })
                                  } catch (e: any) {
                                    sileo.error({
                                      title: e?.message ?? "No se pudo cargar el pedido",
                                    })
                                  } finally {
                                    setOrderPeekLoading(false)
                                  }
                                }}
                                className={cn(
                                  "w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-200/80 dark:hover:bg-gray-700/80",
                                  over
                                    ? "font-medium text-red-600 dark:text-red-400"
                                    : "text-gray-700 dark:text-gray-300",
                                )}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {d.productName}: {d.delayMinutes} min{labelExtra}
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                                </span>
                                {(d.tableName || d.orderNumber) && (
                                  <span className="mt-0.5 block text-[10px] font-normal text-gray-500 dark:text-gray-500">
                                    Pedido #{d.orderNumber}
                                    {d.tableName ? ` · ${d.tableName}` : ""}
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4">
                  <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <TrendingUp className="h-4 w-4" />
                    <span className="font-medium">Facturación del turno</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      Total: <span className="font-semibold tabular-nums">{formatCurrency(shiftMetrics.billing.total)}</span>
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      Mesas normales: {formatCurrency(shiftMetrics.billing.normal)} ({shiftMetrics.billing.normalOrderCount} órdenes)
                    </p>
                    {(shiftMetrics.billing.errors > 0 || shiftMetrics.billing.trash > 0) && (
                      <p className="text-gray-600 dark:text-gray-400">
                        Errores: {formatCurrency(shiftMetrics.billing.errors)} · Tacho: {formatCurrency(shiftMetrics.billing.trash)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Movimientos del turno */}
          {closure.cashMovements && closure.cashMovements.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-white">
                Movimientos del turno (gastos, retiros, ingresos extra)
              </h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-white">Tipo</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white">Monto</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-white">Motivo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-white">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closure.cashMovements.map((m: any) => (
                      <tr key={m.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <td className="px-4 py-2 text-gray-900 dark:text-white">
                          {m.type === "expense" || m.type === "out" ? "Gasto" : m.type === "withdrawal" ? "Retiro" : "Ingreso extra"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                          {(m.type === "expense" || m.type === "out" || m.type === "withdrawal") ? "-" : "+"}
                          {formatCurrency(m.amount)}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-white">{m.reason ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-600 dark:text-white">
                          {m.createdBy ? `${m.createdBy.firstName} ${m.createdBy.lastName}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {closure.salesNoTicket > 0 && (
            <p className="text-sm text-amber-700">
              Ventas sin ticket registradas: {formatCurrency(closure.salesNoTicket)}
            </p>
          )}
          {closure.internalConsumption > 0 && (
            <p className="text-sm text-gray-600">
              Consumos internos: {formatCurrency(closure.internalConsumption)}
            </p>
          )}
          {closure.notes && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase text-gray-500">Observaciones</p>
              <p className="mt-1 text-sm text-gray-700">{closure.notes}</p>
            </div>
          )}
        </div>
      </div>

      {orderPeekLoading && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/25"
          aria-busy="true"
          aria-label="Cargando pedido"
        >
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        </div>
      )}

      {orderPeek && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-peek-title"
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div>
                <h2
                  id="order-peek-title"
                  className="text-lg font-bold text-gray-900 dark:text-white"
                >
                  Pedido #{orderPeek.order.orderNumber ?? orderPeek.order.id}
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {orderPeek.order.table?.name
                    ? `Mesa ${orderPeek.order.table.name}`
                    : "Sin mesa"}
                  {orderPeek.order.closedAt &&
                    ` · Cerrado ${formatDate(orderPeek.order.closedAt)} ${new Date(orderPeek.order.closedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Tocaste un ítem de la lista de demoras; el resaltado es esa línea en el pedido completo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderPeek(null)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Comanda completa
              </p>
              <ul className="space-y-2">
                {(orderPeek.order.items ?? []).map((it: any) => {
                  const lineTotal =
                    typeof it.totalPrice === "number"
                      ? it.totalPrice
                      : (it.unitPrice ?? 0) * (it.quantity ?? 1)
                  const isHi = it.id === orderPeek.highlightItemId
                  return (
                    <li
                      key={it.id}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        isHi
                          ? "border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/35"
                          : "border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/60",
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {it.productName ?? it.product?.name ?? "Ítem"} × {it.quantity ?? 1}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-700 dark:text-gray-300">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                      {it.notes && (
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{it.notes}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex justify-between text-sm font-semibold text-gray-900 dark:text-white">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatCurrency(orderPeek.order.total ?? orderPeek.order.subtotal ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
