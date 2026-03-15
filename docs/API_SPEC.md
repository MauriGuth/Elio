# ELIO — Especificación de APIs REST

## Base URL: `https://api.elio.app/v1`

## Formato: JSON  
## Autenticación: Bearer Token (JWT)  
## Versionado: URI path (`/v1/`)

---

## 1. Autenticación y Usuarios

### 1.1 Auth

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/auth/login` | Iniciar sesión | No |
| `POST` | `/auth/refresh` | Renovar token | Refresh Token |
| `POST` | `/auth/logout` | Cerrar sesión | Sí |
| `POST` | `/auth/forgot-password` | Solicitar reset | No |
| `POST` | `/auth/reset-password` | Resetear contraseña | Token temporal |
| `GET` | `/auth/me` | Perfil del usuario actual | Sí |
| `PUT` | `/auth/me` | Actualizar perfil | Sí |
| `PUT` | `/auth/me/password` | Cambiar contraseña | Sí |

**POST `/auth/login`**

```json
// Request
{
  "email": "mauricio@elio.app",
  "password": "********"
}

// Response 200
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "uuid",
    "email": "mauricio@elio.app",
    "first_name": "Mauricio",
    "last_name": "Huentelaf",
    "role": "admin",
    "location_id": null,
    "tenant": {
      "id": "uuid",
      "name": "Elio Gastronomía",
      "slug": "elio-gastronomia"
    }
  }
}

// Response 401
{
  "error": "invalid_credentials",
  "message": "Email o contraseña incorrectos"
}
```

### 1.2 Users

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/users` | Listar usuarios | admin |
| `POST` | `/users` | Crear usuario | admin |
| `GET` | `/users/:id` | Detalle usuario | admin |
| `PUT` | `/users/:id` | Actualizar usuario | admin |
| `DELETE` | `/users/:id` | Desactivar usuario | admin |
| `PUT` | `/users/:id/role` | Cambiar rol | admin |
| `PUT` | `/users/:id/location` | Asignar local | admin |

**GET `/users`**

```
Query params:
  ?role=waiter
  &location_id=uuid
  &is_active=true
  &search=juan
  &page=1
  &per_page=25
  &sort=last_name
  &order=asc
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "email": "juan@elio.app",
      "first_name": "Juan",
      "last_name": "Pérez",
      "role": "warehouse_manager",
      "location": { "id": "uuid", "name": "Depósito Central" },
      "is_active": true,
      "last_login": "2026-02-11T08:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 12,
    "total_pages": 1
  }
}
```

---

## 2. Productos y Stock

### 2.1 Products

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/products` | Listar productos | Todos |
| `POST` | `/products` | Crear producto | admin, warehouse_manager |
| `GET` | `/products/:id` | Detalle producto | Todos |
| `PUT` | `/products/:id` | Actualizar producto | admin, warehouse_manager |
| `DELETE` | `/products/:id` | Desactivar producto | admin |
| `GET` | `/products/:id/stock` | Stock por ubicación | Todos |
| `GET` | `/products/:id/movements` | Historial movimientos | Todos |
| `GET` | `/products/:id/suppliers` | Proveedores del producto | admin, warehouse_manager |
| `POST` | `/products/import` | Importar masivo (CSV) | admin |
| `GET` | `/products/export` | Exportar productos | admin, auditor |

**GET `/products`**

```
Query params:
  ?search=harina
  &category_id=uuid
  &status=critical           // critical, medium, normal, excess
  &location_id=uuid          // filtrar por stock en ubicación
  &is_active=true
  &is_sellable=true
  &is_ingredient=true
  &barcode=7790001234567
  &page=1
  &per_page=25
  &sort=name                 // name, sku, stock, cost, category
  &order=asc
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "sku": "HAR-001",
      "barcode": "7790001234567",
      "name": "Harina 000 x25Kg",
      "description": "Harina 000 para panadería",
      "category": {
        "id": "uuid",
        "name": "Secos",
        "icon": "🌾"
      },
      "unit": "kg",
      "image_url": "https://cdn.elio.app/products/har-001.jpg",
      "avg_cost": 2450.00,
      "last_cost": 2500.00,
      "sale_price": 0,
      "is_sellable": false,
      "is_ingredient": true,
      "is_produced": false,
      "is_perishable": false,
      "stock_summary": {
        "total": 395.0,
        "critical_locations": 2,
        "by_location": [
          { "location_id": "uuid", "name": "Depósito Central", "qty": 350, "min": 100, "status": "normal" },
          { "location_id": "uuid", "name": "Café Norte", "qty": 25, "min": 50, "status": "critical" },
          { "location_id": "uuid", "name": "Restaurante Sur", "qty": 15, "min": 30, "status": "critical" },
          { "location_id": "uuid", "name": "Express Centro", "qty": 5, "min": 10, "status": "medium" }
        ]
      }
    }
  ],
  "meta": { "page": 1, "per_page": 25, "total": 342, "total_pages": 14 }
}
```

**POST `/products`**

```json
// Request
{
  "sku": "HAR-001",
  "barcode": "7790001234567",
  "name": "Harina 000 x25Kg",
  "description": "Harina 000 para panadería",
  "category_id": "uuid",
  "unit": "kg",
  "is_sellable": false,
  "is_ingredient": true,
  "is_perishable": false,
  "stock_config": [
    { "location_id": "uuid-deposito", "min_quantity": 100, "max_quantity": 500 },
    { "location_id": "uuid-cafe-norte", "min_quantity": 50 },
    { "location_id": "uuid-resto-sur", "min_quantity": 30 }
  ]
}

