"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Package, User, DollarSign, ListChecks, ArrowLeft, Loader2 } from "lucide-react"
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDateLong,
  addCalendarDaysLocal,
} from "@/lib/utils"
import { getApiUrl } from "@/lib/api"

type BatchData = {
  id: string
  batchCode: string
  quantity: number
  unit: string
  producedAt?: string
  product: { id: string; name: string; sku?: string; unit: string }
  producedBy?: { id: string; firstName?: string; lastName?: string }
  productionOrder?: {
    id: string
    orderNumber: string
    estimatedCost?: number
    plannedQty?: number
    recipe?: {
      name: string
      yieldQty?: number
      yieldUnit?: string
      shelfLifeDays?: number | null
    }
    location?: { name: string }
    items?: Array<{
      id: string
      plannedQty: number
      unitCost?: number
      product?: { id: string; name: string; sku?: string; unit: string }
    }>
  }
}

export default function BatchPublicPage() {
  const params = useParams()
  const code = typeof params.code === "string" ? params.code : ""
  const [data, setData] = useState<BatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setLoading(false)
      setError("Código de lote no válido")
      return
    }
    setLoading(true)
    setError(null)
    fetch(`${getApiUrl()}/batch/${encodeURIComponent(code)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Lote no encontrado")
          throw new Error("Error al cargar el lote")
        }
        return res.json()
      })
      .then(setData)
      .catch((e) => setError(e.message || "Error"))
      .finally(() => setLoading(false))
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600">Cargando información del lote...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center max-w-sm">
          <p className="font-medium text-red-800">{error || "Lote no encontrado"}</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>
      </div>
    )
  }

  const productName = data.product?.name ?? "—"
  const producedByName = data.producedBy
    ? `${data.producedBy.firstName ?? ""} ${data.producedBy.lastName ?? ""}`.trim() || "—"
    : "—"
  const order = data.productionOrder
  const items = order?.items ?? []
  const estimatedCost = order?.estimatedCost ?? 0
  const slRaw = order?.recipe?.shelfLifeDays
  const shelfDays =
    slRaw != null && Number.isFinite(Number(slRaw)) ? Math.round(Number(slRaw)) : null
  const shelfLifePublic =
    shelfDays != null ? `${shelfDays} ${shelfDays === 1 ? "día" : "días"}` : "No definida"
  const producedInstant = data.producedAt
  const expirationPublic =
    shelfDays != null && shelfDays > 0 && producedInstant
      ? addCalendarDaysLocal(producedInstant, shelfDays)
      : null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>

        <div className="rounded-2xl border-2 border-blue-200 bg-white shadow-sm overflow-hidden">
          {/* Encabezado del lote */}
          <div className="border-b border-blue-100 bg-blue-50/60 px-6 py-4">
            <p className="font-mono text-sm font-semibold text-blue-900">{data.batchCode}</p>
            <p className="mt-1 text-xs text-blue-700">Información del lote de producción</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Producto, cantidad, producido por */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-gray-700">
                <Package className="h-5 w-5 text-gray-400" />
                <span className="font-medium">Producto:</span>
                <span className="text-gray-900">{productName}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-medium">Cantidad:</span>
                <span className="text-gray-900">
                  {formatNumber(data.quantity)} {data.unit}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <User className="h-5 w-5 text-gray-400" />
                <span className="font-medium">Producido por:</span>
                <span className="text-gray-900">{producedByName}</span>
              </div>
              {order?.orderNumber && (
                <p className="text-xs text-gray-400">Orden: {order.orderNumber}</p>
              )}
            </section>

            <section className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
                Producción y caducidad
              </p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-amber-900/75">Fecha y hora de producción</p>
                  <p className="text-sm font-bold text-gray-900">
                    {producedInstant ? formatDateTime(producedInstant) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-amber-900/75">Vida útil</p>
                  <p className="text-sm font-bold text-gray-900">{shelfLifePublic}</p>
                </div>
                <div className="border-t border-amber-200/90 pt-2">
                  <p className="text-xs font-medium text-green-800">
                    Vencimiento (consumir antes de)
                  </p>
                  <p className="text-sm font-bold text-green-700">
                    {expirationPublic ? formatDateLong(expirationPublic) : "—"}
                  </p>
                </div>
              </div>
            </section>

            {/* Insumos calculados */}
            {items.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                  <ListChecks className="h-4 w-4 text-gray-500" />
                  Insumos calculados
                </h3>
                <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between items-center px-4 py-3 text-sm"
                    >
                      <span className="text-gray-800">
                        {item.product?.name ?? "—"}
                      </span>
                      <span className="text-gray-600 font-medium">
                        {formatNumber(item.plannedQty)} {item.product?.unit ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Desglose del costo */}
            {items.length > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  Desglose del costo
                </h3>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-4 py-2 font-medium">Insumo</th>
                        <th className="px-4 py-2 font-medium text-right">Cant.</th>
                        <th className="px-4 py-2 font-medium text-right">Costo unit.</th>
                        <th className="px-4 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => {
                        const unitCost = item.unitCost ?? 0
                        const lineTotal = (item.plannedQty ?? 0) * unitCost
                        return (
                          <tr key={item.id} className="text-gray-800">
                            <td className="px-4 py-2">{item.product?.name ?? "—"}</td>
                            <td className="px-4 py-2 text-right">
                              {formatNumber(item.plannedQty)} {item.product?.unit ?? ""}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {formatCurrency(unitCost)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">
                              {formatCurrency(lineTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex justify-between items-center text-sm font-semibold text-gray-900">
                    <span>Costo total estimado</span>
                    <span>{formatCurrency(estimatedCost)}</span>
                  </div>
                </div>
              </section>
            )}

            {items.length === 0 && estimatedCost > 0 && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  Costo estimado
                </h3>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(estimatedCost)}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
