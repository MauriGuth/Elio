"use client"

import { useState, useEffect } from "react"
import { Clock, ChefHat, Flame, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------- kitchen order types ----------

interface KitchenItem {
  name: string
  qty: number
  notes?: string
}

interface KitchenOrder {
  id: string
  table: string
  type: "dine_in" | "counter" | "takeaway"
  items: KitchenItem[]
  receivedAt: Date
  status: "urgent" | "queue" | "in_progress"
}

// ---------- hardcoded orders ----------

const now = new Date()

const initialOrders: KitchenOrder[] = [
  {
    id: "ko-1",
    table: "M2",
    type: "dine_in",
    items: [
      { name: "Tostado Jamón y Queso", qty: 2 },
      { name: "Omelette Mixto", qty: 1, notes: "Sin cebolla" },
      { name: "Tarta de Verdura", qty: 1 },
    ],
    receivedAt: new Date(now.getTime() - 22 * 60000),
    status: "urgent",
  },
  {
    id: "ko-2",
    table: "T4",
    type: "dine_in",
    items: [
      { name: "Sándwich de Milanesa", qty: 2 },
      { name: "Ensalada César", qty: 1 },
    ],
    receivedAt: new Date(now.getTime() - 18 * 60000),
    status: "urgent",
  },
  {
    id: "ko-3",
    table: "M5",
    type: "dine_in",
    items: [
      { name: "Croissant Mixto", qty: 3 },
      { name: "Tostado Caprese", qty: 1, notes: "Extra albahaca" },
    ],
    receivedAt: new Date(now.getTime() - 8 * 60000),
    status: "queue",
  },
  {
    id: "ko-4",
    table: "Mostrador",
    type: "counter",
    items: [
      { name: "Medialuna de Manteca", qty: 6 },
      { name: "Budín de Pan", qty: 2, notes: "Para llevar" },
    ],
    receivedAt: new Date(now.getTime() - 5 * 60000),
    status: "queue",
  },
  {
    id: "ko-5",
    table: "T1",
    type: "dine_in",
    items: [
      { name: "Tostado Jamón y Queso", qty: 1 },
      { name: "Sándwich Club", qty: 1, notes: "Sin tomate" },
    ],
    receivedAt: new Date(now.getTime() - 3 * 60000),
    status: "in_progress",
  },
  {
    id: "ko-6",
    table: "B1",
    type: "dine_in",
    items: [{ name: "Tarta de Verdura", qty: 1 }],
    receivedAt: new Date(now.getTime() - 12 * 60000),
    status: "in_progress",
  },
]

// ---------- stats ----------

const completedToday = 87
const avgTime = 14

// ---------- helpers ----------

function minutesAgo(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / 60000)
}

// ---------- main page ----------

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const urgentOrders = orders.filter((o) => o.status === "urgent")
  const queueOrders = orders.filter((o) => o.status === "queue")
  const progressOrders = orders.filter((o) => o.status === "in_progress")

  const handleStart = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "in_progress" as const } : o
      )
    )
  }

  const handleDone = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
  }

  const columns = [
    {
      title: "URGENTE",
      icon: <Flame className="h-4 w-4" />,
      emoji: "🔴",
      orders: urgentOrders,
      headerBg: "bg-red-600",
      cardBorder: "border-red-500/30",
      cardBg: "bg-red-950/50",
      timeBg: "bg-red-500/20 text-red-300",
      action: "Iniciar",
      actionBg: "bg-red-600 hover:bg-red-700",
      onAction: handleStart,
    },
    {
      title: "EN COLA",
      icon: <Clock className="h-4 w-4" />,
      emoji: "🟡",
      orders: queueOrders,
      headerBg: "bg-yellow-600",
      cardBorder: "border-yellow-500/30",
      cardBg: "bg-yellow-950/50",
      timeBg: "bg-yellow-500/20 text-yellow-300",
      action: "Iniciar",
      actionBg: "bg-yellow-600 hover:bg-yellow-700",
      onAction: handleStart,
    },
    {
      title: "EN PREPARACIÓN",
      icon: <ChefHat className="h-4 w-4" />,
      emoji: "🟢",
      orders: progressOrders,
      headerBg: "bg-green-600",
      cardBorder: "border-green-500/30",
      cardBg: "bg-green-950/50",
      timeBg: "bg-green-500/20 text-green-300",
      action: "Listo",
      actionBg: "bg-green-600 hover:bg-green-700",
      onAction: handleDone,
    },
  ]

  const queueCount = urgentOrders.length + queueOrders.length

  return (
    <div className="min-h-screen bg-gray-900">
      {/* -------- Header -------- */}
      <div className="border-b border-gray-700/50 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
              <ChefHat className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Monitor: COCINA
              </h1>
              <p className="text-xs text-gray-400">
                Café Norte · Pedidos en tiempo real
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="font-mono text-lg font-bold tabular-nums text-white">
              {currentTime.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* -------- Kanban Columns -------- */}
      <div className="grid grid-cols-3 gap-4 p-6">
        {columns.map((col) => (
          <div key={col.title} className="flex flex-col">
            {/* Column header */}
            <div
              className={cn(
                "flex items-center justify-between rounded-t-xl px-4 py-3",
                col.headerBg
              )}
            >
              <div className="flex items-center gap-2 text-white">
                <span>{col.emoji}</span>
                {col.icon}
                <span className="text-sm font-bold">{col.title}</span>
              </div>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                {col.orders.length}
              </span>
            </div>

            {/* Column body */}
            <div className="flex-1 space-y-3 rounded-b-xl bg-gray-800/50 p-3">
              {col.orders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-gray-600" />
                  <span className="text-sm">Sin pedidos</span>
                </div>
              )}
              {col.orders.map((order) => {
                const mins = minutesAgo(order.receivedAt)
                return (
                  <div
                    key={order.id}
                    className={cn(
                      "rounded-xl border p-4",
                      col.cardBorder,
                      col.cardBg
                    )}
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white">
                          {order.table}
                        </span>
                        {order.type === "counter" && (
                          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                            MOSTRADOR
                          </span>
                        )}
                        {order.type === "takeaway" && (
                          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                            TAKE AWAY
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          col.timeBg
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {mins} min
                      </span>
                    </div>

                    {/* Items */}
                    <ul className="mt-3 space-y-1.5">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-700/80 text-[10px] font-bold text-gray-300">
                            {item.qty}x
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm text-gray-200">
                              {item.name}
                            </span>
                            {item.notes && (
                              <p className="mt-1.5 rounded-lg border-l-4 border-yellow-400 bg-yellow-950/30 py-1.5 pl-2 pr-1 text-base font-bold leading-snug text-yellow-100 break-words">
                                ⚠ {item.notes}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Action */}
                    <button
                      type="button"
                      onClick={() => col.onAction(order.id)}
                      className={cn(
                        "mt-3 w-full rounded-lg py-2 text-sm font-bold text-white transition-colors",
                        col.actionBg
                      )}
                    >
                      {col.action === "Listo" ? "✓ " : "▶ "}
                      {col.action}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* -------- Stats bar -------- */}
      <div className="border-t border-gray-700/50 bg-gray-800/80 px-6 py-3">
        <div className="flex items-center justify-center gap-6 text-sm">
          <span className="text-gray-400">
            Completados hoy:{" "}
            <span className="font-bold text-white">{completedToday}</span>
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">
            Tiempo prom:{" "}
            <span className="font-bold text-white">{avgTime} min</span>
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">
            En cola:{" "}
            <span className="font-bold text-white">{queueCount}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
