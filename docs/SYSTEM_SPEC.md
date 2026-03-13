# ELIO — Sistema de Gestión Integral para Gastronomía

## Plataforma de Stock, Logística, Producción y Operaciones Multi-Local

**Versión:** 1.0  
**Fecha:** 11 de Febrero de 2026  
**Codename:** Nova  
**Inspiración visual:** Posberry POS — estética limpia, empresarial, profesional

---

## 1. Visión General del Sistema

**Nova** es una plataforma integral de gestión operativa diseñada para redes de cafeterías, restaurantes y depósitos de producción. Centraliza el control de stock, la planificación de producción, la logística entre locales y el punto de venta con inteligencia artificial.

### 1.1 Problema que resuelve

| Problema actual | Solución Nova |
|---|---|
| Stock descentralizado y sin visibilidad real | Dashboard unificado con semáforo por ubicación |
| Producción sin control de costos reales | Módulo de recetas versionadas con costeo automático |
| Logística manual con pérdidas no rastreadas | Envíos con escaneo QR y validación de diferencias |
| Ingreso de mercadería sin verificación | OCR de facturas con IA + comparación automática |
| Decisiones reactivas sin datos | Alertas predictivas y reportes de analítica avanzada |
| Comandas desorganizadas | Sistema por sectores con monitor colaborativo |

### 1.2 Usuarios del Sistema

| Rol | Descripción | Acceso Principal |
|---|---|---|
| **Admin General** | Dueño/Gerente general de la red | Todo el sistema |
| **Gerente de Local** | Responsable de una sucursal específica | Local asignado, stock, comandas, reportes |
| **Jefe de Depósito** | Responsable del depósito de producción | Producción, stock depósito, logística |
| **Operario de Producción** | Ejecuta las recetas y producción | Módulo de producción (vista limitada) |
| **Encargado de Logística** | Gestiona envíos entre depósito y locales | Logística, envíos, recepciones |
| **Cajero / Mozo** | Atiende punto de venta y mesas | Comandas, mesas, cobro |
| **Cocinero / Barista** | Recibe y ejecuta comandas | Monitor de sector asignado |
| **Auditor / Contador** | Revisa reportes y costos | Reportes, analítica (solo lectura) |

### 1.3 Locaciones del Sistema

| Tipo | Ejemplo | Funciones Principales |
|---|---|---|
| **Depósito Central** | Planta de producción | Recepción de mercadería, producción, despacho |
| **Local Tipo A** | Cafetería con cocina | Venta, comandas, stock local, recepción |
| **Local Tipo B** | Restaurante completo | Venta, comandas por sector, stock, recepción |
| **Local Tipo C** | Punto de venta express | Venta simplificada, stock mínimo |

---

## 2. Arquitectura de Módulos

```
┌─────────────────────────────────────────────────────────┐
│                    ELIO PLATFORM                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Dashboard │  │  Stock   │  │ Ingresos │             │
│  │  (Home)   │  │ & Prod.  │  │ Mercad.  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │Producción│  │Logística │  │ Locales  │             │
│  │& Recetas │  │& Envíos  │  │& Sucurs. │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Comandas │  │Reportes &│  │   IA &   │             │
│  │ & Mesas  │  │Analítica │  │ Alertas  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                         │
│  ┌──────────┐  ┌──────────┐                            │
│  │ Usuarios │  │ Config.  │                            │
│  │ & Roles  │  │ General  │                            │
│  └──────────┘  └──────────┘                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Módulo: Home / Panel de Control Principal

### 3.1 Descripción

El Dashboard es la pantalla de entrada al sistema. Presenta un resumen ejecutivo del estado de toda la operación en tiempo real. Diseñado para que en 5 segundos el usuario entienda qué requiere atención.

### 3.2 Estructura de Pantalla

```
┌─────────────────────────────────────────────────────────────┐
│ 🔵 ELIO    [Dashboard] [Stock] [Producción] [...]   🔔 👤  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Buenos días, Mauricio              📅 Mar 11 Feb 2026      │
│  Red: 3 locales activos · Depósito operativo               │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 🔴 12    │ │ 🟡 3     │ │ 📦 847   │ │ 🤖 5     │      │
│  │ Stock    │ │ Produc.  │ │ Movim.   │ │ Alertas  │      │
│  │ Crítico  │ │ Pendiente│ │ Hoy      │ │ IA       │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌────────────────────────────┐ ┌────────────────────────┐ │
│  │ 📊 Ventas del Día          │ │ 🏪 Estado de Locales   │ │
│  │                            │ │                        │ │
│  │  Gráfico de barras por     │ │  • Central ✅ Normal   │ │
│  │  local con comparativa     │ │  • Café Norte ⚠️ 3    │ │
│  │  vs mismo día semana       │ │    items bajo stock    │ │
│  │  anterior                  │ │  • Resto Sur ✅ Normal │ │
│  │                            │ │  • Express ❌ Sin      │ │
│  │  Total: $2.847.500         │ │    conexión (14 min)   │ │
│  └────────────────────────────┘ └────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────┐ ┌────────────────────────┐ │
│  │ 🚛 Envíos en Curso         │ │ 🤖 Eventos IA          │ │
│  │                            │ │                        │ │
│  │  #ENV-2026-0211-001       │ │  ⚡ Harina 000: pedir  │ │
│  │  Depósito → Café Norte    │ │     antes del viernes  │ │
│  │  Estado: En tránsito 🔵   │ │                        │ │
│  │  Items: 23 | ETA: 10:30   │ │  ⚡ Leche: consumo 20% │ │
│  │                            │ │     mayor al esperado  │ │
│  │  #ENV-2026-0211-002       │ │                        │ │
│  │  Depósito → Resto Sur     │ │  📈 Proyección: stock  │ │
│  │  Estado: Entregado ✅     │ │     café grano alcanza │ │
│  │  Recepción pendiente      │ │     hasta el miércoles │ │
│  └────────────────────────────┘ └────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 📋 Actividad Reciente                                │  │
│  │                                                      │  │
│  │  09:45  Juan Pérez ingresó mercadería (Prov: Molinos)│  │
│  │  09:32  Producción #P-084 completada (Medialunas x200│  │
│  │  09:15  Envío #ENV-001 despachado a Café Norte       │  │
│  │  08:50  Alerta IA: anomalía en consumo de azúcar    │  │
│  │  08:30  María López abrió caja en Resto Sur         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 KPIs del Dashboard

| KPI | Fuente | Actualización | Visual |
|---|---|---|---|
| Stock Crítico | Tabla `stock_locations` WHERE qty <= min_qty | Tiempo real | Badge rojo con número |
| Producciones Pendientes | Tabla `production_orders` WHERE status = 'pending' | Tiempo real | Badge amarillo |
| Movimientos Hoy | Tabla `stock_movements` WHERE date = today | Cada 5 min | Contador |
| Alertas IA | Tabla `ai_events` WHERE status = 'active' | Cada 15 min | Badge con ícono robot |
| Ventas del Día | Tabla `orders` WHERE date = today | Cada 5 min | Gráfico + total |
| Estado de Locales | Health check por WebSocket | Tiempo real | Indicador por local |

### 3.4 Interacciones

