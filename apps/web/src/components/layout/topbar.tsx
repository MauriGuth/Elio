'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, Loader2, X, Menu } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { alertsApi } from '@/lib/api/alerts'
import { authApi } from '@/lib/api/auth'
import { getNotificationSettings } from '@/components/notifications-runner'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/stock': 'Stock & Productos',
  '/purchase-orders': 'Pedidos/Compras',
  '/goods-receipts': 'Ingresos',
  '/production': 'Producción',
  '/logistics': 'Logística',
  '/logistics-summary': 'Resumen para logística',
  '/pos': 'Comandas & Mesas',
  '/reports': 'Reportes',
  '/alerts': 'Alertas',
  '/fiscal': 'Fiscalización ARCA',
  '/users': 'Usuarios',
  '/settings': 'Configuración',
  '/suppliers': 'Proveedores',
  '/locations': 'Locales',
  '/stock-reconciliations': 'Auditoría de stock',
  '/auditor-chat': 'Chat Auditor',
  '/perfil': 'Mi perfil',
  '/preferencias': 'Preferencias',
}

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'locations' && segments.length > 1) {
    return 'Detalle del Local'
  }
  if (segments[0] === 'purchase-orders') {
    return segments.length > 1 ? 'Detalle de orden' : 'Pedidos/Compras'
  }
  return 'Dashboard'
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHrs / 24)

  if (diffSec < 60) return 'hace un momento'
  if (diffMin < 60) return `hace ${diffMin}m`
  if (diffHrs < 24) return `hace ${diffHrs}h`
  if (diffDays < 7) return `hace ${diffDays}d`
  return `hace ${Math.floor(diffDays / 7)}sem`
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
}

interface Alert {
  id: string
  title: string
  message: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  type: string
  status: string
  locationId: string
  location: { name: string }
  createdAt: string
}

/** Tipos de alerta que cada rol no debe ver (por permisos). */
function filterAlertsByRole<T extends { type?: string }>(alerts: T[], role: string | undefined): T[] {
  const r = role?.toUpperCase()
  if (r === 'LOGISTICS') {
    return alerts.filter((a) => a.type !== 'payment_order')
  }
  return alerts
}

interface TopbarProps {
  className?: string
  onMenuClick?: () => void
}