// Response 201
{
  "data": { /* producto creado */ },
  "message": "Producto creado exitosamente"
}
```

### 2.2 Categories

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/categories` | Listar categorías | Todos |
| `POST` | `/categories` | Crear categoría | admin |
| `PUT` | `/categories/:id` | Actualizar | admin |
| `DELETE` | `/categories/:id` | Desactivar | admin |

### 2.3 Stock

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/stock` | Stock consolidado | Todos |
| `GET` | `/stock/location/:id` | Stock por local | Todos |
| `GET` | `/stock/critical` | Items en estado crítico | Todos |
| `GET` | `/stock/movements` | Historial de movimientos | Todos |
| `GET` | `/stock/valuation` | Stock valorizado | admin, auditor |

**GET `/stock`**

```
Query params:
  ?location_id=uuid
  &status=critical,medium     // múltiples separados por coma
  &category_id=uuid
  &search=harina
  &page=1
  &per_page=50
```

```json
// Response 200
{
  "data": [
    {
      "product_id": "uuid",
      "sku": "HAR-001",
      "name": "Harina 000 x25Kg",
      "category": "Secos",
      "unit": "kg",
      "locations": [
        {
          "location_id": "uuid",
          "location_name": "Depósito Central",
          "quantity": 350.0,
          "min_quantity": 100.0,
          "max_quantity": 500.0,
          "status": "normal"
        }
      ],
      "total_qty": 395.0,
      "avg_cost": 2450.00,
      "total_value": 967750.00,
      "worst_status": "critical"
    }
  ],
  "summary": {
    "total_products": 342,
    "critical_count": 12,
    "medium_count": 28,
    "normal_count": 295,
    "excess_count": 7,
    "total_value": 15847500.00
  }
}
```

### 2.4 Stock Corrections

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/stock/corrections` | Listar correcciones | admin, location_manager |
| `POST` | `/stock/corrections` | Crear corrección | Todos (con local asignado) |
| `GET` | `/stock/corrections/:id` | Detalle | admin, location_manager |
| `PUT` | `/stock/corrections/:id/approve` | Aprobar | admin, location_manager |
| `PUT` | `/stock/corrections/:id/reject` | Rechazar | admin, location_manager |

**POST `/stock/corrections`**

```json
// Request
{
  "location_id": "uuid",
  "product_id": "uuid",
  "type": "breakage",
  "quantity": -5,
  "reason": "5 medialunas cayeron al piso durante el servicio",
  "photo_url": "https://cdn.elio.app/corrections/foto-123.jpg"
}

// Response 201
{
  "data": {
    "id": "uuid",
    "status": "auto_approved", // o "pending" si requiere aprobación
    "message": "Corrección registrada. Stock actualizado."
  }
}
```

---

## 3. Suppliers (Proveedores)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/suppliers` | Listar proveedores | admin, warehouse_manager |
| `POST` | `/suppliers` | Crear proveedor | admin, warehouse_manager |
| `GET` | `/suppliers/:id` | Detalle | admin, warehouse_manager |
| `PUT` | `/suppliers/:id` | Actualizar | admin, warehouse_manager |
| `DELETE` | `/suppliers/:id` | Desactivar | admin |
| `GET` | `/suppliers/:id/products` | Productos del proveedor | admin, warehouse_manager |
| `GET` | `/suppliers/:id/receipts` | Historial de ingresos | admin, warehouse_manager, auditor |

---