- **Click en KPI** → Navega al módulo correspondiente con filtro aplicado
- **Click en local** → Abre vista detalle del local
- **Click en envío** → Abre tracking del envío
- **Click en alerta IA** → Abre panel de detalle con acción sugerida
- **Click en actividad** → Navega al registro correspondiente

---

## 4. Módulo: Gestión de Productos y Stock

### 4.1 Pantalla: Listado de Productos

```
┌─────────────────────────────────────────────────────────────┐
│ 📦 Productos y Stock                    [+ Nuevo Producto]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔍 Buscar producto...    │Categoría ▼│ Estado ▼│Ubicación▼│ │
│                                                             │
│  Vista: [Lista] [Grilla] [Semáforo]        Exportar 📥     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📷│ SKU      │ Producto        │ Cat.  │ Und │ Stock│   │
│  │───┼──────────┼─────────────────┼───────┼─────┼──────│   │
│  │ 🖼│ HAR-001  │ Harina 000 x25kg│ Seco  │ Kg  │ 🔴 45│   │
│  │ 🖼│ LEC-001  │ Leche Entera 1L │ Frío  │ Lt  │ 🟡120│   │
│  │ 🖼│ CAF-001  │ Café Grano 1Kg  │ Café  │ Kg  │ 🟢 85│   │
│  │ 🖼│ AZU-001  │ Azúcar x50Kg   │ Seco  │ Kg  │ 🟢200│   │
│  │ 🖼│ MAN-001  │ Manteca x5Kg   │ Frío  │ Kg  │ 🔴 8 │   │
│  │ 🖼│ HUE-001  │ Huevos x30     │ Frío  │ Und │ 🟡 15│   │
│  │ 🖼│ CHO-001  │ Chocolate 70% 1K│ Seco  │ Kg  │ 🟢 40│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Mostrando 1-25 de 342 productos    ◀ 1 2 3 ... 14 ▶      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Pantalla: Detalle de Producto

```
┌─────────────────────────────────────────────────────────────┐
│ ← Volver a Productos                                       │
│                                                             │
│  ┌────────┐  Harina 000 x25Kg                              │
│  │  FOTO  │  SKU: HAR-001 · Categoría: Secos              │
│  │ 150x150│  Unidad: Kilogramo · Costo prom: $2.450/Kg    │
│  └────────┘  Proveedor principal: Molinos del Sur          │
│              Lote activo: L-2026-0205 · Vto: 15/08/2026   │
│                                                             │
│  ┌─── Stock por Ubicación ──────────────────────────────┐  │
│  │                                                      │  │
│  │  📍 Depósito Central     350 Kg  🟢  (mín: 100)     │  │
│  │  📍 Café Norte            25 Kg  🔴  (mín: 50)      │  │
│  │  📍 Restaurante Sur       15 Kg  🔴  (mín: 30)      │  │
│  │  📍 Express Centro         5 Kg  🟡  (mín: 10)      │  │
│  │  ──────────────────────────────────────────────      │  │
│  │  TOTAL RED:              395 Kg                      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Historial de Movimientos ─────────────────────────┐  │
│  │                                                      │  │
│  │  📊 Gráfico de consumo últimos 30 días               │  │
│  │  [════════════════════════════════════════]           │  │
│  │                                                      │  │
│  │  11/02  -12 Kg  Producción #P-084 (Medialunas)      │  │
│  │  10/02  +250 Kg  Ingreso mercadería (Molinos)       │  │
│  │  10/02  -50 Kg  Envío → Café Norte                  │  │
│  │  09/02  -8 Kg   Producción #P-081 (Pan lactal)      │  │
│  │  08/02  -30 Kg  Envío → Restaurante Sur             │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Alertas Activas ──────────────────────────────────┐  │
│  │                                                      │  │
│  │  🤖 IA: Al ritmo actual, stock en Café Norte se      │  │
│  │     agota en 2 días. Sugerencia: enviar 50 Kg.      │  │
│  │     [Crear Envío] [Ignorar] [Programar]             │  │
│  │                                                      │  │
│  │  🔴 Stock crítico en Restaurante Sur (15/30 Kg)      │  │
│  │     [Crear Envío] [Ver Local]                        │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Editar Producto] [Ver Proveedores] [Historial Completo]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Sistema de Semáforo de Stock

| Estado | Color | Condición | Acción |
|---|---|---|---|
| **Crítico** | 🔴 Rojo | `stock_actual <= stock_minimo` | Alerta inmediata + sugerencia IA |
| **Medio** | 🟡 Amarillo | `stock_actual <= stock_minimo * 1.5` | Alerta preventiva |
| **Normal** | 🟢 Verde | `stock_actual > stock_minimo * 1.5` | Sin acción |
| **Exceso** | 🔵 Azul | `stock_actual > stock_maximo` | Alerta de sobrestock |

### 4.4 Categorías Predefinidas

| Categoría | Ícono | Ejemplos |
|---|---|---|
| Secos | 🌾 | Harinas, azúcar, sal, especias |
| Refrigerados | ❄️ | Lácteos, carnes, verduras |
| Congelados | 🧊 | Masas, helados, pre-elaborados |
| Bebidas | 🥤 | Gaseosas, aguas, jugos |
| Café & Té | ☕ | Granos, molido, té, infusiones |
| Descartables | 📦 | Vasos, servilletas, bolsas |
| Limpieza | 🧹 | Detergentes, desinfectantes |
| Elaborados | 🍰 | Productos terminados (producción) |

### 4.5 Campos del Producto

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | UUID | Auto | Identificador único |
| `sku` | String | Sí | Código interno (ej: HAR-001) |
| `barcode` | String | No | Código de barras EAN-13 |
| `name` | String | Sí | Nombre del producto |
| `description` | Text | No | Descripción larga |
| `category_id` | FK | Sí | Referencia a categoría |
| `unit` | Enum | Sí | Kg, Lt, Und, Caja, Pack |
| `image_url` | String | No | URL de imagen del producto |
| `avg_cost` | Decimal | Calc | Costo promedio ponderado |
| `last_cost` | Decimal | Auto | Último costo de compra |
| `stock_min` | Decimal | Sí | Stock mínimo por ubicación |
| `stock_max` | Decimal | No | Stock máximo por ubicación |
| `is_perishable` | Boolean | Sí | Si requiere control de vencimiento |
| `shelf_life_days` | Int | Cond. | Días de vida útil |
| `is_active` | Boolean | Auto | Estado activo/inactivo |
| `suppliers` | Relation | No | Proveedores asociados |
| `created_at` | Timestamp | Auto | Fecha de creación |
| `updated_at` | Timestamp | Auto | Última modificación |

---

## 5. Módulo: Ingreso de Mercadería

