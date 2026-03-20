/**
 * Urgencia en tableros cocina/cafetería: según tiempo de elaboración por producto
 * (viene del API: prepTimeMinutes desde receta + ubicación del pedido).
 */

export type KdsBoardConfig = {
  allowedSectors: string[]
  sectorFilter: string
  /** Ítems con skipComanda no cuentan para colas ni urgencia */
  excludeSkipComanda?: boolean
}

/** Si no hay dato de receta: cola 10 min, en preparación 30 min (comportamiento histórico). */
export const FALLBACK_PREP_PENDING_MIN = 10
export const FALLBACK_PREP_IN_PROGRESS_MIN = 30

export function kdsMinutesAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000)
}

export function prepLimitMinutes(
  item: { prepTimeMinutes?: number | null },
  phase: "pending" | "in_progress"
): number {
  const p = item?.prepTimeMinutes
  if (typeof p === "number" && p > 0 && Number.isFinite(p)) {
    return Math.round(p)
  }
  return phase === "in_progress"
    ? FALLBACK_PREP_IN_PROGRESS_MIN
    : FALLBACK_PREP_PENDING_MIN
}

export function kdsVisibleItems(order: any, cfg: KdsBoardConfig): any[] {
  const skip = cfg.excludeSkipComanda !== false
  return (order.items ?? []).filter((i: any) => {
    if (skip && i.skipComanda) return false
    if (!cfg.allowedSectors.includes(i.sector)) return false
    if (cfg.sectorFilter !== "all" && i.sector !== cfg.sectorFilter) {
      return false
    }
    return true
  })
}

/** Hay ítem pendiente o en curso que superó su tiempo objetivo de elaboración */
export function orderIsUrgent(order: any, cfg: KdsBoardConfig): boolean {
  return kdsVisibleItems(order, cfg).some((i: any) => {
    if (i.status === "pending") {
      return kdsMinutesAgo(i.createdAt) >= prepLimitMinutes(i, "pending")
    }
    if (i.status === "in_progress" && i.startedAt) {
      return kdsMinutesAgo(i.startedAt) >= prepLimitMinutes(i, "in_progress")
    }
    return false
  })
}

export function orderHasPendingOnBoard(order: any, cfg: KdsBoardConfig): boolean {
  return kdsVisibleItems(order, cfg).some((i: any) => i.status === "pending")
}

export function orderHasInProgressOnBoard(order: any, cfg: KdsBoardConfig): boolean {
  return kdsVisibleItems(order, cfg).some((i: any) => i.status === "in_progress")
}

/** Minutos transcurridos del ítem más atrasado entre los que dispararon urgencia (para voz). */
export function urgentLeadMinutesForVoice(order: any, cfg: KdsBoardConfig): number {
  let max = 0
  for (const i of kdsVisibleItems(order, cfg)) {
    if (
      i.status === "pending" &&
      kdsMinutesAgo(i.createdAt) >= prepLimitMinutes(i, "pending")
    ) {
      max = Math.max(max, kdsMinutesAgo(i.createdAt))
    }
    if (
      i.status === "in_progress" &&
      i.startedAt &&
      kdsMinutesAgo(i.startedAt) >= prepLimitMinutes(i, "in_progress")
    ) {
      max = Math.max(max, kdsMinutesAgo(i.startedAt))
    }
  }
  if (max > 0) return max
  return kdsMinutesAgo(order.openedAt)
}
