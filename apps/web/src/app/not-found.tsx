import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <h1 className="text-4xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-gray-600">Página no encontrada</p>
      <Link
        href="/pos"
        className="mt-6 rounded-lg bg-amber-500 px-6 py-3 font-medium text-white hover:bg-amber-600"
      >
        Ir a Nova (Elegir estación)
      </Link>
    </div>
  )
}
