import { getApiUrl } from "@/lib/api"

/** Misma clave en `/kitchen/display` y `/pos/kitchen` para que el equipo quede alineado. */
export function kitchenEquipoStorageKey(locationId: string): string {
  const suffix = getApiUrl()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
  return `elio_kitchen_equipo_${locationId}__${suffix}`
}

export function loadKitchenEquipoIds(locationId: string): string[] {
  if (typeof window === "undefined" || !locationId) return []
  try {
    const raw = localStorage.getItem(kitchenEquipoStorageKey(locationId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : []
  } catch {
    return []
  }
}

export function saveKitchenEquipoIds(locationId: string, ids: string[]) {
  if (typeof window === "undefined" || !locationId) return
  localStorage.setItem(kitchenEquipoStorageKey(locationId), JSON.stringify(ids))
}
