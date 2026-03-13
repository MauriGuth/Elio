"use client"

import Link from "next/link"
import { Banknote, UtensilsCrossed, ChefHat, Coffee, Warehouse } from "lucide-react"

export default function PosStationSelectorPage() {
  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-amber-100 bg-white px-4 py-8 shadow-xl sm:px-8 sm:py-10">
          <div className="mb-6 text-center sm:mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 shadow-lg sm:h-16 sm:w-16">
              <span className="text-2xl font-black text-white sm:text-3xl">N</span>
            </div>
            <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">Elige tu estación</h1>
            <p className="mt-2 text-sm text-gray-500">Inicia sesión en el link de tu rol</p>
          </div>
          <div className="space-y-2 sm:space-y-3">
            <Link
              href="/cajero"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
                <Banknote className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cajero</p>
                <p className="text-sm text-gray-500">Mesas y Caja</p>
              </div>
            </Link>
            <Link
              href="/mozo"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
                <UtensilsCrossed className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Mozo</p>
                <p className="text-sm text-gray-500">Mesas</p>
              </div>
            </Link>
            <Link
              href="/kitchen"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
                <ChefHat className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cocina</p>
                <p className="text-sm text-gray-500">Pantalla de cocina</p>
              </div>
            </Link>
            <Link
              href="/cafeteria"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
                <Coffee className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">Cafetería</p>
                <p className="text-sm text-gray-500">Pantalla de cafetería</p>
              </div>
            </Link>
            <Link
              href="/deposito"
              className="flex w-full min-h-[52px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left transition-colors active:scale-[0.99] hover:border-amber-300 hover:bg-amber-50 sm:gap-4 sm:px-5 sm:py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
                <Warehouse className="h-5 w-5 text-amber-600" />
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