### 5.1 Flujo de Ingreso

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. Crear    │───▶│  2. Cargar   │───▶│  3. Comparar │
│  Ingreso     │    │  Items       │    │  vs Pedido   │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
┌──────────────┐    ┌──────────────┐           │
│  5. Registro │◀───│  4. Validar  │◀──────────┘
│  Completo    │    │  y Ajustar   │
└──────────────┘    └──────────────┘
```

### 5.2 Pantalla: Nuevo Ingreso de Mercadería

```
┌─────────────────────────────────────────────────────────────┐
│ 📥 Nuevo Ingreso de Mercadería                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Método de carga:                                          │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │  📝 Manual       │  │  📸 Foto de     │                 │
│  │  Cargar items    │  │  Factura (IA)   │                 │
│  │  uno a uno       │  │  OCR automático │                 │
│  └─────────────────┘  └─────────────────┘                 │
│                                                             │
│  ──── Datos del Ingreso ────────────────────────────────── │
│                                                             │
│  Proveedor:     [Molinos del Sur          ▼]               │
│  Nº Factura:    [FC-A-0001-00045832        ]               │
│  Fecha Factura: [11/02/2026                ]               │
│  Ubicación:     [Depósito Central          ▼]               │
│  Responsable:   Juan Pérez (auto)                          │
│                                                             │
│  ──── Items ────────────────────────────────────────────── │
│                                                             │
│  [+ Agregar Item]  [📷 Escanear código]                    │
│                                                             │
│  │ Producto          │ Cant.Pedida│ Cant.Recibida│ Dif │ $ │
│  │───────────────────┼───────────┼─────────────┼─────┼───│
│  │ Harina 000 x25Kg  │    250 Kg │    250 Kg   │  0  │✅ │
│  │ Leche Entera 1L   │    100 Lt │     96 Lt   │ -4  │⚠️ │
│  │ Manteca x5Kg      │     50 Kg │     50 Kg   │  0  │✅ │
│  │ Huevos x30        │     20 Und│     18 Und  │ -2  │⚠️ │
│                                                             │
│  ──── Observaciones ───────────────────────────────────── │
│                                                             │
│  Leche: 4 unidades con envase dañado → rechazadas         │
│  Huevos: 2 maple con rotura → rechazados                  │
│                                                             │
│  ──── Resumen ─────────────────────────────────────────── │
│                                                             │
│  Total items: 4 │ Completos: 2 │ Con diferencia: 2        │
│  Costo total factura: $487.500                             │
│  Costo items recibidos: $463.200                           │
│                                                             │
│  [Cancelar]  [Guardar Borrador]  [✅ Confirmar Ingreso]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Flujo OCR con IA (Foto de Factura)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. Usuario  │───▶│  2. IA OCR   │───▶│  3. Matching │
│  sube foto   │    │  extrae      │    │  automático  │
│  de factura  │    │  texto/datos │    │  con catalog │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
┌──────────────┐    ┌──────────────┐           │
│  5. Guardar  │◀───│  4. Usuario  │◀──────────┘
│  validado    │    │  revisa y    │
│              │    │  confirma    │
└──────────────┘    └──────────────┘
```

**Datos extraídos por IA:**
- Nombre del proveedor (match con proveedores registrados)
- Número de factura
- Fecha de emisión
- Lista de productos con cantidades y precios
- Total de la factura
- Condición de pago (contado/crédito)

**Pantalla de revisión OCR:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 Revisión de Factura — IA OCR                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │                  │  │ Datos extraídos:                │ │
│  │   IMAGEN DE LA   │  │                                │ │
│  │   FACTURA         │  │ Proveedor: Molinos del Sur ✅  │ │
│  │   (zoom +/-)     │  │ Factura: FC-A-0001-45832  ✅   │ │
│  │                  │  │ Fecha: 11/02/2026         ✅   │ │
│  │                  │  │ Total: $487.500           ✅   │ │
│  │                  │  │                                │ │
│  │                  │  │ Confianza general: 94% ████░  │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
│                                                             │
│  Items detectados:                                         │
│  │ Detectado IA        │ Match Catálogo  │ Cant │ Precio │ │
│  │────────────────────┼────────────────┼──────┼────────│ │
│  │ "Hna 000 25K" 92%  │ Harina 000 25Kg│ 10   │$24.500 │ │
│  │ "Leche Ent 1L" 98% │ Leche Entera 1L│ 100  │$ 1.200 │ │
│  │ "Manteca 5K" 95%   │ Manteca x5Kg   │ 10   │$ 8.500 │ │
│  │ "Hvos mpl 30" 87%  │ Huevos x30  ⚠️ │ 20   │$ 3.800 │ │
│                                                             │
│  ⚠️ 1 item requiere confirmación manual (confianza < 90%) │
│                                                             │
│  [Rechazar y cargar manual]  [✅ Aprobar y continuar]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Validaciones del Ingreso

| Validación | Tipo | Acción |
|---|---|---|
| Cantidad recibida ≠ cantidad pedida | Warning | Requiere observación obligatoria |
| Producto no en catálogo | Bloqueo | No permite ingresar hasta crear producto |
| Factura duplicada (mismo nro + proveedor) | Bloqueo | Muestra ingreso anterior |
| Lote vencido o próximo a vencer | Warning | Muestra alerta, permite continuar |
| Costo unitario > 30% del último costo | Warning | Requiere confirmación |
| OCR confianza < 80% | Warning | Requiere revisión manual obligatoria |

---

## 6. Módulo: Producción

### 6.1 Pantalla: Listado de Órdenes de Producción

```
┌─────────────────────────────────────────────────────────────┐
│ 🍽️ Producción                        [+ Nueva Producción]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Filtros: [Estado ▼] [Fecha ▼] [Receta ▼]   🔍 Buscar     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ #       │ Receta           │ Cant  │ Estado    │ Fecha│  │
│  │─────────┼─────────────────┼───────┼──────────┼──────│  │
│  │ P-087   │ Medialunas       │ 300   │ 🔵 En curso│ 11/02│  │
│  │ P-086   │ Pan Lactal       │ 50    │ 🟡 Pendiente│ 11/02│  │
│  │ P-085   │ Torta Chocolate  │ 8     │ 🟡 Pendiente│ 11/02│  │
│  │ P-084   │ Medialunas       │ 200   │ ✅ Completada│ 11/02│  │
│  │ P-083   │ Budín de Pan     │ 20    │ ✅ Completada│ 10/02│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Producción Sugerida por IA ───────────────────────┐  │
│  │                                                      │  │
│  │  🤖 Basado en demanda histórica para mañana jueves:  │  │
│  │                                                      │  │
│  │  • Medialunas: 350 unidades (promedio jueves: 320)  │  │
│  │  • Pan Lactal: 40 unidades                          │  │
│  │  • Facturas: 200 unidades                           │  │
│  │                                                      │  │
│  │  [Crear Orden desde Sugerencia] [Ver Análisis]      │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Pantalla: Nueva Orden de Producción

