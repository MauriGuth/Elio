# Integración Elio con ARCA

Guía para integrar el proyecto **Elio** (gestión gastronómica, stock, logística, POS) con **ARCA** (sistema de gestión / ERP: facturación electrónica, compras, ventas).

---

## 1. Definir el alcance de la integración

Elegí qué querés sincronizar:

| Tipo | Descripción | Dónde implementar |
|------|-------------|-------------------|
| **Autenticación** | Login con usuario ARCA o SSO (si ARCA lo ofrece) | `apps/api` auth + `apps/web` login |
| **Productos** | Sincronizar ítems/catálogo ARCA ↔ Elio | Módulo `arca` + jobs/cron |
| **Clientes/Proveedores** | Maestro de clientes o proveedores desde ARCA | Módulo `arca` + `customers` / `suppliers` |
| **Ventas / Facturación** | Enviar ventas de Elio a ARCA para facturación electrónica | Módulo `arca` + hook en cierres de caja u órdenes |
| **Compras** | Órdenes de compra o ingresos Elio ↔ ARCA | Módulo `arca` + `purchase-orders` / `goods-receipts` |

---

## 2. Conocer la API de ARCA

- Si usás **ARCA API** (ej. [facturap.ar/arca-api](https://www.facturap.ar/arca-api.html)): anotá la URL base, método de autenticación (API Key, OAuth, etc.) y endpoints (productos, clientes, comprobantes, etc.).
- Si ARCA solo expone **webservices** (SOAP/REST propietario): necesitás documentación técnica o WSDL para definir requests/responses.
- Guardá en el repo (o en un doc interno) la especificación: URLs, headers, formato de cuerpo y códigos de error.

---

## 3. Configuración en Elio

### 3.1 Variables de entorno (API)

En `apps/api/.env` (y en Railway/Vercel según corresponda) agregá:

```env
# ARCA (ajustar según documentación real de ARCA)
ARCA_API_URL=https://api.arca.com  # o la URL que te den
ARCA_API_KEY=                      # API Key / token si aplica
ARCA_TENANT_ID=                    # Si ARCA usa multi-tenant
# Opcional: para no llamar a ARCA en desarrollo
ARCA_ENABLED=false
```

Para producción, activá la integración con `ARCA_ENABLED=true` y las credenciales correctas.

### 3.2 Módulo ARCA en la API

En el repo existe un módulo base en `apps/api/src/arca/`:

- **`arca.module.ts`**: registro del módulo.
- **`arca.service.ts`**: cliente HTTP hacia ARCA (configuración desde `ARCA_*`). Acá se implementan los métodos que llaman a productos, clientes, comprobantes, etc.
- **`arca.controller.ts`** (opcional): endpoints en Elio para probar la conexión o disparar sincronizaciones manuales.

Podés exponer endpoints como:

- `GET /api/arca/health` — verificar conectividad con ARCA.
- `POST /api/arca/sync/products` — sincronizar productos desde ARCA (o hacia ARCA, según diseño).
- `POST /api/arca/sync/customers` — idem para clientes.

Todo protegido con `JwtAuthGuard` y, si aplica, `RolesGuard` (solo admin).

---

## 4. Flujos recomendados

### 4.1 Productos ARCA → Elio

1. En `ArcaService` implementar `getProducts()` (o equivalente) según la API de ARCA.
2. Mapear respuesta ARCA al modelo de Elio (ej. `Product`, `Category` en Prisma).
3. Opciones:
   - **Job programado**: cron que llame a `ArcaService.getProducts()` y actualice/inserte en DB vía `ProductsService`.
   - **Endpoint manual**: `POST /api/arca/sync/products` para disparar la misma lógica.
4. Definir reglas: crear solo productos nuevos, actualizar por código externo, desactivar en Elio si dejaron de existir en ARCA, etc.

### 4.2 Ventas Elio → ARCA (facturación)

1. En Elio, al cerrar caja o al confirmar venta, preparar payload con ítems, montos, cliente (si aplica).
2. En `ArcaService` implementar `createComprobante()` (o el método que ARCA use para facturación).
3. Llamar a ese método desde el flujo de cierre de caja o de órdenes (ej. en `CashRegistersService` o `OrdersService`).
4. Guardar en Elio el ID o número de comprobante devuelto por ARCA (podés agregar un campo en la tabla de cierres o de órdenes).

### 4.3 Compras / Órdenes de compra

1. Si las órdenes de compra se crean en ARCA: en `ArcaService` implementar `getPurchaseOrders()` (o similar) y un job o endpoint que sincronice a Elio (`PurchaseOrdersService`).
2. Si se crean en Elio y debén verse en ARCA: implementar en ARCA el endpoint de alta de orden y llamarlo desde `PurchaseOrdersService` al crear/aprobar.

---

## 5. Autenticación (opcional)

- Si **no** hay SSO con ARCA: los usuarios siguen entrando con email/contraseña de Elio; ARCA solo se usa como backend de datos/facturación.
- Si ARCA ofrece **OAuth/OpenID**: en `AuthService` (NestJS) agregá una estrategia “login con ARCA” que intercambie código por token y cree o actualice usuario en Elio; en el front, en la pantalla de login agregá el botón “Entrar con ARCA” y el redirect al proveedor ARCA.

---

## 6. Resumen de pasos

1. **Documentar** la API de ARCA (URLs, auth, endpoints, ejemplos).
2. **Configurar** `ARCA_*` en `apps/api/.env` y en el entorno de despliegue.
3. **Implementar** en `apps/api/src/arca/arca.service.ts` los métodos que llaman a ARCA (productos, clientes, comprobantes, etc.).
4. **Conectar** con los servicios de Elio (productos, órdenes, cierres de caja) según los flujos que definiste.
5. **Probar** en desarrollo con `ARCA_ENABLED=true` y datos de prueba antes de usar producción.
6. **Monitorear** logs y errores en las llamadas a ARCA; definir reintentos y manejo de fallos (ej. cola o reintento para facturación).

---

## 7. Referencias en el repo

| Recurso | Ubicación |
|---------|-----------|
| API REST Elio | `docs/API_SPEC.md` |
| Modelo de datos | `docs/DATA_MODEL.md` |
| Auth (JWT, roles) | `apps/api/src/auth/` |
| Productos | `apps/api/src/products/` |
| Órdenes de compra | `apps/api/src/purchase-orders/` |
| Cierres de caja | `apps/api/src/cash-registers/` |
| Cliente HTTP (ConfigService) | `apps/api/src/arca/arca.service.ts` (base) |

Si tenés la documentación concreta de ARCA (PDF, Postman, Swagger), podés agregar un `docs/ARCA_API.md` con los endpoints y ejemplos para que todo el equipo tenga la misma referencia.
