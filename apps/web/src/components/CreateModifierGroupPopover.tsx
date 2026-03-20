"use client"

import * as Popover from "@radix-ui/react-popover"
import { ChevronDown, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export type CreateModifierGroupPayload = {
  name: string
  required: boolean
  maxSelect: number
}

type Props = {
  disabled?: boolean
  onCreate: (payload: CreateModifierGroupPayload) => Promise<void>
  variant?: "blue" | "amber"
  align?: "start" | "end"
  /** Tamaño del trigger (recetas = sm, stock = md) */
  triggerSize?: "sm" | "md"
  className?: string
}

export function CreateModifierGroupPopover({
  disabled,
  onCreate,
  variant = "blue",
  align = "end",
  triggerSize = "md",
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [required, setRequired] = useState(false)
  const [maxSelect, setMaxSelect] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName("")
    setRequired(false)
    setMaxSelect(1)
  }

  const handleSubmit = async () => {
    const n = name.trim()
    if (!n) return
    setSubmitting(true)
    try {
      await onCreate({
        name: n,
        required,
        maxSelect: Math.max(1, maxSelect),
      })
      reset()
      setOpen(false)
    } catch {
      // El padre muestra toast; no cerramos si falla
    } finally {
      setSubmitting(false)
    }
  }

  const triggerClass =
    variant === "amber"
      ? cn(
          "inline-flex shrink-0 items-center gap-1 rounded border border-amber-600 dark:border-amber-500 bg-amber-600/90 font-medium text-white hover:bg-amber-700 disabled:opacity-50",
          triggerSize === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm",
        )
      : cn(
          "inline-flex items-center gap-1 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-50",
          triggerSize === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm",
        )

  const confirmClass =
    variant === "amber"
      ? "w-full rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      : "w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <Popover.Trigger asChild disabled={disabled || submitting}>
        <button type="button" className={cn(triggerClass, className)}>
          {submitting ? (
            <Loader2 className={cn("animate-spin", triggerSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          ) : (
            <Plus className={cn(triggerSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
          )}
          Crear grupo
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[3000] w-[min(calc(100vw-2rem),20rem)] rounded-lg border border-gray-200 bg-white p-4 shadow-lg outline-none dark:border-gray-600 dark:bg-gray-800"
          sideOffset={8}
          align={align}
          collisionPadding={16}
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Nuevo grupo
          </p>
          <div className="space-y-3">
            <input
              placeholder="Ej. Tipo de pan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Obligatorio
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              Max opciones
              <input
                type="number"
                min={1}
                value={maxSelect}
                onChange={(e) =>
                  setMaxSelect(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-16 rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
              />
            </label>
            <button
              type="button"
              disabled={submitting || !name.trim()}
              onClick={() => void handleSubmit()}
              className={confirmClass}
            >
              {submitting ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Confirmar"
              )}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