```
┌─────────────────────────────────────────────────────────────┐
│ 🍽️ Nueva Orden de Producción                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Receta:     [Medialunas de Manteca       ▼]  v2.1        │
│  Cantidad:   [300            ] unidades                    │
│  Fecha prod: [11/02/2026     ]                             │
│  Responsable:[Carlos Gómez                ▼]               │
│                                                             │
│  ──── Insumos Calculados (x300 unidades) ───────────────── │
│                                                             │
│  │ Insumo          │ Necesario │ Disponible│ Estado      │ │
│  │─────────────────┼──────────┼──────────┼────────────│  │
│  │ Harina 000      │  45.0 Kg │  350 Kg  │ ✅ OK       │ │
│  │ Manteca         │  15.0 Kg │    8 Kg  │ ❌ Falta 7Kg│ │
│  │ Levadura        │   1.5 Kg │   12 Kg  │ ✅ OK       │ │
│  │ Huevos          │  25 Und  │   15 Und │ ❌ Falta 10 │ │
│  │ Azúcar          │   9.0 Kg │  200 Kg  │ ✅ OK       │ │
│  │ Sal             │   0.5 Kg │   50 Kg  │ ✅ OK       │ │
│  │ Esencia vainilla│   0.3 Lt │    2 Lt  │ ✅ OK       │ │
│                                                             │
│  ⚠️ 2 insumos con stock insuficiente                       │
│                                                             │
│  ──── Costo Estimado ──────────────────────────────────── │
│                                                             │
│  Costo total insumos:    $67.350                           │
│  Costo por unidad:       $224,50                           │
│  Costo mano de obra est: $15.000                           │
│  Costo total producción: $82.350                           │
│  Costo unitario final:   $274,50                           │
│                                                             │
│  [Cancelar]  [Ajustar Cantidad]  [✅ Iniciar Producción]   │
│                                                             │
│  ⚠️ No se puede iniciar: stock insuficiente de Manteca y  │
│     Huevos. [Solicitar Compra] [Reducir Cantidad a 160]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Recetas Versionadas

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador de la receta |
| `name` | String | Nombre de la receta |
| `version` | String | Versión semántica (v2.1) |
| `category` | Enum | Panadería, Pastelería, Cocina, Bebidas |
| `yield_qty` | Decimal | Cantidad que produce (ej: 100 unidades) |
| `yield_unit` | Enum | Unidad del producto final |
| `ingredients` | JSON[] | Lista de insumos con cantidades |
| `instructions` | Text | Pasos de preparación |
| `prep_time_min` | Int | Tiempo de preparación en minutos |
| `is_active` | Boolean | Versión activa |
| `created_by` | FK | Usuario que creó la versión |
| `created_at` | Timestamp | Fecha de creación |

**Ejemplo de ingredientes (JSON):**
```json
{
  "ingredients": [
    { "product_id": "uuid-harina", "qty_per_unit": 0.15, "unit": "kg" },
    { "product_id": "uuid-manteca", "qty_per_unit": 0.05, "unit": "kg" },
    { "product_id": "uuid-huevos", "qty_per_unit": 0.083, "unit": "und" },
    { "product_id": "uuid-levadura", "qty_per_unit": 0.005, "unit": "kg" },
    { "product_id": "uuid-azucar", "qty_per_unit": 0.03, "unit": "kg" }
  ]
}
```

### 6.4 Estados de Producción

```
[Borrador] → [Pendiente] → [En Curso] → [Completada]
                 │                           │
                 └→ [Cancelada]              └→ [Completada con Ajuste]
```

| Estado | Descripción | Acciones Disponibles |
|---|---|---|
| Borrador | Creada pero no confirmada | Editar, Eliminar |
| Pendiente | Confirmada, esperando inicio | Iniciar, Cancelar |
| En Curso | Producción en ejecución | Completar, Reportar Problema |
| Completada | Finalizada exitosamente | Ver Detalle, Exportar |
| Completada con Ajuste | Finalizada con diferencias | Ver Ajustes, Exportar |
| Cancelada | Cancelada antes de producir | Ver Motivo |

---

## 7. Módulo: Logística y Envíos

### 7.1 Flujo de Envío Depósito → Local

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1. Crear │──▶│ 2. Prepar│──▶│ 3. Desp. │──▶│ 4. Recep.│──▶│ 5. Valid.│
│ Envío    │   │ ar Items │   │ y Transit│   │ en Local │   │ y Cierre │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
  Depósito       Depósito       Logística      Local          Local
```

### 7.2 Pantalla: Gestión de Envíos

```
┌─────────────────────────────────────────────────────────────┐
│ 🚛 Logística y Envíos                     [+ Nuevo Envío]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Filtros: [Estado ▼] [Origen ▼] [Destino ▼] [Fecha ▼]     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ # Envío           │ Ruta              │ Items│ Estado│  │
│  │───────────────────┼──────────────────┼──────┼───────│  │
│  │ ENV-2026-0211-001 │ Depósito→Café N. │  23  │🔵 Trán│  │
│  │ ENV-2026-0211-002 │ Depósito→Resto S.│  15  │🟡 Recep│  │
│  │ ENV-2026-0210-008 │ Depósito→Express │   8  │✅ Cerr.│  │
│  │ ENV-2026-0210-007 │ Depósito→Café N. │  31  │✅ Cerr.│  │
│  │ ENV-2026-0210-006 │ Depósito→Resto S.│  12  │⚠️ Dif. │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Mapa de Envíos Activos ───────────────────────────┐  │
│  │                                                      │  │
│  │   📍 Depósito Central                               │  │
│  │       │                                             │  │
│  │       ├── 🚛→ Café Norte (ETA: 10:30)              │  │
│  │       │                                             │  │
│  │       └── ✅ Restaurante Sur (Entregado 09:15)     │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Pantalla: Detalle de Envío

```
┌─────────────────────────────────────────────────────────────┐
│ 🚛 Envío #ENV-2026-0211-001                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Origen:   Depósito Central                                │
│  Destino:  Café Norte                                      │
│  Creado:   11/02/2026 08:00 por Juan Pérez                 │
│  Despachado: 11/02/2026 09:15                              │
│  ETA:      11/02/2026 10:30                                │
│                                                             │
│  Estado: 🔵 En Tránsito                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                       │
│  Creado → Preparado → Despachado → [En Tránsito] → Recibido│
│                                                             │
│  ──── Items del Envío ─────────────────────────────────── │
│                                                             │
│  │ Producto          │ Enviado │ Recibido│ Dif │ Estado  │ │
│  │───────────────────┼────────┼────────┼─────┼────────│  │
│  │ Harina 000 x25Kg  │  50 Kg │   —    │  —  │ Pend.  │ │
│  │ Leche Entera 1L   │  48 Lt │   —    │  —  │ Pend.  │ │
│  │ Medialunas (prod) │ 150 Und│   —    │  —  │ Pend.  │ │
│  │ Café Grano 1Kg    │  10 Kg │   —    │  —  │ Pend.  │ │
│                                                             │
│  QR del Envío: [██████] (para escaneo en recepción)       │
│                                                             │
│  [Imprimir Remito] [Generar QR] [Cancelar Envío]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 Pantalla: Recepción en Local (Tablet/Móvil)

```
┌─────────────────────────────────────┐
│ 📱 Recepción de Mercadería          │
│ Local: Café Norte                   │
├─────────────────────────────────────┤
│                                     │
│  [📷 Escanear QR del Envío]        │
│                                     │
│  Envío: #ENV-2026-0211-001         │
│  Origen: Depósito Central          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Harina 000      50 Kg  [50 ]│ │
│  │ Leche Entera    48 Lt  [48 ]│ │
│  │ Medialunas     150 Und [148]│ │
│  │ Café Grano      10 Kg  [10 ]│ │
│  └───────────────────────────────┘ │
│                                     │
│  ⚠️ Diferencia en Medialunas:      │
│  Enviado: 150 · Recibido: 148      │
│  Motivo: [Rotura en transporte ▼]  │
│                                     │
│  Foto evidencia: [📷 Tomar Foto]   │
│                                     │
│  [✅ Confirmar Recepción]           │
│                                     │
└─────────────────────────────────────┘
```

