"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { sileo } from "sileo"
import {
  Users,
  UserPlus,
  Search,
  Edit,
  Shield,
  MapPin,
  Mail,
  Loader2,
  X,
  UserX,
  UserCheck,
  Phone,
  Clock,
  Camera,
} from "lucide-react"
import { usersApi } from "@/lib/api/users"
import { locationsApi } from "@/lib/api/locations"
import { cn, formatDateTime, formatPhoneNumber } from "@/lib/utils"
import { validatePassword } from "@/lib/settings"

// ---------- helpers ----------

const roleConfig: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  ADMIN: { label: "Admin", bg: "bg-purple-100", text: "text-purple-700" },
  LOCATION_MANAGER: {
    label: "Gerente Local",
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  WAREHOUSE_MANAGER: {
    label: "Jefe Depósito",
    bg: "bg-amber-100",
    text: "text-amber-700",
  },
  PRODUCTION_WORKER: {
    label: "Producción",
    bg: "bg-orange-100",
    text: "text-orange-700",
  },
  LOGISTICS: {
    label: "Logística",
    bg: "bg-cyan-100",
    text: "text-cyan-700",
  },
  CASHIER: { label: "Cajero", bg: "bg-green-100", text: "text-green-700" },
  WAITER: { label: "Mozo", bg: "bg-pink-100", text: "text-pink-700" },
  KITCHEN: { label: "Cocina", bg: "bg-red-100", text: "text-red-700" },
  CAFETERIA: { label: "Cafetería", bg: "bg-amber-100", text: "text-amber-700" },
  AUDITOR: { label: "Auditor", bg: "bg-gray-100", text: "text-gray-700" },
}

const allRoles = Object.entries(roleConfig).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}))

