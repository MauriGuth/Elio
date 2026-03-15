"use client"

import { useState, useEffect } from "react"
import {
  Settings,
  Bell,
  Package,
  Shield,
  Save,
  Check,
  Building2,
  Globe,
  DollarSign,
  Smartphone,
  AlertTriangle,
  Lock,
  Clock,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FormattedNumberInput } from "@/components/ui/formatted-number-input"
import { sileo } from "sileo"

// ---------- helpers ----------

const STORAGE_KEY = "elio_settings"

interface AppSettings {
  general: {
    companyName: string
    timezone: string
    currency: string
  }
  notifications: {
    pushNotifications: boolean
    alertOnCriticalStock: boolean
    alertOnLocationOffline: boolean
  }
  stock: {
    defaultMinQuantity: number
    criticalThresholdPercent: number
    autoCheckIntervalMinutes: number
    enableAutoAlerts: boolean
  }
  security: {
    minPasswordLength: number
    requireUppercase: boolean
    requireNumbers: boolean
    requireSpecialChars: boolean
    sessionTimeoutMinutes: number
    maxLoginAttempts: number
  }
}

const defaultSettings: AppSettings = {
  general: {
    companyName: "Mi Empresa Gastronómica",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
  },
  notifications: {
    pushNotifications: true,
    alertOnCriticalStock: true,
    alertOnLocationOffline: true,
  },
  stock: {
    defaultMinQuantity: 10,
    criticalThresholdPercent: 20,
    autoCheckIntervalMinutes: 30,
    enableAutoAlerts: true,
  },
  security: {
    minPasswordLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    sessionTimeoutMinutes: 480,
    maxLoginAttempts: 5,
  },
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        general: { ...defaultSettings.general, ...parsed.general },
        notifications: {
          ...defaultSettings.notifications,
          ...parsed.notifications,
        },
        stock: { ...defaultSettings.stock, ...parsed.stock },
        security: { ...defaultSettings.security, ...parsed.security },
      }
    }
  } catch {
    /* ignore */
  }
  return defaultSettings
}

function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

// ---------- Section components ----------

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  icon,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (val: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 text-gray-400">{icon}</div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked ? "true" : "false"}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-blue-600" : "bg-gray-200"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

function SaveButton({
  onClick,
  saving,
  saved,
}: {
  onClick: () => void
  saving: boolean
  saved: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        saved
          ? "bg-green-100 text-green-700"
          : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      )}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : saved ? (
        <Check className="h-4 w-4" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {saved ? "Guardado" : "Guardar"}
    </button>
  )
}