### 7.5 Validación de Diferencias

| Diferencia | Acción Automática | Acción Manual |
|---|---|---|
| 0 (todo OK) | Cierre automático | — |
| < 5% | Warning, permite cierre | Requiere motivo |
| 5-10% | Notificación a gerente | Requiere motivo + foto |
| > 10% | Bloqueo, escala a admin | Requiere aprobación admin |

---

## 8. Módulo: Locales / Sucursales

### 8.1 Pantalla: Vista de Local

```
┌─────────────────────────────────────────────────────────────┐
│ 🏪 Café Norte — Panel de Local                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Estado: ✅ Operativo · Última sync: hace 2 min            │
│  Caja: Abierta desde 07:00 por María López                │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ $847.200 │ │ 🔴 3     │ │ 📦 2     │ │ 45       │     │
│  │ Ventas   │ │ Stock    │ │ Envíos   │ │ Tickets  │     │
│  │ Hoy      │ │ Crítico  │ │ Pendient.│ │ Hoy      │     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                                                             │
│  ┌─── Stock del Local ──────────────────────────────────┐  │
│  │                                                      │  │
│  │  🔴 Leche Entera:    12 Lt  (mín: 30)              │  │
│  │  🔴 Medialunas:       8 Und (mín: 50)              │  │
│  │  🔴 Café Grano:       2 Kg  (mín: 5)               │  │
│  │  🟡 Azúcar:          15 Kg  (mín: 10)              │  │
│  │  🟢 Servilletas:    500 Und (mín: 200)              │  │
│  │                                                      │  │
│  │  [Ver Todo el Stock] [Solicitar Reposición]         │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Movimientos Recientes ────────────────────────────┐  │
│  │                                                      │  │
│  │  10:15  Venta #T-045: -2 Medialunas, -1 Café        │  │
│  │  10:08  Venta #T-044: -1 Tostado, -2 Jugos          │  │
│  │  09:45  Corrección: +5 Medialunas (error de conteo) │  │
│  │  09:15  Recepción Envío #ENV-001: +148 items         │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Alertas ──────────────────────────────────────────┐  │
│  │                                                      │  │
│  │  🤖 Stock de Medialunas no alcanza para el turno    │  │
│  │     tarde. Producción sugerida: 100 unidades        │  │
│  │     [Solicitar a Depósito]                          │  │
│  │                                                      │  │
│  │  ⚠️ Corrección de stock requiere aprobación:         │  │
│  │     +5 Medialunas por María López                   │  │
│  │     [Aprobar] [Rechazar] [Ver Detalle]              │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Correcciones de Stock en Local

| Tipo de Corrección | Requiere Aprobación | Campos |
|---|---|---|
| Error de conteo | Sí (gerente) | Producto, cant, motivo |
| Rotura/Desperdicio | No | Producto, cant, foto, motivo |
| Devolución de cliente | Sí (gerente) | Ticket ref, producto, cant |
| Vencimiento | No | Producto, cant, lote, foto |
| Transferencia a otro local | Sí (admin) | Producto, cant, destino |
| Consumo interno | No | Producto, cant, motivo |

### 8.3 Flujo de Corrección

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. Empleado │───▶│  2. Sistema  │───▶│  3a. Auto    │
│  registra    │    │  evalúa tipo │    │  aprobación  │
│  corrección  │    │  y monto     │    │  (si aplica) │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                    ┌──────────────┐           │
                    │  3b. Espera  │◀──────────┘
                    │  aprobación  │
                    │  de gerente  │
                    └──────────────┘
                           │
                    ┌──────────────┐
                    │  4. Stock    │
                    │  actualizado │
                    └──────────────┘
```

---

## 9. Módulo: Comandas y Control de Mesas

### 9.1 Pantalla: Mapa de Mesas

```
┌─────────────────────────────────────────────────────────────┐
│ 🍽️ Mesas — Café Norte                   Turno: Mañana      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SALÓN PRINCIPAL                                           │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐            │
│  │ M1  │  │ M2  │  │ M3  │  │ M4  │  │ M5  │            │
│  │ 🟢  │  │ 🔴4p│  │ 🟢  │  │ 🟡2p│  │ 🔴3p│            │
│  │Libre│  │45min│  │Libre│  │Pedir│  │20min│            │
│  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘            │
│                                                             │
│  TERRAZA                                                   │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                      │
│  │ T1  │  │ T2  │  │ T3  │  │ T4  │                      │
│  │ 🔴2p│  │ 🟢  │  │ 🟢  │  │ 🔴6p│                      │
│  │35min│  │Libre│  │Libre│  │55min│                      │
│  └─────┘  └─────┘  └─────┘  └─────┘                      │
│                                                             │
│  BARRA                                                     │
│  [B1 🔴] [B2 🟢] [B3 🔴] [B4 🟢] [B5 🔴] [B6 🟢]        │
│                                                             │
│  Resumen: 6 ocupadas · 7 libres · 1 pidiendo              │
│  Tiempo promedio: 38 min                                   │
│                                                             │
│  [+ Pedido Mostrador] [+ Pedido Delivery]                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Pantalla: Toma de Pedido

```
┌─────────────────────────────────────────────────────────────┐
│ 🍽️ Mesa M2 — 4 personas — Mozo: Pedro                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [🎤 Pedido por Voz]  [📝 Manual]  [⏱️ 00:45]             │
│                                                             │
│  ──── Menú Rápido ─────────────────────────────────────── │
│                                                             │
│  ☕ Cafetería    🥐 Panadería    🥗 Cocina    🍺 Bebidas   │
│                                                             │
│  [Cortado   ] [Medialuna ] [Tostado   ] [Agua min. ]     │
│  [Café doble] [Factura   ] [Sandwich  ] [Jugo nat. ]     │
│  [Cappuccino] [Croissant ] [Ensalada  ] [Gaseosa   ]     │
│  [Té        ] [Torta porc] [Milanesa  ] [Cerveza   ]     │
│  [Submarino ] [Brownie   ] [Pasta     ] [Vino copa ]     │
│                                                             │
│  ──── Pedido Actual ───────────────────────────────────── │
│                                                             │
│  │ Item              │ Cant│ Sector  │ Notas        │ $   │ │
│  │───────────────────┼─────┼────────┼──────────────┼─────│ │
│  │ Cortado           │  2  │ ☕ Café │              │2.400│ │
│  │ Cappuccino        │  1  │ ☕ Café │ Con canela   │1.800│ │
│  │ Medialuna manteca │  4  │ 🥐 Pan. │ 2 calientes  │2.000│ │
│  │ Tostado J&Q       │  1  │ 🥗 Coc. │ Sin tomate   │3.200│ │
│  │ Jugo naranja      │  2  │ 🍺 Beb. │ Grande       │3.600│ │
│                                                             │
│  Subtotal: $13.000                                         │
│                                                             │
│  [Cancelar Pedido] [Agregar Item]  [✅ Enviar a Cocina]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Monitor de Sector (Cocina / Barra / Café)

