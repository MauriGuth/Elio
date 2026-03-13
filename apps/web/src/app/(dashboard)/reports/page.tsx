"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { sileo } from "sileo"
import {
  Eye,
  Trash2,
  DollarSign,
  Brain,
  GitCompareArrows,
  ShoppingCart,
  Download,
  Calendar,
  MapPin,
  Loader2,
  AlertTriangle,
  Package,
  Activity,
  TrendingUp,
  TrendingDown,
  FileText,
  Info,
  Sparkles,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Shield,
  Lightbulb,
  Target,
  Zap,
  ChevronDown,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from "recharts"
import { stockApi } from "@/lib/api/stock"
import { ordersApi } from "@/lib/api/orders"
import { locationsApi } from "@/lib/api/locations"
import { goodsReceiptsApi } from "@/lib/api/goods-receipts"
import { aiEventsApi } from "@/lib/api/ai-events"
import { cashMovementsApi } from "@/lib/api/cash-movements"
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils"

// ─── Helpers ────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = toDateStr(now)
  const from = new Date(now)
  switch (preset) {
    case "today":
      break
    case "week":
      from.setDate(from.getDate() - 7)
      break
    case "month":
      from.setMonth(from.getMonth() - 1)
      break
    case "quarter":
      from.setMonth(from.getMonth() - 3)
      break
    case "year":
      from.setFullYear(from.getFullYear() - 1)
      break
    default:
      from.setDate(from.getDate() - 30)
  }
  return { from: toDateStr(from), to }
}

const SALES_METRICS = [
  { value: "cantidad_ventas", label: "Cantidad de ventas" },
  { value: "cantidad_ventas_sucursal", label: "Cantidad de ventas por sucursal" },
  { value: "monto_ventas", label: "Monto de ventas" },
  { value: "monto_ventas_sucursal", label: "Monto de ventas por sucursal" },
  { value: "movimientos_caja", label: "Movimientos de caja" },
  { value: "movimientos_caja_sucursal", label: "Movimientos de caja por sucursal" },
  { value: "rentabilidad", label: "Rentabilidad por día" },
]

function escapeCsv(v: string | number): string {
  const s = String(v)
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\n")
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// ─── Constants ──────────────────────────────────────────────────────

const CHART_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#06B6D4",
  "#F59E0B",
  "#EF4444",
  "#10B981",
  "#F97316",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
]

/** Color de la cuadrícula punteada en gráficos (visible en tema claro y oscuro) */
const CHART_GRID_STROKE = "rgb(203 213 225)"

const PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Última Semana" },
  { value: "month", label: "Último Mes" },
  { value: "quarter", label: "Último Trimestre" },
  { value: "year", label: "Último Año" },
]

const REPORT_CARDS = [
  {
    id: "overview",
    title: "Visión General",
    desc: "Resumen de stock, movimientos y métricas clave",
    Icon: Eye,
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-500 border-blue-500",
    darkBg: "dark:bg-blue-900/50",
    darkColor: "dark:text-blue-300",
  },
  {
    id: "losses",
    title: "Pérdidas y Mermas",
    desc: "Análisis de pérdidas por merma, ajuste y rotura",
    Icon: Trash2,
    color: "text-red-600",
    bg: "bg-red-50",
    ring: "ring-red-500 border-red-500",
    darkBg: "dark:bg-red-900/50",
    darkColor: "dark:text-red-300",
  },
  {
    id: "costs",
    title: "Costos y Márgenes",
    desc: "Desglose de costos y márgenes por producto",
    Icon: DollarSign,
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-500 border-green-500",
    darkBg: "dark:bg-green-900/50",
    darkColor: "dark:text-green-300",
  },
  {
    id: "consumption",
    title: "Consumo de Insumos",
    desc: "Uso de materia prima por producto y local",
    Icon: ShoppingCart,
    color: "text-purple-600",
    bg: "bg-purple-50",
    ring: "ring-purple-500 border-purple-500",
    darkBg: "dark:bg-purple-900/50",
    darkColor: "dark:text-purple-300",
  },
  {
    id: "projections",
    title: "Proyecciones IA",
    desc: "Predicción de demanda e inteligencia artificial",
    Icon: Brain,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-500 border-indigo-500",
    darkBg: "dark:bg-indigo-900/50",
    darkColor: "dark:text-indigo-300",
  },
  {
    id: "comparison",
    title: "Comparativo Locales",
    desc: "Comparación de rendimiento entre sucursales",
    Icon: GitCompareArrows,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    ring: "ring-cyan-500 border-cyan-500",
    darkBg: "dark:bg-cyan-900/50",
    darkColor: "dark:text-cyan-300",
  },
  {
    id: "sales",
    title: "Ventas",
    desc: "Monto de ventas, por sucursal, día/hora y top productos",
    Icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-500 border-emerald-500",
    darkBg: "dark:bg-emerald-900/50",
    darkColor: "dark:text-emerald-300",
  },
]

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: "Compra",
  sale: "Venta",
  production_in: "Producción (entrada)",
  production_out: "Producción (salida)",
  transfer_in: "Transferencia (entrada)",
  transfer_out: "Transferencia (salida)",
  adjustment: "Ajuste",
  loss: "Pérdida",
  return: "Devolución",
}

const INBOUND_TYPES = ["purchase", "production_in", "transfer_in", "return"]

// ─── Sub-components ─────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: e.color }}>
          {e.name}: {formatNumber(e.value)}
        </p>
      ))}
    </div>
  )
}

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: e.color }}>
          {e.name}: {formatCurrency(e.value)}
        </p>
      ))}
    </div>
  )
}

function PercentTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: e.color }}>
          {e.name}: {e.value.toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
          >
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-3 h-8 w-32 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
          >
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="mt-4 h-64 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="h-4 w-48 rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: string
  icon: any
  color: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            bg,
            color
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500">{label}</p>
          <p className={cn("mt-0.5 text-xl font-bold tabular-nums", color)}>
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({
  title,
  onExport,
}: {
  title: string
  onExport?: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 py-16">
      <FileText className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-500" />
      <p className="text-sm font-medium text-gray-500 dark:text-white">{message}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-400">
        No hay datos para el período seleccionado
      </p>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ReportsPage() {
  // ── Filter State ──
  const defaultRange = getPresetRange("month")
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [activePreset, setActivePreset] = useState<string | null>("month")
  const [selectedLocation, setSelectedLocation] = useState("")
  const [activeReport, setActiveReport] = useState("overview")

  // ── Data State ──
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [stockSummary, setStockSummary] = useState<any>(null)
  const [stockLevels, setStockLevels] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [aiEvents, setAiEvents] = useState<any[]>([])
  const [aiAnalysis, setAiAnalysis] = useState<any>(null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null)

  // ── Sales report data ──
  const [salesByDay, setSalesByDay] = useState<{ date: string; amount: number; count?: number }[]>([])
  const [salesByDayBranch, setSalesByDayBranch] = useState<{ date: string; amount: number; count?: number }[]>([])
  const [cashMovementsByDay, setCashMovementsByDay] = useState<{ date: string; amount: number }[]>([])
  const [cashMovementsByDayBranch, setCashMovementsByDayBranch] = useState<{ date: string; amount: number }[]>([])
  const [salesStackedByLocation, setSalesStackedByLocation] = useState<Record<string, number>[]>([])
  const [salesStackedDates, setSalesStackedDates] = useState<string[]>([])
  const [salesByDayAndHour, setSalesByDayAndHour] = useState<{ dayOfWeek: number; hour: number; total: number; count: number; ticketAvg: number }[]>([])
  const [salesByDayAndHourBranch, setSalesByDayAndHourBranch] = useState<{ dayOfWeek: number; hour: number; total: number; count: number; ticketAvg: number }[]>([])
  const [topProductsSales, setTopProductsSales] = useState<{ productId: string; name: string; categoryName: string; total: number; quantity: number }[]>([])
  const [topCategoriesSales, setTopCategoriesSales] = useState<{ categoryId: string; name: string; total: number }[]>([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesMetric, setSalesMetric] = useState("monto_ventas")
  const [mainChartData, setMainChartData] = useState<{ date: string; dateShort: string; amount?: number; count?: number }[]>([])
  const [mainChartLoading, setMainChartLoading] = useState(false)

  // ── Fetch locations once ──
  useEffect(() => {
    locationsApi.getAll().then(setLocations).catch(() => {})
  }, [])

  // ── Fetch report data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const locId = selectedLocation || undefined
      const [summaryRes, levelsRes, movementsRes, receiptsRes, aiEventsRes] =
        await Promise.all([
          stockApi.getSummary(locId),
          stockApi.getLevels({}),
          stockApi.getMovements({
            dateFrom,
            dateTo,
            locationId: locId,
            limit: 1000,
          }),
          (goodsReceiptsApi.getAll as any)({ dateFrom, dateTo, limit: 500 }),
          aiEventsApi.getActive().catch(() => []),
        ])
      setStockSummary(summaryRes)
      setStockLevels(
        Array.isArray(levelsRes) ? levelsRes : (levelsRes as any)?.data ?? []
      )
      setMovements(
        Array.isArray(movementsRes)
          ? movementsRes
          : (movementsRes as any)?.data ?? []
      )
      setReceipts(
        Array.isArray(receiptsRes)
          ? receiptsRes
          : (receiptsRes as any)?.data ?? []
      )
      setAiEvents(Array.isArray(aiEventsRes) ? aiEventsRes : [])
    } catch (err: any) {
      const msg = err.message || "Error al cargar datos de reportes"
      setError(msg)
      sileo.error({ title: msg })
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedLocation])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Fetch sales report data when on sales tab (usa filtros globales: dateFrom, dateTo, selectedLocation) ──
  const fetchSalesData = useCallback(async () => {
    setSalesLoading(true)
    try {
      const dFrom = dateFrom
      const dTo = dateTo
      const paramsTotal = { dateFrom: dFrom, dateTo: dTo }
      const paramsBranch = selectedLocation ? { dateFrom: dFrom, dateTo: dTo, locationId: selectedLocation } : null
      const base = [
        ordersApi.getSalesByDay(paramsTotal),
        ordersApi.getSalesByDayAndHour(paramsTotal),
        ordersApi.getTopProductsBySales({ ...paramsTotal, limit: 10 }),
        ordersApi.getTopCategoriesBySales({ ...paramsTotal, limit: 10 }),
        cashMovementsApi.getByDay(paramsTotal),
        paramsBranch ? cashMovementsApi.getByDay(paramsBranch) : Promise.resolve([]),
      ]
      const allRes = await Promise.all(base)
      const [byDayRes, byDayHourRes, topPRes, topCRes, cashByDayRes, cashByDayBranchRes] = allRes
      setSalesByDay(Array.isArray(byDayRes) ? byDayRes : [])
      setSalesByDayAndHour(Array.isArray(byDayHourRes) ? byDayHourRes : [])
      setTopProductsSales(Array.isArray(topPRes) ? topPRes : [])
      setTopCategoriesSales(Array.isArray(topCRes) ? topCRes : [])
      setCashMovementsByDay(Array.isArray(cashByDayRes) ? cashByDayRes : [])
      setCashMovementsByDayBranch(Array.isArray(cashByDayBranchRes) ? cashByDayBranchRes : [])

      if (paramsBranch) {
        const byDayBranchRes = await ordersApi.getSalesByDay(paramsBranch)
        const byDayHourBranchRes = await ordersApi.getSalesByDayAndHour(paramsBranch)
        setSalesByDayBranch(Array.isArray(byDayBranchRes) ? byDayBranchRes : [])
        setSalesByDayAndHourBranch(Array.isArray(byDayHourBranchRes) ? byDayHourBranchRes : [])
      } else {
        setSalesByDayBranch([])
        setSalesByDayAndHourBranch([])
      }

      // Stacked by location
      if (locations.length > 0) {
        const perLoc = await Promise.all(
          locations.map((loc: any) =>
            ordersApi.getSalesByDay({ dateFrom: dFrom, dateTo: dTo, locationId: loc.id }).then((arr: any) => ({
              id: loc.id,
              name: loc.name || loc.id,
              data: Array.isArray(arr) ? arr : [],
            }))
          )
        )
        const dateSet = new Set<string>()
        perLoc.forEach(({ data }) => data.forEach((d: { date: string }) => dateSet.add(d.date)))
        const sortedDates = Array.from(dateSet).sort()
        const stacked = sortedDates.map((date) => {
          const row: Record<string, string | number> = { date }
          perLoc.forEach(({ name, data }) => {
            const item = data.find((d: any) => d.date === date)
            row[name] = item?.amount ?? 0
          })
          return row
        })
        setSalesStackedDates(sortedDates)
        setSalesStackedByLocation(stacked)
      } else {
        setSalesStackedByLocation([])
        setSalesStackedDates([])
      }
    } catch {
      setSalesByDay([])
      setSalesByDayBranch([])
      setSalesByDayAndHour([])
      setSalesByDayAndHourBranch([])
      setCashMovementsByDay([])
      setCashMovementsByDayBranch([])
      setSalesStackedByLocation([])
      setSalesStackedDates([])
      setTopProductsSales([])
      setTopCategoriesSales([])
    } finally {
      setSalesLoading(false)
    }
  }, [dateFrom, dateTo, selectedLocation, locations])

  useEffect(() => {
    if (activeReport === "sales") fetchSalesData()
  }, [activeReport, fetchSalesData])

  const fetchMainChartData = useCallback(async () => {
    setMainChartLoading(true)
    try {
      const params = { dateFrom, dateTo }
      const branchParams = selectedLocation ? { ...params, locationId: selectedLocation } : null
      const isBranch = salesMetric.endsWith("_sucursal")
      const isQuantity = salesMetric.includes("cantidad")
      const isCash = salesMetric.includes("movimientos_caja")
      if (salesMetric === "rentabilidad") {
        setMainChartData([])
        return
      }
      if (isCash) {
        const res = isBranch && branchParams ? await cashMovementsApi.getByDay(branchParams) : await cashMovementsApi.getByDay(params)
        const arr = Array.isArray(res) ? res : []
        setMainChartData(arr.map((d) => ({ ...d, dateShort: formatShortDate(d.date) })))
        return
      }
      const res = isBranch && branchParams ? await ordersApi.getSalesByDay(branchParams) : await ordersApi.getSalesByDay(params)
      const arr = Array.isArray(res) ? res : []
      setMainChartData(arr.map((d: any) => ({ ...d, dateShort: formatShortDate(d.date) })))
    } catch {
      setMainChartData([])
    } finally {
      setMainChartLoading(false)
    }
  }, [salesMetric, dateFrom, dateTo, selectedLocation])

  useEffect(() => {
    if (activeReport === "sales") fetchMainChartData()
  }, [activeReport, fetchMainChartData])

  const salesTotalByLocation = useMemo(() => {
    if (!salesStackedByLocation.length) return []
    const totals: Record<string, number> = {}
    salesStackedByLocation.forEach((row: Record<string, string | number>) => {
      Object.entries(row).forEach(([k, v]) => {
        if (k !== "date" && typeof v === "number") totals[k] = (totals[k] ?? 0) + v
      })
    })
    return Object.entries(totals).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  }, [salesStackedByLocation])

  // ── Preset handler ──
  const applyPreset = (preset: string) => {
    const r = getPresetRange(preset)
    setDateFrom(r.from)
    setDateTo(r.to)
    setActivePreset(preset)
  }

  // ── Filtered stock levels by selected location ──
  const filteredLevels = useMemo(() => {
    if (!selectedLocation) return stockLevels
    return stockLevels.filter((sl: any) => sl.locationId === selectedLocation)
  }, [stockLevels, selectedLocation])

  const activeLocations = useMemo(
    () => (locations || []).filter((l: any) => l.isActive !== false),
    [locations]
  )

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED DATA — Visión General
  // ═══════════════════════════════════════════════════════════════════

  const movementsByDate = useMemo(() => {
    const dayMap: Record<string, { date: string; Entradas: number; Salidas: number }> = {}
    movements.forEach((m: any) => {
      const date = new Date(m.createdAt).toISOString().split("T")[0]
      if (!dayMap[date]) dayMap[date] = { date, Entradas: 0, Salidas: 0 }
      if (INBOUND_TYPES.includes(m.type)) {
        dayMap[date].Entradas += Math.abs(m.quantity)
      } else {
        dayMap[date].Salidas += Math.abs(m.quantity)
      }
    })
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
  }, [movements])

  const stockValueByLocation = useMemo(() => {
    const locMap: Record<string, { name: string; value: number; products: number }> = {}
    stockLevels.forEach((sl: any) => {
      const id = sl.locationId
      const name = sl.location?.name || "Desconocido"
      if (!locMap[id]) locMap[id] = { name, value: 0, products: 0 }
      locMap[id].value += (sl.quantity || 0) * (sl.product?.avgCost || 0)
      locMap[id].products += 1
    })
    return activeLocations
      .map((loc: any) => ({
        name: loc.name || loc.id,
        value: locMap[loc.id]?.value ?? 0,
        products: locMap[loc.id]?.products ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
  }, [stockLevels, activeLocations])

  const topProductsByValue = useMemo(() => {
    const pMap: Record<
      string,
      { name: string; sku: string; category: string; value: number; quantity: number; unit: string }
    > = {}
    filteredLevels.forEach((sl: any) => {
      const pid = sl.productId
      const p = sl.product || {}
      if (!pMap[pid]) {
        pMap[pid] = {
          name: p.name || "N/A",
          sku: p.sku || "",
          category: p.category?.name || "Sin categoría",
          value: 0,
          quantity: 0,
          unit: p.unit || "un",
        }
      }
      pMap[pid].value += (sl.quantity || 0) * (p.avgCost || 0)
      pMap[pid].quantity += sl.quantity || 0
    })
    return Object.values(pMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filteredLevels])

  const totalReceiptsValue = useMemo(
    () =>
      receipts
        .filter((r: any) => r.status !== "cancelled")
        .reduce((s: number, r: any) => s + (r.totalAmount || 0), 0),
    [receipts]
  )

  const totalStockValue = useMemo(
    () =>
      filteredLevels.reduce(
        (s: number, sl: any) =>
          s + (sl.quantity || 0) * (sl.product?.avgCost || 0),
        0
      ),
    [filteredLevels]
  )

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED DATA — Pérdidas y Mermas
  // ═══════════════════════════════════════════════════════════════════

  const lossMovements = useMemo(
    () =>
      movements.filter(
        (m: any) =>
          m.type === "loss" || (m.type === "adjustment" && m.quantity < 0)
      ),
    [movements]
  )

  const totalLossValue = useMemo(
    () =>
      lossMovements.reduce(
        (s: number, m: any) => s + Math.abs(m.quantity) * (m.unitCost || 0),
        0
      ),
    [lossMovements]
  )

  const lossesByLocation = useMemo(() => {
    const locMap: Record<string, { name: string; value: number; count: number }> = {}
    lossMovements.forEach((m: any) => {
      const name = m.location?.name || "Desconocido"
      if (!locMap[name]) locMap[name] = { name, value: 0, count: 0 }
      locMap[name].value += Math.abs(m.quantity) * (m.unitCost || 0)
      locMap[name].count += 1
    })
    return Object.values(locMap).sort((a, b) => b.value - a.value)
  }, [lossMovements])

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED DATA — Costos y Márgenes
  // ═══════════════════════════════════════════════════════════════════

  const productsWithMargin = useMemo(() => {
    const pMap: Record<
      string,
      {
        name: string
        category: string
        avgCost: number
        salePrice: number
        margin: number
        quantity: number
        unit: string
      }
    > = {}
    filteredLevels.forEach((sl: any) => {
      const pid = sl.productId
      const p = sl.product || {}
      const cost = p.avgCost || 0
      const price = p.salePrice || 0
      if (!pMap[pid] && cost > 0) {
        const margin = price > 0 ? ((price - cost) / price) * 100 : 0
        pMap[pid] = {
          name: p.name || "N/A",
          category: p.category?.name || "Sin categoría",
          avgCost: cost,
          salePrice: price,
          margin,
          quantity: 0,
          unit: p.unit || "un",
        }
      }
      if (pMap[pid]) {
        pMap[pid].quantity += sl.quantity || 0
      }
    })
    return Object.values(pMap).sort((a, b) => b.margin - a.margin)
  }, [filteredLevels])

  const avgMargin = useMemo(() => {
    if (productsWithMargin.length === 0) return 0
    const validProducts = productsWithMargin.filter((p) => p.salePrice > 0)
    if (validProducts.length === 0) return 0
    return (
      validProducts.reduce((s, p) => s + p.margin, 0) / validProducts.length
    )
  }, [productsWithMargin])

  const highestMarginProduct = useMemo(
    () =>
      productsWithMargin.filter((p) => p.salePrice > 0).sort((a, b) => b.margin - a.margin)[0] ?? null,
    [productsWithMargin]
  )

  const lowestMarginProduct = useMemo(
    () =>
      productsWithMargin.filter((p) => p.salePrice > 0).sort((a, b) => a.margin - b.margin)[0] ?? null,
    [productsWithMargin]
  )

  const topMarginProducts = useMemo(
    () =>
      productsWithMargin
        .filter((p) => p.salePrice > 0)
        .slice(0, 10)
        .map((p) => ({ name: p.name, "Margen %": Number(p.margin.toFixed(1)) })),
    [productsWithMargin]
  )

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED DATA — Consumo de Insumos
  // ═══════════════════════════════════════════════════════════════════

  const consumptionData = useMemo(() => {
    const pMap: Record<
      string,
      { name: string; unit: string; quantity: number; cost: number; locationSet: Set<string> }
    > = {}
    movements
      .filter((m: any) => m.type === "production_out" || m.type === "sale")
      .forEach((m: any) => {
        const pid = m.productId
        if (!pMap[pid]) {
          pMap[pid] = {
            name: m.product?.name || "N/A",
            unit: m.product?.unit || "un",
            quantity: 0,
            cost: 0,
            locationSet: new Set(),
          }
        }
        pMap[pid].quantity += Math.abs(m.quantity)
        pMap[pid].cost += Math.abs(m.quantity) * (m.unitCost || 0)
        if (m.location?.name) pMap[pid].locationSet.add(m.location.name)
      })
    return Object.values(pMap)
      .map((p) => ({
        name: p.name,
        unit: p.unit,
        quantity: p.quantity,
        cost: p.cost,
        locations: Array.from(p.locationSet),
      }))
      .sort((a, b) => b.quantity - a.quantity)
  }, [movements])

  const topConsumedChart = useMemo(
    () =>
      consumptionData.slice(0, 15).map((p) => ({
        name: p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name,
        Cantidad: p.quantity,
      })),
    [consumptionData]
  )

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTED DATA — Comparativo Locales
  // ═══════════════════════════════════════════════════════════════════

  const comparisonData = useMemo(() => {
    const locMap: Record<
      string,
      { name: string; value: number; products: number; critical: number; totalQty: number }
    > = {}
    stockLevels.forEach((sl: any) => {
      const id = sl.locationId
      const name = sl.location?.name || "Desconocido"
      if (!locMap[id]) locMap[id] = { name, value: 0, products: 0, critical: 0, totalQty: 0 }
      locMap[id].value += (sl.quantity || 0) * (sl.product?.avgCost || 0)
      locMap[id].products += 1
      locMap[id].totalQty += sl.quantity || 0
      if (sl.minQuantity != null && sl.quantity <= sl.minQuantity) {
        locMap[id].critical += 1
      }
    })
    return activeLocations.map((loc: any) => {
      const l = locMap[loc.id] ?? {
        name: loc.name || loc.id,
        value: 0,
        products: 0,
        critical: 0,
        totalQty: 0,
      }
      return {
        ...l,
        name: loc.name || loc.id,
        value: l.value,
        products: l.products,
        critical: l.critical,
        totalQty: l.totalQty,
        avgStock: l.products > 0 ? Math.round(l.totalQty / l.products) : 0,
      }
    })
  }, [stockLevels, activeLocations])

  // ═══════════════════════════════════════════════════════════════════
  // IA ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  const runAiAnalysis = useCallback(async (reportType?: string) => {
    setAiAnalysisLoading(true)
    setAiAnalysisError(null)
    try {
      const result = await aiEventsApi.analyzeReport({
        dateFrom,
        dateTo,
        locationId: selectedLocation || undefined,
        reportType: reportType || activeReport,
      })
      setAiAnalysis(result.analysis)
    } catch (err: any) {
      const msg = err.message || "Error al generar análisis con IA"
      setAiAnalysisError(msg)
      sileo.error({ title: msg })
    } finally {
      setAiAnalysisLoading(false)
    }
  }, [dateFrom, dateTo, selectedLocation, activeReport])

  // ═══════════════════════════════════════════════════════════════════
  // EXPORT HANDLERS
  // ═══════════════════════════════════════════════════════════════════

  const exportOverview = () => {
    downloadCSV(
      "reporte_vision_general.csv",
      ["Producto", "SKU", "Categoría", "Cantidad", "Unidad", "Valor Total"],
      topProductsByValue.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.quantity,
        p.unit,
        Math.round(p.value),
      ])
    )
  }

  const exportLosses = () => {
    downloadCSV(
      "reporte_perdidas.csv",
      ["Fecha", "Producto", "Local", "Tipo", "Cantidad", "Costo Unitario", "Costo Total", "Notas"],
      lossMovements.map((m: any) => [
        formatDate(m.createdAt),
        m.product?.name || "N/A",
        m.location?.name || "N/A",
        MOVEMENT_LABELS[m.type] || m.type,
        Math.abs(m.quantity),
        m.unitCost || 0,
        Math.round(Math.abs(m.quantity) * (m.unitCost || 0)),
        m.notes || "",
      ])
    )
  }

  const exportCosts = () => {
    downloadCSV(
      "reporte_costos_margenes.csv",
      ["Producto", "Categoría", "Costo Promedio", "Precio Venta", "Margen %", "Stock", "Unidad"],
      productsWithMargin.map((p) => [
        p.name,
        p.category,
        Math.round(p.avgCost),
        Math.round(p.salePrice),
        p.margin.toFixed(1),
        p.quantity,
        p.unit,
      ])
    )
  }

  const exportConsumption = () => {
    downloadCSV(
      "reporte_consumo_insumos.csv",
      ["Producto", "Unidad", "Cantidad Consumida", "Costo Total", "Locales"],
      consumptionData.map((p) => [
        p.name,
        p.unit,
        p.quantity,
        Math.round(p.cost),
        p.locations.join("; "),
      ])
    )
  }

  const exportComparison = () => {
    downloadCSV(
      "reporte_comparativo_locales.csv",
      ["Local", "Valor Total", "Productos", "Items Críticos", "Stock Promedio"],
      comparisonData.map((l) => [
        l.name,
        Math.round(l.value),
        l.products,
        l.critical,
        l.avgStock,
      ])
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ────── Header ────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Reportes y Analítica
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Análisis integral de tu operación gastronómica
        </p>
      </div>

      {/* ────── Date Range & Location Filters ────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <Calendar className="h-5 w-5 text-gray-400" />
        <div className="flex items-center gap-2">
          <label htmlFor="report-date-from" className="text-sm font-medium text-gray-600">Desde</label>
          <input
            id="report-date-from"
            type="date"
            value={dateFrom}
            title="Fecha desde"
            onChange={(e) => {
              setDateFrom(e.target.value)
              setActivePreset(null)
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="report-date-to" className="text-sm font-medium text-gray-600">Hasta</label>
          <input
            id="report-date-to"
            type="date"
            value={dateTo}
            title="Fecha hasta"
            onChange={(e) => {
              setDateTo(e.target.value)
              setActivePreset(null)
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mx-1 h-6 w-px bg-gray-200" />

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => applyPreset(p.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activePreset === p.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400" />
          <select
            aria-label="Filtrar por local"
            title="Filtrar por local"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 pl-3 pr-8 text-sm font-medium text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Todos los locales</option>
            {activeLocations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* ────── Report Type Cards ────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {REPORT_CARDS.map((card) => {
          const isActive = activeReport === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveReport(card.id)}
              className={cn(
                "group rounded-xl border p-4 text-left transition-all",
                isActive
                  ? cn("ring-1 shadow-sm dark:bg-gray-800", card.ring, card.bg + "/30")
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
              )}
            >
              <div
                className={cn(
                  "mb-2 flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  card.bg,
                  card.color,
                  isActive ? cn(card.darkBg, card.darkColor) : "dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                <card.Icon className="h-4.5 w-4.5" />
              </div>
              <h3
                className={cn(
                  "text-sm font-semibold",
                  isActive ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-white"
                )}
              >
                {card.title}
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {card.desc}
              </p>
            </button>
          )
        })}
      </div>

      {/* ────── Error State ────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={fetchData}
            className="ml-auto text-sm font-medium text-red-700 underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ────── Loading State ────── */}
      {loading && <LoadingSkeleton />}

      {/* ────── Report Content ────── */}
      {!loading && !error && (
        <>
          {/* ═══════════════════════════════════════════ */}
          {/* VISIÓN GENERAL */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "overview" && (
            <div className="space-y-6">
              <SectionHeader title="Visión General" onExport={exportOverview} />

              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Total Productos"
                  value={formatNumber(stockSummary?.totalProducts ?? filteredLevels.length)}
                  icon={Package}
                  color="text-blue-600"
                  bg="bg-blue-50"
                />
                <KpiCard
                  label="Valor Total Stock"
                  value={formatCurrency(stockSummary?.totalValue ?? totalStockValue)}
                  icon={DollarSign}
                  color="text-green-600"
                  bg="bg-green-50"
                />
                <KpiCard
                  label="Movimientos del Período"
                  value={formatNumber(movements.length)}
                  icon={Activity}
                  color="text-purple-600"
                  bg="bg-purple-50"
                />
                <KpiCard
                  label="Ingresos del Período"
                  value={formatCurrency(totalReceiptsValue)}
                  icon={TrendingUp}
                  color="text-amber-600"
                  bg="bg-amber-50"
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Line Chart — Movements over time */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Movimientos en el Período
                  </h3>
                  {movementsByDate.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={movementsByDate}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_GRID_STROKE}
                          />
                          <XAxis
                            dataKey="date"
                            interval={0}
                            tickFormatter={(v: string, i: number) => (i % 2 === 0 ? formatShortDate(v) : "")}
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-tick)" }} />
                          <Line
                            type="monotone"
                            dataKey="Entradas"
                            stroke="#3B82F6"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#3B82F6" }}
                            activeDot={{ r: 5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Salidas"
                            stroke="#EF4444"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="Sin movimientos en este período" />
                  )}
                </div>

                {/* Bar Chart — Stock value by location */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Valor de Stock por Local
                  </h3>
                  {stockValueByLocation.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={stockValueByLocation}
                          layout="vertical"
                          margin={{ left: 10 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_GRID_STROKE}
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tickFormatter={(v: number) =>
                              formatCurrency(v).replace(/\s/g, "")
                            }
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            width={120}
                          />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Bar
                            dataKey="value"
                            name="Valor"
                            radius={[0, 6, 6, 0]}
                            barSize={28}
                          >
                            {stockValueByLocation.map((_, idx) => (
                              <Cell
                                key={idx}
                                fill={
                                  CHART_COLORS[idx % CHART_COLORS.length]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState message="Sin datos de stock por local" />
                  )}
                </div>
              </div>

              {/* Top Products Table */}
              {topProductsByValue.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Top 10 Productos por Valor de Stock
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800">
                          <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                            #
                          </th>
                          <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                            Producto
                          </th>
                          <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                            SKU
                          </th>
                          <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                            Categoría
                          </th>
                          <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                            Cantidad
                          </th>
                          <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                            Valor Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {topProductsByValue.map((p, i) => (
                          <tr key={i} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-3 text-gray-400 dark:text-white">
                              {i + 1}
                            </td>
                            <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                              {p.name}
                            </td>
                            <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-300">
                              {p.sku}
                            </td>
                            <td className="px-6 py-3 text-gray-600 dark:text-white">
                              {p.category}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              {formatNumber(p.quantity)} {p.unit}
                            </td>
                            <td className="px-6 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(p.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* PÉRDIDAS Y MERMAS */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "losses" && (
            <div className="space-y-6">
              <SectionHeader
                title="Pérdidas y Mermas"
                onExport={lossMovements.length > 0 ? exportLosses : undefined}
              />

              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Total Pérdidas"
                  value={formatCurrency(totalLossValue)}
                  icon={TrendingDown}
                  color="text-red-600"
                  bg="bg-red-50"
                />
                <KpiCard
                  label="Eventos de Pérdida"
                  value={formatNumber(lossMovements.length)}
                  icon={AlertTriangle}
                  color="text-orange-600"
                  bg="bg-orange-50"
                />
                <KpiCard
                  label="Valor Promedio por Evento"
                  value={formatCurrency(
                    lossMovements.length > 0
                      ? totalLossValue / lossMovements.length
                      : 0
                  )}
                  icon={Activity}
                  color="text-yellow-600"
                  bg="bg-yellow-50"
                />
              </div>

              {lossMovements.length > 0 ? (
                <>
                  {/* Losses by Location Chart */}
                  {lossesByLocation.length > 0 && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                        Pérdidas por Local
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={lossesByLocation}
                            layout="vertical"
                            margin={{ left: 10 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART_GRID_STROKE}
                              horizontal={false}
                            />
                            <XAxis
                              type="number"
                              tickFormatter={(v: number) =>
                                formatCurrency(v).replace(/\s/g, "")
                              }
                              tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              width={120}
                            />
                            <Tooltip content={<CurrencyTooltip />} />
                            <Bar
                              dataKey="value"
                              name="Pérdida"
                              radius={[0, 6, 6, 0]}
                              barSize={28}
                            >
                              {lossesByLocation.map((_, idx) => (
                                <Cell
                                  key={idx}
                                  fill={
                                    ["#EF4444", "#F97316", "#F59E0B", "#FB923C", "#FBBF24"][
                                      idx % 5
                                    ]
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Losses Table */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Detalle de Pérdidas y Mermas
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800">
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Fecha
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Producto
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Local
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Tipo
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Cantidad
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Costo Total
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Notas
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                          {lossMovements.map((m: any, i: number) => (
                            <tr key={m.id || i} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="whitespace-nowrap px-6 py-3 text-gray-600 dark:text-white">
                                {formatDate(m.createdAt)}
                              </td>
                              <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                                {m.product?.name || "N/A"}
                              </td>
                              <td className="px-6 py-3 text-gray-600 dark:text-white">
                                {m.location?.name || "N/A"}
                              </td>
                              <td className="px-6 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    m.type === "loss"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                                  )}
                                >
                                  {MOVEMENT_LABELS[m.type] || m.type}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatNumber(Math.abs(m.quantity))}
                              </td>
                              <td className="px-6 py-3 text-right font-semibold tabular-nums text-red-600">
                                {formatCurrency(
                                  Math.abs(m.quantity) * (m.unitCost || 0)
                                )}
                              </td>
                              <td className="max-w-[200px] truncate px-6 py-3 text-gray-500 dark:text-white">
                                {m.notes || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState message="No se registraron pérdidas en este período" />
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* COSTOS Y MÁRGENES */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "costs" && (
            <div className="space-y-6">
              <SectionHeader
                title="Costos y Márgenes"
                onExport={
                  productsWithMargin.length > 0 ? exportCosts : undefined
                }
              />

              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label="Margen Promedio"
                  value={`${avgMargin.toFixed(1)}%`}
                  icon={Activity}
                  color="text-green-600"
                  bg="bg-green-50"
                />
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-500">
                        Mayor Margen
                      </p>
                      <p className="mt-0.5 truncate text-base font-bold text-emerald-600">
                        {highestMarginProduct
                          ? `${highestMarginProduct.name} (${highestMarginProduct.margin.toFixed(1)}%)`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                      <TrendingDown className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-500">
                        Menor Margen
                      </p>
                      <p className="mt-0.5 truncate text-base font-bold text-red-600">
                        {lowestMarginProduct
                          ? `${lowestMarginProduct.name} (${lowestMarginProduct.margin.toFixed(1)}%)`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {productsWithMargin.length > 0 ? (
                <>
                  {/* Top Margin Chart */}
                  {topMarginProducts.length > 0 && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                        Top 10 Productos por Margen
                      </h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={topMarginProducts}
                            layout="vertical"
                            margin={{ left: 10 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART_GRID_STROKE}
                              horizontal={false}
                            />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tickFormatter={(v: number) => `${v}%`}
                              tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                              width={140}
                            />
                            <Tooltip content={<PercentTooltip />} />
                            <Bar
                              dataKey="Margen %"
                              name="Margen %"
                              radius={[0, 6, 6, 0]}
                              barSize={24}
                            >
                              {topMarginProducts.map((_, idx) => (
                                <Cell
                                  key={idx}
                                  fill={
                                    CHART_COLORS[idx % CHART_COLORS.length]
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Products Margin Table */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Detalle de Costos y Márgenes
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800">
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Producto
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Categoría
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Costo Promedio
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Precio Venta
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Margen %
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Stock
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                          {productsWithMargin.map((p, i) => (
                            <tr key={i} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                                {p.name}
                              </td>
                              <td className="px-6 py-3 text-gray-600 dark:text-white">
                                {p.category}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatCurrency(p.avgCost)}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {p.salePrice > 0
                                  ? formatCurrency(p.salePrice)
                                  : "—"}
                              </td>
                              <td className="px-6 py-3 text-right">
                                {p.salePrice > 0 ? (
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                                      p.margin >= 50
                                        ? "bg-green-100 text-green-700"
                                        : p.margin >= 20
                                          ? "bg-yellow-100 text-yellow-700"
                                          : "bg-red-100 text-red-700"
                                    )}
                                  >
                                    {p.margin.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">
                                    Sin precio
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatNumber(p.quantity)} {p.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState message="Sin datos de costos disponibles" />
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* CONSUMO DE INSUMOS */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "consumption" && (
            <div className="space-y-6">
              <SectionHeader
                title="Consumo de Insumos"
                onExport={
                  consumptionData.length > 0 ? exportConsumption : undefined
                }
              />

              {consumptionData.length > 0 ? (
                <>
                  {/* Top 15 Chart */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                      Top 15 Productos Más Consumidos
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topConsumedChart}
                          layout="vertical"
                          margin={{ left: 10 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_GRID_STROKE}
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={150}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            dataKey="Cantidad"
                            name="Cantidad"
                            radius={[0, 6, 6, 0]}
                            barSize={20}
                          >
                            {topConsumedChart.map((_, idx) => (
                              <Cell
                                key={idx}
                                fill={
                                  CHART_COLORS[idx % CHART_COLORS.length]
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Consumption Table */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Detalle de Consumo
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800">
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Producto
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Unidad
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Cantidad Consumida
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Costo Total
                            </th>
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Locales
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                          {consumptionData.map((p, i) => (
                            <tr key={i} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                                {p.name}
                              </td>
                              <td className="px-6 py-3 text-gray-600 dark:text-white">
                                {p.unit}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatNumber(p.quantity)}
                              </td>
                              <td className="px-6 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                                {formatCurrency(p.cost)}
                              </td>
                              <td className="px-6 py-3 text-gray-600 dark:text-white">
                                <div className="flex flex-wrap gap-1">
                                  {p.locations.map((loc: string) => (
                                    <span
                                      key={loc}
                                      className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-900"
                                    >
                                      {loc}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState message="Sin datos de consumo en este período" />
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* PROYECCIONES IA */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "projections" && (
            <div className="space-y-6">
              <SectionHeader title="Análisis con Inteligencia Artificial" />

              {/* Generate Analysis Button */}
              {!aiAnalysis && !aiAnalysisLoading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white py-16">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                    <Brain className="h-8 w-8 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-indigo-900">
                    Análisis Inteligente con OpenAI
                  </h3>
                  <p className="mt-2 max-w-md text-center text-sm text-gray-500">
                    Generá un análisis completo de tu negocio con predicciones,
                    insights y recomendaciones accionables usando inteligencia artificial.
                  </p>
                  {aiAnalysisError && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      {aiAnalysisError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => runAiAnalysis("general")}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generar Análisis con IA
                  </button>
                </div>
              )}

              {/* Loading State */}
              {aiAnalysisLoading && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/30 py-16">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-indigo-900">
                    Analizando datos con OpenAI...
                  </h3>
                  <p className="mt-2 text-sm text-indigo-600">
                    Procesando stock, movimientos, ingresos y alertas
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-indigo-500">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                    Esto puede tardar 10-20 segundos
                  </div>
                </div>
              )}

              {/* Analysis Results */}
              {aiAnalysis && !aiAnalysisLoading && (
                <div className="space-y-6">
                  {/* Regenerate button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-500" />
                      <span className="text-xs text-gray-500">
                        Análisis generado con OpenAI GPT-4o
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => runAiAnalysis("general")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      Regenerar
                    </button>
                  </div>

                  {/* Executive Summary */}
                  {aiAnalysis.resumenEjecutivo && (
                    <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-6">
                      <div className="mb-3 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-sm font-bold text-indigo-900">Resumen Ejecutivo</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                        {aiAnalysis.resumenEjecutivo}
                      </p>
                    </div>
                  )}

                  {/* KPIs */}
                  {aiAnalysis.kpis && aiAnalysis.kpis.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {aiAnalysis.kpis.map((kpi: any, i: number) => (
                        <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-500">{kpi.nombre}</p>
                            {kpi.tendencia === "up" && <ArrowUpRight className="h-4 w-4 text-green-500" />}
                            {kpi.tendencia === "down" && <ArrowDownRight className="h-4 w-4 text-red-500" />}
                            {kpi.tendencia === "stable" && <Minus className="h-4 w-4 text-gray-400" />}
                          </div>
                          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{kpi.valor}</p>
                          {kpi.detalle && (
                            <p className="mt-1 text-xs text-gray-500">{kpi.detalle}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Insights */}
                  {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Insights
                      </h3>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {aiAnalysis.insights.map((ins: any, i: number) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-xl border p-5",
                              ins.tipo === "danger"
                                ? "border-red-200 bg-red-50/50"
                                : ins.tipo === "warning"
                                  ? "border-amber-200 bg-amber-50/50"
                                  : ins.tipo === "success"
                                    ? "border-green-200 bg-green-50/50"
                                    : "border-blue-200 bg-blue-50/50"
                            )}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              {ins.tipo === "danger" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {ins.tipo === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                              {ins.tipo === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                              {ins.tipo === "info" && <Info className="h-4 w-4 text-blue-500" />}
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{ins.titulo}</h4>
                            </div>
                            <p className="text-sm text-gray-600">{ins.descripcion}</p>
                            {ins.accion && (
                              <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2">
                                <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                                <p className="text-xs font-medium text-indigo-700">{ins.accion}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {aiAnalysis.recomendaciones && aiAnalysis.recomendaciones.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <Zap className="h-4 w-4 text-indigo-500" />
                        Recomendaciones
                      </h3>
                      <div className="space-y-3">
                        {aiAnalysis.recomendaciones.map((rec: any, i: number) => (
                          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{rec.titulo}</h4>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                      rec.prioridad === "alta"
                                        ? "bg-red-100 text-red-700"
                                        : rec.prioridad === "media"
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-gray-100 text-gray-600"
                                    )}
                                  >
                                    {rec.prioridad}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">{rec.descripcion}</p>
                              </div>
                            </div>
                            {rec.impacto && (
                              <div className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2">
                                <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                                <p className="text-xs text-green-700">{rec.impacto}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projections */}
                  {aiAnalysis.proyecciones && aiAnalysis.proyecciones.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                        Proyecciones
                      </h3>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {aiAnalysis.proyecciones.map((proj: any, i: number) => (
                          <div key={i} className="rounded-xl border border-blue-200 bg-blue-50/30 p-5">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{proj.titulo}</h4>
                            <p className="mt-1 text-xs font-medium text-blue-600">{proj.periodo}</p>
                            <p className="mt-2 text-sm text-gray-600">{proj.descripcion}</p>
                            {proj.confianza != null && (
                              <div className="mt-3 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      proj.confianza >= 75
                                        ? "bg-green-500"
                                        : proj.confianza >= 50
                                          ? "bg-amber-500"
                                          : "bg-red-500"
                                    )}
                                    style={{ width: `${proj.confianza}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-500">{proj.confianza}%</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Anomalies */}
                  {aiAnalysis.anomalias && aiAnalysis.anomalias.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        <Shield className="h-4 w-4 text-red-500" />
                        Anomalías Detectadas
                      </h3>
                      <div className="space-y-2">
                        {aiAnalysis.anomalias.map((anom: any, i: number) => (
                          <div
                            key={i}
                            className={cn(
                              "flex items-start gap-3 rounded-xl border p-4",
                              anom.severidad === "alta"
                                ? "border-red-200 bg-red-50/50"
                                : anom.severidad === "media"
                                  ? "border-amber-200 bg-amber-50/50"
                                  : "border-gray-200 bg-gray-50/50"
                            )}
                          >
                            <AlertTriangle
                              className={cn(
                                "mt-0.5 h-4 w-4 shrink-0",
                                anom.severidad === "alta"
                                  ? "text-red-500"
                                  : anom.severidad === "media"
                                    ? "text-amber-500"
                                    : "text-gray-400"
                              )}
                            />
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{anom.titulo}</h4>
                              <p className="mt-0.5 text-sm text-gray-600">{anom.descripcion}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Events */}
              {aiEvents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Eventos de IA Activos
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {aiEvents.map((evt: any) => (
                      <div
                        key={evt.id}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 transition-shadow hover:shadow-sm"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {evt.title || evt.type || "Evento IA"}
                          </h4>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                              evt.severity === "critical"
                                ? "bg-red-100 text-red-700"
                                : evt.severity === "high"
                                  ? "bg-orange-100 text-orange-700"
                                  : evt.severity === "medium"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-blue-100 text-blue-700"
                            )}
                          >
                            {evt.severity === "critical"
                              ? "Crítico"
                              : evt.severity === "high"
                                ? "Alto"
                                : evt.severity === "medium"
                                  ? "Medio"
                                  : "Info"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                          {evt.description || evt.message || "Sin descripción"}
                        </p>
                        {evt.recommendation && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                            <p className="text-xs text-indigo-700">
                              {evt.recommendation}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* VENTAS */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "sales" && (
            <div className="space-y-6">
              <SectionHeader title="Ventas" />

              {salesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Primer gráfico: listado de métrica + período + refresh (como antes) */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Métrica a visualizar"
                        value={salesMetric}
                        onChange={(e) => setSalesMetric(e.target.value)}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-white"
                      >
                        {SALES_METRICS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {salesMetric === "rentabilidad" ? (
                      <EmptyState message="Rentabilidad por día no disponible aún. Próximamente." />
                    ) : mainChartLoading ? (
                      <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
                    ) : mainChartData.length === 0 ? (
                      <EmptyState message={(salesMetric.endsWith("_sucursal") && !selectedLocation) ? "Seleccioná un local en el filtro superior" : "Sin datos para el período"} />
                    ) : (
                      (() => {
                        const isQuantity = salesMetric.includes("cantidad")
                        const dataKey = isQuantity ? "count" : "amount"
                        const total = mainChartData.reduce((s, d) => s + (Number((d as any)[dataKey]) || 0), 0)
                        const totalLabel = isQuantity ? "Total cantidad" : "Total monto"
                        const totalFormatted = isQuantity ? formatNumber(total) : formatCurrency(total)
                        return (
                          <>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={mainChartData}>
                                  <defs>
                                    <linearGradient id="salesMainGrad" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                                  <XAxis dataKey="dateShort" interval={0} tickFormatter={(v: string, i: number) => (i % 2 === 0 ? v : "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                  <YAxis tickFormatter={(v) => (isQuantity ? formatNumber(v) : formatCurrency(v).replace(/\s/g, ""))} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                  <Tooltip content={isQuantity ? <ChartTooltip /> : <CurrencyTooltip />} />
                                  <Area type="monotone" dataKey={dataKey} name={isQuantity ? "Cantidad" : "Monto"} stroke="#3B82F6" fill="url(#salesMainGrad)" strokeWidth={2} />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                            <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">{totalLabel}: {totalFormatted}</p>
                          </>
                        )
                      })()
                    )}
                  </div>

                  {/* Monto y cantidad por sucursal: con local seleccionado = serie por día; sin local = total por local (todos los locales) */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Monto de ventas por sucursal</h3>
                      {selectedLocation && salesByDayBranch.length > 0 ? (
                        <>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={salesByDayBranch.map((d) => ({ ...d, dateShort: formatShortDate(d.date) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                                <XAxis dataKey="dateShort" interval={0} tickFormatter={(v: string, i: number) => (i % 2 === 0 ? v : "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={(v) => formatCurrency(v).replace(/\s/g, "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<CurrencyTooltip />} />
                                <Bar dataKey="amount" name="Monto" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Total monto: {formatCurrency(salesByDayBranch.reduce((s, d) => s + d.amount, 0))}</p>
                        </>
                      ) : !selectedLocation && salesTotalByLocation.length > 0 ? (
                        <>
                          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Todos los locales — monto total en el período</p>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={salesTotalByLocation} layout="vertical" margin={{ left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                                <XAxis type="number" tickFormatter={(v) => formatCurrency(v).replace(/\s/g, "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                                <Tooltip content={<CurrencyTooltip />} />
                                <Bar dataKey="total" name="Monto" fill="#06B6D4" radius={[0, 6, 6, 0]} barSize={24} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Total: {formatCurrency(salesTotalByLocation.reduce((s, d) => s + d.total, 0))}</p>
                        </>
                      ) : (
                        <EmptyState message={selectedLocation ? "Sin datos para este local" : "Seleccioná un local para ver evolución por día, o revisá el gráfico de totalizadas por sucursal más abajo"} />
                      )}
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Cantidad de ventas por sucursal</h3>
                      {selectedLocation && salesByDayBranch.length > 0 && salesByDayBranch.some((d) => (d as any).count != null) ? (
                        <>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={salesByDayBranch.map((d) => ({ ...d, dateShort: formatShortDate(d.date) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                                <XAxis dataKey="dateShort" interval={0} tickFormatter={(v: string, i: number) => (i % 2 === 0 ? v : "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="count" name="Cantidad" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Total cantidad: {formatNumber((salesByDayBranch as { count?: number }[]).reduce((s, d) => s + (d.count ?? 0), 0))}</p>
                        </>
                      ) : !selectedLocation ? (
                        <EmptyState message="Seleccioná un local en el filtro superior para ver cantidad de ventas por día en ese local. El gráfico de abajo muestra monto por sucursal para todos los locales." />
                      ) : (
                        <EmptyState message="Sin datos para este local" />
                      )}
                    </div>
                  </div>

                  {/* Monto totalizado por sucursal (stacked) */}
                  {salesStackedByLocation.length > 0 && locations.length > 0 && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Monto de ventas totalizadas por sucursal</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={salesStackedByLocation}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                            <XAxis dataKey="date" interval={0} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: string, i: number) => (i % 2 === 0 ? formatShortDate(v) : "")} />
                            <YAxis tickFormatter={(v) => formatCurrency(v).replace(/\s/g, "")} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CurrencyTooltip />} />
                            {activeLocations.map((loc: any, i: number) => (
                              <Area key={loc.id} type="monotone" dataKey={loc.name} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.7} strokeWidth={1} />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Total monto: {formatCurrency(salesStackedByLocation.reduce((s, row) => {
                          let rowTotal = 0
                          Object.keys(row).forEach((k) => { if (k !== "date" && typeof row[k] === "number") rowTotal += row[k] })
                          return s + rowTotal
                        }, 0))}
                      </p>
                    </div>
                  )}

                  {/* Fila 3: Heatmaps día/hora */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {(() => {
                      const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
                      const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`)
                      const heatmapData = salesByDayAndHour
                      const maxTotal = heatmapData.length ? Math.max(...heatmapData.map((d) => d.total), 1) : 1
                      const getCell = (dow: number, hour: number) => heatmapData.find((d) => d.dayOfWeek === dow && d.hour === hour)
                      return (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Monto de ventas por día y hora</h3>
                          {heatmapData.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr>
                                    <th className="border border-gray-200 dark:border-gray-600 p-1 text-left font-medium text-gray-500 dark:text-gray-400">Hora</th>
                                    {DAY_LABELS.map((l, i) => (
                                      <th key={i} className="border border-gray-200 dark:border-gray-600 p-1 text-center font-medium text-gray-500 dark:text-gray-400">{l}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {HOUR_LABELS.map((_, hour) => (
                                    <tr key={hour}>
                                      <td className="border border-gray-200 dark:border-gray-600 p-1 text-gray-500 dark:text-gray-400">{HOUR_LABELS[hour]}</td>
                                      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                                        const cell = getCell(dow, hour)
                                        const t = cell?.total ?? 0
                                        const intensity = maxTotal > 0 ? Math.min(1, t / maxTotal) : 0
                                        const bg = intensity > 0 ? `rgba(239, 68, 68, ${0.2 + intensity * 0.8})` : "transparent"
                                        return (
                                          <td key={dow} className="border border-gray-200 dark:border-gray-600 p-0.5 align-middle" title={cell ? `Total: ${formatCurrency(cell.total)} · Cantidad: ${cell.count} · Ticket prom: ${formatCurrency(cell.ticketAvg)}` : ""}>
                                            <div className="h-5 min-w-[28px] rounded-sm" style={{ backgroundColor: bg }} />
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <EmptyState message="Sin datos por día y hora" />
                          )}
                        </div>
                      )
                    })()}
                    {(() => {
                      const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
                      const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`)
                      const heatmapData = salesByDayAndHourBranch
                      const maxTotal = heatmapData.length ? Math.max(...heatmapData.map((d) => d.total), 1) : 1
                      const getCell = (dow: number, hour: number) => heatmapData.find((d) => d.dayOfWeek === dow && d.hour === hour)
                      return (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Monto por día, hora y sucursal</h3>
                          {heatmapData.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-xs">
                                <thead>
                                  <tr>
                                    <th className="border border-gray-200 dark:border-gray-600 p-1 text-left font-medium text-gray-500 dark:text-gray-400">Hora</th>
                                    {DAY_LABELS.map((l, i) => <th key={i} className="border border-gray-200 dark:border-gray-600 p-1 text-center font-medium text-gray-500 dark:text-gray-400">{l}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {HOUR_LABELS.map((_, hour) => (
                                    <tr key={hour}>
                                      <td className="border border-gray-200 dark:border-gray-600 p-1 text-gray-500 dark:text-gray-400">{HOUR_LABELS[hour]}</td>
                                      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                                        const cell = getCell(dow, hour)
                                        const t = cell?.total ?? 0
                                        const intensity = maxTotal > 0 ? Math.min(1, t / maxTotal) : 0
                                        const bg = intensity > 0 ? `rgba(239, 68, 68, ${0.2 + intensity * 0.8})` : "transparent"
                                        return (
                                          <td key={dow} className="border border-gray-200 dark:border-gray-600 p-0.5 align-middle" title={cell ? `Total: ${formatCurrency(cell.total)} · Cantidad: ${cell.count} · Ticket prom: ${formatCurrency(cell.ticketAvg)}` : ""}>
                                            <div className="h-5 min-w-[28px] rounded-sm" style={{ backgroundColor: bg }} />
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <EmptyState message={selectedLocation ? "Sin datos para este local" : "Seleccioná un local en el filtro superior"} />
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Top 10 Familias + Top 10 Productos (donuts) */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Top 10 familias</h3>
                      {topCategoriesSales.length > 0 ? (
                        <div className="flex flex-col items-center gap-4">
                          <div className="h-64 w-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={topCategoriesSales.map((c, i) => ({ ...c, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                                  dataKey="total"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={1}
                                  label={({ name, percent }) => `${name?.slice(0, 12) ?? ""} ${(percent * 100).toFixed(0)}%`}
                                >
                                  {topCategoriesSales.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <EmptyState message="Sin datos de familias" />
                      )}
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Top 10 productos</h3>
                      {topProductsSales.length > 0 ? (
                        <div className="flex flex-col items-center gap-4">
                          <div className="h-64 w-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={topProductsSales.map((p, i) => ({ ...p, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                                  dataKey="total"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={1}
                                  label={({ name, percent }) => `${(name ?? "").slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                                >
                                  {topProductsSales.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <EmptyState message="Sin datos de productos" />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════ */}
          {/* COMPARATIVO LOCALES */}
          {/* ═══════════════════════════════════════════ */}
          {activeReport === "comparison" && (
            <div className="space-y-6">
              <SectionHeader
                title="Comparativo de Locales"
                onExport={
                  comparisonData.length > 0 ? exportComparison : undefined
                }
              />

              {activeLocations.length === 0 ? (
                <EmptyState message="No hay locales cargados. Los gráficos y la tabla incluyen todos los locales activos." />
              ) : comparisonData.length > 0 ? (
                <>
                  {/* Grouped Bar Chart */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                    <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                      Valor de Stock por Local
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_GRID_STROKE}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fill: "var(--chart-tick)", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v: number) =>
                              formatCurrency(v).replace(/\s/g, "")
                            }
                            tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<CurrencyTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-tick)" }} />
                          <Bar
                            dataKey="value"
                            name="Valor Stock"
                            fill="#3B82F6"
                            radius={[4, 4, 0, 0]}
                            barSize={40}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Comparison metrics cards */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                        Productos por Local
                      </h3>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART_GRID_STROKE}
                            />
                            <XAxis
                              dataKey="name"
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="products"
                              name="Productos"
                              fill="#8B5CF6"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                        Items Críticos por Local
                      </h3>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART_GRID_STROKE}
                            />
                            <XAxis
                              dataKey="name"
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="critical"
                              name="Críticos"
                              fill="#EF4444"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                        Stock Promedio por Local
                      </h3>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={CHART_GRID_STROKE}
                            />
                            <XAxis
                              dataKey="name"
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="avgStock"
                              name="Promedio"
                              fill="#06B6D4"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Comparison Table */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Detalle Comparativo
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800">
                            <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-white">
                              Local
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Valor Total
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Productos
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Items Críticos
                            </th>
                            <th className="px-6 py-3 text-right font-medium text-gray-500 dark:text-white">
                              Stock Promedio
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                          {comparisonData.map((l, i) => (
                            <tr key={i} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                      backgroundColor:
                                        CHART_COLORS[
                                          i % CHART_COLORS.length
                                        ],
                                    }}
                                  />
                                  {l.name}
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                                {formatCurrency(l.value)}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatNumber(l.products)}
                              </td>
                              <td className="px-6 py-3 text-right">
                                {l.critical > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-700">
                                    {l.critical}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">
                                    0
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">
                                {formatNumber(l.avgStock)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState message="Sin datos de locales disponibles" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
