/**
 * Geolocalización para POS: en PC/localhost el GPS suele fallar (POSITION_UNAVAILABLE)
 * aunque el permiso esté OK. Primero pedimos red/Wi‑Fi (enableHighAccuracy: false).
 */
export function getPosGeolocationPosition(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Tu navegador no soporta ubicación."))
  }

  const read = (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options)
    })

  return read({
    enableHighAccuracy: false,
    timeout: 28000,
    maximumAge: 300000,
  }).catch((first: GeolocationPositionError) => {
    if (first.code === 1) {
      return Promise.reject(first)
    }
    return read({
      enableHighAccuracy: true,
      timeout: 22000,
      maximumAge: 0,
    })
  })
}

export function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === 1) {
    return "Tenés que permitir la ubicación en el navegador (ícono de candado o permisos del sitio)."
  }
  if (err.code === 3) {
    return "Se acabó el tiempo. Probá de nuevo; en PC suele funcionar mejor con Wi‑Fi encendido."
  }
  return "No se pudo fijar la posición. En escritorio probá con Wi‑Fi, o desactivá «ubicación precisa» y reintentá."
}