```
┌─────────────────────────────────────────────────────────────┐
│ 🔥 Monitor: COCINA                    ⏱️ 11:23 AM          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐│
│  │ 🔴 URGENTE      │ │ 🟡 EN COLA      │ │ 🟢 EN PREP.   ││
│  │                 │ │                 │ │                ││
│  │ Mesa T4 ⏱️12min│ │ Mesa M2 ⏱️2min │ │ Mesa M5 ⏱️8min││
│  │ ───────────    │ │ ───────────    │ │ ───────────   ││
│  │ 2x Milanesa    │ │ 1x Tostado J&Q │ │ 1x Ensalada   ││
│  │ 1x Pasta       │ │   Sin tomate   │ │ 2x Sandwich   ││
│  │ 1x Ensalada    │ │                 │ │               ││
│  │ Nota: mesa 6p  │ │                 │ │ [Listo ✅]    ││
│  │ piden rapido    │ │                 │ │               ││
│  │                 │ │ [Iniciar 🔥]   │ │               ││
│  │ [Iniciar 🔥]   │ │                 │ │               ││
│  └─────────────────┘ └─────────────────┘ └────────────────┘│
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 🔈 Último pedido: Mesa M2 — Tostado J&Q sin tomate  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Completados hoy: 87 │ Tiempo prom: 14 min │ En cola: 3   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 Separación por Sectores

| Sector | Ícono | Productos | Monitor |
|---|---|---|---|
| Cocina | 🔥 | Platos calientes, sandwiches, tostados | Pantalla cocina |
| Barra de Bebidas | 🍺 | Bebidas frías, jugos, gaseosas, alcohol | Pantalla barra |
| Café | ☕ | Café, té, infusiones, chocolate | Pantalla café |
| Panadería | 🥐 | Medialunas, facturas, tortas | Pantalla mostrador |
| Delivery | 🏍️ | Todos los items para delivery | Pantalla despacho |

### 9.5 Pedido por Voz (IA)

**Flujo:**
1. Mozo presiona botón de micrófono
2. Dicta el pedido: *"Dos cortados, un cappuccino con canela, cuatro medialunas, dos calientes, un tostado sin tomate y dos jugos de naranja grandes"*
3. IA procesa y genera el pedido estructurado
4. Mozo revisa y confirma
5. Se envía a los sectores correspondientes

**Tecnología:** Whisper API → NLP personalizado → Matching con menú

---

## 10. Módulo: Reportes y Analítica

### 10.1 Pantalla: Centro de Reportes

```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Reportes y Analítica                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Período: [Última Semana ▼]  Local: [Todos ▼]  📥 Exportar│
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 📈 Visión    │ │ 📉 Pérdidas  │ │ 💰 Costos    │       │
│  │   General    │ │   y Mermas   │ │   y Márgenes │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 📦 Consumo   │ │ 🤖 IA        │ │ 🏪 Por Local │       │
│  │   de Insumos │ │  Proyecciones│ │   Comparativo│       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                             │
│  ──── Visión General ──────────────────────────────────── │
│                                                             │
│  ┌────────────────────────────┐ ┌────────────────────────┐ │
│  │ Ventas Totales             │ │ Margen Bruto           │ │
│  │ $18.450.000               │ │ 62.3% (+2.1%)          │ │
│  │ ▲ 8.5% vs semana anterior │ │ ▲ vs semana anterior   │ │
│  │                            │ │                        │ │
│  │ [Gráfico línea 7 días]    │ │ [Gráfico por categoría]│ │
│  └────────────────────────────┘ └────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────┐ ┌────────────────────────┐ │
│  │ Top 5 Productos           │ │ Pérdidas del Período   │ │
│  │                            │ │                        │ │
│  │ 1. Cortado        $2.4M   │ │ Total: $127.400        │ │
│  │ 2. Medialuna      $1.8M   │ │ ▼ 15% vs anterior      │ │
│  │ 3. Café doble     $1.2M   │ │                        │ │
│  │ 4. Tostado J&Q    $980K   │ │ • Vencimiento: $45.2K  │ │
│  │ 5. Cappuccino     $870K   │ │ • Rotura: $32.1K       │ │
│  │                            │ │ • Merma prod: $28.8K   │ │
│  │                            │ │ • Diferencias: $21.3K  │ │
│  └────────────────────────────┘ └────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Reportes Disponibles

| Reporte | Descripción | Periodicidad | Roles |
|---|---|---|---|
| **Visión General** | KPIs principales, ventas, márgenes | Diario/Semanal/Mensual | Admin, Gerente |
| **Pérdidas y Mermas** | Detalle de pérdidas por tipo y local | Semanal/Mensual | Admin, Auditor |
| **Consumo de Insumos** | Uso real vs teórico por producto | Semanal | Admin, Jefe Depósito |
| **Costos y Márgenes** | Costo real por producto y receta | Mensual | Admin, Auditor |
| **Proyecciones IA** | Demanda futura, stock, compras | Semanal | Admin |
| **Comparativo por Local** | Rendimiento local vs local | Mensual | Admin |
| **Productividad** | Tiempos de producción, comandas | Semanal | Admin, Gerente |
| **Stock Valorizado** | Valor del inventario por ubicación | Mensual | Admin, Auditor |
| **Movimientos** | Historial completo de movimientos | Bajo demanda | Todos |
| **Auditoría** | Log de acciones del sistema | Bajo demanda | Admin, Auditor |

### 10.3 Formatos de Exportación

- **PDF**: Reportes formateados con gráficos
- **Excel (.xlsx)**: Datos crudos con tablas dinámicas
- **CSV**: Para integración con otros sistemas
- **Email programado**: Envío automático periódico

---

## 11. Especificación de Alertas y Semáforos

### 11.1 Sistema de Alertas

| ID | Alerta | Trigger | Prioridad | Canal | Acción |
|---|---|---|---|---|---|
| A01 | Stock crítico | `qty <= min_qty` | Alta | Push + Dashboard | Sugerencia de reposición |
| A02 | Stock medio | `qty <= min_qty * 1.5` | Media | Dashboard | Información |
| A03 | Producción pendiente | Orden sin iniciar > 2h | Media | Push + Dashboard | Recordatorio |
| A04 | Envío no recibido | Envío sin confirmación > ETA + 1h | Alta | Push + Email | Escalamiento |
| A05 | Diferencia en recepción > 10% | En validación de envío | Alta | Push + Email | Bloqueo + aprobación |
| A06 | Corrección de stock pendiente | Corrección sin aprobar > 4h | Media | Push | Recordatorio a gerente |
| A07 | Caja sin cerrar | Caja abierta > 14h | Alta | Push | Notificación admin |
| A08 | Anomalía de consumo (IA) | Desviación > 2σ del patrón | Alta | Dashboard | Revisión |
| A09 | Sugerencia de compra (IA) | Proyección de agotamiento | Media | Dashboard | Acción de compra |
| A10 | Producto próximo a vencer | Vencimiento < 7 días | Media | Dashboard | Priorizar uso |
| A11 | Local desconectado | Sin heartbeat > 10 min | Crítica | Push + Email | Verificar conexión |
| A12 | Comanda demorada | Tiempo en cola > 20 min | Alta | Monitor + Push | Alerta cocina |

