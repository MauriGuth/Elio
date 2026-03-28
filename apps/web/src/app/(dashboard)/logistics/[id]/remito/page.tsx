"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, Loader2, FileText } from "lucide-react"
import { shipmentsApi } from "@/lib/api/shipments"
import { ShipmentLogisticsDocument } from "@/components/shipment/shipment-logistics-document"

/**
 * Remito digital: misma información que el detalle de logística y la vista pública por QR.
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
        <p className="text-red-600 dark:text-red-400">{error ?? "Envío no encontrado"}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 print:min-h-0 print:bg-white print:p-4">
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

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/40 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center gap-2 border-b border-gray-200 pb-4 dark:border-gray-700 print:mb-4 print:border-gray-300">
          <FileText className="h-8 w-8 text-gray-500 dark:text-gray-400 print:text-gray-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white print:text-black">Remito de envío</h1>
            <p className="text-sm text-gray-500 dark:text-gray-300 print:text-gray-600">
              Documento para conductor y destino · {shipment.shipmentNumber}
            </p>
          </div>
        </div>

        <ShipmentLogisticsDocument
          shipment={shipment}
          footerText="Generado desde Nova · Remito digital"
          className="print:space-y-4"
        />
      </div>
    </div>
  )
}