// ---------- main page ----------

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [savedSection, setSavedSection] = useState<string | null>(null)

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

  const handleSave = (section: string) => {
    setSavingSection(section)
    setTimeout(() => {
      saveSettings(settings)
      setSavingSection(null)
      setSavedSection(section)
      setTimeout(() => setSavedSection(null), 2000)
    }, 300)
  }

  const updateGeneral = (key: keyof AppSettings["general"], value: string) => {
    setSettings((prev) => ({
      ...prev,
      general: { ...prev.general, [key]: value },
    }))
  }

  const updateNotification = (
    key: keyof AppSettings["notifications"],
    value: boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const updateStock = (
    key: keyof AppSettings["stock"],
    value: number | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      stock: { ...prev.stock, [key]: value },
    }))
  }

  const updateSecurity = (
    key: keyof AppSettings["security"],
    value: number | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      security: { ...prev.security, [key]: value },
    }))
  }

  return (
    <div className="settings-page space-y-6">
      {/* -------- Header -------- */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Administra las preferencias generales del sistema
        </p>
      </div>

      {/* -------- General -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <SectionHeader
          icon={<Settings className="h-5 w-5 text-gray-400" />}
          title="General"
          description="Configuración básica de la empresa"
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              Nombre de la Empresa
            </label>
            <input
              type="text"
              aria-label="Nombre de la empresa"
              value={settings.general.companyName}
              onChange={(e) =>
                updateGeneral("companyName", e.target.value)
              }
              className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white">
              <Globe className="h-3.5 w-3.5 text-gray-400" />
              Zona Horaria
            </label>
            <select
              aria-label="Zona horaria"
              value={settings.general.timezone}
              onChange={(e) =>
                updateGeneral("timezone", e.target.value)
              }
              className="max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="America/Argentina/Buenos_Aires">
                Buenos Aires (GMT-3)
              </option>
              <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
              <option value="America/Santiago">Santiago (GMT-4)</option>
              <option value="America/Bogota">Bogotá (GMT-5)</option>
              <option value="America/Mexico_City">
                Ciudad de México (GMT-6)
              </option>
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              Moneda
            </label>
            <select
              aria-label="Moneda"
              value={settings.general.currency}
              onChange={(e) =>
                updateGeneral("currency", e.target.value)
              }
              className="max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ARS">Peso Argentino (ARS)</option>
              <option value="USD">Dólar (USD)</option>
              <option value="BRL">Real (BRL)</option>
              <option value="CLP">Peso Chileno (CLP)</option>
              <option value="MXN">Peso Mexicano (MXN)</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <SaveButton
            onClick={() => handleSave("general")}
            saving={savingSection === "general"}
            saved={savedSection === "general"}
          />
        </div>
      </div>

      {/* -------- Notifications -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <SectionHeader
          icon={<Bell className="h-5 w-5 text-gray-400" />}
          title="Notificaciones"
          description="Configura cómo y cuándo recibir alertas"
        />
        <div className="divide-y divide-gray-100">
          <Toggle
            label="Notificaciones Push"
            description="Notificaciones del navegador en tiempo real"
            checked={settings.notifications.pushNotifications}
            onChange={async (v) => {
              updateNotification("pushNotifications", v)
              if (v && typeof window !== "undefined" && "Notification" in window) {
                try {
                  const perm = await Notification.requestPermission()
                  if (perm === "granted") {
                    sileo.success({ title: "Notificaciones push activadas" })
                  } else if (perm === "denied") {
                    sileo.error({ title: "Permiso de notificaciones denegado" })
                  }
                } catch {
                  sileo.error({ title: "No se pudo solicitar permiso de notificaciones" })
                }
              }
            }}
            icon={<Smartphone className="h-4 w-4" />}
          />
          <Toggle
            label="Alerta de Stock Crítico"
            description="Notificar cuando un producto alcance el mínimo"
            checked={settings.notifications.alertOnCriticalStock}
            onChange={(v) =>
              updateNotification("alertOnCriticalStock", v)
            }
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <Toggle
            label="Alerta de Local Sin Conexión"
            description="Notificar cuando un local pierda conectividad"
            checked={settings.notifications.alertOnLocationOffline}
            onChange={(v) =>
              updateNotification("alertOnLocationOffline", v)
            }
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <SaveButton
            onClick={() => handleSave("notifications")}
            saving={savingSection === "notifications"}
            saved={savedSection === "notifications"}
          />
        </div>
      </div>

      {/* -------- Stock -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <SectionHeader
          icon={<Package className="h-5 w-5 text-gray-400" />}
          title="Stock"
          description="Parámetros de control de inventario"
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Cantidad Mínima por Defecto
            </label>
            <FormattedNumberInput
              aria-label="Cantidad mínima por defecto"
              value={settings.stock.defaultMinQuantity}
              onChange={(n) =>
                updateStock("defaultMinQuantity", Math.max(1, n))
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Cantidad mínima por defecto para nuevos productos
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Umbral Crítico (%)
            </label>
            <FormattedNumberInput
              aria-label="Umbral crítico en porcentaje"
              value={settings.stock.criticalThresholdPercent}
              onChange={(n) =>
                updateStock(
                  "criticalThresholdPercent",
                  Math.max(1, Math.min(100, n)) || 20
                )
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Porcentaje del mínimo a partir del cual se genera alerta crítica
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Intervalo de Chequeo Automático (min)
            </label>
            <FormattedNumberInput
              aria-label="Intervalo de chequeo automático en minutos"
              value={settings.stock.autoCheckIntervalMinutes}
              onChange={(n) =>
                updateStock("autoCheckIntervalMinutes", Math.max(5, n) || 30)
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Cada cuántos minutos verificar niveles de stock
            </p>
          </div>
          <Toggle
            label="Alertas Automáticas"
            description="Generar alertas automáticas al detectar stock bajo"
            checked={settings.stock.enableAutoAlerts}
            onChange={(v) => updateStock("enableAutoAlerts", v)}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <SaveButton
            onClick={() => handleSave("stock")}
            saving={savingSection === "stock"}
            saved={savedSection === "stock"}
          />
        </div>
      </div>

      {/* -------- Security -------- */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <SectionHeader
          icon={<Shield className="h-5 w-5 text-gray-400" />}
          title="Seguridad"
          description="Políticas de contraseñas y sesiones"
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white">
              <Lock className="h-3.5 w-3.5 text-gray-400" />
              Longitud Mínima de Contraseña
            </label>
            <FormattedNumberInput
              aria-label="Longitud mínima de contraseña"
              value={settings.security.minPasswordLength}
              onChange={(n) =>
                updateSecurity(
                  "minPasswordLength",
                  Math.max(6, Math.min(32, n)) || 8
                )
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Toggle
            label="Requerir Mayúsculas"
            description="Las contraseñas deben contener al menos una mayúscula"
            checked={settings.security.requireUppercase}
            onChange={(v) => updateSecurity("requireUppercase", v)}
          />
          <Toggle
            label="Requerir Números"
            description="Las contraseñas deben contener al menos un número"
            checked={settings.security.requireNumbers}
            onChange={(v) => updateSecurity("requireNumbers", v)}
          />
          <Toggle
            label="Requerir Caracteres Especiales"
            description="Las contraseñas deben contener al menos un carácter especial"
            checked={settings.security.requireSpecialChars}
            onChange={(v) =>
              updateSecurity("requireSpecialChars", v)
            }
          />
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              Tiempo de Expiración de Sesión (min)
            </label>
            <FormattedNumberInput
              aria-label="Tiempo de expiración de sesión en minutos"
              value={settings.security.sessionTimeoutMinutes}
              onChange={(n) =>
                updateSecurity("sessionTimeoutMinutes", Math.max(15, n) || 480)
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              La sesión expira después de este tiempo de inactividad
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-white">
              Intentos Máximos de Login
            </label>
            <FormattedNumberInput
              aria-label="Intentos máximos de login"
              value={settings.security.maxLoginAttempts}
              onChange={(n) =>
                updateSecurity(
                  "maxLoginAttempts",
                  Math.max(3, Math.min(10, n)) || 5
                )
              }
              className="w-40 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Bloquear la cuenta después de estos intentos fallidos
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <SaveButton
            onClick={() => handleSave("security")}
            saving={savingSection === "security"}
            saved={savedSection === "security"}
          />
        </div>
      </div>
    </div>
  )
}