## 4. Ingresos de Mercadería

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/goods-receipts` | Listar ingresos | admin, warehouse_manager, auditor |
| `POST` | `/goods-receipts` | Crear ingreso (manual) | admin, warehouse_manager |
| `POST` | `/goods-receipts/ocr` | Crear desde OCR | admin, warehouse_manager |
| `GET` | `/goods-receipts/:id` | Detalle | admin, warehouse_manager, auditor |
| `PUT` | `/goods-receipts/:id` | Actualizar borrador | admin, warehouse_manager |
| `PUT` | `/goods-receipts/:id/confirm` | Confirmar ingreso | admin, warehouse_manager |
| `PUT` | `/goods-receipts/:id/cancel` | Cancelar | admin |
| `GET` | `/goods-receipts/:id/items` | Items del ingreso | admin, warehouse_manager |

**POST `/goods-receipts/ocr`**

```json
// Request (multipart/form-data)
{
  "image": "[archivo de imagen]",
  "location_id": "uuid"
}

// Response 200 (procesamiento OCR)
{
  "data": {
    "id": "uuid",
    "status": "pending_review",
    "ocr_confidence": 94.2,
    "extracted": {
      "supplier_match": {
        "detected_name": "Molinos del Sur S.A.",
        "matched_id": "uuid",
        "matched_name": "Molinos del Sur",
        "confidence": 97.5
      },
      "invoice_number": "FC-A-0001-00045832",
      "invoice_date": "2026-02-11",
      "total_amount": 487500.00,
      "items": [
        {
          "detected_text": "Hna 000 25K",
          "matched_product_id": "uuid",
          "matched_product_name": "Harina 000 x25Kg",
          "confidence": 92.1,
          "quantity": 10,
          "unit_price": 24500.00,
          "total": 245000.00
        },
        {
          "detected_text": "Leche Ent 1L",
          "matched_product_id": "uuid",
          "matched_product_name": "Leche Entera 1L",
          "confidence": 98.3,
          "quantity": 100,
          "unit_price": 1200.00,
          "total": 120000.00
        }
      ]
    },
    "image_url": "https://cdn.elio.app/receipts/ocr-123.jpg"
  }
}
```

**PUT `/goods-receipts/:id/confirm`**

```json
// Request
{
  "items": [
    {
      "product_id": "uuid",
      "ordered_qty": 250,
      "received_qty": 250,
      "unit_cost": 2450.00,
      "lot_number": "L-2026-0205",
      "expiry_date": "2026-08-15"
    },
    {
      "product_id": "uuid",
      "ordered_qty": 100,
      "received_qty": 96,
      "unit_cost": 1200.00,
      "notes": "4 envases dañados - rechazados"
    }
  ],
  "notes": "Entrega parcial de leche por envases dañados"
}

// Response 200
{
  "data": {
    "id": "uuid",
    "status": "confirmed",
    "total_amount": 463200.00,
    "items_count": 4,
    "items_with_diff": 2,
    "stock_updated": true
  },
  "message": "Ingreso confirmado. Stock actualizado en Depósito Central."
}
```

---

## 5. Producción

### 5.1 Recipes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/recipes` | Listar recetas | Todos |
| `POST` | `/recipes` | Crear receta | admin, warehouse_manager |
| `GET` | `/recipes/:id` | Detalle con ingredientes | Todos |
| `PUT` | `/recipes/:id` | Actualizar receta | admin, warehouse_manager |
| `POST` | `/recipes/:id/version` | Nueva versión | admin, warehouse_manager |
| `GET` | `/recipes/:id/versions` | Historial de versiones | admin, warehouse_manager |
| `GET` | `/recipes/:id/cost` | Costo actual calculado | admin, warehouse_manager, auditor |
| `POST` | `/recipes/:id/simulate` | Simular producción | admin, warehouse_manager |

**POST `/recipes/:id/simulate`**

```json
// Request
{
  "quantity": 300
}

// Response 200
{
  "data": {
    "recipe": { "id": "uuid", "name": "Medialunas de Manteca", "version": "2.1" },
    "planned_qty": 300,
    "ingredients": [
      {
        "product_id": "uuid",
        "name": "Harina 000",
        "required_qty": 45.0,
        "unit": "kg",
        "available_qty": 350.0,
        "sufficient": true,
        "unit_cost": 2450.00,
        "total_cost": 110250.00
      },
      {
        "product_id": "uuid",
        "name": "Manteca",
        "required_qty": 15.0,
        "unit": "kg",
        "available_qty": 8.0,
        "sufficient": false,
        "shortage": 7.0,
        "unit_cost": 8500.00,
        "total_cost": 127500.00
      }
    ],
    "total_ingredient_cost": 67350.00,
    "estimated_labor_cost": 15000.00,
    "total_estimated_cost": 82350.00,
    "unit_cost": 274.50,
    "all_ingredients_available": false,
    "max_producible_qty": 160,
    "shortages": [
      { "product": "Manteca", "shortage": 7.0, "unit": "kg" },
      { "product": "Huevos", "shortage": 10, "unit": "und" }
    ]
  }
}
```

