import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Dispara la animación global de "contenido actualizado" (llamar después de guardar/actualizar datos). */
export function triggerContentUpdateAnimation(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("content-updated"))
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n)
}

/** Formatea un número con punto como separador de miles para mostrar en inputs (ej: 1500 → "1.500", 0 → "0"). */
export function formatNumberInputDisplay(n: number): string {
  if (Number.isNaN(n)) return ""
  const int = Math.floor(Math.abs(n))
  if (int === 0) return "0"
  const s = String(int)
  const formatted = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return n < 0 ? `-${formatted}` : formatted
}

/** Parsea un string que puede tener puntos como separador de miles (ej: "1.500" → 1500). Solo dígitos y opcional signo menos. */
export function parseNumberInputInput(s: string): number {
  const cleaned = s.replace(/[^\d-]/g, "")
  const hasMinus = cleaned.startsWith("-")
  const digits = cleaned.replace(/-/g, "")
  if (digits === "") return 0
  const n = parseInt(digits, 10)
  return Number.isNaN(n) ? 0 : hasMinus ? -n : n
}

/** Cantidad para stock/inventario: máximo 2 decimales para evitar superposición en UI. */
export function formatQuantity(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : Number(n)
  if (Number.isNaN(num)) return "—"
  if (Number.isInteger(num)) return String(num)
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date))
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

/** Fecha legible larga, ej. "28 de marzo de 2026" (es-AR). */
export function formatDateLong(date: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date))
}

/** Suma días calendario en hora local (vencimiento = día de producción + N días). */
export function addCalendarDaysLocal(date: string | Date, calendarDays: number): Date {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + calendarDays)
}

/**
 * POS: el producto se ofrece en un local si no tiene niveles de stock (compat: carta global)
 * o si existe `StockLevel` para ese `locationId` (ubicaciones elegidas en el producto).
 */
export function isProductAvailableAtLocation(
  product: {
    stockLevels?: Array<{ locationId?: string; location?: { id?: string } }> | null
  },
  locationId: string
): boolean {
  if (!locationId) return false
  const levels = product.stockLevels
  if (!Array.isArray(levels) || levels.length === 0) return true
  return levels.some(
    (l) => (l.locationId ?? l.location?.id) === locationId
  )
}

/**
 * Formatea un número de teléfono para mostrar (ej: 542995171364 → "+54 299 517 1364").
 * Acepta entrada con o sin +; normaliza a solo dígitos y opcional + al inicio.
 * Para Argentina (+54): 10 dígitos → 3 3 4 (ej. 299 517 1364), 9 dígitos → 2 3 4 (ej. 11 123 4567).
 */
export function formatPhoneNumber(value: string): string {
  const trimmed = value.trim()
  const hasPlus = trimmed.startsWith("+")
  const digits = value.replace(/\D/g, "")
  if (digits.length === 0) return hasPlus ? "+" : ""
  const prefix = hasPlus ? "+" : ""
  if (digits.startsWith("54") && digits.length > 2) {
    const rest = digits.slice(2)
    let formatted: string
    if (rest.length === 10) {
      formatted = `${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 10)}`
    } else if (rest.length === 9) {
      formatted = `${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 9)}`
    } else {
      const groups = rest.match(/.{1,3}/g) ?? []
      formatted = groups.join(" ")
    }
    return `${prefix}54 ${formatted}`.trim()
  }
  const groups = digits.match(/.{1,3}/g) ?? []
  return prefix + groups.join(" ").trim()
}

/** Fecha en formato dd/mm/yyyy usando solo la parte de fecha (YYYY-MM-DD) del valor, sin aplicar zona horaria. Evita que medianoche UTC se muestre como "día anterior" en zonas como Argentina. */
export function formatDateOnly(isoOrDate: string | Date): string {
  const s = typeof isoOrDate === "string" ? isoOrDate.slice(0, 10) : isoOrDate.toISOString().slice(0, 10)
  if (!s || s.length < 10) return ""
  const [y, m, d] = [s.slice(0, 4), s.slice(5, 7), s.slice(8, 10)]
  return `${d}/${m}/${y}`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Buenos días"
  if (hour < 18) return "Buenas tardes"
  return "Buenas noches"
}

export function getStockStatus(current: number, min: number, max?: number) {
  if (current <= min) return "critical"
  if (current <= min * 1.5) return "medium"
  if (max && current > max) return "excess"
  return "normal"
}

export function getStockStatusLabel(status: string) {
  const map: Record<string, string> = {
    critical: "Crítico",
    medium: "Medio",
    low: "low",
    normal: "Normal",
    excess: "Exceso",
  }
  return map[status] || status
}

export function getStockStatusColor(status: string) {
  const map: Record<string, string> = {
    critical:
      "text-red-600 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-900/50 dark:border-red-800",
    medium:
      "text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-200 dark:bg-amber-900/50 dark:border-amber-800",
    low:
      "text-gray-700 bg-gray-100 border-gray-200 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600",
    normal:
      "text-green-600 bg-green-50 border-green-200 dark:text-green-200 dark:bg-green-900/50 dark:border-green-800",
    excess:
      "text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-200 dark:bg-purple-900/50 dark:border-purple-800",
  }
  return map[status] || ""
}

function hexLuminance(hex: string): number {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return 0
  const h = hex.slice(1)
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  if (Number.isNaN(r + g + b)) return 0
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Devuelve un color de texto legible para badges de categoría (evita fondos claros con texto claro) */
export function getCategoryBadgeTextColor(hex: string): string {
  const luminance = hexLuminance(hex)
  if (luminance > 0.7) return "#0f766e"
  if (luminance > 0.5) return "#134e4a"
  return hex || "#1f2937"
}

/** Estilos para el badge de categoría: fondo sombreado visible y texto legible (todas las categorías se ven igual) */
export function getCategoryBadgeStyle(hex: string): { backgroundColor: string; color: string } {
  const h = hex || "#94a3b8"
  const luminance = hexLuminance(h)
  const color = getCategoryBadgeTextColor(h)
  if (luminance > 0.75) return { backgroundColor: "#E0F2F1", color }
  if (luminance > 0.5) return { backgroundColor: "#CCFBF1", color }
  return { backgroundColor: `${h}18`, color }
}