export function Topbar({ className, onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const title = getPageTitle(pathname)

  const [searchFocused, setSearchFocused] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const prevAlertCountRef = useRef<number | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const user = authApi.getStoredUser()
  const userInitials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '??'
  const userDisplayName = user ? user.firstName : 'Usuario'
  const userFullName = user ? `${user.firstName} ${user.lastName}` : 'Usuario'
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Usuario'

  // Fetch alert count (por rol: logística no cuenta órdenes de pago); notificación push si sube el número
  const fetchAlertCount = useCallback(async () => {
    try {
      const role = user?.role
      let newCount: number
      if (role === 'LOGISTICS' || role === 'logistics') {
        const res = await alertsApi.getAll({ status: 'active', limit: 200 })
        const data = Array.isArray(res) ? res : res?.data ?? []
        const filtered = filterAlertsByRole(data, role)
        newCount = filtered.length
      } else {
        const res = await alertsApi.getCount()
        newCount = res.count
      }
      const prev = prevAlertCountRef.current
      prevAlertCountRef.current = newCount
      setNotificationCount(newCount)
      if (prev !== null && newCount > prev && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const prefs = getNotificationSettings()
        if (prefs.pushNotifications) {
          const n = newCount - prev
          try {
            new Notification('Nova', {
              body: n === 1 ? 'Tienes 1 alerta nueva' : `Tienes ${n} alertas nuevas`,
            })
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      // silently fail
    }
  }, [user?.role])

  // Fetch alert count on mount + every 60s
  useEffect(() => {
    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchAlertCount])

  // Fetch alerts when notification panel opens (filtradas por rol)
  useEffect(() => {
    if (!notifOpen) return
    let cancelled = false
    async function load() {
      setAlertsLoading(true)
      try {
        const res = await alertsApi.getAll({ limit: 50, status: 'active' })
        const data = Array.isArray(res) ? res : res?.data ?? []
        const filtered = filterAlertsByRole(data, user?.role).slice(0, 8)
        if (!cancelled) setAlerts(filtered)
      } catch {
        if (!cancelled) setAlerts([])
      } finally {
        if (!cancelled) setAlertsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [notifOpen, user?.role])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async (id: string) => {
    setDismissingIds((prev) => new Set(prev).add(id))
    try {
      await alertsApi.markAsRead(id)
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      setNotificationCount((prev) => Math.max(0, prev - 1))
    } catch {
      // silently fail
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleLogout = () => {
    authApi.logout()
  }

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 sm:h-16 sm:px-4 md:px-6',
        className
      )}
    >
      {/* Menú móvil + título */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
        )}
        <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white sm:text-lg md:text-xl">{title}</h1>
      </div>

      {/* Right side */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Search: oculto en móvil muy pequeño, más estrecho en tablet */}
        <div
          className={cn(
            'hidden items-center gap-2 rounded-lg border bg-gray-50 dark:bg-gray-800 px-2 py-1.5 transition-all sm:flex',
            searchFocused
              ? 'border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 ring-2 ring-blue-100 dark:ring-blue-900/50 md:w-64'
              : 'border-gray-200 dark:border-gray-700 w-40 md:w-52'
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Buscar..."
            className="topbar-search-input w-full min-w-0 bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-400"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            aria-label="Buscar"
          />
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => {
              setNotifOpen(!notifOpen)
              if (dropdownOpen) setDropdownOpen(false)
            }}
            className={cn(
              'relative rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-gray-500 dark:text-gray-400 transition-colors',
              notifOpen
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
            )}
            aria-label="Notificaciones"
          >
            <Bell className="h-[18px] w-[18px]" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-[calc(100vw-2rem)] max-w-96 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Alertas
                </h3>
                <button
                  onClick={() => setNotifOpen(false)}
                  aria-label="Cerrar alertas"
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[400px] overflow-y-auto">
                {alertsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
                    <Bell className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-500" />
                    <p className="text-sm">Sin alertas pendientes</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {alerts.map((alert) => (
                      <li
                        key={alert.id}
                        tabIndex={0}
                        onClick={() => {
                          setNotifOpen(false)
                          router.push(`/alerts${alert.id ? `?id=${encodeURIComponent(alert.id)}` : ''}`)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setNotifOpen(false)
                            router.push(`/alerts${alert.id ? `?id=${encodeURIComponent(alert.id)}` : ''}`)
                          }
                        }}
                        className="group relative flex cursor-pointer gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 transition-colors outline-none"
                      >
                        {/* Priority dot */}
                        <div className="mt-1.5 shrink-0">
                          <span
                            className={cn(
                              'block h-2 w-2 rounded-full',
                              priorityColors[alert.priority] ?? 'bg-gray-400'
                            )}
                          />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {alert.title}
                            </p>
                            <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                              {timeAgo(alert.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                            {alert.message}
                          </p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                              {alert.location?.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkAsRead(alert.id)
                              }}
                              disabled={dismissingIds.has(alert.id)}
                              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 opacity-0 transition-opacity hover:text-blue-700 dark:hover:text-blue-300 group-hover:opacity-100 disabled:opacity-50"
                            >
                              {dismissingIds.has(alert.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Marcar como leída'
                              )}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 dark:border-gray-700">
                <Link
                  href="/alerts"
                  onClick={() => setNotifOpen(false)}
                  className="flex items-center justify-center py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  Ver todas las alertas
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => {
              setDropdownOpen(!dropdownOpen)
              if (notifOpen) setNotifOpen(false)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 py-1.5 pl-1.5 pr-2 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors sm:gap-2 sm:pr-2.5"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white">
              {userInitials}
            </div>
            <span className="hidden truncate text-sm font-medium text-gray-700 dark:text-gray-200 sm:block">
              {userDisplayName}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-gray-400 transition-transform',
                dropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg">
              <div className="border-b border-gray-100 dark:border-gray-700 px-3 py-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {userFullName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{userRole}</p>
              </div>
              <Link
                href="/perfil"
                onClick={() => setDropdownOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors text-left"
              >
                Mi perfil
              </Link>
              <Link
                href="/preferencias"
                onClick={() => setDropdownOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors text-left"
              >
                Preferencias
              </Link>
              <div className="border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
