"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Banknote, UtensilsCrossed, ChefHat, Coffee, Warehouse, MapPin } from "lucide-react"
import { setStoredPosCoords, getStoredPosCoords } from "@/lib/api/auth"
import {
  getPosGeolocationPosition,
  geolocationErrorMessage,
} from "@/lib/pos-geolocation"

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false
  const h = window.location.hostname
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]"
}

export default function PosStationSelectorPage() {
  const [locationStatus, setLocationStatus] = useState<"idle" | "asking" | "granted" | "denied" | "error">("idle")
  const [locationError, setLocationError] = useState("")

  useEffect(() => {
    if (getStoredPosCoords()) setLocationStatus("granted")
  }, [])

  const requestLocation = useCallback(() => {
    setLocationError("")
    setLocationStatus("asking")
    getPosGeolocationPosition()
      .then((pos) => {
        setStoredPosCoords(pos.coords.latitude, pos.coords.longitude)
        setLocationStatus("granted")
      })
      .catch((err: unknown) => {
        if (err instanceof Object && "code" in err && (err as GeolocationPositionError).code === 1) {
          setLocationStatus("denied")
          setLocationError(geolocationErrorMessage(err as GeolocationPositionError))
          return
        }
        if (
          err instanceof Object &&
          "code" in err &&
          typeof (err as GeolocationPositionError).code === "number"
        ) {
          setLocationStatus("error")
          setLocationError(geolocationErrorMessage(err as GeolocationPositionError))
          return
        }
        setLocationStatus("error")
        setLocationError(err instanceof Error ? err.message : "No se pudo obtener la ubicación.")
      })
  }, [])

  const skipGeoDev = useCallback(() => {
    const lat = Number(process.env.NEXT_PUBLIC_POS_DEV_LAT ?? "-34.6037")
    const lng = Number(process.env.NEXT_PUBLIC_POS_DEV_LNG ?? "-58.3816")
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setStoredPosCoords(lat, lng)
    setLocationError("")
    setLocationStatus("granted")
  }, [])

  const [showLocalDevSkip, setShowLocalDevSkip] = useState(false)
  useEffect(() => {
    setShowLocalDevSkip(isLocalDevHost())
  }, [])

  const showOverlay = locationStatus !== "granted" && locationStatus !== "denied"

  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/40 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:px-4">
      {/* Overlay: pedir ubicación al entrar a /pos */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-200/60">
                <MapPin className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-center text-lg font-semibold text-gray-800">
              Ubicación necesaria
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Para ingresar como Cajero, Mozo, Cocina, Cafetería o Depósito necesitamos tu ubicación.
            </p>
            {(locationError || locationStatus === "error") && (
              <p className="mt-2 text-center text-sm text-red-600">{locationError}</p>
            )}
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={requestLocation}
                disabled={locationStatus === "asking"}
                className="w-full rounded-xl bg-blue-500 px-4 py-3 font-medium text-white transition active:scale-[0.99] disabled:opacity-70 hover:bg-blue-600"
              >
                {locationStatus === "asking" ? "Obteniendo ubicación…" : "Permitir ubicación"}
              </button>
              {showLocalDevSkip && (
                <button
                  type="button"
                  onClick={skipGeoDev}
                  disabled={locationStatus === "asking"}
                  className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                >
                  Desarrollo: continuar sin GPS (usa coordenadas de prueba)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {locationStatus === "denied" && !showOverlay && (
        <div className="fixed left-0 right-0 top-0 z-40 border-b border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm text-blue-900">
          Sin ubicación no podrás iniciar sesión en Cajero, Mozo, Cocina, Cafetería ni Depósito.{" "}
          <button type="button" onClick={requestLocation} className="underline font-medium">
            Permitir ubicación
          </button>
        </div>
      )}

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200/60 bg-white px-4 py-8 shadow-xl sm:px-8 sm:py-10">
          <div className="mb-6 text-center sm:mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-200/60 sm:h-16 sm:w-16">
              <span className="text-2xl font-black text-white sm:text-3xl">N</span>
            </div>
            <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">Elige tu estación</h1>
            <p className="mt-2 text-sm text-gray-500">Inicia sesión en el link de tu rol</p>
          </div>
          <div className="space-y-2 sm:space-y-3">
            <Link
              href="/cajero"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-blue-300 hover:bg-blue-50/80 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
                <Banknote className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cajero</p>
                <p className="text-sm text-gray-500">Mesas y Caja</p>
              </div>
            </Link>
            <Link
              href="/mozo"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-blue-300 hover:bg-blue-50/80 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
                <UtensilsCrossed className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Mozo</p>
                <p className="text-sm text-gray-500">Mesas</p>
              </div>
            </Link>
            <Link
              href="/kitchen"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-blue-300 hover:bg-blue-50/80 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
                <ChefHat className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cocina</p>
                <p className="text-sm text-gray-500">Pantalla de cocina y despacho</p>
              </div>
            </Link>
            <Link
              href="/cafeteria"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-blue-300 hover:bg-blue-50/80 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
                <Coffee className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cafetería</p>
                <p className="text-sm text-gray-500">Pantalla de cafetería</p>
              </div>
            </Link>
            <Link
              href="/deposito"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-blue-300 hover:bg-blue-50/80 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
                <Warehouse className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Depósito</p>
                <p className="text-sm text-gray-500">Mesas y comandas</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
