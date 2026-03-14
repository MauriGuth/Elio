"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  Eye,
  EyeOff,
  Loader2,
  Coffee,
  MapPin,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import { api, getLocationKey } from "@/lib/api"
import { NeedPhotoStep } from "@/components/auth/need-photo-step"
import { VerifyIdentityStep } from "@/components/auth/verify-identity-step"

type Step = "login" | "need-photo" | "verify-identity" | "select-location"

const CAFE_ROLES = [
  "cafeteria",
  "admin",
  "location_manager",
  "CAFETERIA",
  "ADMIN",
  "LOCATION_MANAGER",
]
const LEGACY_CAFETERIA_LOCATION_KEY = "nova_cafeteria_location"

export default function CafeteriaLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("login")

  // Login form
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Location selection
  const [locations, setLocations] = useState<any[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [user, setUser] = useState<any>(null)
  const isAdminUser = user?.role === "admin" || user?.role === "ADMIN"

  const readStoredLocation = () => {
    try {
      const scopedKey = getLocationKey()
      const scopedValue = localStorage.getItem(scopedKey)
      if (scopedValue) return JSON.parse(scopedValue)

      const legacyValue = localStorage.getItem(LEGACY_CAFETERIA_LOCATION_KEY)
      if (!legacyValue) return null

      const parsed = JSON.parse(legacyValue)
      localStorage.setItem(scopedKey, legacyValue)
      return parsed
    } catch {
      return null
    }
  }

  // Check if already logged in
  useEffect(() => {
    const storedUser = authApi.getStoredUser()
    const isAuth = authApi.isAuthenticated()

    if (isAuth && storedUser && CAFE_ROLES.includes(storedUser.role)) {
      setUser(storedUser)
      if (!storedUser.avatarUrl) {
        setStep("need-photo")
        return
      }
      setStep("verify-identity")
    }
  }, [router])

  const fetchLocations = async () => {
    setLoadingLocations(true)
    try {
      const data = await locationsApi.getAll({ isActive: true })
      setLocations(data)
    } catch {
      setError("Error al cargar sucursales")
    } finally {
      setLoadingLocations(false)
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim() || !password.trim()) {
      setError("Por favor, completa todos los campos")
      return
    }

    setLoading(true)
    try {
      const response = await authApi.login({ email, password })

      if (!CAFE_ROLES.includes(response.user.role)) {
        setError("No tienes permisos para acceder a la cafetería")
        return
      }

      setUser(response.user)

      if (!response.user.avatarUrl) {
        setStep("need-photo")
        return
      }
      setStep("verify-identity")
      return
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al iniciar sesión"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const selectLocation = (location: any) => {
    const serialized = JSON.stringify({
      id: location.id,
      name: location.name,
      type: location.type,
    })
    localStorage.setItem(getLocationKey(), serialized)
    localStorage.setItem(LEGACY_CAFETERIA_LOCATION_KEY, serialized)
    router.push("/cafeteria/display")
  }

  const proceedAfterVerify = () => {
    if (isAdminUser) {
      setStep("select-location")
      fetchLocations()
      return
    }

    const loc = user?.location || readStoredLocation()
    if (loc) {
      if (!user?.location) {
        const serialized = JSON.stringify(loc)
        localStorage.setItem(getLocationKey(), serialized)
        localStorage.setItem(LEGACY_CAFETERIA_LOCATION_KEY, serialized)
      }
      router.push("/cafeteria/display")
      return
    }
    if (user?.role === "LOCATION_MANAGER" || user?.role === "location_manager") {
      setStep("select-location")
      fetchLocations()
      return
    }
    setError("Tu cuenta no tiene una sucursal asignada")
  }

  const handleRejectOrLogout = () => {
    api.clearToken()
    setUser(null)
    setStep("login")
    setError("")
  }

  if (step === "need-photo") {
    return <NeedPhotoStep onLogout={handleRejectOrLogout} />
  }

  if (step === "verify-identity" && user) {
    return (
      <VerifyIdentityStep
        user={user}
        onVerified={proceedAfterVerify}
        onReject={handleRejectOrLogout}
      />
    )
  }

  /* ── STEP 2: Location selector ── */
  if (step === "select-location") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-950 via-stone-900 to-amber-950 px-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-amber-800/50 bg-stone-800 px-8 py-10 shadow-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-600 shadow-lg shadow-amber-600/30">
                <Coffee className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                Seleccionar Sucursal
              </h1>
              <p className="mt-1 text-sm text-amber-200/60">
                Hola {user?.firstName}, elige la cafetería
              </p>
            </div>

            {loadingLocations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className="flex w-full items-center gap-4 rounded-xl border border-stone-600 bg-stone-700 px-5 py-4 text-left transition-all hover:border-amber-400 hover:bg-stone-600 active:scale-[0.98]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
                      <MapPin className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">
                        {loc.name}
                      </p>
                      <p className="text-sm capitalize text-stone-400">
                        {loc.type}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-stone-500" />
                  </button>
                ))}

                {locations.length === 0 && !loadingLocations && (
                  <p className="py-8 text-center text-sm text-stone-500">
                    No hay sucursales disponibles
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-700 bg-red-900/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={() => {
                setStep("login")
                setError("")
              }}
              className="mt-6 flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── STEP 1: Login form ── */
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-950 via-stone-900 to-amber-950 px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-amber-900/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-amber-800/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-amber-800/50 bg-stone-800 px-8 py-10 shadow-xl">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="mb-4 flex items-center gap-2 text-sm text-stone-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-600 shadow-lg shadow-amber-600/30">
              <Coffee className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-wider text-white">
              EL<span className="text-amber-500">IO</span>
            </h1>
            <p className="mt-2 text-base text-amber-200/60">Cafetería</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="cafe-email"
                className="mb-2 block text-sm font-medium text-stone-300"
              >
                Correo electrónico
              </label>
              <input
                id="cafe-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-stone-600 bg-stone-700 px-4 py-3.5 text-base text-white placeholder:text-stone-500 transition-colors focus:border-amber-500 focus:bg-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="cafe-password"
                className="mb-2 block text-sm font-medium text-stone-300"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="cafe-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-600 bg-stone-700 px-4 py-3.5 pr-12 text-base text-white placeholder:text-stone-500 transition-colors focus:border-amber-500 focus:bg-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-400 transition-colors hover:text-stone-200"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-700 bg-red-900/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Ingresando...
                </>
              ) : (
                "Ingresar a Cafetería"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-stone-600">
          Nova Cafetería &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
