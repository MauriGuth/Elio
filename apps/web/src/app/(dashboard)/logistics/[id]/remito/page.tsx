"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Truck,
  Printer,
  Loader2,
  FileText,
} from "lucide-react"
import { shipmentsApi } from "@/lib/api/shipments"
import { formatDate, formatTime, formatNumber } from "@/lib/utils"

const statusLabelEs: Record<string, string> = {
  draft: "Borrador",
  prepared: "Preparado",
  dispatched: "Despachado",
  in_transit: "En tránsito",
  delivered: "Entregado",
  received: "Recibido",
  received_with_diff: "Recibido con diferencia",
  closed: "Cerrado",
  cancelled: "Cancelado",
}

/**
 * Remito digital: vista para ver e imprimir el remito de un envío.
 * Fase 3.3 del plan: Remito digital por envío.
 */
export default function RemitoPage() {
  const params = useParams()
  const id = params.id as string
  const [shipment, setShipment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    shipmentsApi
      .getById(id)
      .then(setShipment)
      .catch((err: any) => setError(err?.message ?? "Error al cargar el envío"))
      .finally(() => setLoading(false))
  }, [id])

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !shipment) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href={`/logistics/${id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-white hover:text-gray-900 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al envío
        </Link>
        <p className="text-red-600">{error ?? "Envío no encontrado"}</p>
      </div>
    )
  }

  const originName = shipment.origin?.name ?? "—"
  const destName = shipment.destination?.name ?? "—"
  const originAddress = shipment.origin?.address ?? ""
  const destAddress = shipment.destination?.address ?? ""
  const items = shipment.items ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 print:bg-white print:min-h-0">
      {/* Solo visible en pantalla, no en impresión */}
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href={`/logistics/${id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-white hover:text-gray-900 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al envío
        </Link>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Printer className="h-4 w-4" />
          Imprimir remito
        </button>
      </div>

      {/* Contenido del remito */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 print:border-0 print:shadow-none">
        <div className="mb-8 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
          <FileText className="h-8 w-8 text-gray-500 dark:text-gray-400" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Remito de envío</h1>
            <p className="text-sm text-gray-500 dark:text-gray-300">Documento para conductor y destino</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">Origen</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{originName}</p>
            {originAddress && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{originAddress}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">Destino</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{destName}</p>
            {destAddress && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{destAddress}</p>}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-400 dark:text-white">Nº Envío</p>
            <p className="mt-0.5 font-mono font-semibold text-gray-900 dark:text-white">{shipment.shipmentNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-white">Fecha creación</p>
            <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
              {shipment.createdAt ? formatDate(shipment.createdAt) : "—"}
            </p>
          </div>
          {shipment.estimatedArrival && (
            <div>
              <p className="text-xs text-gray-400 dark:text-white">Llegada estimada</p>
              <p className="mt-0.5 font-medium text-blue-700 dark:text-blue-300">
                {formatDate(shipment.estimatedArrival)} {formatTime(shipment.estimatedArrival)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 dark:text-white">Estado</p>
            <p className="mt-0.5 font-medium text-gray-900 dark:text-white">
              {statusLabelEs[(shipment.status ?? "draft").toLowerCase()] ?? "Borrador"}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-white">Ítems del envío</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                <th className="pb-2 font-medium text-gray-600 dark:text-white">Producto</th>
                <th className="pb-2 text-right font-medium text-gray-600 dark:text-white">Cantidad enviada</th>
                <th className="pb-2 text-right font-medium text-gray-600 dark:text-white">Cantidad recibida</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 font-medium text-gray-900 dark:text-white">
                    {item.product?.name ?? "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-700 dark:text-white">
                    {formatNumber(item.sentQty ?? 0)} {item.product?.unit ?? ""}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-600 dark:text-white">
                    {item.receivedQty != null ? `${formatNumber(item.receivedQty)} ${item.product?.unit ?? ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {shipment.notes && (
          <div className="mt-6 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Notas</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {String(shipment.notes).replace(/\*\*/g, "")}
            </p>
          </div>
        )}

        <div className="mt-10 flex justify-between border-t border-gray-200 pt-6 text-xs text-gray-400">
          <span>Generado desde Nova · Remito digital</span>
          <span>{shipment.shipmentNumber}</span>
        </div>
      </div>
    </div>
  )
}
