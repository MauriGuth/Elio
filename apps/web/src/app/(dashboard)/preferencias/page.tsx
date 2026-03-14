"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Settings, Bell, Palette, Globe, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const PREF_THEME = "nova_preferencias_tema"
const PREF_NOTIFICACIONES = "nova_preferencias_notificaciones"

export default function PreferenciasPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system")
  const [notificaciones, setNotificaciones] = useState(true)

  useEffect(() => {
    if (typeof window === "undefined") return
    const t = localStorage.getItem(PREF_THEME) as "light" | "dark" | "system" | null
    if (t) setTheme(t)
    const n = localStorage.getItem(PREF_NOTIFICACIONES)
    setNotificaciones(n !== "false")
  }, [])

  const applyTheme = (value: "light" | "dark" | "system") => {
    setTheme(value)
    localStorage.setItem(PREF_THEME, value)
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (value === "dark") {
      root.classList.add("dark")
    } else if (value === "light") {
      root.classList.remove("dark")
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
    }
  }

  const toggleNotificaciones = () => {
    const next = !notificaciones
    setNotificaciones(next)
    localStorage.setItem(PREF_NOTIFICACIONES, String(next))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferencias</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajustá cómo querés usar el panel</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Palette className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              Apariencia
            </h2>
          </div>
          <div className="p-4">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Tema</p>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyTheme(value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    theme === value
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600"
                      : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                  )}
                >
                  {value === "light" ? "Claro" : value === "dark" ? "Oscuro" : "Sistema"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 dark:border-gray-700 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              Notificaciones
            </h2>
          </div>
          <div className="p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Mostrar notificaciones en el panel</span>
              <input
                type="checkbox"
                checked={notificaciones}
                onChange={toggleNotificaciones}
                className="peer sr-only"
                aria-label="Mostrar notificaciones en el panel"
              />
              <span
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600 after:absolute after:left-1 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5",
                  "pointer-events-none"
                )}
                aria-hidden
              />
            </label>
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
              <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Configuración del sistema</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Empresa, alertas, stock y seguridad</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </Link>
      </div>
    </div>
  )
}
