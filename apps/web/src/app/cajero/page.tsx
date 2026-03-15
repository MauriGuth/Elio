"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import { ArrowLeft, Eye, EyeOff, Loader2, Banknote, MapPin, ChevronRight } from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import { api, getLocationKey } from "@/lib/api"
import { NeedPhotoStep } from "@/components/auth/need-photo-step"
import { VerifyIdentityStep } from "@/components/auth/verify-identity-step"

type Step = "login" | "need-photo" | "verify-identity" | "select-location"

const CAJERO_ROLES = ["cashier", "CASHIER", "admin", "ADMIN", "location_manager", "LOCATION_MANAGER"]
const LEGACY_CAJERO_LOCATION_KEY = "elio_cajero_location"

export default function CajeroLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<any[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [userTypedEmail, setUserTypedEmail] = useState(false)
  const [userTypedPassword, setUserTypedPassword] = useState(false)
  const isAdminUser = user?.role === "admin" || user?.role === "ADMIN"

  const readStoredLocation = () => {
    try {
      const scopedKey = getLocationKey()
      const scopedValue = localStorage.getItem(scopedKey)
      if (scopedValue) return JSON.parse(scopedValue)

      const legacyValue = localStorage.getItem(LEGACY_CAJERO_LOCATION_KEY)
      if (!legacyValue) return null

      const parsed = JSON.parse(legacyValue)
      localStorage.setItem(scopedKey, legacyValue)
      return parsed
    } catch {
      return null
    }
  }

  useEffect(() => {
    const storedUser = authApi.getStoredUser()
    const isAuth = authApi.isAuthenticated()
    if (isAuth && storedUser && CAJERO_ROLES.includes(storedUser.role)) {
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
      if (!CAJERO_ROLES.includes(response.user.role)) {
        setError("Solo Cajero, Admin o Gerente pueden acceder aquí")
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
      const msg = err instanceof Error ? err.message : "Error al iniciar sesión"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }

  const selectLocation = (location: any) => {
    const serialized = JSON.stringify({ id: location.id, name: location.name, type: location.type })
    localStorage.setItem(getLocationKey(), serialized)
    localStorage.setItem(LEGACY_CAJERO_LOCATION_KEY, serialized)
    router.push("/pos/tables?station=cajero")
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
        localStorage.setItem(LEGACY_CAJERO_LOCATION_KEY, serialized)
      }
      router.push("/pos/tables?station=cajero")
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

  if (step === "select-location") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-4 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-amber-100 bg-white px-8 py-10 shadow-xl dark:bg-white dark:border-gray-200">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500 shadow-lg">
                <Banknote className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Cajero – Elegir sucursal</h1>
              <p className="mt-1 text-sm text-gray-600">Hola {user?.firstName}, elige la sucursal</p>
            </div>
            {loadingLocations ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
            ) : (
              <div className="space-y-3">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-left hover:border-amber-300 hover:bg-amber-50 dark:bg-gray-100 dark:border-gray-300"
                  >
                    <MapPin className="h-5 w-5 shrink-0 text-amber-600" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{loc.name}</p>
                      <p className="text-sm capitalize text-gray-600">{loc.type}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" />
                  </button>
                ))}
              </div>
            )}
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-amber-100 bg-white px-8 py-10 shadow-xl">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 shadow-lg">
              <Banknote className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Cajero</h1>
            <p className="mt-2 text-sm text-gray-500">Solo Cajero, Admin o Gerente</p>
          </div>
          <form onSubmit={handleLogin} className="form-login-fields space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Correo</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  const v = e.target.value
                  setEmail(v)
                  setUserTypedEmail(v.length > 0)
                }}
                placeholder="caja@roberto"
                className={`login-field w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base transition-colors focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${userTypedEmail ? "user-typed" : ""}`}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value
                    setPassword(v)
                    setUserTypedPassword(v.length > 0)
                  }}
                  placeholder="••••••••"
                  className={`login-field w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-12 text-base transition-colors focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${userTypedPassword ? "user-typed" : ""}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
            >
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Entrando...</> : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
