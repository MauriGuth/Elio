"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { sileo } from "sileo"
import { ArrowLeft, Loader2 } from "lucide-react"
import { locationsApi } from "@/lib/api/locations"

const locationTypeOptions: { value: string; label: string }[] = [
  { value: "WAREHOUSE", label: "Depósito" },
  { value: "CAFE", label: "Café" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "EXPRESS", label: "Express" },
  { value: "HOTEL", label: "Hotel" },
  { value: "SUPPLIER_PICKUP", label: "Retiro proveedor / logística" },
]

export default function NewLocationPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [type, setType] = useState("CAFE")
  const [address, setAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await locationsApi.create({
        name: trimmedName,
        type,
        address: address.trim() || undefined,
      })
      const id = created?.id ?? (created as any)?.data?.id
      sileo.success({ title: "Local creado correctamente" })
      if (id) {
        router.push(`/locations/${id}`)
      } else {
        router.push("/locations")
      }
    } catch (err: any) {
      const msg = err.message || "Error al crear el local"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/locations"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-white transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Locales
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Nuevo local
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-300 dark:text-gray-400">
          Agregar una nueva sucursal o ubicación a la operación
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800/50"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="new-location-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="new-location-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Ej: Café Belgrano"
            />
          </div>
          <div>
            <label
              htmlFor="new-location-type"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tipo <span className="text-red-500">*</span>
            </label>
            <select
              id="new-location-type"
              aria-label="Tipo de local"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              {locationTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="new-location-address"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Ubicación / Dirección
            </label>
            <input
              id="new-location-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Ej: Av. Cabildo 2040, Belgrano, CABA"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Crear local
            </button>
            <Link
              href="/locations"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Cancelar
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
