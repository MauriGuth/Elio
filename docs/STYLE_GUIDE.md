# ELIO — Guía de Estilo Visual y Componentes UI

## Inspiración: Posberry + Estética Moderna SaaS Empresarial

---

## 1. Filosofía de Diseño

### Principios

| Principio | Descripción | Implementación |
|---|---|---|
| **Claridad** | La información se entiende en 3 segundos | Jerarquía tipográfica clara, KPIs prominentes |
| **Eficiencia** | Mínimos clicks para cada tarea | Atajos, acciones rápidas, flujos directos |
| **Consistencia** | Mismos patrones en todo el sistema | Design system con componentes reutilizables |
| **Confianza** | El usuario confía en los datos | Timestamps visibles, estados claros, confirmaciones |
| **Accesibilidad** | Usable en cualquier contexto | Contraste WCAG AA, touch-friendly, responsive |

### Referencia Posberry

De Posberry se toma:
- Limpieza visual: espacios blancos generosos
- Cards con bordes sutiles y sombras suaves
- Navegación lateral clara con iconografía
- Paleta de colores profesional, no saturada
- Tipografía legible en tamaños variados
- Dashboard con KPIs en cards superiores

---

## 2. Paleta de Colores

### 2.1 Colores Primarios

| Nombre | Hex | Uso |
|---|---|---|
| **Nova Blue** | `#2563EB` | Acciones primarias, links, sidebar activo |
| **Nova Blue Dark** | `#1D4ED8` | Hover de acciones primarias |
| **Nova Blue Light** | `#DBEAFE` | Backgrounds de selección, badges info |
| **Nova Navy** | `#1E293B` | Textos principales, sidebar background |

### 2.2 Colores de Estado (Semáforo)

| Nombre | Hex | Uso |
|---|---|---|
| **Success Green** | `#16A34A` | Stock normal, completado, confirmado |
| **Success Green BG** | `#DCFCE7` | Background de badges verdes |
| **Warning Yellow** | `#CA8A04` | Stock medio, pendiente, atención |
| **Warning Yellow BG** | `#FEF9C3` | Background de badges amarillos |
| **Danger Red** | `#DC2626` | Stock crítico, error, urgente |
| **Danger Red BG** | `#FEE2E2` | Background de badges rojos |
| **Info Blue** | `#2563EB` | En tránsito, en curso, informativo |
| **Info Blue BG** | `#DBEAFE` | Background de badges azules |
| **Excess Purple** | `#7C3AED` | Sobrestock |
| **Excess Purple BG** | `#EDE9FE` | Background de badges purple |

### 2.3 Colores Neutros

| Nombre | Hex | Uso |
|---|---|---|
| **Gray 900** | `#111827` | Títulos principales |
| **Gray 700** | `#374151` | Texto body |
| **Gray 500** | `#6B7280` | Texto secundario, placeholders |
| **Gray 400** | `#9CA3AF` | Íconos inactivos, bordes |
| **Gray 200** | `#E5E7EB` | Bordes de tablas, divisores |
| **Gray 100** | `#F3F4F6` | Backgrounds alternados de filas |
| **Gray 50** | `#F9FAFB` | Background general de página |
| **White** | `#FFFFFF` | Cards, modales, inputs |

### 2.4 Colores de Sector (Comandas)

| Sector | Color | Hex |
|---|---|---|
| Cocina | Naranja | `#EA580C` |
| Barra | Índigo | `#4F46E5` |
| Café | Marrón | `#92400E` |
| Panadería | Rosa | `#DB2777` |
| Delivery | Verde Agua | `#0891B2` |

### 2.5 CSS Custom Properties

```css
:root {
  /* Primarios */
  --color-primary: #2563EB;
  --color-primary-dark: #1D4ED8;
  --color-primary-light: #DBEAFE;
  --color-primary-50: #EFF6FF;
  
  /* Semáforo */
  --color-success: #16A34A;
  --color-success-bg: #DCFCE7;
  --color-warning: #CA8A04;
  --color-warning-bg: #FEF9C3;
  --color-danger: #DC2626;
  --color-danger-bg: #FEE2E2;
  --color-info: #2563EB;
  --color-info-bg: #DBEAFE;
  
  /* Neutros */
  --color-text-primary: #111827;
  --color-text-secondary: #374151;
  --color-text-muted: #6B7280;
  --color-border: #E5E7EB;
  --color-bg-page: #F9FAFB;
  --color-bg-card: #FFFFFF;
  --color-bg-sidebar: #1E293B;
  
  /* Sombras */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  
  /* Bordes */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Espaciado */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

---

## 3. Tipografía

### 3.1 Font Stack

```css
/* Principal */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monoespaciada (códigos, SKUs) */
font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;

