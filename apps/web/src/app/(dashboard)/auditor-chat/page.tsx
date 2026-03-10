'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Send,
  Bot,
  User,
  Loader2,
  MessageSquarePlus,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  auditorChatApi,
  type AuditorConversationListItem,
  type AuditorMessageRecord,
} from '@/lib/api/auditor-chat';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';

const WELCOME_TEXT =
  'Soy un auditor interno. Puedo responder consultas sobre locales, depósito, stock, facturación, tiempos de despacho, producción y operación general de la empresa. Escribí tu pregunta o elegí una conversación anterior.';

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white', className)}>
        {value}
      </p>
    </div>
  );
}

export default function AuditorChatPage() {
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get('c');

  const [conversations, setConversations] = useState<AuditorConversationListItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(conversationIdFromUrl);
  const [messages, setMessages] = useState<AuditorMessageRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingSend, setLoadingSend] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricsData, setMetricsData] = useState<{
    summary: Record<string, number | string>;
    charts: Array<{
      id: string;
      type: 'bar' | 'line' | 'pie';
      title: string;
      dataKey?: string;
      data: Array<Record<string, unknown>>;
    }>;
  } | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setConversationInUrl = useCallback(
    (id: string | null) => {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('c', id);
      else url.searchParams.delete('c');
      window.history.replaceState({}, '', url.pathname + url.search);
    },
    [],
  );

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const list = await auditorChatApi.getConversations();
      setConversations(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar conversaciones');
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadConversationMessages = useCallback(
    async (id: string) => {
      setLoadingMessages(true);
      setError(null);
      try {
        if (typeof window !== 'undefined') sessionStorage.setItem('auditor_chat_last', id);
        const conv = await auditorChatApi.getConversation(id);
        setMessages(conv.messages || []);
        setCurrentId(id);
        setConversationInUrl(id);
      } catch (e: any) {
        setError(e?.message || 'Error al cargar la conversación');
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [setConversationInUrl],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (conversationIdFromUrl && conversationIdFromUrl !== currentId) {
      setCurrentId(conversationIdFromUrl);
    }
  }, [conversationIdFromUrl]);

  useEffect(() => {
    if (currentId || conversationIdFromUrl) return;
    const last = typeof window !== 'undefined' ? sessionStorage.getItem('auditor_chat_last') : null;
    if (last) setCurrentId(last);
  }, []);

  useEffect(() => {
    if (currentId) {
      loadConversationMessages(currentId);
    } else {
      setMessages([]);
    }
  }, [currentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleNewConversation = async () => {
    setError(null);
    try {
      const created = await auditorChatApi.createConversation();
      if (typeof window !== 'undefined') sessionStorage.setItem('auditor_chat_last', created.id);
      setConversations((prev) => [created, ...prev]);
      setCurrentId(created.id);
      setConversationInUrl(created.id);
      setMessages([]);
    } catch (e: any) {
      setError(e?.message || 'Error al crear conversación');
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentId(id);
    setConversationInUrl(id);
    setSidebarOpen(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loadingSend) return;

    let convId = currentId;
    if (!convId) {
      try {
        const created = await auditorChatApi.createConversation();
        setConversations((prev) => [created, ...prev]);
        convId = created.id;
        setCurrentId(convId);
        setConversationInUrl(convId);
        setMessages([]);
      } catch (e: any) {
        setError(e?.message || 'Error al crear conversación');
        return;
      }
    }

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { id: '', role: 'user', content: text, createdAt: new Date().toISOString() }]);
    setLoadingSend(true);
    try {
      const { userMessage, assistantMessage } = await auditorChatApi.sendMessage(convId, text);
      setMessages((prev) => prev.slice(0, -1).concat(userMessage, assistantMessage));
      await loadConversations();
      const pideGraficosOMetricas =
        /(gráfico|gráficos|métricas?|resumen\s+(de\s+)?(ventas|cierres|datos)?|estadística|ventas\s+(por|del|en)|cierres?(\s+de\s+caja)?|facturación|facturacion|cómo\s+están\s+(las\s+)?ventas|como\s+estan\s+(las\s+)?ventas|stock\s+(por|del|actual)|despachos\s+(por|del)|producción\s+(por|del)|por\s+local|por\s+día|por\s+dia|ver\s+(las\s+)?métricas|quiero\s+ver\s+(las\s+)?(métricas|gráficos))/i.test(text) &&
        !/(receta|recetas|ingrediente|ingredientes|proveedor|proveedores|lista\s+de\s+(recetas|productos))/i.test(text);
      if (pideGraficosOMetricas) {
        loadMetrics();
        setMetricsOpen(true);
      }
    } catch (e: any) {
      setError(e?.message || 'Error al enviar. Revisá la conexión e intentá de nuevo.');
      setMessages((prev) => prev.filter((m) => m.id || m.content !== text));
    } finally {
      setLoadingSend(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await auditorChatApi.getMetrics();
      setMetricsData(data);
    } catch {
      setMetricsData(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const showWelcome = !currentId && messages.length === 0 && !loadingMessages;
  const canSend = currentId || input.trim();

  return (
    <div className="relative flex h-[calc(100vh-7rem)] min-h-[400px] rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
      {/* Sidebar: lista de conversaciones (plegable con animación) */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 overflow-hidden min-h-0',
          'transition-[width] duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-12',
          'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-xl max-md:!w-64',
          !sidebarOpen && 'max-md:hidden'
        )}
      >
        {/* Vista colapsada: solo iconos */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-12 flex flex-col items-center py-2 gap-1 min-h-0 transition-opacity duration-300',
            sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0"
            aria-label="Desplegar menú"
            title="Desplegar menú"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={loadingList}
            className="p-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-1 w-full px-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectConversation(c.id)}
                title={c.title}
                className={cn(
                  'w-full p-2 rounded-xl shrink-0 transition-colors',
                  currentId === c.id
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
                aria-label={c.title}
              >
                <MessageCircle className="w-4 h-4 mx-auto" />
              </button>
            ))}
          </div>
        </div>

        {/* Vista expandida: títulos y lista completa */}
        <div
          className={cn(
            'flex flex-col w-64 shrink-0 min-h-0 min-w-64 transition-opacity duration-300 delay-75',
            sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Conversaciones</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors"
              aria-label="Plegar conversaciones"
              title="Plegar para ampliar el chat"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={loadingList}
            className="m-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Nueva conversación</span>
          </button>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingList ? (
              <div className="p-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <ul className="p-2 space-y-0.5">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl text-sm truncate flex items-center gap-2 transition-colors',
                        currentId === c.id
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      )}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* En móvil: drawer expandido, fixed para quedar pegado al borde izquierdo sin franja */}
      {sidebarOpen && (
        <aside
          className={cn(
            'md:hidden flex flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
            'fixed top-14 sm:top-16 left-0 bottom-0 z-20 shadow-xl animate-in slide-in-from-left-3 duration-200'
          )}
        >
          <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Conversaciones</span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              aria-label="Cerrar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={loadingList}
            className="m-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            <MessageSquarePlus className="w-4 h-4 shrink-0" />
            Nueva conversación
          </button>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="p-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <ul className="p-2 space-y-0.5">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl text-sm truncate flex items-center gap-2',
                        currentId === c.id
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      )}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="min-w-0 truncate">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {/* Área principal: mensajes o métricas */}
      <div className="flex-1 flex flex-col min-w-0">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden absolute top-2 left-2 z-10 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow"
            aria-label="Abrir conversaciones"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        )}

        {metricsOpen ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Métricas y resumen</h2>
              <button
                type="button"
                onClick={() => setMetricsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                aria-label="Cerrar métricas"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {metricsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : metricsData ? (
              <div className="space-y-6 max-w-4xl">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <MetricCard label="Locales" value={metricsData.summary.totalLocales} />
                  <MetricCard label="Ventas (7 días)" value={formatCurrency(Number(metricsData.summary.ventasUltimos7Dias))} />
                  <MetricCard label="Cierres (14 días)" value={metricsData.summary.cierresUltimos14Dias} />
                  <MetricCard label="Ventas caja (14 días)" value={formatCurrency(Number(metricsData.summary.ventasCajaUltimos14Dias))} />
                  <MetricCard label="Productos con stock" value={metricsData.summary.productosConStock} />
                  <MetricCard label="Stock crítico" value={metricsData.summary.productosCriticos} className="text-red-600 dark:text-red-400" />
                  <MetricCard label="Alertas activas" value={metricsData.summary.alertasActivas} />
                  <MetricCard label="Órdenes producción (7 d)" value={metricsData.summary.ordenesProduccionUltimos7Dias} />
                  <MetricCard label="Despachos (14 d)" value={metricsData.summary.despachosUltimos14Dias} />
                  <MetricCard label="Mermas (14 d)" value={metricsData.summary.registrosMermaUltimos14Dias} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {metricsData.charts.map((chart) => (
                    <div
                      key={chart.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
                    >
                      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{chart.title}</h3>
                      <div className="h-56">
                        {chart.type === 'bar' && (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chart.data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-600" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))} />
                              <Tooltip formatter={(v: number | undefined) => (v != null ? (chart.dataKey === 'ventas' ? formatCurrency(v) : formatNumber(v)) : '')} />
                              <Bar dataKey={chart.dataKey ?? 'value'} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                        {chart.type === 'line' && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chart.data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-600" />
                              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))} />
                              <Tooltip formatter={(v: number | undefined) => (v != null ? (chart.dataKey === 'ventas' ? formatCurrency(v) : formatNumber(v)) : '')} />
                              <Line type="monotone" dataKey={chart.dataKey ?? 'value'} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                        {chart.type === 'pie' && (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chart.data}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={({ name, value }) => `${name}: ${value}`}
                              >
                                {(chart.data as Array<{ fill?: string }>).map((entry, i) => (
                                  <Cell key={i} fill={entry.fill ?? '#94a3b8'} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No se pudieron cargar las métricas.</p>
            )}
          </div>
        ) : (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 pb-24"
        >
          {loadingMessages ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : showWelcome ? (
            <div className="max-w-2xl mx-auto text-center py-12 text-slate-500 dark:text-slate-400">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-60" />
              <p className="whitespace-pre-wrap">{WELCOME_TEXT}</p>
              <p className="mt-4 text-sm">Creá una nueva conversación o elegí una de la lista.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id || msg.createdAt + msg.content.slice(0, 20)}
                className={cn(
                  'flex gap-3 max-w-3xl',
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                )}
              >
                <div
                  className={cn(
                    'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  )}
                >
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={cn(
                    'rounded-xl px-4 py-2.5 text-sm shadow-sm',
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                </div>
              </div>
            ))
          )}
          {loadingSend && (
            <div className="flex gap-3 max-w-3xl">
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-slate-600 dark:text-slate-300" />
              </div>
              <div className="rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400 text-sm">Pensando...</span>
              </div>
            </div>
          )}
        </div>
        )}
        {error && (
          <div className="px-4 pb-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        <div className="sticky bottom-0 left-0 right-0 p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu consulta sobre locales, stock, facturación, despachos, producción..."
              className="flex-1 min-h-[44px] max-h-32 resize-y rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              disabled={loadingSend}
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend || loadingSend}
              className="shrink-0 h-11 w-11 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingSend ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