### 5.2 Production Orders

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/production` | Listar órdenes | admin, warehouse_manager, production_worker |
| `POST` | `/production` | Crear orden | admin, warehouse_manager |
| `GET` | `/production/:id` | Detalle orden | admin, warehouse_manager, production_worker |
| `PUT` | `/production/:id` | Actualizar borrador | admin, warehouse_manager |
| `PUT` | `/production/:id/start` | Iniciar producción | warehouse_manager, production_worker |
| `PUT` | `/production/:id/complete` | Completar producción | warehouse_manager, production_worker |
| `PUT` | `/production/:id/cancel` | Cancelar | admin, warehouse_manager |
| `GET` | `/production/suggestions` | Sugerencias de IA | admin, warehouse_manager |

**PUT `/production/:id/complete`**

```json
// Request
{
  "actual_qty": 295,
  "waste_qty": 5,
  "waste_notes": "5 unidades no alcanzaron el estándar de calidad",
  "actual_ingredients": [
    { "product_id": "uuid", "actual_qty": 45.0 },
    { "product_id": "uuid", "actual_qty": 15.2 },
    { "product_id": "uuid", "actual_qty": 1.5 }
  ],
  "labor_cost": 16000.00,
  "notes": "Producción normal, ligero exceso de manteca"
}

// Response 200
{
  "data": {
    "id": "uuid",
    "status": "completed_adjusted",
    "actual_qty": 295,
    "planned_qty": 300,
    "variance_pct": -1.67,
    "actual_cost": 84200.00,
    "estimated_cost": 82350.00,
    "cost_variance": 1850.00,
    "unit_cost": 285.42,
    "stock_movements_created": 8,
    "product_added_to_stock": true
  },
  "message": "Producción completada. 295 Medialunas ingresadas al stock del Depósito Central."
}
```

---

## 6. Logística y Envíos

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/shipments` | Listar envíos | Todos |
| `POST` | `/shipments` | Crear envío | admin, warehouse_manager, logistics |
| `GET` | `/shipments/:id` | Detalle envío | Todos |
| `PUT` | `/shipments/:id` | Actualizar borrador | admin, warehouse_manager |
| `PUT` | `/shipments/:id/prepare` | Marcar preparado | warehouse_manager, logistics |
| `PUT` | `/shipments/:id/dispatch` | Despachar | warehouse_manager, logistics |
| `PUT` | `/shipments/:id/receive` | Confirmar recepción | location_manager, admin |
| `PUT` | `/shipments/:id/approve-diff` | Aprobar diferencias | admin |
| `PUT` | `/shipments/:id/cancel` | Cancelar envío | admin, warehouse_manager |
| `GET` | `/shipments/:id/qr` | Generar código QR | Todos |
| `GET` | `/shipments/by-qr/:code` | Buscar por QR | Todos |
| `GET` | `/shipments/active` | Envíos en curso | Todos |

**POST `/shipments`**

```json
// Request
{
  "origin_id": "uuid-deposito",
  "destination_id": "uuid-cafe-norte",
  "estimated_arrival": "2026-02-11T10:30:00Z",
  "items": [
    { "product_id": "uuid", "quantity": 50, "lot_number": "L-2026-0205" },
    { "product_id": "uuid", "quantity": 48 },
    { "product_id": "uuid", "quantity": 150 },
    { "product_id": "uuid", "quantity": 10 }
  ],
  "notes": "Envío matutino regular"
}

// Response 201
{
  "data": {
    "id": "uuid",
    "shipment_number": "ENV-2026-0211-001",
    "status": "draft",
    "qr_code": "ELIO-SHP-abc123def456",
    "total_items": 4,
    "total_qty": 258
  },
  "message": "Envío creado. QR generado para escaneo en destino."
}
```

**PUT `/shipments/:id/receive`**