function getInitials(firstName?: string, lastName?: string): string {
  const f = (firstName ?? "").charAt(0).toUpperCase()
  const l = (lastName ?? "").charAt(0).toUpperCase()
  return f + l || "?"
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-600",
    "bg-purple-600",
    "bg-green-600",
    "bg-amber-600",
    "bg-cyan-600",
    "bg-pink-600",
    "bg-red-600",
    "bg-indigo-600",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// ---------- Modal component ----------

function UserModal({
  open,
  onClose,
  onSave,
  user,
  locations,
  saving,
  saveError,
  clearSaveError,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: any) => void
  user: any | null
  locations: any[]
  saving: boolean
  saveError: string | null
  clearSaveError: () => void
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "CASHIER",
    locationIds: [] as string[],
    phone: "",
    avatarUrl: "",
  })
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!open) return
    setValidationError(null)
    if (user) {
      const ids =
        (user.locations?.length && user.locations.map((l: any) => l.id)) ||
        (user.locationId || user.location?.id ? [user.locationId || user.location?.id] : [])
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email ?? "",
        password: "",
        role: user.role ?? "CASHIER",
        locationIds: Array.isArray(ids) ? ids : [],
        phone: formatPhoneNumber(user.phone ?? ""),
        avatarUrl: user.avatarUrl ?? "",
      })
    } else {
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "CASHIER",
        locationIds: [],
        phone: "",
        avatarUrl: "",
      })
    }
  }, [user, open])

  // Cámara en vivo para "Tomar foto"
  useEffect(() => {
    if (!showCamera || !videoRef.current) return
    setCameraError(null)
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        stream = s
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setCameraError("No se pudo acceder a la cámara"))
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [showCamera])

  if (!open) return null

  const isEditing = !!user

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const { url } = await usersApi.uploadAvatar(file)
      setForm((f) => ({ ...f, avatarUrl: url }))
    } catch {
      alert("Error al subir la foto")
    } finally {
      setUploadingPhoto(false)
      e.target.value = ""
    }
  }

  const handleCapturePhoto = () => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || video.readyState !== 4) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], "foto-biometrica.jpg", { type: "image/jpeg" })
        setUploadingPhoto(true)
        setShowCamera(false)
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        usersApi
          .uploadAvatar(file)
          .then(({ url }) => setForm((f) => ({ ...f, avatarUrl: url })))
          .catch(() => alert("Error al subir la foto"))
          .finally(() => setUploadingPhoto(false))
      },
      "image/jpeg",
      0.9
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    clearSaveError()
    setValidationError(null)
    const data: any = { ...form }
    if (isEditing && !data.password) {
      delete data.password
    } else if (data.password) {
      const { valid, errors } = validatePassword(data.password)
      if (!valid) {
        setValidationError(errors.join(" "))
        return
      }
    }
    data.locationIds = form.locationIds?.length ? form.locationIds : []
    if (!data.avatarUrl) delete data.avatarUrl
    onSave(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            role="presentation"
          />
      {showCamera && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
          <div className="relative rounded-xl bg-white dark:bg-gray-800 p-4 shadow-2xl max-w-sm w-full border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tomar foto</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCamera(false)
                  streamRef.current?.getTracks().forEach((t) => t.stop())
                  streamRef.current = null
                }}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="aspect-square max-h-[60vh] w-full overflow-hidden rounded-lg bg-gray-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover -scale-x-100"
              />
            </div>
            {cameraError && (
              <p className="mt-2 text-sm text-red-600">{cameraError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCamera(false)
                  streamRef.current?.getTracks().forEach((t) => t.stop())
                  streamRef.current = null
                }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={!!cameraError}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Capturar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="modal-editar-usuario relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Editar Usuario" : "Nuevo Usuario"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
                Nombre
              </label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Nombre"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
                Apellido
              </label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Apellido"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.target.value })
              }
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="email@ejemplo.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Contraseña{isEditing ? " (dejar vacío para no cambiar)" : ""}
            </label>
            <input
              type="password"
              required={!isEditing}
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={isEditing ? "••••••••" : "Contraseña"}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
                Rol
              </label>
              <select
                aria-label="Rol del usuario"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value })
                }
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {allRoles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
                Ubicaciones (puede elegir varias)
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 space-y-1">
                {locations.map((loc: any) => (
                  <label
                    key={loc.id}
                    className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <input
                      type="checkbox"
                      checked={form.locationIds.includes(loc.id)}
                      onChange={(e) => {
                        setForm((f) => ({
                          ...f,
                          locationIds: e.target.checked
                            ? [...f.locationIds, loc.id]
                            : f.locationIds.filter((id) => id !== loc.id),
                        }))
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {loc.name}
                    </span>
                  </label>
                ))}
                {locations.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-1">
                    No hay ubicaciones cargadas.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Teléfono
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: formatPhoneNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="+54 11 1234 5678"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Foto para verificación biométrica
            </label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Se usará para validar la identidad al iniciar sesión en el POS.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {form.avatarUrl ? (
                <div className="relative">
                  <img
                    src={
                      form.avatarUrl.startsWith("http")
                        ? form.avatarUrl
                        : `${process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || ""}${form.avatarUrl.startsWith("/") ? form.avatarUrl : "/" + form.avatarUrl}`
                    }
                    alt="Foto del usuario"
                    className="h-20 w-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatarUrl: "" }))}
                    className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                    aria-label="Quitar foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={uploadingPhoto}
                  aria-label="Subir foto desde el dispositivo"
                  title="Subir foto"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="user"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={uploadingPhoto}
                  aria-label="Tomar foto con la cámara"
                  title="Tomar foto"
                />
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    form.avatarUrl ? "Cambiar" : "Subir foto"
                  )}
                </button>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
                      setShowCamera(true)
                      setCameraError(null)
                    } else {
                      cameraInputRef.current?.click()
                    }
                  }}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Camera className="h-4 w-4" />
                  Tomar foto
                </button>
              </div>
            </div>
          </div>
          {(saveError || validationError) && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {saveError || validationError}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 pt-4 mt-4 px-0 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Guardar Cambios" : "Crear Usuario"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

// ---------- main page ----------

export default function UsersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [locations, setLocations] = useState<any[]>([])

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filterRole, setFilterRole] = useState("")
  const [filterLocation, setFilterLocation] = useState("")
  const [filterActive, setFilterActive] = useState<string>("")
  const [page, setPage] = useState(1)
  const limit = 20

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersRes, locationsRes] = await Promise.all([
        usersApi.getAll({
          search: searchQuery || undefined,
          role: filterRole || undefined,
          locationId: filterLocation || undefined,
          isActive:
            filterActive === "true"
              ? true
              : filterActive === "false"
                ? false
                : undefined,
          page,
          limit,
        }),
        locationsApi.getAll(),
      ])
      const usersData = Array.isArray(usersRes)
        ? usersRes
        : usersRes?.data ?? []
      setUsers(usersData)
      setTotal(
        Array.isArray(usersRes)
          ? usersRes.length
          : usersRes?.total ?? usersData.length
      )
      setLocations(Array.isArray(locationsRes) ? locationsRes : [])
    } catch (err: any) {
      const msg = err.message || "Error al cargar usuarios"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filterRole, filterLocation, filterActive, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Debounced search
  const [searchInput, setSearchInput] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleSave = async (data: any) => {
    setSaveError(null)
    setSaving(true)
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, data)
      } else {
        await usersApi.create(data)
      }
      setModalOpen(false)
      setEditingUser(null)
      setSaveError(null)
      fetchData()
      sileo.success({ title: "Usuario guardado correctamente" })
    } catch (err: any) {
      const msg = err?.message ?? "Error al guardar. Revisa los datos e intenta de nuevo."
      setSaveError(msg)
      sileo.error({ title: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: any) => {
    setActionLoading(user.id)
    try {
      await usersApi.update(user.id, { isActive: !user.isActive })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, isActive: !u.isActive } : u
        )
      )
    } catch (err: unknown) {
      sileo.error({ title: err instanceof Error ? err.message : "Error al actualizar usuario" })
    } finally {
      setActionLoading(null)
    }
  }

  const openCreate = () => {
    setEditingUser(null)
    setModalOpen(true)
  }

  const openEdit = (user: any) => {
    setEditingUser(user)
    setModalOpen(true)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6">
      {/* -------- Header -------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestión de usuarios y permisos del sistema
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* -------- Filters -------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          aria-label="Filtrar por rol"
          value={filterRole}
          onChange={(e) => {
            setFilterRole(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los roles</option>
          {allRoles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por ubicación"
          value={filterLocation}
          onChange={(e) => {
            setFilterLocation(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas las ubicaciones</option>
          {locations.map((loc: any) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por estado"
          value={filterActive}
          onChange={(e) => {
            setFilterActive(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* -------- Error -------- */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={fetchData}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* -------- Loading -------- */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* -------- Table -------- */}
      {!loading && (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Rol
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Ubicación
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Último Acceso
                  </th>
                  <th className="w-28 min-w-28 shrink-0 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const role =
                    roleConfig[user.role] ??
                    roleConfig.CASHIER
                  const initials = getInitials(
                    user.firstName,
                    user.lastName
                  )
                  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                  const avatarColor = getAvatarColor(fullName)
                  const isActioning = actionLoading === user.id

                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50",
                        !user.isActive && "opacity-60"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                              avatarColor
                            )}
                          >
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {fullName || "Sin nombre"}
                            </p>
                            {user.phone && (
                              <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-white">
                                <Phone className="h-3 w-3 shrink-0" />
                                {formatPhoneNumber(user.phone)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-white">
                          <Mail className="h-3.5 w-3.5 text-gray-400 dark:text-gray-300" />
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            role.bg,
                            role.text
                          )}
                        >
                          <Shield className="h-3 w-3" />
                          {role.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(user.locations?.length
                          ? user.locations.map((l: any) => l.name).join(", ")
                          : user.location?.name ?? user.locationName) ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-white">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 dark:text-gray-300" />
                            {user.locations?.length
                              ? user.locations.map((l: any) => l.name).join(", ")
                              : user.location?.name ?? user.locationName}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            user.isActive
                              ? "bg-green-50 dark:bg-green-900/50 text-green-700 dark:text-green-200"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-200"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              user.isActive
                                ? "bg-green-500"
                                : "bg-gray-400 dark:bg-gray-500"
                            )}
                          />
                          {user.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.lastLogin ? (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-white">
                            <Clock className="h-3 w-3 dark:text-gray-300" />
                            {formatDateTime(user.lastLogin)}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-white">
                            Nunca
                          </span>
                        )}
                      </td>
                      <td className="w-28 min-w-28 shrink-0 px-4 py-3">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <button
                            onClick={() => openEdit(user)}
                            className="rounded-md p-1.5 text-gray-400 dark:text-white transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleToggleActive(user)
                            }
                            disabled={isActioning}
                            className={cn(
                              "rounded-md p-1.5 transition-colors disabled:opacity-50",
                              user.isActive
                                ? "text-gray-400 dark:text-white hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400"
                                : "text-gray-400 dark:text-white hover:bg-green-50 dark:hover:bg-green-900/40 hover:text-green-600 dark:hover:text-green-400"
                            )}
                            title={
                              user.isActive
                                ? "Desactivar"
                                : "Activar"
                            }
                          >
                            {isActioning ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : user.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-gray-400"
                    >
                      <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      No se encontraron usuarios
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
              <p className="text-sm text-gray-500 dark:text-white">
                Mostrando{" "}
                <span className="font-medium text-gray-700 dark:text-white">
                  {(page - 1) * limit + 1}
                </span>
                -
                <span className="font-medium text-gray-700 dark:text-white">
                  {Math.min(page * limit, total)}
                </span>{" "}
                de{" "}
                <span className="font-medium text-gray-700 dark:text-white">
                  {total}
                </span>{" "}
                usuarios
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-500 dark:text-white">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() =>
                    setPage((p) =>
                      Math.min(totalPages || 1, p + 1)
                    )
                  }
                  disabled={page >= totalPages}
                  className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------- Modal -------- */}
      <UserModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingUser(null)
          setSaveError(null)
        }}
        onSave={handleSave}
        user={editingUser}
        locations={locations}
        saving={saving}
        saveError={saveError}
        clearSaveError={() => setSaveError(null)}
      />
    </div>
  )
}