### 11.2 Canales de Notificación

| Canal | Uso | Tecnología |
|---|---|---|
| Dashboard | Todas las alertas | WebSocket en tiempo real |
| Push Notification | Alertas alta/crítica | Firebase Cloud Messaging |
| Email | Alertas críticas + reportes | SendGrid / SES |
| SMS | Solo emergencias (local desconectado) | Twilio |
| Monitor de Sector | Alertas de comandas | WebSocket |
| Sonido | Nuevas comandas, alertas críticas | Web Audio API |

---

## 12. Mapa de Navegación

```
                            ┌─────────────┐
                            │   LOGIN     │
                            └──────┬──────┘
                                   │
                            ┌──────▼──────┐
                   ┌────────│  DASHBOARD  │────────┐
                   │        └──────┬──────┘        │
                   │               │               │
          ┌────────▼──┐    ┌──────▼──────┐   ┌────▼────────┐
          │  STOCK &  │    │ PRODUCCIÓN  │   │  LOGÍSTICA  │
          │ PRODUCTOS │    │             │   │  & ENVÍOS   │
          ├───────────┤    ├─────────────┤   ├─────────────┤
          │• Listado  │    │• Órdenes    │   │• Envíos     │
          │• Detalle  │    │• Nueva Orden│   │• Nuevo Envío│
          │• Nuevo    │    │• Recetas    │   │• Tracking   │
          │• Categorías│   │• Sugerencias│   │• Recepción  │
          └───────────┘    └─────────────┘   └─────────────┘
                   │               │               │
          ┌────────▼──┐    ┌──────▼──────┐   ┌────▼────────┐
          │ INGRESOS  │    │  COMANDAS   │   │   LOCALES   │
          │ MERCADERÍA│    │  & MESAS    │   │             │
          ├───────────┤    ├─────────────┤   ├─────────────┤
          │• Nuevo    │    │• Mapa Mesas │   │• Dashboard  │
          │• OCR IA   │    │• Toma Pedido│   │• Stock      │
          │• Historial│    │• Monitores  │   │• Movimientos│
          │• Revisión │    │• Cobro      │   │• Correcciones│
          └───────────┘    └─────────────┘   └─────────────┘
                   │               │               │
                   │        ┌──────▼──────┐        │
                   └────────│  REPORTES   │────────┘
                            │ & ANALÍTICA │
                            ├─────────────┤
                            │• General    │
                            │• Pérdidas   │
                            │• Costos     │
                            │• Proyección │
                            │• Por Local  │
                            └─────────────┘
                                   │
                   ┌───────────────┼───────────────┐
                   │               │               │
            ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼─────┐
            │  USUARIOS   │ │    IA &    │ │   CONFIG   │
            │  & ROLES    │ │  ALERTAS   │ │  GENERAL   │
            └─────────────┘ └────────────┘ └────────────┘
```

### 12.1 Sidebar de Navegación

```
┌──────────────────────┐
│  🔵 ELIO             │
│                      │
│  🏠 Dashboard        │
│                      │
│  ─── OPERACIONES ─── │
│  📦 Stock & Productos│
│  📥 Ingresos         │
│  🍽️ Producción       │
│  🚛 Logística        │
│                      │
│  ─── LOCALES ──────  │
│  🏪 Café Norte       │
│  🏪 Restaurante Sur  │
│  🏪 Express Centro   │
│                      │
│  ─── PUNTO VENTA ──  │
│  🍽️ Comandas & Mesas │
│                      │
│  ─── ANÁLISIS ─────  │
│  📊 Reportes         │
│  🤖 IA & Alertas     │
│                      │
│  ─── SISTEMA ──────  │
│  👥 Usuarios         │
│  ⚙️ Configuración    │
│                      │
│  ─────────────────── │
│  👤 Mauricio H.      │
│  Admin General       │
│  [Cerrar Sesión]     │
│                      │
└──────────────────────┘
```

---

## 13. Textos y Labels del Sistema

### 13.1 Navegación y Headers

| Elemento | Texto | Contexto |
|---|---|---|
| App Name | ELIO | Sidebar, login |
| Tagline | Gestión Integral Gastronómica | Login, about |
| Dashboard Title | Panel de Control | Header |
| Greeting | Buenos días/tardes/noches, {nombre} | Dashboard |
| Network Status | {n} locales activos · Depósito {status} | Dashboard |

### 13.2 Botones Principales

| Botón | Texto | Variante |
|---|---|---|
| Crear | + Nuevo {entidad} | Primary |
| Guardar | Guardar | Primary |
| Confirmar | ✅ Confirmar {acción} | Success |
| Cancelar | Cancelar | Ghost |
| Eliminar | Eliminar | Danger |
| Exportar | 📥 Exportar | Secondary |
| Filtrar | Filtrar | Secondary |
| Buscar | 🔍 Buscar {entidad}... | Input placeholder |
| Editar | Editar {entidad} | Secondary |
| Ver Detalle | Ver Detalle | Link |
| Volver | ← Volver a {sección} | Link |

### 13.3 Estados y Badges

| Estado | Texto | Color | Contexto |
|---|---|---|---|
| Activo | Activo | Verde | Productos, usuarios |
| Inactivo | Inactivo | Gris | Productos, usuarios |
| Pendiente | Pendiente | Amarillo | Producciones, aprobaciones |
| En Curso | En Curso | Azul | Producciones, envíos |
| Completado | Completado | Verde | Producciones, envíos |
| Cancelado | Cancelado | Rojo | Producciones, envíos |
| Crítico | Stock Crítico | Rojo | Stock |
| Medio | Stock Medio | Amarillo | Stock |
| Normal | Stock Normal | Verde | Stock |
| Exceso | Sobrestock | Azul | Stock |

### 13.4 Mensajes de Error

| Código | Mensaje | Contexto |
|---|---|---|
| E001 | No se puede iniciar producción: stock insuficiente de {items} | Producción |
| E002 | Factura duplicada: ya existe un ingreso con este número | Ingresos |
| E003 | Diferencia mayor al 10%: requiere aprobación de administrador | Logística |
| E004 | No tiene permisos para realizar esta acción | General |
| E005 | Error de conexión: reintentando... | General |
| E006 | Producto no encontrado en catálogo | Ingresos |
| E007 | Stock insuficiente para este envío | Logística |
| E008 | Caja no abierta: debe abrir caja antes de operar | Comandas |
| E009 | Receta sin ingredientes definidos | Producción |
| E010 | Local sin conexión: operando en modo offline | Locales |

### 13.5 Mensajes de Confirmación

| Acción | Mensaje |
|---|---|
| Confirmar Ingreso | ¿Confirmar ingreso de {n} items por ${total}? Esta acción actualizará el stock. |
| Iniciar Producción | ¿Iniciar producción de {qty} {producto}? Se descontarán los insumos del stock. |
| Despachar Envío | ¿Confirmar despacho de {n} items a {local}? |
| Confirmar Recepción | ¿Confirmar recepción? {diferencias detectadas}. |
| Aprobar Corrección | ¿Aprobar corrección de stock: {detalle}? |
| Enviar Comanda | ¿Enviar pedido de Mesa {n} a cocina? |