```json
// Request
{
  "items": [
    { "product_id": "uuid", "received_qty": 50 },
    { "product_id": "uuid", "received_qty": 48 },
    { "product_id": "uuid", "received_qty": 148, "diff_reason": "breakage", "diff_photo_url": "https://..." },
    { "product_id": "uuid", "received_qty": 10 }
  ],
  "notes": "2 medialunas rotas en transporte"
}

// Response 200
{
  "data": {
    "id": "uuid",
    "status": "received_with_diff",
    "differences": [
      {
        "product": "Medialunas",
        "sent": 150,
        "received": 148,
        "diff": -2,
        "diff_pct": -1.33,
        "reason": "breakage",
        "auto_approved": true
      }
    ],
    "total_received": 256,
    "total_sent": 258,
    "overall_diff_pct": -0.78,
    "requires_admin_approval": false
  },
  "message": "Recepción registrada con diferencias menores (auto-aprobadas). Stock actualizado."
}
```

---

## 7. Locales

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/locations` | Listar locales | Todos |
| `POST` | `/locations` | Crear local | admin |
| `GET` | `/locations/:id` | Detalle local | Todos |
| `PUT` | `/locations/:id` | Actualizar | admin |
| `GET` | `/locations/:id/dashboard` | Dashboard del local | admin, location_manager |
| `GET` | `/locations/:id/stock` | Stock del local | Todos |
| `GET` | `/locations/:id/movements` | Movimientos del local | admin, location_manager |
| `GET` | `/locations/:id/alerts` | Alertas del local | admin, location_manager |
| `POST` | `/locations/:id/heartbeat` | Heartbeat de conexión | Sistema |

**GET `/locations/:id/dashboard`**

```json
// Response 200
{
  "data": {
    "location": {
      "id": "uuid",
      "name": "Café Norte",
      "type": "cafe",
      "is_active": true,
      "last_heartbeat": "2026-02-11T10:28:00Z"
    },
    "kpis": {
      "sales_today": 847200.00,
      "sales_yesterday": 792500.00,
      "sales_change_pct": 6.9,
      "orders_today": 45,
      "avg_ticket": 18826.67,
      "stock_critical_count": 3,
      "pending_shipments": 2,
      "pending_corrections": 1
    },
    "stock_alerts": [
      { "product": "Leche Entera", "qty": 12, "min": 30, "status": "critical" },
      { "product": "Medialunas", "qty": 8, "min": 50, "status": "critical" },
      { "product": "Café Grano", "qty": 2, "min": 5, "status": "critical" }
    ],
    "recent_movements": [
      { "time": "10:15", "type": "sale", "description": "Venta #T-045: -2 Medialunas, -1 Café" }
    ],
    "active_orders": 3,
    "tables_occupied": 6,
    "tables_total": 13,
    "cash_register": {
      "status": "open",
      "opened_at": "2026-02-11T07:00:00Z",
      "opened_by": "María López",
      "total_sales": 847200.00,
      "total_orders": 45
    }
  }
}
```

---

## 8. Comandas y Mesas

### 8.1 Tables

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/locations/:id/tables` | Mapa de mesas | waiter, location_manager, admin |
| `POST` | `/locations/:id/tables` | Crear mesa | admin, location_manager |
| `PUT` | `/tables/:id` | Actualizar mesa | admin, location_manager |
| `PUT` | `/tables/:id/status` | Cambiar estado | waiter, location_manager |

### 8.2 Orders (Comandas)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/orders` | Listar pedidos | Todos |
| `POST` | `/orders` | Crear pedido | waiter, cashier |
| `GET` | `/orders/:id` | Detalle pedido | Todos |
| `POST` | `/orders/:id/items` | Agregar items | waiter |
| `PUT` | `/orders/:id/items/:itemId` | Modificar item | waiter |
| `DELETE` | `/orders/:id/items/:itemId` | Cancelar item | waiter, location_manager |
| `PUT` | `/orders/:id/send` | Enviar a cocina | waiter |
| `PUT` | `/orders/:id/close` | Cerrar/Cobrar | cashier |
| `PUT` | `/orders/:id/cancel` | Cancelar pedido | location_manager |
| `POST` | `/orders/voice` | Pedido por voz (IA) | waiter |
| `GET` | `/orders/kitchen/:sector` | Monitor de sector | kitchen |
| `PUT` | `/orders/items/:itemId/status` | Cambiar estado item | kitchen |

**POST `/orders`**

