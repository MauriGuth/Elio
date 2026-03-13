"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { authApi } from "@/lib/api/auth"
import { api, posStationSuffix, getLocationKey } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Store,
  User,
  Clock,
  LogOut,
  UtensilsCrossed,
  ChefHat,
  Coffee,
  Banknote,
  Loader2,
  Menu,
  X,
} from "lucide-react"
import { ForceLightMode } from "@/components/force-light-mode"

const POS_ROLES = ["waiter", "cashier", "kitchen", "cafeteria", "location_manager", "warehouse_manager", "admin", "auditor", "WAITER", "CASHIER", "KITCHEN", "CAFETERIA", "LOCATION_MANAGER", "WAREHOUSE_MANAGER", "ADMIN", "AUDITOR"]

const CASHIER_ROLE = ["cashier", "CASHIER"]
const WAITER_ROLE = ["waiter", "WAITER"]
const KITCHEN_ROLE = ["kitchen", "KITCHEN"]
const CAFETERIA_ROLE = ["cafeteria", "CAFETERIA"]

function PosLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const station = searchParams.get("station")
  const [user, setUser] = useState<any>(null)
  const [location, setLocation] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [navOpen, setNavOpen] = useState(false)

  const isCashier = useMemo(() => user && CASHIER_ROLE.includes(user.role), [user])
  const isWaiter = useMemo(() => user && WAITER_ROLE.includes(user.role), [user])
  const isKitchen = useMemo(() => user && KITCHEN_ROLE.includes(user.role), [user])
  const isCafeteria = useMemo(() => user && CAFETERIA_ROLE.includes(user.role), [user])
  const isDepot = useMemo(() => station === "deposito" && !!user, [station, user])

  const navItems = useMemo(() => {
    const all = [
      { href: "/pos/tables", label: "Mesas", icon: UtensilsCrossed },
      { href: "/pos/kitchen", label: "Cocina", icon: ChefHat },
      { href: "/pos/cafeteria", label: "Cafetería", icon: Coffee },
      { href: "/pos/caja", label: "Caja", icon: Banknote },
    ]
    if (isDepot) return all.filter((item) => item.href === "/pos/tables" || item.href === "/pos/caja")
    if (isCashier) return all.filter((item) => item.href === "/pos/tables" || item.href === "/pos/caja")
    if (isWaiter) return all.filter((item) => item.href === "/pos/tables")
    if (isKitchen) return all.filter((item) => item.href === "/pos/kitchen")
    if (isCafeteria) return all.filter((item) => item.href === "/pos/cafeteria")
    return all
  }, [isDepot, isCashier, isWaiter, isKitchen, isCafeteria])

  useEffect(() => {
    const storedUser = authApi.getStoredUser()
    const isAuth = authApi.isAuthenticated()

    if (isAuth && storedUser && POS_ROLES.includes(storedUser.role)) {
      setUser(storedUser)
      const loc =
        storedUser.location ||
        (() => {
          try {
            return JSON.parse(
              localStorage.getItem(getLocationKey()) || "null"
            )
          } catch {
            return null
          }
        })()
      setLocation(loc)
    }
    setLoading(false)
  }, [pathname])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Redirigir a login si no hay usuario o local (en useEffect para no actualizar Router durante el render)
  useEffect(() => {
    if (loading || pathname === "/pos") return
    if (!user || !location) {
      if (station === "deposito") {
        router.replace("/deposito")
      } else {
        router.replace("/pos" + posStationSuffix())
      }
    }
  }, [loading, user, location, pathname, station, router])

  useEffect(() => {
    if (!user) return
    const q = posStationSuffix()
    if (isDepot && (pathname.startsWith("/pos/kitchen") || pathname.startsWith("/pos/cafeteria"))) {
      router.replace("/pos/tables" + q)
    }
    if (isCashier && (pathname.startsWith("/pos/kitchen") || pathname.startsWith("/pos/cafeteria"))) {
      router.replace("/pos/tables" + q)
    }
    if (isWaiter && (pathname.startsWith("/pos/kitchen") || pathname.startsWith("/pos/cafeteria") || pathname.startsWith("/pos/caja"))) {
      router.replace("/pos/tables" + q)
    }
    if (isKitchen && (pathname.startsWith("/pos/tables") || pathname.startsWith("/pos/cafeteria") || pathname.startsWith("/pos/caja"))) {
      router.replace("/pos/kitchen" + q)
    }
    if (isCafeteria && (pathname.startsWith("/pos/tables") || pathname.startsWith("/pos/kitchen") || pathname.startsWith("/pos/caja"))) {
      router.replace("/pos/cafeteria" + q)
    }
  }, [user, isDepot, isCashier, isWaiter, isKitchen, isCafeteria, pathname, router])

  const handleLogout = () => {
    localStorage.removeItem(getLocationKey())
    api.clearToken()
    const station = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("station") : null
    window.location.href = "/pos" + (station ? `?station=${station}` : "")
  }

  // Login page — no layout chrome
  if (pathname === "/pos") {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (!user || !location) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  const forceLight = station === "cajero" || station === "mozo"

  return (
    <div className="flex h-dvh max-h-screen flex-col bg-gray-50 dark:bg-gray-900 sm:h-screen">
      {forceLight && <ForceLightMode />}
      {/* ── POS Header: safe area en móvil para notch/home indicator ── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 shadow-sm pt-[env(safe-area-inset-top)] sm:pt-0 sm:px-4">
        {/* Left: menú móvil + brand + navigation (desktop) */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4 md:gap-6">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label={navOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href={"/pos/tables" + posStationSuffix()} className="flex shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
              <span className="text-sm font-black text-white">N</span>
            </div>
            <span className="hidden text-lg font-bold tracking-wide text-gray-800 sm:inline">POS</span>
          </Link>

          {/* Nav: dropdown en móvil/tablet, inline en desktop */}
          {navOpen && (
            <div className="absolute left-0 right-0 top-14 z-40 flex flex-col border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg md:hidden" style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href + posStationSuffix()}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-amber-50 text-amber-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href + posStationSuffix()}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-amber-50 text-amber-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right: location · user · clock · logout */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-1.5 text-sm text-gray-600 sm:flex">
            <Store className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium max-w-[120px] lg:max-w-none">{location.name}</span>
          </div>

          <div className="hidden h-5 w-px bg-gray-200 sm:block" />

          <div className="hidden items-center gap-1.5 text-sm text-gray-600 md:flex">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[80px] lg:max-w-none">
              {user.firstName} {user.lastName}
            </span>
          </div>

          <div className="hidden h-5 w-px bg-gray-200 md:block" />

          <div className="flex items-center gap-1 sm:gap-1.5 text-xs tabular-nums text-gray-500 sm:text-sm">
            <Clock className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>
              {currentTime.toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          <div className="h-5 w-px bg-gray-200" />

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 sm:px-3 sm:py-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-sm sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* ── Main content: min-w-0 para que con panel IA abierto no desborde; h-full para que las páginas puedan scrollear dentro ── */}
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div key={pathname} className="animate-page-enter flex h-full min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      }
    >
      <PosLayoutInner>{children}</PosLayoutInner>
    </Suspense>
  )
}
