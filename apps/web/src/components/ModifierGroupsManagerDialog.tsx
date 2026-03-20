"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { ChevronDown, Eye, Loader2, X } from "lucide-react"
import { ModifierGroupsPanel } from "@/components/ModifierGroupsPanel"

type Props = {
  productId: string | null
  disabled?: boolean
  /** Al cerrar el modal (tras gestionar grupos), p. ej. recargar modificadores en la receta */
  onAfterChange?: () => void
}

/**
 * Botón “Ver variantes” que abre el gestor de modificadores de carta
 * (antes en Stock → producto). Solo usar cuando hay producto de salida vendible.
 */
export function ModifierGroupsManagerDialog({ productId, disabled, onAfterChange }: Props) {
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) onAfterChange?.()
      }}
    >
      <Dialog.Trigger asChild disabled={disabled || !productId}>
        <button
          type="button"
          aria-label="Ver variantes del menú"
          className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-600 dark:border-amber-500 bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          Ver variantes
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[201] max-h-[min(90vh,720px)] w-[min(calc(100vw-1.5rem),28rem)] translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-600">
            <Dialog.Title className="pr-6 text-base font-semibold leading-tight text-gray-900 dark:text-white">
              Modificadores de carta (opciones en el POS)
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Gestioná grupos de opciones del menú, precios y opciones para el punto de venta.
          </Dialog.Description>
          {productId ? (
            <ModifierGroupsPanel
              productId={productId}
              readOnly={false}
              embedded
              showRecipesLink={false}
            />
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