```json
// Request
{
  "location_id": "uuid",
  "type": "dine_in",
  "table_id": "uuid",
  "customer_count": 4,
  "items": [
    { "product_id": "uuid-cortado", "quantity": 2, "notes": "" },
    { "product_id": "uuid-cappuccino", "quantity": 1, "notes": "Con canela" },
    { "product_id": "uuid-medialuna", "quantity": 4, "notes": "2 calientes" },
    { "product_id": "uuid-tostado", "quantity": 1, "notes": "Sin tomate" },
    { "product_id": "uuid-jugo", "quantity": 2, "notes": "Grande" }
  ]
}

// Response 201
{
  "data": {
    "id": "uuid",
    "order_number": "T-046",
    "status": "open",
    "table": "M2",
    "items_by_sector": {
      "coffee": [
        { "name": "Cortado", "qty": 2 },
        { "name": "Cappuccino", "qty": 1, "notes": "Con canela" }
      ],
      "bakery": [
        { "name": "Medialuna Manteca", "qty": 4, "notes": "2 calientes" }
      ],
      "kitchen": [
        { "name": "Tostado J&Q", "qty": 1, "notes": "Sin tomate" }
      ],
      "drinks": [
        { "name": "Jugo Naranja", "qty": 2, "notes": "Grande" }
      ]
    },
    "subtotal": 13000.00,
    "total": 13000.00
  }
}
```

**POST `/orders/voice`**

```json
// Request (multipart/form-data)
{
  "audio": "[archivo de audio]",
  "location_id": "uuid",
  "table_id": "uuid"
}

// Response 200
{
  "data": {
    "transcription": "Dos cortados, un cappuccino con canela, cuatro medialunas dos calientes, un tostado sin tomate y dos jugos de naranja grandes",
    "confidence": 96.5,
    "parsed_items": [
      { "matched_product_id": "uuid", "name": "Cortado", "quantity": 2, "confidence": 99 },
      { "matched_product_id": "uuid", "name": "Cappuccino", "quantity": 1, "notes": "con canela", "confidence": 97 },
      { "matched_product_id": "uuid", "name": "Medialuna Manteca", "quantity": 4, "notes": "2 calientes", "confidence": 95 },
      { "matched_product_id": "uuid", "name": "Tostado J&Q", "quantity": 1, "notes": "sin tomate", "confidence": 94 },
      { "matched_product_id": "uuid", "name": "Jugo Naranja Grande", "quantity": 2, "confidence": 92 }
    ],
    "requires_confirmation": true
  }
}
```

**GET `/orders/kitchen/:sector`**

```json
// GET /orders/kitchen/kitchen
// Response 200
{
  "data": {
    "sector": "kitchen",
    "queue": [
      {
        "order_id": "uuid",
        "order_number": "T-040",
        "table": "T4",
        "customer_count": 6,
        "waiting_minutes": 12,
        "priority": "urgent",
        "items": [
          { "id": "uuid", "name": "Milanesa Napolitana", "qty": 2, "notes": "", "status": "pending" },
          { "id": "uuid", "name": "Pasta Bolognesa", "qty": 1, "notes": "", "status": "pending" },
          { "id": "uuid", "name": "Ensalada César", "qty": 1, "notes": "", "status": "pending" }
        ]
      },
      {
        "order_id": "uuid",
        "order_number": "T-046",
        "table": "M2",
        "waiting_minutes": 2,
        "priority": "normal",
        "items": [
          { "id": "uuid", "name": "Tostado J&Q", "qty": 1, "notes": "Sin tomate", "status": "pending" }
        ]
      }
    ],
    "in_progress": [
      {
        "order_number": "T-043",
        "table": "M5",
        "items": [
          { "id": "uuid", "name": "Ensalada Mixta", "qty": 1, "status": "in_progress", "started_minutes_ago": 8 },
          { "id": "uuid", "name": "Sandwich Club", "qty": 2, "status": "in_progress", "started_minutes_ago": 8 }
        ]
      }
    ],
    "stats": {
      "completed_today": 87,
      "avg_time_minutes": 14,
      "in_queue": 3,
      "in_progress": 1
    }
  }
}
```

### 8.3 Cash Register

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `POST` | `/locations/:id/cash/open` | Abrir caja | cashier, location_manager |
| `PUT` | `/locations/:id/cash/close` | Cerrar caja | cashier, location_manager |
| `GET` | `/locations/:id/cash/current` | Caja actual | cashier, location_manager |
| `GET` | `/locations/:id/cash/history` | Historial de cajas | admin, location_manager, auditor |

---

## 9. Reportes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/reports/overview` | Visión general | admin, auditor |
| `GET` | `/reports/sales` | Reporte de ventas | admin, location_manager, auditor |
| `GET` | `/reports/losses` | Pérdidas y mermas | admin, auditor |
| `GET` | `/reports/consumption` | Consumo de insumos | admin, warehouse_manager, auditor |
| `GET` | `/reports/costs` | Costos y márgenes | admin, auditor |
| `GET` | `/reports/production` | Reporte producción | admin, warehouse_manager |
| `GET` | `/reports/location-compare` | Comparativo locales | admin |
| `GET` | `/reports/stock-valuation` | Stock valorizado | admin, auditor |
| `GET` | `/reports/audit` | Log de auditoría | admin, auditor |
| `GET` | `/reports/export/:type` | Exportar reporte | admin, auditor |