/* Display (logo, headings grandes) */
font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
```

### 3.2 Escala Tipográfica

| Nivel | Tamaño | Peso | Line Height | Uso |
|---|---|---|---|---|
| **Display** | 30px | 700 | 1.2 | Título de login, onboarding |
| **H1** | 24px | 600 | 1.3 | Título de página |
| **H2** | 20px | 600 | 1.35 | Título de sección |
| **H3** | 16px | 600 | 1.4 | Título de card |
| **Body** | 14px | 400 | 1.5 | Texto general |
| **Body Medium** | 14px | 500 | 1.5 | Labels, botones |
| **Small** | 12px | 400 | 1.5 | Captions, timestamps |
| **Tiny** | 11px | 500 | 1.4 | Badges, tags |
| **Mono** | 13px | 400 | 1.5 | SKUs, códigos, IDs |

### 3.3 Clases CSS

```css
.text-display { font-size: 30px; font-weight: 700; line-height: 1.2; }
.text-h1      { font-size: 24px; font-weight: 600; line-height: 1.3; }
.text-h2      { font-size: 20px; font-weight: 600; line-height: 1.35; }
.text-h3      { font-size: 16px; font-weight: 600; line-height: 1.4; }
.text-body    { font-size: 14px; font-weight: 400; line-height: 1.5; }
.text-label   { font-size: 14px; font-weight: 500; line-height: 1.5; }
.text-small   { font-size: 12px; font-weight: 400; line-height: 1.5; }
.text-tiny    { font-size: 11px; font-weight: 500; line-height: 1.4; }
.text-mono    { font-size: 13px; font-weight: 400; font-family: var(--font-mono); }
```

---

## 4. Iconografía

### 4.1 Librería

**Recomendada:** Lucide Icons (open source, consistente con estilo Posberry)  
**Alternativa:** Heroicons (Tailwind), Phosphor Icons

### 4.2 Íconos del Sistema

| Módulo | Ícono | Nombre Lucide |
|---|---|---|
| Dashboard | `LayoutDashboard` | layout-dashboard |
| Stock & Productos | `Package` | package |
| Ingresos | `PackagePlus` | package-plus |
| Producción | `ChefHat` | chef-hat |
| Logística | `Truck` | truck |
| Locales | `Store` | store |
| Comandas | `UtensilsCrossed` | utensils-crossed |
| Mesas | `LayoutGrid` | layout-grid |
| Reportes | `BarChart3` | bar-chart-3 |
| IA & Alertas | `Brain` | brain |
| Usuarios | `Users` | users |
| Configuración | `Settings` | settings |
| Notificaciones | `Bell` | bell |
| Búsqueda | `Search` | search |
| Filtrar | `Filter` | filter |
| Exportar | `Download` | download |
| Agregar | `Plus` | plus |
| Editar | `Pencil` | pencil |
| Eliminar | `Trash2` | trash-2 |
| QR Code | `QrCode` | qr-code |
| Cámara | `Camera` | camera |
| Micrófono | `Mic` | mic |
| Reloj | `Clock` | clock |

### 4.3 Tamaños de Íconos

| Tamaño | Pixels | Uso |
|---|---|---|
| `xs` | 14px | Dentro de texto small |
| `sm` | 16px | Dentro de botones, inputs |
| `md` | 20px | Sidebar, acciones |
| `lg` | 24px | Headers, estados |
| `xl` | 32px | KPIs del dashboard |
| `2xl` | 48px | Empty states, onboarding |

---

## 5. Componentes UI

### 5.1 Buttons

```
┌─────────────────────────────────────────────┐
│                                             │
│  [Primary]  [Secondary]  [Ghost]  [Danger]  │
│                                             │
│  Primary:   bg-blue-600, text-white         │
│  Secondary: bg-gray-100, text-gray-700      │
│  Ghost:     bg-transparent, text-gray-600   │
│  Danger:    bg-red-600, text-white          │
│  Success:   bg-green-600, text-white        │
│                                             │
│  Tamaños: sm (32px h), md (36px h),         │
│           lg (40px h), xl (44px h)          │
│                                             │
│  Con ícono: [+ Nuevo Producto]              │
│  Solo ícono: [🔍] (tooltip obligatorio)     │
│  Loading: [⟳ Cargando...]                  │
│  Disabled: opacity 50%, no pointer          │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.2 Cards

