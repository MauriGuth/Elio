'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { authApi } from '@/lib/api/auth'
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  ChefHat,
  Truck,
  Store,
  UtensilsCrossed,
  BarChart3,
  Brain,
  Users,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  MapPin,
  Loader2,
  Receipt,
  X,
  CreditCard,
  Trash2,
  ClipboardList,
  ShoppingCart,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { locationsApi } from '@/lib/api/locations'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
}

interface LocationData {
  id: string
  name: string
  type: string
  isActive: boolean
}

const navSectionsAll: NavSection[] = [
  {
    title: 'OPERACIONES',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Stock & Productos', href: '/stock', icon: Package },
      { label: 'Pedidos/Compras', href: '/purchase-orders', icon: ShoppingCart },
      { label: 'Ingresos', href: '/goods-receipts', icon: PackagePlus },
      { label: 'Producción', href: '/production', icon: ChefHat },
      { label: 'Recetas', href: '/recipes', icon: ClipboardList },
      { label: 'Logística', href: '/logistics', icon: Truck },
      { label: 'Resumen para logística', href: '/logistics-summary', icon: ClipboardList },
      { label: 'Proveedores', href: '/suppliers', icon: Building2 },
      { label: 'Órdenes de pago', href: '/payment-orders', icon: CreditCard },
      { label: 'Mermas', href: '/waste-records', icon: Trash2 },
      { label: 'Locales', href: '/locations', icon: MapPin },
    ],
  },
  {
    title: 'PUNTO VENTA',
    items: [
      { label: 'Comandas & Mesas', href: '/pos', icon: UtensilsCrossed },
    ],
  },
  {
    title: 'ANÁLISIS',
    items: [
      { label: 'Reportes', href: '/reports', icon: BarChart3 },
      { label: 'Cierres de caja', href: '/cash-registers', icon: Receipt },
      { label: 'Fiscalización ARCA', href: '/fiscal', icon: Receipt },
      { label: 'Auditoría de stock', href: '/stock-reconciliations', icon: ClipboardList },
      { label: 'IA & Alertas', href: '/alerts', icon: Brain },
      { label: 'Chat Auditor', href: '/auditor-chat', icon: MessageCircle },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { label: 'Usuarios', href: '/users', icon: Users },
      { label: 'Configuración', href: '/settings', icon: Settings },
    ],
  },
]

/** Roles que pueden ver cada ruta (Fase 4). ADMIN ve todo. */
const roleByPath: Record<string, string[]> = {
  '/': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'PRODUCTION_WORKER', 'CASHIER', 'WAITER', 'KITCHEN', 'CAFETERIA', 'AUDITOR'],
  '/stock': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'PRODUCTION_WORKER', 'LOGISTICS', 'AUDITOR'],
  '/goods-receipts': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'AUDITOR'],
  '/production': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'PRODUCTION_WORKER', 'AUDITOR'],
  '/recipes': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'PRODUCTION_WORKER', 'AUDITOR'],
  '/logistics': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'AUDITOR'],
  '/logistics-summary': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'AUDITOR'],
  '/purchase-orders': ['ADMIN', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'AUDITOR'],
  '/suppliers': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'AUDITOR'],
  '/payment-orders': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'AUDITOR'],
  '/waste-records': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'AUDITOR'],
  '/locations': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'AUDITOR'],
  '/pos': ['ADMIN', 'LOCATION_MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'CAFETERIA'],
  '/reports': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'CASHIER', 'AUDITOR'],
  '/cash-registers': ['ADMIN', 'LOCATION_MANAGER', 'CASHIER', 'AUDITOR'],
  '/fiscal': ['ADMIN', 'LOCATION_MANAGER', 'CASHIER', 'AUDITOR'],
  '/stock-reconciliations': ['ADMIN', 'AUDITOR'],
  '/alerts': ['ADMIN', 'LOCATION_MANAGER', 'WAREHOUSE_MANAGER', 'LOGISTICS', 'CASHIER', 'AUDITOR'],
  '/auditor-chat': ['ADMIN', 'LOCATION_MANAGER', 'AUDITOR'],
  '/users': ['ADMIN'],
  '/settings': ['ADMIN'],
}

const statusDotColor: Record<string, string> = {
  online: 'bg-emerald-400',
  offline: 'bg-slate-500',
  warning: 'bg-amber-400',
}

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ collapsed = false, onToggle, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const user = authApi.getStoredUser()
  const role = user?.role ?? null

  const navSections = useMemo(() => {
    if (!role) return navSectionsAll
    if (role === 'ADMIN') return navSectionsAll
    return navSectionsAll.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const allowed = roleByPath[item.href]
        if (!allowed) return true
        return allowed.includes(role)
      }),
    })).filter((section) => section.items.length > 0)
  }, [role])

  const [locations, setLocations] = useState<LocationData[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await locationsApi.getAll()
        const data = Array.isArray(res) ? res : (res as any)?.data ?? []
        setLocations(data)
      } catch {
        // Silently fail - sidebar will just not show locations
      } finally {
        setLocationsLoading(false)
      }
    }
    loadLocations()
  }, [])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const getLocationStatus = (loc: LocationData): string => {
    if (!loc.isActive) return 'offline'
    return 'online'
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4 sm:h-16">
        <Link href="/" className="flex items-center gap-2" onClick={onMobileClose}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            N
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-wide text-gray-900 dark:text-white">
              NO<span className="text-blue-600 dark:text-blue-400">VA</span>
            </span>
          )}
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 dark:text-slate-400 transition-colors hover:bg-gray-200 dark:hover:bg-white/5 dark:hover:text-white lg:inline-flex"
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 dark:text-slate-400 transition-colors hover:bg-gray-200 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-2 py-4">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      className={cn(
                        'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-l-2 border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-600/10 dark:text-white'
                          : 'border-l-2 border-transparent text-gray-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white')} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {/* Locales section - loaded from API */}
        <div>
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">
              LOCALES
            </p>
          )}
          <ul className="space-y-0.5">
            {locationsLoading && (
              <li className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-slate-500" />
              </li>
            )}
            {!locationsLoading && locations.length === 0 && !collapsed && (
              <li className="px-3 py-2 text-xs text-gray-500 dark:text-slate-500">
                Sin locales
              </li>
            )}
            {locations.map((loc) => {
              const href = `/locations/${loc.id}`
              const active = isActive(href)
              const status = getLocationStatus(loc)
              return (
                <li key={loc.id}>
                  <Link
                    href={href}
                    onClick={onMobileClose}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-l-2 border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-600/10 dark:text-white'
                        : 'border-l-2 border-transparent text-gray-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                    )}
                    title={collapsed ? loc.name : undefined}
                  >
                    <Store className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-white')} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{loc.name}</span>
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            statusDotColor[status] || statusDotColor.online
                          )}
                        />
                      </>
                    )}
                    {collapsed && (
                      <span
                        className={cn(
                          'absolute right-2 top-1 h-2 w-2 rounded-full',
                          statusDotColor[status] || statusDotColor.online
                        )}
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>
    </>
  )

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-gray-100 dark:bg-slate-900 transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-64',
        /* Móvil/tablet: drawer overlay */
        'fixed left-0 top-0 z-50 h-full transform ease-out lg:relative lg:left-auto lg:z-auto lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
    >
      {sidebarContent}
    </aside>
  )
}
