"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import {
  Eye,
  EyeOff,
  Loader2,
  ChefHat,
  MapPin,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import { getLocationKey } from "@/lib/api"

type Step = "login" | "select-location"

const KITCHEN_ROLES = [
  "kitchen",
  "admin",
  "location_manager",
  "KITCHEN",
  "ADMIN",
  "LOCATION_MANAGER",
]
const LEGACY_KITCHEN_LOCATION_KEY = "elio_kitchen_location"

export default function KitchenLoginPage() {
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

      const legacyValue = localStorage.getItem(LEGACY_KITCHEN_LOCATION_KEY)
      if (!legacyValue) return null

      const parsed = JSON.parse(legacyValue)
      localStorage.setItem(scopedKey, legacyValue)
      return parsed
    } catch {
      return null
    }
  }

  // Ir directo a sucursal o pantalla (cocina no exige verificación por rostro)
  const goAfterLogin = (u: any) => {
    const isAdmin = u?.role === "admin" || u?.role === "ADMIN"
    const isLocMgr = u?.role === "LOCATION_MANAGER" || u?.role === "location_manager"
    if (isAdmin || isLocMgr) {
      setStep("select-location")
      fetchLocations()
      return
    }
    const loc = u?.location || readStoredLocation()
    if (loc) {
      if (!u?.location) {
        const serialized = JSON.stringify({ id: loc.id, name: loc.name, type: loc.type })
        localStorage.setItem(getLocationKey(), serialized)
        localStorage.setItem(LEGACY_KITCHEN_LOCATION_KEY, serialized)
      }
      router.push("/kitchen/display")
      return
    }
    setError("Tu cuenta no tiene una sucursal asignada")
  }

  // Check if already logged in
  useEffect(() => {
    const storedUser = authApi.getStoredUser()
    const isAuth = authApi.isAuthenticated()

    if (isAuth && storedUser && KITCHEN_ROLES.includes(storedUser.role)) {
      setUser(storedUser)
      goAfterLogin(storedUser)
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

      if (!KITCHEN_ROLES.includes(response.user.role)) {
        setError("No tienes permisos para acceder a la cocina")
        return
      }

      setUser(response.user)
      goAfterLogin(response.user)
      return
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al iniciar sesión"
      setError(message)
      sileo.error({ title: message })
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
    localStorage.setItem(LEGACY_KITCHEN_LOCATION_KEY, serialized)
    router.push("/kitchen/display")
  }

  /* ── STEP 2: Location selector ── */
  if (step === "select-location") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-gray-700 bg-gray-800 px-8 py-10 shadow-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30">
                <ChefHat className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                Seleccionar Sucursal
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Hola {user?.firstName}, elige la cocina
              </p>
            </div>

            {loadingLocations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className="flex w-full items-center gap-4 rounded-xl border border-gray-600 bg-gray-700 px-5 py-4 text-left transition-all hover:border-orange-400 hover:bg-gray-600 active:scale-[0.98]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
                      <MapPin className="h-5 w-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {loc.name}
                      </p>
                      <p className="text-sm capitalize text-gray-400">
                        {loc.type}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" />
                  </button>
                ))}

                {locations.length === 0 && !loadingLocations && (
                  <p className="py-8 text-center text-sm text-gray-500">
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
              className="mt-6 flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-orange-900/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-red-900/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 px-8 py-10 shadow-xl">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="mb-4 flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30">
              <ChefHat className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-wider text-white">
              EL<span className="text-orange-500">IO</span>
            </h1>
            <p className="mt-2 text-base text-gray-400">Cocina</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="kitchen-email"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Correo electrónico
              </label>
              <input
                id="kitchen-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-gray-600 bg-gray-700 px-4 py-3.5 text-base text-white placeholder:text-gray-500 transition-colors focus:border-orange-500 focus:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="kitchen-password"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="kitchen-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-600 bg-gray-700 px-4 py-3.5 pr-12 text-base text-white placeholder:text-gray-500 transition-colors focus:border-orange-500 focus:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-200"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Ingresando...
                </>
              ) : (
                "Ingresar a Cocina"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-600">
          Nova Kitchen &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
