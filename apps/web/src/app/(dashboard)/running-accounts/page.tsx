"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { runningAccountsApi, locationsApi, customersApi } from "@/lib/api/index"
import { BookOpen, Loader2, Send, CheckCircle, ChevronRight, UserPlus, X, Pencil, Trash2, Download, Share2, FileCheck, Search } from "lucide-react"
import { cn } from "@/lib/utils"

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
}

/** Formatea dígitos a CUIT XX-XXXXXXXX-X (máx. 11 dígitos). */
function formatCuitDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

/** Formatea monto con puntos de miles (y coma decimal opcional). Ej: 200000 → "200.000" */
function formatCreditLimitDisplay(value: string): string {
  const cleaned = value.replace(/[^\d,]/g, "")
  const commaIdx = cleaned.indexOf(",")
  const intPart = commaIdx === -1 ? cleaned : cleaned.slice(0, commaIdx)
  const decPart = commaIdx === -1 ? "" : cleaned.slice(commaIdx + 1).replace(/\D/g, "").slice(0, 2)
  if (intPart === "" && decPart === "") return ""
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return decPart ? `${withDots},${decPart}` : withDots
}

/** Parsea valor mostrado (ej. "200.000" o "1.500,50") a número. */
function parseCreditLimitDisplay(display: string): number {
  const normalized = display.replace(/\./g, "").replace(",", ".")
  return parseFloat(normalized) || 0
}

