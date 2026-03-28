"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { ShipmentLogisticsDocument } from "@/components/shipment/shipment-logistics-document"

const SHIPMENT_API_PATH = "/api/shipment"

export default function ShipmentPublicPage() {
  const params = useParams()
  const number = (typeof params.number === "string" ? params.number : "").trim()
  const [shipment, setShipment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!number) {
      setLoading(false)
      setError("Número de envío no válido")
      return
    }
    setLoading(true)
    setError(null)
    fetch(`${SHIPMENT_API_PATH}/${encodeURIComponent(number)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Envío no encontrado")
          throw new Error("Error al cargar el envío")
        }
        return res.json()
      })
      .then(setShipment)
      .catch((e) => setError(e.message || "Error"))
      .finally(() => setLoading(false))
  }, [number])

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-gray-600 dark:text-gray-300">Cargando detalle del envío...</p>
      </div>
    )
  }

  if (error || !shipment) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
        <div className="max-w-sm rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950/40">
          <p className="font-medium text-red-800 dark:text-red-200">{error || "Envío no encontrado"}</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline dark:text-red-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <ShipmentLogisticsDocument shipment={shipment} />
      </div>
    </div>
  )
}