### 13.6 Mensajes de IA

| Tipo | Formato |
|---|---|
| Sugerencia de compra | 🤖 {Producto}: al ritmo actual, se agota en {n} días. Sugerencia: pedir {qty} {unit}. |
| Anomalía detectada | 🤖 Anomalía en consumo de {producto}: {descripción}. Revisar {local}. |
| Proyección de demanda | 🤖 Para {día}: se estiman {qty} unidades de {producto} (base: histórico {período}). |
| OCR completado | 🤖 Factura procesada: {n} items detectados con {confianza}% de confianza. |
| Producción sugerida | 🤖 Basado en demanda histórica para {día}: producir {lista de items}. |

---

## 14. Flujos Funcionales Detallados

### 14.1 Flujo: Ingreso de Mercadería con OCR

**Actor:** Jefe de Depósito  
**Precondición:** Proveedor y productos registrados en el sistema

1. Jefe de Depósito selecciona "Nuevo Ingreso" → "Foto de Factura (IA)"
2. Toma foto de la factura con cámara del dispositivo o sube archivo
3. Sistema envía imagen a servicio de IA OCR
4. IA extrae: proveedor, nro factura, fecha, items, cantidades, precios
5. Sistema muestra pantalla de revisión lado a lado (imagen + datos extraídos)
6. Sistema intenta hacer match automático de items con catálogo de productos
7. Items con confianza < 90% se marcan para revisión manual
8. Usuario revisa, corrige si es necesario, y aprueba
9. Sistema pre-carga formulario de ingreso con datos validados
10. Usuario compara con orden de compra (si existe) y marca diferencias
11. Usuario registra observaciones por cada diferencia
12. Sistema calcula costo total y muestra resumen
13. Usuario confirma ingreso → Stock se actualiza en tiempo real
14. Sistema genera registro de auditoría

**Manejo de errores:**
- Foto ilegible → Mensaje: "No se pudo procesar la imagen. Intente con mejor iluminación o cargue manualmente."
- IA no puede matchear producto → Se muestra como "Sin match" y permite selección manual del catálogo
- Factura duplicada → Bloqueo con link al ingreso anterior

### 14.2 Flujo: Producción Completa

**Actor:** Jefe de Depósito / Operario  
**Precondición:** Recetas activas, stock disponible

1. Jefe revisa sugerencias de IA o crea orden manual
2. Selecciona receta y versión
3. Ingresa cantidad a producir
4. Sistema calcula insumos necesarios automáticamente
5. Sistema verifica disponibilidad de cada insumo:
   - ✅ Disponible → Muestra cantidad a descontar
   - ❌ Insuficiente → Muestra faltante, sugiere reducir cantidad o solicitar compra
6. Sistema muestra costo estimado (insumos + mano de obra)
7. Jefe confirma → Orden pasa a "Pendiente"
8. Operario inicia producción → Estado cambia a "En Curso"
9. Al completar, operario registra:
   - Cantidad real producida
   - Observaciones
   - Merma (si hubo)
10. Sistema descuenta insumos del stock
11. Sistema ingresa productos terminados al stock
12. Sistema calcula costo real vs estimado
13. Si hay diferencia > 5%, genera alerta

### 14.3 Flujo: Envío y Recepción

**Actores:** Jefe de Depósito, Encargado de Logística, Gerente de Local

**Creación (Depósito):**
1. Jefe de Depósito crea envío → Selecciona local destino
2. Agrega items y cantidades desde stock del depósito
3. Sistema verifica disponibilidad
4. Confirma → Genera remito y código QR único
5. Prepara envío → Marca como "Preparado"
6. Despacha → Marca como "En Tránsito"

**Recepción (Local):**
7. Gerente de Local escanea QR del envío
8. Sistema carga lista de items esperados
9. Gerente ingresa cantidades recibidas para cada item
10. Sistema calcula diferencias automáticamente
11. Si diferencia = 0 → Cierre automático
12. Si diferencia < 5% → Requiere motivo
13. Si diferencia 5-10% → Requiere motivo + foto
14. Si diferencia > 10% → Bloqueo, escala a admin
15. Admin revisa y aprueba/rechaza
16. Stock del local se actualiza
17. Stock del depósito se ajusta si hay diferencias aprobadas

### 14.4 Flujo: Toma de Comanda

**Actor:** Mozo  
**Precondición:** Caja abierta, mesas configuradas

1. Mozo selecciona mesa del mapa → Se asigna automáticamente
2. Opción A: Manual → Selecciona items del menú
   - Busca por categoría o nombre
   - Agrega cantidad y notas especiales
3. Opción B: Por voz → Presiona micrófono
   - Dicta pedido natural
   - IA procesa y estructura
   - Mozo revisa y confirma
4. Sistema separa items por sector (cocina, café, barra)
5. Mozo confirma → Pedido se envía a cada sector
6. En el monitor de cada sector aparece nuevo pedido con sonido
7. Cocinero/Barista marca "Iniciado"
8. Al completar item, marca "Listo"
9. Monitor del mozo muestra items listos para servir
10. Mozo sirve y marca como entregado
11. Al solicitar cuenta → Sistema genera ticket
12. Cobro (efectivo, tarjeta, QR) → Cierre de mesa

---

## 15. Descripción de Flujos por Usuario

### 15.1 Admin General (Mauricio)

**Inicio de día:**
1. Abre Dashboard → Revisa KPIs generales
2. Verifica alertas pendientes (especialmente IA)
3. Revisa estado de cada local
4. Aprueba correcciones de stock pendientes
5. Revisa reportes del día anterior

**Tareas periódicas:**
- Revisar reportes semanales de pérdidas
- Analizar proyecciones de IA para compras
- Configurar nuevas recetas o actualizar versiones
- Gestionar usuarios y permisos
- Revisar anomalías detectadas por IA

### 15.2 Gerente de Local

**Apertura:**
1. Abre caja del local
2. Revisa stock local → Verifica items críticos
3. Confirma recepciones de envíos pendientes
4. Revisa comandas del turno anterior (si aplica)

**Durante el día:**
- Supervisa mapa de mesas y tiempos
- Aprueba correcciones de stock
- Gestiona situaciones de stock bajo
- Solicita reposiciones al depósito

**Cierre:**
1. Verifica que todas las mesas estén cerradas
2. Revisa resumen de ventas del día
3. Cierra caja con arqueo
4. Revisa correcciones pendientes

### 15.3 Jefe de Depósito

**Inicio de día:**
1. Revisa órdenes de producción pendientes
2. Verifica stock de insumos
3. Confirma sugerencias de producción de IA
4. Programa envíos del día

**Durante el día:**
- Recibe mercadería (con OCR o manual)
- Supervisa producciones en curso
- Despacha envíos a locales
- Registra mermas y ajustes

---

Este documento continúa con el Modelo de Datos, APIs, Integración IA, Guía de Estilo y Requerimientos Técnicos en documentos separados.
