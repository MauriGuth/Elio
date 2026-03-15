import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SileoToaster } from '@/components/sileo-toaster'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Nova - Sistema de Gestión',
  description: 'Sistema de gestión integral para operaciones, inventario y punto de venta',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

const themeScript = `
(function() {
  var path = typeof window !== 'undefined' ? window.location.pathname : '';
  var search = typeof window !== 'undefined' ? window.location.search : '';
  var isCajeroMozo = path === '/cajero' || path === '/mozo' || (path.startsWith('/pos') && (search.indexOf('station=cajero') !== -1 || search.indexOf('station=mozo') !== -1));
  var root = document.documentElement;
  function setDark(dark) {
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }
  if (isCajeroMozo) {
    setDark(false);
  } else {
    var theme = typeof localStorage !== 'undefined' && localStorage.getItem('elio_preferencias_tema');
    if (theme === 'dark') setDark(true);
    else if (theme === 'light') setDark(false);
    else {
      var m = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)');
      setDark(m && m.matches);
    }
  }
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SileoToaster />
        {children}
      </body>
    </html>
  )
}