```
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Card Default                       │   │
│  │  bg: white                          │   │
│  │  border: 1px solid gray-200         │   │
│  │  border-radius: 12px               │   │
│  │  shadow: shadow-sm                  │   │
│  │  padding: 24px                      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Card KPI (Dashboard)               │   │
│  │  Contenido: Valor grande + Label    │   │
│  │  Borde izquierdo de color           │   │
│  │  Ícono con bg circular              │   │
│  │  Hover: shadow-md, scale 1.02       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Card Alert                         │   │
│  │  Borde izquierdo: color de alerta   │   │
│  │  Ícono de tipo                      │   │
│  │  Acciones: botones inline           │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.3 Tables

```
Estilo de tabla:

- Header: bg-gray-50, text-gray-600, text-small, font-500, uppercase
- Rows: bg-white, hover bg-gray-50, border-bottom gray-200
- Rows alternados: NO (mantener limpio como Posberry)
- Padding: 12px vertical, 16px horizontal
- Acciones: íconos al final de fila, visibles en hover
- Paginación: al pie, con contadores y navegación

Funcionalidades:
- Ordenar por columna (click en header)
- Selección múltiple con checkbox
- Acciones masivas en toolbar superior
- Filas expandibles para detalle
- Sticky header en scroll
```

### 5.4 Forms / Inputs

```
Input Default:
- Height: 40px
- Border: 1px solid gray-300
- Border-radius: 8px
- Padding: 0 12px
- Focus: border-blue-500, ring 3px blue-100
- Error: border-red-500, ring 3px red-100

Label:
- Size: 14px, weight 500
- Color: gray-700
- Margin bottom: 6px
- Required: asterisco rojo

Textarea:
- Min-height: 80px
- Resize: vertical
- Mismo estilo que input

Select:
- Mismo estilo que input
- Chevron icon derecho
- Dropdown con shadow-lg

Checkbox / Radio:
- Size: 16px
- Color: blue-600 cuando checked
- Border-radius: 4px (checkbox), full (radio)

Toggle/Switch:
- Width: 44px, Height: 24px
- Active: bg blue-600
- Inactive: bg gray-300
```

### 5.5 Badges / Tags

```
┌─────────────────────────────────────────────┐
│                                             │
│  Semáforo de Stock:                         │
│  [🔴 Crítico]  [🟡 Medio]  [🟢 Normal]    │
│  [🔵 Exceso]                               │
│                                             │
│  Estados:                                   │
│  [Pendiente]  [En Curso]  [Completado]      │
│  [Cancelado]  [Borrador]                    │
│                                             │
│  Estilo:                                    │
│  - Height: 24px                             │
│  - Padding: 0 10px                          │
│  - Border-radius: full (pill)               │
│  - Font: 12px, weight 500                   │
│  - Background: color ligero                 │
│  - Text: color oscuro                       │
│  - Opcional: dot indicator a la izquierda   │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.6 Modals / Dialogs

```
- Overlay: bg-black/50, backdrop-blur-sm
- Card: bg-white, border-radius 16px, shadow-xl
- Ancho: sm (400px), md (500px), lg (640px), xl (800px), full (95vw)
- Header: título + botón cerrar (X)
- Body: padding 24px, max-height con scroll
- Footer: botones alineados a la derecha
- Animación: fade-in + scale desde 95%
```

### 5.7 Toast / Notifications

```
Posición: Top-right, stacked
Duración: 5 segundos (auto-dismiss)
Tipos:
  - Success: ícono check verde, borde izquierdo verde
  - Error: ícono X rojo, borde izquierdo rojo
  - Warning: ícono ! amarillo, borde izquierdo amarillo
  - Info: ícono i azul, borde izquierdo azul
Animación: slide-in from right
Botón dismiss: X en esquina superior derecha
Acción opcional: link "Ver detalle" / "Deshacer"
```

---

## 6. Layout

### 6.1 Estructura General (Desktop)

