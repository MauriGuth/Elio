"use client"

import { useEffect, useRef } from "react"
import { authApi } from "@/lib/api/auth"
import { alertsApi } from "@/lib/api/alerts"

const STORAGE_KEY = "elio_settings"
const CHECK_STOCK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

export type NotificationPrefs = {
  alertOnCriticalStock?: boolean
  pushNotifications?: boolean
  alertOnLocationOffline?: boolean
}

export function getNotificationSettings(): NotificationPrefs {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.notifications ?? {}
    }
  } catch {
    /* ignore */
  }
  return {}
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return
  try {
    new Notification(title, { body })
  } catch {
    /* ignore */
  }
}

/**
 * Ejecuta en segundo plano las notificaciones configuradas:
 * - Si "Alerta de Stock Crítico" está activa, llama al backend para verificar stock y crear alertas.
 * - Si "Notificaciones Push" está activa y se crean alertas, muestra notificación del navegador.
 */
export function NotificationsRunner() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const runStockCheck = async () => {
      const prefs = getNotificationSettings()
      if (!prefs.alertOnCriticalStock) return
      try {
        const user = authApi.getStoredUser()
        const locationId = user?.location?.id ?? undefined
        const res = await alertsApi.checkStock(locationId)
        const created = res?.alerts ?? []
        if (created.length > 0 && prefs.pushNotifications) {
          if (created.length === 1) {
            showBrowserNotification(
              created[0].title ?? "Alerta de stock",
              created[0].message ?? "Un producto alcanzó el nivel mínimo"
            )
          } else {
            showBrowserNotification(
              "Alertas de stock",
              `${created.length} productos con stock crítico o bajo`
            )
          }
        }
      } catch {
        // Silencioso: no molestar al usuario si falla la verificación en segundo plano
      }
    }

    runStockCheck()
    intervalRef.current = setInterval(runStockCheck, CHECK_STOCK_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  return null
}