**GET `/reports/overview`**

```
Query params:
  ?period=week        // day, week, month, quarter, year, custom
  &from=2026-02-04
  &to=2026-02-11
  &location_id=uuid   // null = todos
```

```json
// Response 200
{
  "data": {
    "period": { "from": "2026-02-04", "to": "2026-02-11" },
    "sales": {
      "total": 18450000.00,
      "previous_period": 17010000.00,
      "change_pct": 8.47,
      "by_day": [
        { "date": "2026-02-04", "total": 2340000 },
        { "date": "2026-02-05", "total": 2680000 }
      ],
      "by_location": [
        { "location": "Café Norte", "total": 8200000, "orders": 312 },
        { "location": "Restaurante Sur", "total": 7100000, "orders": 198 },
        { "location": "Express Centro", "total": 3150000, "orders": 445 }
      ],
      "by_payment": {
        "cash": 7380000,
        "card": 6457500,
        "mercadopago_qr": 3690000,
        "transfer": 922500
      }
    },
    "costs": {
      "total_ingredient_cost": 6957000.00,
      "gross_margin_pct": 62.3,
      "labor_cost": 2400000.00,
      "net_margin_pct": 49.3
    },
    "losses": {
      "total": 127400.00,
      "by_type": {
        "expiry": 45200,
        "breakage": 32100,
        "production_waste": 28800,
        "differences": 21300
      },
      "pct_of_sales": 0.69
    },
    "top_products": [
      { "name": "Cortado", "qty": 1420, "revenue": 2414000 },
      { "name": "Medialuna Manteca", "qty": 2840, "revenue": 1846000 },
      { "name": "Café Doble", "qty": 890, "revenue": 1246000 }
    ],
    "stock_health": {
      "critical": 12,
      "medium": 28,
      "normal": 295,
      "excess": 7
    }
  }
}
```

---

## 10. IA y Alertas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/ai/events` | Eventos de IA | admin, warehouse_manager |
| `GET` | `/ai/events/:id` | Detalle evento | admin, warehouse_manager |
| `PUT` | `/ai/events/:id/acknowledge` | Marcar como leído | admin, warehouse_manager |
| `PUT` | `/ai/events/:id/act` | Ejecutar acción sugerida | admin, warehouse_manager |
| `PUT` | `/ai/events/:id/dismiss` | Descartar | admin |
| `POST` | `/ai/ocr` | Procesar imagen OCR | admin, warehouse_manager |
| `POST` | `/ai/voice` | Procesar audio (voz) | waiter |
| `GET` | `/ai/predictions/stock` | Predicciones de stock | admin, warehouse_manager |
| `GET` | `/ai/predictions/demand` | Predicción de demanda | admin |
| `GET` | `/ai/suggestions/purchases` | Sugerencias de compra | admin, warehouse_manager |
| `GET` | `/ai/suggestions/production` | Sugerencias producción | admin, warehouse_manager |
| `GET` | `/ai/anomalies` | Anomalías detectadas | admin |

**GET `/ai/predictions/stock`**

```json
// Response 200
{
  "data": {
    "generated_at": "2026-02-11T06:00:00Z",
    "predictions": [
      {
        "product_id": "uuid",
        "product_name": "Harina 000",
        "location_id": "uuid",
        "location_name": "Café Norte",
        "current_qty": 25,
        "daily_avg_consumption": 12.5,
        "estimated_days_remaining": 2.0,
        "estimated_stockout_date": "2026-02-13",
        "confidence": 89,
        "suggested_action": "shipment",
        "suggested_qty": 50,
        "priority": "high"
      }
    ]
  }
}
```

**GET `/ai/suggestions/purchases`**

```json
// Response 200
{
  "data": {
    "generated_at": "2026-02-11T06:00:00Z",
    "suggestions": [
      {
        "product_id": "uuid",
        "product_name": "Harina 000 x25Kg",
        "supplier_id": "uuid",
        "supplier_name": "Molinos del Sur",
        "current_total_stock": 395,
        "projected_need_7d": 250,
        "suggested_order_qty": 200,
        "estimated_cost": 490000.00,
        "urgency": "medium",
        "reason": "Stock proyectado a 7 días insuficiente para Café Norte y Restaurante Sur",
        "last_purchase_date": "2026-02-05",
        "lead_time_days": 2
      }
    ]
  }
}
```

---

