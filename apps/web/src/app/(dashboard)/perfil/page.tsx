"use client"

import { useState, useEffect } from "react"
import { sileo } from "sileo"
import { User, Mail, Building2, Shield, Loader2, Camera, Save } from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { usersApi } from "@/lib/api/users"
import { cn } from "@/lib/utils"

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  LOCATION_MANAGER: "Gerente de local",
  WAREHOUSE_MANAGER: "Jefe de depósito",
  PRODUCTION_WORKER: "Producción",
  LOGISTICS: "Logística",
  CASHIER: "Cajero",
  WAITER: "Mozo",
  KITCHEN: "Cocina",
  CAFETERIA: "Cafetería",
  AUDITOR: "Auditor",
}

export default function PerfilPage() {
  const [user, setUser] = useState<{
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    location: { id: string; name: string; type: string } | null
    avatarUrl?: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  useEffect(() => {
    authApi.me().then(setUser).catch(() => setUser(authApi.getStoredUser())).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "")
      setLastName(user.lastName ?? "")
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setMessage(null)
    try {
      let avatarUrl: string | undefined
      if (avatarFile) {
        const res = await usersApi.uploadAvatar(avatarFile)
        avatarUrl = res.url
      }
      await usersApi.update(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(avatarUrl && { avatarUrl }),
      })
      const updated = await authApi.me()
      setUser(updated)
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("elio_user")
        if (stored) {
          const parsed = JSON.parse(stored)
          localStorage.setItem("elio_user", JSON.stringify({ ...parsed, ...updated }))
        }
      }
      setEditing(false)
      setAvatarFile(null)
      setMessage({ type: "success", text: "Perfil actualizado." })
      sileo.success({ title: "Perfil actualizado" })
    } catch (e: any) {
      const msg = e.message || "Error al guardar"
      setMessage({ type: "error", text: msg })
      sileo.error({ title: msg })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        No se pudo cargar tu perfil. Volvé a iniciar sesión.
      </div>
    )
  }

  const avatarUrl = user.avatarUrl || null
  const initials = [user.firstName, user.lastName].filter(Boolean).map((n) => n.charAt(0).toUpperCase()).join("") || "?"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi perfil</h1>
        <p className="mt-1 text-sm text-gray-500">Datos de tu cuenta</p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex flex-col items-center">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl.startsWith("http") ? avatarUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${avatarUrl}`}
                    alt="Avatar"
                    className="h-24 w-24 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-2xl font-semibold text-white border-2 border-gray-200">
                    {initials}
                  </div>
                )}
                <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-800 text-white shadow hover:bg-gray-700">
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Cambiar foto"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {avatarFile && <p className="mt-2 text-xs text-gray-500 truncate max-w-[120px]">{avatarFile.name}</p>}
            </div>

            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="perfil-firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Nombre</label>
                  {editing ? (
                    <input
                      id="perfil-firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="mt-1 text-gray-900 dark:text-white">{user.firstName || "—"}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="perfil-lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Apellido</label>
                  {editing ? (
                    <input
                      id="perfil-lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="mt-1 text-gray-900 dark:text-white">{user.lastName || "—"}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4 shrink-0" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="h-4 w-4 shrink-0" />
                <span>{roleLabels[user.role] || user.role}</span>
              </div>
              {user.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>{user.location.name}</span>
                </div>
              )}
            </div>
          </div>

          {message && (
            <p className={cn("mt-4 text-sm", message.type === "success" ? "text-green-600" : "text-red-600")}>
              {message.text}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setAvatarFile(null); setMessage(null); }}
                  className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Editar perfil
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
