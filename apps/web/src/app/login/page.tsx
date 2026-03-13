"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { sileo } from "sileo"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { authApi } from "@/lib/api/auth"
import { VerifyIdentityStep } from "@/components/auth/verify-identity-step"
import { NeedPhotoStep } from "@/components/auth/need-photo-step"
import type { LoginResponse } from "@/lib/api/auth"

const DASHBOARD_ROLES = ["ADMIN", "LOCATION_MANAGER", "AUDITOR", "LOGISTICS"]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<"login" | "verify-face" | "need-photo">("login")
  const [loggedUser, setLoggedUser] = useState<LoginResponse["user"] | null>(null)
  const [userTypedEmail, setUserTypedEmail] = useState(false)
  const [userTypedPassword, setUserTypedPassword] = useState(false)

  const finishLogin = (role: string) => {
    const isLogistics = role === "LOGISTICS" || role === "logistics"
    router.push(isLogistics ? "/logistics" : "/")
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim() || !password.trim()) {
      setError("Por favor, completa todos los campos")
      return
    }

    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      const role = (res?.user?.role ?? "").toUpperCase()

      if (!DASHBOARD_ROLES.includes(role)) {
        authApi.logout()
        setError("Solo pueden ingresar administradores, gerentes de local, auditores y logística.")
        setLoading(false)
        return
      }

      setLoggedUser(res.user)

      if (res.user.avatarUrl) {
        setStep("verify-face")
      } else {
        finishLogin(role)
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Error al iniciar sesión"
      const message =
        raw === "No autorizado" ? "Correo o contraseña incorrectos." : raw
      setError(message)
      sileo.error({ title: message })
    } finally {
      setLoading(false)
    }
  }

  const handleFaceVerified = () => {
    if (loggedUser?.role) finishLogin(loggedUser.role)
  }

  const handleFaceReject = () => {
    authApi.logout()
    setLoggedUser(null)
    setStep("login")
  }

  const handleNeedPhotoBack = () => {
    authApi.logout()
    setLoggedUser(null)
    setStep("login")
  }

  if (step === "verify-face" && loggedUser) {
    return (
      <VerifyIdentityStep
        user={loggedUser}
        onVerified={handleFaceVerified}
        onReject={handleFaceReject}
      />
    )
  }

  if (step === "need-photo") {
    return <NeedPhotoStep onLogout={handleNeedPhotoBack} />
  }

  return (
    <div className="flex min-h-dvh min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50/30 px-4 py-6 safe-area-top">
      {/* Decorative elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-slate-200/60 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-slate-200/60 bg-white px-5 py-8 shadow-xl shadow-slate-200/50 sm:px-8 sm:py-10">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-200">
              <span className="text-2xl font-black text-white">N</span>
            </div>
            <h1 className="text-3xl font-black tracking-wider text-slate-800">
              NO<span className="text-emerald-600">VA</span>
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Sistema de Gestión Gastronómica
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Acceso: administradores, gerentes de local, auditores y logística. Verificación por rostro si tenés foto de perfil.
            </p>
          </div>

          {/* Form */}
          <form id="login-form" onSubmit={handleSubmit} className="form-login-fields space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  const v = e.target.value
                  setEmail(v)
                  setUserTypedEmail(v.length > 0)
                }}
                placeholder="tu@email.com"
                className={`login-field w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${userTypedEmail ? "user-typed" : ""}`}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value
                    setPassword(v)
                    setUserTypedPassword(v.length > 0)
                  }}
                  placeholder="••••••••"
                  className={`login-field w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${userTypedPassword ? "user-typed" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                "Iniciar Sesión"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Nova &copy; {new Date().getFullYear()} — Todos los derechos reservados
        </p>
      </div>
    </div>
  )
}
