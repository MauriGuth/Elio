"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import { ArrowLeft, Eye, EyeOff, Loader2, UtensilsCrossed, MapPin, ChevronRight } from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { locationsApi } from "@/lib/api/locations"
import { api, getLocationKey } from "@/lib/api"
import { NeedPhotoStep } from "@/components/auth/need-photo-step"
import { VerifyIdentityStep } from "@/components/auth/verify-identity-step"

type Step = "login" | "need-photo" | "verify-identity" | "select-location"

const MOZO_ROLES = ["waiter", "WAITER", "admin", "ADMIN", "location_manager", "LOCATION_MANAGER"]
const LEGACY_MOZO_LOCATION_KEY = "elio_mozo_location"

export default function MozoLoginPage() {
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
  const [needLocationPrompt, setNeedLocationPrompt] = useState(false)
  const isAdminUser = user?.role === "admin" || user?.role === "ADMIN"

  const readStoredLocation = () => {
    try {
      const scopedKey = getLocationKey()
      const scopedValue = localStorage.getItem(scopedKey)
      if (scopedValue) return JSON.parse(scopedValue)

      const legacyValue = localStorage.getItem(LEGACY_MOZO_LOCATION_KEY)
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
    if (isAuth && storedUser && MOZO_ROLES.includes(storedUser.role)) {
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
    setNeedLocationPrompt(false)
    if (!email.trim() || !password.trim()) {
      setError("Por favor, completa todos los campos")
      return
    }
    setLoading(true)
    try {
      const response = await authApi.login({ email, password })
      if (!MOZO_ROLES.includes(response.user.role)) {
        setError("Solo Mozo, Admin o Gerente pueden acceder aquí")
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
      const code = (err as Error & { code?: string })?.code
      if (code === "LOCATION_REQUIRED") {
        setNeedLocationPrompt(true)
        setError((err as Error).message)
      } else {
        const msg = err instanceof Error ? err.message : "Error al iniciar sesión"
        setError(msg)
        sileo.error({ title: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLoginWithLocation = async () => {
    setError("")
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    try {
      const response = await authApi.loginWithLocation({ email, password })
      if (!MOZO_ROLES.includes(response.user.role)) {
        setError("Solo Mozo, Admin o Gerente pueden acceder aquí")
        return
      }
      setUser(response.user)
      setNeedLocationPrompt(false)
      if (!response.user.avatarUrl) {
        setStep("need-photo")
        return
      }
      setStep("verify-identity")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al obtener ubicación"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }

  const selectLocation = (location: any) => {
    const serialized = JSON.stringify({ id: location.id, name: location.name, type: location.type })
    localStorage.setItem(getLocationKey(), serialized)
    localStorage.setItem(LEGACY_MOZO_LOCATION_KEY, serialized)
    router.push("/pos/tables?station=mozo")
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
        localStorage.setItem(LEGACY_MOZO_LOCATION_KEY, serialized)
      }
      router.push("/pos/tables?station=mozo")
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
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 sm:px-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-amber-100 bg-white px-4 py-8 shadow-xl dark:bg-white dark:border-gray-200 sm:px-8 sm:py-10">
            <div className="mb-6 text-center sm:mb-8">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500 shadow-lg">
                <UtensilsCrossed className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Mozo – Elegir sucursal</h1>
              <p className="mt-1 text-sm text-gray-600">Hola {user?.firstName}, elige la sucursal</p>
            </div>
            {loadingLocations ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 dark:bg-gray-100 dark:border-gray-300 sm:gap-4 sm:px-5 sm:py-4"
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
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 sm:px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-amber-100 bg-white px-4 py-8 shadow-xl dark:border-gray-200 dark:bg-gray-900 sm:px-8 sm:py-10">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="mb-4 flex min-h-[44px] items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="mb-6 text-center sm:mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 shadow-lg sm:h-16 sm:w-16">
              <UtensilsCrossed className="h-7 w-7 text-white sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white sm:text-2xl">Mozo</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Solo Mozo, Admin o Gerente</p>
          </div>
          <form onSubmit={handleLogin} className="form-login-fields space-y-4 sm:space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Correo</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  const v = e.target.value
                  setEmail(v)
                  setUserTypedEmail(v.length > 0)
                }}
                placeholder="mozo@roberto"
                className={`login-field w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-base transition-colors focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${userTypedEmail ? "user-typed" : ""}`}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Contraseña</label>
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
                  className={`login-field w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-12 text-base transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${userTypedPassword ? "user-typed" : ""}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
                {needLocationPrompt && (
                  <button
                    type="button"
                    onClick={handleLoginWithLocation}
                    disabled={loading}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><MapPin className="h-4 w-4" /> Usar mi ubicación e iniciar sesión</>}
                  </button>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60 active:scale-[0.99]"
            >
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Entrando...</> : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
