"use client"

import { useEffect } from "react"

const PREF_THEME = "nova_preferencias_tema"

function forceLight() {
  if (typeof document === "undefined") return
  document.documentElement.classList.remove("dark")
}

/**
 * Fuerza modo claro en la página: quita la clase "dark" del documento
 * y evita que se aplique modo oscuro aunque la preferencia global sea oscuro.
 * Usado en rutas que deben ser solo modo claro (cajero, mozo).
 */
export function ForceLightMode() {
  useEffect(() => {
    forceLight()
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREF_THEME) forceLight()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return null
}