## 11. Alertas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| `GET` | `/alerts` | Listar alertas | Todos |
| `GET` | `/alerts/unread` | Alertas no leídas | Todos |
| `GET` | `/alerts/count` | Contador de alertas | Todos |
| `PUT` | `/alerts/:id/read` | Marcar como leída | Todos |
| `PUT` | `/alerts/:id/resolve` | Resolver alerta | Según tipo |
| `PUT` | `/alerts/read-all` | Marcar todas como leídas | Todos |

---

## 12. WebSocket Events (Tiempo Real)

### Conexión

```
wss://api.elio.app/ws?token={jwt_token}
```

### Canales

| Canal | Evento | Payload | Suscriptores |
|---|---|---|---|
| `stock:{location_id}` | `stock.updated` | `{ product_id, qty, status }` | Dashboard, Locales |
| `orders:{location_id}` | `order.created` | `{ order_id, table, items }` | Cocina, Barra |
| `orders:{location_id}` | `order.item.status` | `{ item_id, status }` | Mozos, Cocina |
| `shipments:{tenant_id}` | `shipment.status` | `{ shipment_id, status }` | Dashboard, Logística |
| `alerts:{user_id}` | `alert.new` | `{ alert_id, type, message }` | Todos |
| `ai:{tenant_id}` | `ai.event` | `{ event_id, type, title }` | Admin, Dashboard |
| `locations:{tenant_id}` | `location.heartbeat` | `{ location_id, status }` | Dashboard |
| `kitchen:{location_id}:{sector}` | `kitchen.new_order` | `{ order_id, items }` | Sector cocina |
| `kitchen:{location_id}:{sector}` | `kitchen.item.ready` | `{ item_id }` | Mozo |

### Ejemplo de Uso (Cliente)

```javascript
const ws = new WebSocket('wss://api.elio.app/ws?token=eyJhbG...');

// Suscribirse a canal
ws.send(JSON.stringify({
  action: 'subscribe',
  channels: [
    'stock:uuid-cafe-norte',
    'orders:uuid-cafe-norte',
    'alerts:uuid-mi-usuario',
    'kitchen:uuid-cafe-norte:kitchen'
  ]
}));

// Recibir eventos
ws.onmessage = (event) => {
  const { channel, event_type, data } = JSON.parse(event.data);
  
  switch (event_type) {
    case 'order.created':
      playNotificationSound();
      addOrderToQueue(data);
      break;
    case 'stock.updated':
      updateStockBadge(data);
      break;
    case 'alert.new':
      showNotification(data);
      break;
  }
};
```

---

## 13. Rate Limiting y Paginación

### Rate Limiting

| Endpoint | Límite | Ventana |
|---|---|---|
| `/auth/login` | 5 intentos | 15 minutos |
| `/ai/ocr` | 20 requests | 1 hora |
| `/ai/voice` | 100 requests | 1 hora |
| General (lectura) | 1000 requests | 1 minuto |
| General (escritura) | 200 requests | 1 minuto |

### Headers de Rate Limit

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1707649200
```

### Paginación

Todas las listas soportan:

```
?page=1           // Página actual (1-based)
&per_page=25      // Items por página (máx: 100)
&sort=created_at  // Campo de ordenamiento
&order=desc       // asc | desc
```

Respuesta:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "per_page": 25,
    "total": 342,
    "total_pages": 14,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## 14. Códigos de Error Estándar

```json
// 400 Bad Request
{
  "error": "validation_error",
  "message": "Error de validación",
  "details": [
    { "field": "name", "message": "El nombre es requerido" },
    { "field": "quantity", "message": "La cantidad debe ser mayor a 0" }
  ]
}

// 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Token inválido o expirado"
}

// 403 Forbidden
{
  "error": "forbidden",
  "message": "No tiene permisos para esta acción"
}

// 404 Not Found
{
  "error": "not_found",
  "message": "Recurso no encontrado"
}

// 409 Conflict
{
  "error": "conflict",
  "message": "Ya existe un ingreso con este número de factura",
  "existing_id": "uuid"
}

// 422 Unprocessable Entity
{
  "error": "business_rule_violation",
  "message": "Stock insuficiente para este envío",
  "details": {
    "shortages": [
      { "product": "Manteca", "available": 8, "required": 15 }
    ]
  }
}

// 429 Too Many Requests
{
  "error": "rate_limited",
  "message": "Demasiadas solicitudes. Intente de nuevo en 60 segundos.",
  "retry_after": 60
}

// 500 Internal Server Error
{
  "error": "internal_error",
  "message": "Error interno del servidor",
  "request_id": "req-abc123"
}
```
