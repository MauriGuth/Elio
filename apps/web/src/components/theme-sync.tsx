"use client"

import { useEffect } from "react"

const PREF_THEME = "nova_preferencias_tema"

function applyStoredTheme() {
  if (typeof window === "undefined") return
  const theme = localStorage.getItem(PREF_THEME)
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else if (theme === "light") {
    root.classList.remove("dark")
  } else {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", dark)
  }
}

/** Sincroniza el tema cuando cambia la preferencia del sistema (modo "Sistema") o cuando se cambia en otra pestaña. */
export function ThemeSync() {
  useEffect(() => {
    applyStoredTheme()
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystemChange = () => {
      if (localStorage.getItem(PREF_THEME) === "system") applyStoredTheme()
    }
    media.addEventListener("change", onSystemChange)
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREF_THEME) applyStoredTheme()
    }
    window.addEventListener("storage", onStorage)
    return () => {
      media.removeEventListener("change", onSystemChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  return null
}