```
┌────────────────────────────────────────────────────┐
│ SIDEBAR       │        MAIN CONTENT                │
│ (240px fixed) │        (flex-1)                     │
│               │                                     │
│ Logo          │  ┌─── Top Bar ──────────────────┐  │
│ Nav Items     │  │ Page Title    🔍  🔔  👤      │  │
│ ...           │  └────────────────────────────────┘ │
│               │                                     │
│ Locales       │  ┌─── Page Content ──────────────┐ │
│ ...           │  │                                │ │
│               │  │  (contenido de la página)      │ │
│ Config        │  │                                │ │
│               │  │                                │ │
│ User Info     │  │                                │ │
│               │  └────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### 6.2 Sidebar

```
Ancho: 240px (expandido), 64px (colapsado)
Background: Navy (#1E293B)
Text: White/Gray-400
Active Item: bg-blue-600/20, text-white, left-border blue-500
Hover: bg-white/5
Dividers: border-white/10

Secciones con subtítulos:
- Color: gray-400
- Size: 11px
- Weight: 600
- Uppercase
- Letter-spacing: 0.05em
```

### 6.3 Top Bar

```
Height: 64px
Background: white
Border-bottom: 1px solid gray-200
Contenido:
  - Izquierda: Page Title (H1), Breadcrumbs
  - Derecha: Buscador global, Notificaciones (badge), Avatar + menú
```

### 6.4 Responsive Breakpoints

| Breakpoint | Ancho | Layout |
|---|---|---|
| **Desktop** | >= 1280px | Sidebar + Content completo |
| **Laptop** | 1024-1279px | Sidebar colapsada + Content |
| **Tablet** | 768-1023px | Sidebar oculta (toggle) + Content |
| **Mobile** | < 768px | Bottom nav + Content full width |

### 6.5 Layout de Dashboard

```
Desktop (1280px+):
┌──────┬──────┬──────┬──────┐
│ KPI1 │ KPI2 │ KPI3 │ KPI4 │  ← 4 columnas iguales
└──────┴──────┴──────┴──────┘
┌────────────────┬───────────┐
│ Ventas (gráf.) │ Locales   │  ← 2:1 ratio
└────────────────┴───────────┘
┌────────────────┬───────────┐
│ Envíos         │ IA Events │  ← 2:1 ratio
└────────────────┴───────────┘
┌────────────────────────────┐
│ Actividad Reciente (tabla) │  ← Full width
└────────────────────────────┘

Tablet (768-1023px):
┌──────┬──────┐
│ KPI1 │ KPI2 │  ← 2 columnas
├──────┼──────┤
│ KPI3 │ KPI4 │
└──────┴──────┘
┌────────────────────────────┐
│ Ventas (gráfico)           │  ← Full width
├────────────────────────────┤
│ Estado Locales             │  ← Full width
├────────────────────────────┤
│ Envíos                     │
├────────────────────────────┤
│ IA Events                  │
├────────────────────────────┤
│ Actividad Reciente         │
└────────────────────────────┘
```

---

## 7. Animaciones y Transiciones

### 7.1 Micro-interacciones

| Elemento | Animación | Duración | Easing |
|---|---|---|---|
| Hover en cards | Scale 1.02, shadow increase | 200ms | ease-out |
| Hover en filas | Background change | 150ms | ease |
| Apertura modal | Fade + scale from 95% | 200ms | ease-out |
| Cierre modal | Fade + scale to 95% | 150ms | ease-in |
| Toast entrada | Slide from right | 300ms | spring |
| Toast salida | Fade out + slide right | 200ms | ease-in |
| Cambio de badge | Color transition | 300ms | ease |
| Loading spinner | Rotate infinite | 1000ms | linear |
| Skeleton loading | Pulse opacity | 1500ms | ease-in-out |
| Sidebar collapse | Width transition | 200ms | ease |

### 7.2 Loading States

```
1. Skeleton: Para carga inicial de página
   - Formas grises animadas en lugar de contenido
   - Mismo layout que el contenido final

2. Spinner: Para acciones puntuales
   - Circular, color primary
   - Dentro de botones cuando están loading
   
3. Progress Bar: Para cargas largas (OCR, exportación)
   - Barra horizontal animada
   - Porcentaje si es determinado

4. Empty State: Cuando no hay datos
   - Ilustración suave
   - Texto descriptivo
   - CTA relevante
```

---

## 8. Modo Oscuro (Futuro)

```
Preparar el sistema con CSS custom properties para facilitar 
implementación futura de modo oscuro:

Dark Mode mappings:
  --color-bg-page: #0F172A
  --color-bg-card: #1E293B
  --color-text-primary: #F1F5F9
  --color-text-secondary: #CBD5E1
  --color-border: #334155
  --color-bg-sidebar: #0F172A
```

---

## 9. Accesibilidad

| Requisito | Implementación |
|---|---|
| Contraste texto | Mínimo 4.5:1 (WCAG AA) |
| Focus visible | Ring de 3px en color primary |
| Aria labels | En todos los íconos sin texto |
| Tab navigation | Orden lógico, skip links |
| Screen reader | Roles semánticos HTML5 |
| Touch targets | Mínimo 44x44px en móvil |
| Color no único | Íconos/texto además de color para semáforo |
| Reduced motion | Respetar prefers-reduced-motion |

---

## 10. Logo y Branding

### Marca

```
ELIO
- Tipografía: Plus Jakarta Sans, Extra Bold
- Color principal: Nova Blue (#2563EB)
- Subtítulo: "Gestión Integral Gastronómica"

Usos:
- Sidebar: Logo completo en sidebar expandida, ícono "E" en colapsada
- Login: Logo centrado con subtítulo
- Favicon: "E" en cuadrado redondeado azul
- Loading: Logo con animación pulse
```
