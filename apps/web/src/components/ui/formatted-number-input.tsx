"use client"

import { useRef, useEffect, useCallback } from "react"
import { formatNumberInputDisplay, parseNumberInputInput } from "@/lib/utils"
import { cn } from "@/lib/utils"

type FormattedNumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number
  onChange: (value: number) => void
}

/**
 * Input numérico que muestra el valor con punto como separador de miles cuando supera 1000
 * (ej: 1500 → "1.500"). El valor interno sigue siendo un número.
 */
export function FormattedNumberInput({
  value,
  onChange,
  className,
  ...rest
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorRef = useRef<number | null>(null)

  const displayValue = formatNumberInputDisplay(value)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = parseNumberInputInput(e.target.value)
      onChange(n)
      cursorRef.current = e.target.selectionStart
    },
    [onChange]
  )

  useEffect(() => {
    if (cursorRef.current == null || !inputRef.current) return
    const len = inputRef.current.value.length
    inputRef.current.setSelectionRange(len, len)
    cursorRef.current = null
  }, [displayValue])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={displayValue}
      onChange={handleChange}
      className={cn(className)}
      {...rest}
    />
  )
}