/** Genera HTML del remito para imprimir o descargar. */
function getRemitoHtml(order: any, client: any): string {
  const dateStr = order?.closedAt ? new Date(order.closedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : ""
  const items = (order?.items ?? []).map((item: any) => {
    const subtotal = (item.unitPrice ?? 0) * (item.quantity ?? 1)
    return `<tr><td>${item.quantity} × ${(item.product?.name ?? "—")} ${item.notes ? `(${item.notes})` : ""}</td><td style="text-align:right">${formatCurrency(subtotal)}</td></tr>`
  }).join("")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remito ${order?.orderNumber ?? ""}</title><style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 24px auto; padding: 16px; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
    th { font-weight: 600; }
    .total { font-weight: 700; font-size: 1.125rem; margin-top: 12px; }
  </style></head><body>
    <h1>Remito</h1>
    <div class="meta">
      <div><strong>Cliente:</strong> ${client?.name ?? "—"}</div>
      <div><strong>CUIT:</strong> ${client?.cuit ? formatCuitDisplay(String(client.cuit)) : "—"}</div>
      <div><strong>Pedido:</strong> ${order?.orderNumber ?? "—"} · ${dateStr}</div>
    </div>
    <table><thead><tr><th>Detalle</th><th style="text-align:right">Importe</th></tr></thead><tbody>${items}</tbody></table>
    <div class="total">Total: ${formatCurrency(order?.total ?? 0)}</div>
  </body></html>`
}

/** Genera HTML con todos los remitos del mes (un bloque por pedido) para compartir. */
function getRemitoMonthHtml(orders: any[], client: any): string {
  const blocks = orders.map((order: any) => {
    const dateStr = order?.closedAt ? new Date(order.closedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : ""
    const items = (order?.items ?? []).map((item: any) => {
      const subtotal = (item.unitPrice ?? 0) * (item.quantity ?? 1)
      return `<tr><td>${item.quantity} × ${(item.product?.name ?? "—")} ${item.notes ? `(${item.notes})` : ""}</td><td style="text-align:right">${formatCurrency(subtotal)}</td></tr>`
    }).join("")
    return `
    <div class="remito-block" style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #ddd;">
      <div class="meta" style="color: #666; font-size: 0.875rem; margin-bottom: 8px;">
        <strong>Pedido ${order?.orderNumber ?? "—"}</strong> · ${dateStr}
      </div>
      <table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 6px; text-align: left;">Detalle</th><th style="padding: 6px; text-align: right;">Importe</th></tr></thead><tbody>${items}</tbody></table>
      <div style="font-weight: 700; margin-top: 8px;">Total pedido: ${formatCurrency(order?.total ?? 0)}</div>
    </div>`
  }).join("")
  const totalMonth = orders.reduce((sum: number, o: any) => sum + (o?.total ?? 0), 0)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remitos del mes - ${client?.name ?? ""}</title><style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 24px auto; padding: 16px; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    .client { color: #666; font-size: 0.875rem; margin-bottom: 16px; }
  </style></head><body>
    <h1>Remitos del mes</h1>
    <div class="client">
      <div><strong>Cliente:</strong> ${client?.name ?? "—"}</div>
      <div><strong>CUIT:</strong> ${client?.cuit ? formatCuitDisplay(String(client.cuit)) : "—"}</div>
    </div>
    ${blocks}
    <div style="font-weight: 700; font-size: 1.125rem; margin-top: 16px;">Total del mes: ${formatCurrency(totalMonth)}</div>
  </body></html>`
}

function isDepositoLocation(name: string) {
  const n = (name ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
  return n.includes("deposito")
}

const ACCOUNT_KIND_OPTIONS = [
  { value: "client" as const, label: "Cliente" },
  { value: "employee" as const, label: "Empleado" },
]

function accountKindLabel(kind: string | undefined) {
  return kind === "employee" ? "Empleado" : "Cliente"
}

export default function RunningAccountsPage() {
  const [locations, setLocations] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [clientSearchQuery, setClientSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const locationsWithoutDeposito = useMemo(
    () => locations.filter((l: any) => !isDepositoLocation(l.name ?? "")),
    [locations]
  )
  const filteredClients = useMemo(() => {
    const raw = (clientSearchQuery ?? "").trim()
    if (!raw) return clients
    const q = raw.toLowerCase().normalize("NFD").replace(/\u0301/g, "")
    const cuitQ = raw.replace(/\D/g, "")
    return clients.filter((c: any) => {
      const name = (c.name ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
      const legalName = (c.legalName ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
      const cuit = (c.cuit ?? "").replace(/\D/g, "")
      const email = (c.email ?? "").toLowerCase()
      const phone = (c.phone ?? "").replace(/\D/g, "")
      const locationName = (c.locationName ?? "").toLowerCase().normalize("NFD").replace(/\u0301/g, "")
      return (
        name.includes(q) ||
        legalName.includes(q) ||
        (cuitQ.length >= 2 && cuit.includes(cuitQ)) ||
        (q.length >= 2 && email.includes(q)) ||
        (cuitQ.length >= 2 && phone.includes(cuitQ)) ||
        locationName.includes(q)
      )
    })
  }, [clients, clientSearchQuery])
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [ordersMonth, setOrdersMonth] = useState("")
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)
  const [showAddClient, setShowAddClient] = useState(false)
  const [addClientForm, setAddClientForm] = useState({
    name: "",
    cuit: "",
    email: "",
    phone: "",
    creditLimit: "",
    accountKind: "client" as "client" | "employee",
  })
  const [addClientError, setAddClientError] = useState<string | null>(null)
  const [addingClient, setAddingClient] = useState(false)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [deletingClient, setDeletingClient] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [remitoOrder, setRemitoOrder] = useState<any | null>(null)
  const [showMonthRemito, setShowMonthRemito] = useState(false)
  const [monthBatchAction, setMonthBatchAction] = useState<string | null>(null)

  useEffect(() => {
    locationsApi.getAll?.().then((list: any) => {
      const arr = Array.isArray(list) ? list : list?.data ?? []
      setLocations(arr.filter((l: any) => l.isActive !== false))
    }).catch(() => setLocations([]))
  }, [])

  const fetchClients = useCallback(() => {
    setLoading(true)
    runningAccountsApi.getClients().then((res) => {
      const list = Array.isArray(res) ? res : (res as any)?.data
      setClients(Array.isArray(list) ? list : [])
    }).catch(() => setClients([])).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  useEffect(() => {
    if (!selectedClient?.locationId || !selectedClient?.id) {
      setOrders([])
      return
    }
    const month = ordersMonth || undefined
    setLoadingOrders(true)
    runningAccountsApi.getOrdersByCustomer(selectedClient.locationId, selectedClient.id, month).then(setOrders).catch(() => setOrders([])).finally(() => setLoadingOrders(false))
  }, [selectedClient?.locationId, selectedClient?.id, ordersMonth])

  const openRemito = (order: any) => {
    setRemitoOrder(order)
  }

  const handleRemitoDownload = () => {
    if (!remitoOrder || !selectedClient) return
    const html = getRemitoHtml(remitoOrder, selectedClient)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Remito-${remitoOrder?.orderNumber ?? remitoOrder?.id ?? "remito"}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRemitoSentAndClose = async () => {
    if (!remitoOrder) return
    setActioning(remitoOrder.id)
    try {
      await runningAccountsApi.markRemitoSent(remitoOrder.id)
      setRemitoOrder(null)
      if (selectedClient?.locationId) runningAccountsApi.getOrdersByCustomer(selectedClient.locationId, selectedClient.id, ordersMonth || undefined).then(setOrders)
      fetchClients()
    } finally {
      setActioning(null)
    }
  }

  const handleInvoiced = async (orderId: string) => {
    setActioning(orderId)
    try {
      await runningAccountsApi.markInvoiced(orderId)
      if (selectedClient?.locationId) runningAccountsApi.getOrdersByCustomer(selectedClient.locationId, selectedClient.id, ordersMonth || undefined).then(setOrders)
      fetchClients()
    } finally {
      setActioning(null)
    }
  }

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const monthParam = ordersMonth || currentMonth
  const pendingOrRemitoOrders = orders.filter((o: any) => o.cuentaCorrienteStatus === "pending" || o.cuentaCorrienteStatus === "remito_sent")
  const canShareMonth = orders.length > 0
  const canInvoiceMonth = pendingOrRemitoOrders.length > 0

  const handleDownloadMonthRemito = () => {
    if (!selectedClient || orders.length === 0) return
    const html = getRemitoMonthHtml(orders, selectedClient)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Remitos-${selectedClient.name ?? "cliente"}-${monthParam}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleMonthRemitoSent = async () => {
    if (!selectedClient?.locationId || !selectedClient || !monthParam) return
    setMonthBatchAction("remito")
    try {
      const updated = await runningAccountsApi.markMonthRemitoSent(selectedClient.locationId, selectedClient.id, monthParam)
      setOrders(updated)
      setShowMonthRemito(false)
      fetchClients()
    } finally {
      setMonthBatchAction(null)
    }
  }

  const handleMonthInvoiced = async () => {
    if (!selectedClient?.locationId || !selectedClient || !monthParam) return
    setMonthBatchAction("invoiced")
    try {
      const updated = await runningAccountsApi.markMonthInvoiced(selectedClient.locationId, selectedClient.id, monthParam)
      setOrders(updated)
      fetchClients()
    } finally {
      setMonthBatchAction(null)
    }
  }

  const openEditClient = () => {
    if (!selectedClient) return
    setEditingClientId(selectedClient.id)
    setAddClientForm({
      name: selectedClient.name ?? "",
      cuit: formatCuitDisplay(selectedClient.cuit ?? ""),
      email: selectedClient.email ?? "",
      phone: selectedClient.phone ?? "",
      creditLimit: formatCreditLimitDisplay(String(selectedClient.creditLimit ?? "")),
      accountKind: selectedClient.accountKind === "employee" ? "employee" : "client",
    })
    setAddClientError(null)
    setShowAddClient(true)
  }

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddClientError(null)
    const limit = parseCreditLimitDisplay(addClientForm.creditLimit)
    if (!addClientForm.name.trim() || !addClientForm.cuit.trim() || Number.isNaN(limit) || limit <= 0) {
      setAddClientError("Completá nombre, CUIT y límite (número mayor a 0).")
      return
    }
    if (!editingClientId && locationsWithoutDeposito.length === 0) {
      setAddClientError("No hay locales disponibles (excepto depósito).")
      return
    }
    setAddingClient(true)
    const idEdited = editingClientId
    try {
      if (editingClientId) {
        await customersApi.update(editingClientId, {
          name: addClientForm.name.trim(),
          cuit: addClientForm.cuit.trim().replace(/\D/g, ""),
          email: addClientForm.email.trim() || undefined,
          phone: addClientForm.phone.trim() || undefined,
          creditLimit: limit,
          accountKind: addClientForm.accountKind,
        })
      } else {
        const cuitNorm = addClientForm.cuit.trim().replace(/\D/g, "")
        const payload = {
          name: addClientForm.name.trim(),
          cuit: cuitNorm,
          email: addClientForm.email.trim() || undefined,
          phone: addClientForm.phone.trim() || undefined,
          creditLimit: limit,
          accountKind: addClientForm.accountKind,
        }
        const results = await Promise.allSettled(
          locationsWithoutDeposito.map((loc: any) =>
            customersApi.create({ ...payload, locationId: loc.id })
          )
        )
        const failed = results.filter((r) => r.status === "rejected")
        if (failed.length === results.length) {
          const msg = (failed[0] as PromiseRejectedResult)?.reason?.message
          throw new Error(msg ?? "No se pudo crear el cliente en ningún local.")
        }
        if (failed.length > 0) {
          setAddClientError(`Cliente creado en ${results.length - failed.length} local(es). Algunos locales fallaron (ej. CUIT duplicado).`)
        }
      }
      setShowAddClient(false)
      setEditingClientId(null)
      setAddClientForm({
        name: "",
        cuit: "",
        email: "",
        phone: "",
        creditLimit: "",
        accountKind: "client",
      })
      const res = await runningAccountsApi.getClients()
      const newClients = Array.isArray(res) ? res : (res as any)?.data ?? []
      const list = Array.isArray(newClients) ? newClients : []
      setClients(list)
      if (idEdited && selectedClient?.id === idEdited) {
        setSelectedClient(list.find((c: any) => c.id === idEdited) ?? null)
      }
    } catch (err: any) {
      setAddClientError(err?.message ?? (editingClientId ? "Error al actualizar el cliente." : "Error al crear el cliente. ¿CUIT duplicado en algún local?"))
    } finally {
      setAddingClient(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return
    setDeleteError(null)
    setDeletingClient(true)
    try {
      await customersApi.remove(selectedClient.id)
      setSelectedClient(null)
      setShowDeleteConfirm(false)
      fetchClients()
    } catch (err: any) {
      setDeleteError(err?.message ?? "No se pudo eliminar el cliente.")
    } finally {
      setDeletingClient(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <BookOpen className="h-7 w-7 text-amber-600" />
          Cuentas corrientes
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setEditingClientId(null)
              setShowAddClient(true)
              setAddClientError(null)
              setAddClientForm({
                name: "",
                cuit: "",
                email: "",
                phone: "",
                creditLimit: "",
                accountKind: "client",
              })
            }}
            disabled={locationsWithoutDeposito.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            <UserPlus className="h-4 w-4" />
            Agregar cliente
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Clientes con cuenta corriente</h2>
          {!loading && clients.length > 0 && (
            <div className="mb-3">
              <label htmlFor="client-search" className="sr-only">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="client-search"
                  type="text"
                  autoComplete="off"
                  value={clientSearchQuery}
                  onChange={(e) => setClientSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, CUIT, email..."
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
          ) : clients.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">No hay clientes con cuenta corriente. Usá &quot;Agregar cliente&quot; para dar de alta uno; aparecerá también en Mesas al cerrar con Cuenta corriente.</p>
          ) : filteredClients.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">Ningún cliente coincide con la búsqueda.</p>
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {filteredClients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedClient(c)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      selectedClient?.id === c.id ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <span className="truncate font-medium">{c.name}</span>
                      {c.accountKind === "employee" && (
                        <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                          Emp.
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-500">{formatCurrency(c.pendingTotal ?? 0)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {!selectedClient ? (
            <p className="py-8 text-center text-sm text-gray-500">Elegí un cliente para ver el detalle.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedClient.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="mr-2 inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-600 dark:text-gray-100">
                      {accountKindLabel(selectedClient.accountKind)}
                    </span>
                    Límite: {selectedClient.creditLimit != null ? formatCurrency(selectedClient.creditLimit) : "—"} · Pendiente:{" "}
                    {formatCurrency(selectedClient.pendingTotal ?? 0)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditClient}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(true); setDeleteError(null) }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:bg-gray-700 dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                  <label className="text-xs text-gray-500">Mes</label>
                  <input
                    type="month"
                    value={ordersMonth || currentMonth}
                    onChange={(e) => setOrdersMonth(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  {orders.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowMonthRemito(true)}
                        disabled={!canShareMonth || !!monthBatchAction}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 disabled:opacity-50"
                        title="Ver y guardar remitos del mes para compartir"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Compartir remitos del mes
                      </button>
                      <button
                        type="button"
                        onClick={handleMonthInvoiced}
                        disabled={!canInvoiceMonth || !!monthBatchAction}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 disabled:opacity-50"
                        title="Emitir Factura A y marcar facturado todas las órdenes del mes"
                      >
                        {monthBatchAction === "invoiced" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                        Facturar todo el mes
                      </button>
                    </>
                  )}
                </div>
              </div>
              {loadingOrders ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>
              ) : orders.length === 0 ? (
                <p className="py-4 text-sm text-gray-500">No hay órdenes a cuenta en el período.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-3 py-2 dark:bg-gray-700/50">
                        <div className="min-w-0">
                          <span className="text-sm font-medium">Pedido #{order.orderNumber} · {formatDate(order.closedAt)}</span>
                          {order.location?.name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Local: {order.location.name}</p>
                          )}
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(order.total ?? 0)}</span>
                      </div>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {(order.items ?? []).map((item: any) => (
                          <li key={item.id} className="flex justify-between px-3 py-2 text-sm">
                            <span>{item.quantity} × {item.product?.name ?? "—"} {item.notes ? `(${item.notes})` : ""}</span>
                            <span className="tabular-nums text-gray-600 dark:text-gray-400">{formatCurrency((item.unitPrice ?? 0) * (item.quantity ?? 1))}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50/50 px-3 py-2 dark:border-gray-600 dark:bg-gray-800/50">
                        {order.cuentaCorrienteStatus === "pending" && (
                          <button
                            type="button"
                            onClick={() => openRemito(order)}
                            disabled={!!actioning}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
                          >
                            <Send className="h-3 w-3" />
                            Enviar remito
                          </button>
                        )}
                        {(order.cuentaCorrienteStatus === "pending" || order.cuentaCorrienteStatus === "remito_sent") && (
                          <button
                            type="button"
                            onClick={() => handleInvoiced(order.id)}
                            disabled={!!actioning}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200"
                          >
                            {actioning === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            Marcar facturado/pagado
                          </button>
                        )}
                        {order.cuentaCorrienteStatus === "invoiced" && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Facturado / Pagado</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal Compartir remitos del mes */}
      {showMonthRemito && selectedClient && orders.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !monthBatchAction && setShowMonthRemito(false)}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Remitos del mes · {monthParam}</h3>
              <button type="button" onClick={() => !monthBatchAction && setShowMonthRemito(false)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                {selectedClient.name} · {orders.length} pedido(s). Total: {formatCurrency(orders.reduce((s: number, o: any) => s + (o.total ?? 0), 0))}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Guardá el archivo para compartir con el cliente. Opcionalmente marcá todos como &quot;remito enviado&quot;.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-200 p-4 dark:border-gray-600">
              <button type="button" onClick={handleDownloadMonthRemito} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                <Download className="h-4 w-4" />
                Guardar (HTML)
              </button>
              {pendingOrRemitoOrders.length > 0 && (
                <button type="button" onClick={handleMonthRemitoSent} disabled={!!monthBatchAction} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                  {monthBatchAction === "remito" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Marcar todos como remito enviado y cerrar
                </button>
              )}
              <button type="button" onClick={() => setShowMonthRemito(false)} disabled={!!monthBatchAction} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar cliente */}
      {showAddClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !addingClient && (setShowAddClient(false), setEditingClientId(null))}>
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingClientId ? "Editar cliente" : "Nuevo cliente (cuenta corriente)"}</h3>
              <button type="button" onClick={() => !addingClient && (setShowAddClient(false), setEditingClientId(null))} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            {!editingClientId && <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">El cliente se guardará en todos los locales (excepto depósito) y podrá aparecer en Mesas al cerrar con &quot;Cuenta corriente&quot;.</p>}
            <form onSubmit={handleAddClient} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo *</label>
                <select
                  value={addClientForm.accountKind}
                  onChange={(e) =>
                    setAddClientForm((f) => ({
                      ...f,
                      accountKind: e.target.value as "client" | "employee",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  aria-label="Cliente o empleado"
                >
                  {ACCOUNT_KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre / Razón social *</label>
                <input
                  type="text"
                  value={addClientForm.name}
                  onChange={(e) => setAddClientForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Juan Pérez o razón social"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">CUIT *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={addClientForm.cuit}
                  onChange={(e) => setAddClientForm((f) => ({ ...f, cuit: formatCuitDisplay(e.target.value) }))}
                  placeholder="20-12345678-9"
                  maxLength={13}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Límite cuenta corriente ($) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={addClientForm.creditLimit}
                  onChange={(e) => setAddClientForm((f) => ({ ...f, creditLimit: formatCreditLimitDisplay(e.target.value) }))}
                  placeholder="Ej. 50.000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input
                  type="email"
                  value={addClientForm.email}
                  onChange={(e) => setAddClientForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="opcional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Teléfono</label>
                <input
                  type="text"
                  value={addClientForm.phone}
                  onChange={(e) => setAddClientForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="opcional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              {addClientError && <p className="text-sm text-red-600 dark:text-red-400">{addClientError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowAddClient(false); setEditingClientId(null) }} disabled={addingClient} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                  Cancelar
                </button>
                <button type="submit" disabled={addingClient} className="flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {addingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {addingClient ? "Guardando…" : editingClientId ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Remito: ver, imprimir, guardar */}
      {remitoOrder && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRemitoOrder(null)}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Remito · {remitoOrder.orderNumber ?? "Pedido"}</h3>
              <button type="button" onClick={() => setRemitoOrder(null)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-600 dark:bg-gray-700/30">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedClient.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">CUIT {formatCuitDisplay(selectedClient.cuit ?? "")}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{remitoOrder.orderNumber} · {formatDate(remitoOrder.closedAt)}</p>
                <ul className="mt-3 space-y-1 border-t border-gray-200 pt-3 dark:border-gray-600">
                  {(remitoOrder.items ?? []).map((item: any) => (
                    <li key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantity} × {item.product?.name ?? "—"} {item.notes ? `(${item.notes})` : ""}</span>
                      <span className="tabular-nums text-gray-600 dark:text-gray-400">{formatCurrency((item.unitPrice ?? 0) * (item.quantity ?? 1))}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-semibold tabular-nums">Total: {formatCurrency(remitoOrder.total ?? 0)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-200 p-4 dark:border-gray-600">
              <button type="button" onClick={handleRemitoDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                <Download className="h-4 w-4" />
                Guardar (HTML)
              </button>
              <button type="button" onClick={handleRemitoSentAndClose} disabled={!!actioning} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {actioning === remitoOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {actioning === remitoOrder.id ? "Guardando…" : "Marcar remito enviado y cerrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar cliente */}
      {showDeleteConfirm && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !deletingClient && setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Eliminar cliente</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              ¿Eliminar a <strong>{selectedClient.name}</strong>? Dejará de aparecer en cuenta corriente; las órdenes ya cargadas no se borran.
            </p>
            {deleteError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deletingClient} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button type="button" onClick={handleDeleteClient} disabled={deletingClient} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {deletingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deletingClient ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
