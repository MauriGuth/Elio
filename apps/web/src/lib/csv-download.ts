/** CSV con separador `;` y BOM UTF-8 para Excel en español. */

export function escapeCsvField(s: string | number | boolean | null | undefined): string {
  const v = s == null ? "" : String(s)
  if (/[",\n\r;]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean)[][]): void {
  const bom = "\uFEFF"
  const head = headers.map((h) => escapeCsvField(h)).join(";")
  const body = rows.map((r) => r.map((c) => escapeCsvField(c)).join(";")).join("\r\n")
  const blob = new Blob([bom + head + "\r\n" + body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
