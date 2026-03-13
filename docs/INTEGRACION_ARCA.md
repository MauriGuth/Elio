# Integración Nova con ARCA / AFIP

Guía para integrar el proyecto **Nova** con **ARCA/AFIP** para facturación electrónica usando `WSAA` + `wsfev1`.

---

## 1. Definir el alcance de la integración

Elegí qué querés sincronizar:

| Tipo | Descripción | Dónde implementar |
|------|-------------|-------------------|
| **Autenticación** | Login con usuario ARCA o SSO (si ARCA lo ofrece) | `apps/api` auth + `apps/web` login |
| **Productos** | Sincronizar ítems/catálogo ARCA ↔ Nova | Módulo `arca` + jobs/cron |
| **Clientes/Proveedores** | Maestro de clientes o proveedores desde ARCA | Módulo `arca` + `customers` / `suppliers` |
| **Ventas / Facturación** | Enviar ventas de Nova a ARCA para facturación electrónica | Módulo `arca` + hook en cierres de caja u órdenes |
| **Compras** | Órdenes de compra o ingresos Nova ↔ ARCA | Módulo `arca` + `purchase-orders` / `goods-receipts` |

---

## 2. Arquitectura real

- La autenticación se realiza contra `WSAA` mediante certificado X.509 y firma CMS.
- El cliente obtiene un `TA` (Token + Sign) con vigencia limitada y lo reutiliza hasta su vencimiento.
- La emisión de comprobantes se realiza vía SOAP contra `wsfev1`.
- El backend de Nova resuelve la emisión automáticamente al cerrar una venta POS, sin bloquear la transacción principal del cierre.

URLs base:

- Testing WSAA: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
- Producción WSAA: `https://wsaa.afip.gov.ar/ws/services/LoginCms`
- Testing wsfev1: `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`
- Producción wsfev1: `https://servicios1.afip.gov.ar/wsfev1/service.asmx`

---

## 3. Configuración en Nova

### 3.1 Variables de entorno (API)

En `apps/api/.env` (y en Railway/Vercel según corresponda) agregá:

```env
# ARCA / AFIP
ARCA_ENABLED=false
ARCA_ENV=testing
ARCA_CUIT=
ARCA_SERVICE=wsfe
ARCA_CERT_PATH=
ARCA_KEY_PATH=
ARCA_WSAA_URL=https://wsaahomo.afip.gov.ar/ws/services/LoginCms
ARCA_WSFEV1_URL=https://wswhomo.afip.gov.ar/wsfev1/service.asmx
ARCA_PTO_VTA=
ARCA_DEFAULT_INVOICE_TYPE=factura_b
ARCA_DEFAULT_IVA_ID=5
```

Para producción, activá `ARCA_ENABLED=true`, cambiá URLs al entorno productivo y configurá certificado, clave, CUIT y punto de venta reales.

### 3.3 Pasos para usar ventas reales (producción AFIP)

Para facturar ventas reales (no homologación), seguí estos pasos:

1. **Certificado de producción**
   - En AFIP tenés que tener el **certificado digital de producción** (no el de homologación). Si solo tenés el de prueba, generá/obtené el de producción desde el sitio de AFIP.
   - Guardá el archivo del certificado (`.crt` o `.pem`) y la **clave privada** en una carpeta segura del servidor (no en el repo).

2. **Variables en `apps/api/.env` (producción)**

   ```env
   ARCA_ENABLED=true
   ARCA_ENV=production
   ARCA_CUIT=20xxxxxxxxx
   ARCA_SERVICE=wsfe
   ARCA_CERT_PATH=/ruta/absoluta/al/certificado_produccion.pem
   ARCA_KEY_PATH=/ruta/absoluta/a/la/clave_privada_produccion
   ARCA_PTO_VTA=3
   ARCA_DEFAULT_INVOICE_TYPE=factura_b
   ARCA_DEFAULT_IVA_ID=5
   ```

   - **ARCA_WSAA_URL** y **ARCA_WSFEV1_URL**: si no las definís, el código usa por defecto las URLs de producción cuando `ARCA_ENV=production`. Si querés dejarlas explícitas:
   - `ARCA_WSAA_URL=https://wsaa.afip.gov.ar/ws/services/LoginCms`
   - `ARCA_WSFEV1_URL=https://servicios1.afip.gov.ar/wsfev1/service.asmx`

3. **Punto de venta**
   - El `ARCA_PTO_VTA` debe ser un punto de venta **habilitado para factura electrónica en AFIP** (no solo homologación). Verificá con `GET /api/arca/wsfev1/params` que ese punto aparezca en la respuesta una vez en producción.

4. **Validar antes de vender**
   - Reiniciá la API para que tome el nuevo `.env`.
   - `POST /api/arca/wsaa/test-login`: debe responder OK (autenticación contra WSAA de producción).
   - `GET /api/arca/wsfev1/params`: debe listar tus puntos de venta y tipos de comprobante.
   - Emití **una factura de prueba** (ej. Factura B consumidor final) y verificá en el panel **Fiscalización ARCA** que el CAE y el número coincidan. Opcional: **Verificar en AFIP** desde el detalle del comprobante.

5. **Despliegue (Railway / servidor)**
   - En el entorno donde corre la API de producción, configurá las mismas variables. Las rutas `ARCA_CERT_PATH` y `ARCA_KEY_PATH` deben ser accesibles desde el proceso de la API (ej. volumen montado o archivos subidos al servidor). No subas certificados al repositorio.

Notas importantes:

- En `WSAA`, el servicio correcto para factura electrónica es `ARCA_SERVICE=wsfe`.
- El punto de venta no conviene asumirlo: primero consultalo con `GET /api/arca/wsfev1/params` y usá uno realmente habilitado en AFIP.

### 3.2 Módulo ARCA en la API

En el repo existe la implementación base en `apps/api/src/arca/`:

- **`arca.wsaa.service.ts`**: genera TRA, firma CMS y obtiene `Token`/`Sign`.
- **`arca.wsfev1.service.ts`**: cliente SOAP para `FECompUltimoAutorizado`, `FECAESolicitar`, `FECompConsultar`, `FEParamGetCondicionIvaReceptor` y demás parámetros.
- **`arca.fiscal.service.ts`**: orquesta la emisión para una orden cerrada y persiste el resultado.
- **`arca.service.ts`**: facade de alto nivel para health, login, parámetros, emisión manual y reintento.
- **`arca.controller.ts`**: endpoints admin para health, login, parámetros y operación manual.

Podés exponer endpoints como:

- `GET /api/arca/health`
- `POST /api/arca/wsaa/test-login`
- `GET /api/arca/wsfev1/params` — Devuelve puntos de venta, tipos de comprobante, tipos de documento y **condicionIvaReceptor** (códigos de condición frente al IVA del receptor, RG 5616).
- `POST /api/arca/orders/:id/emit`
- `POST /api/arca/orders/:id/retry`
- `GET /api/arca/orders/:id/status`
- `GET /api/arca/orders/:id/verify` — Verifica en AFIP que el comprobante figure correctamente (FECompConsultar). Devuelve si AFIP tiene el comprobante, el CAE y si coincide con el guardado.

Todo protegido con `JwtAuthGuard` y, si aplica, `RolesGuard` (solo admin).

### 3.4 Condición frente al IVA del receptor (RG 5616)

Desde la **Resolución General AFIP N° 5616** (vigencia 09/06/2025), el campo **Condición Frente al IVA del receptor** es **obligatorio** en `FECAESolicitar`. Si no se envía o el valor no es válido, AFIP rechaza la emisión (códigos 10242, 10243, 10246).

- La API ya envía `CondicionIVAReceptorId` en cada solicitud de CAE. El valor se obtiene a partir del cliente de la orden y del tipo de comprobante (`mapRecipientVatCondition`). Para consumidor final sin dato se usa **5** (Consumidor Final).
- Los códigos válidos los provee AFIP con el método **FEParamGetCondicionIvaReceptor**. La API los expone en `GET /api/arca/wsfev1/params` dentro de `condicionIvaReceptor` (array de `{ id, description }`). Podés usar esa lista en el front para mostrar opciones al cargar cliente o tipo de factura.
- Si el cliente tiene `taxCondition` (ej. "Monotributo", "Responsable inscripto", "Consumidor final"), se mapea al `Id` correspondiente; si falta, se usa 5. No se debe enviar `CondicionIVAReceptorId` en 0.

---

## 4. Flujos recomendados

### 4.1 Ventas Nova → ARCA (facturación)

1. El front POS envía `invoiceType` y `customerId` al cerrar la orden.
2. `OrdersService.closeOrder()` cierra la venta, libera mesa, registra stock y deja el comprobante fiscal en estado `pending`.
3. Luego, fuera de la transacción, `ArcaFiscalService.emitForOrder(orderId)` solicita CAE en `wsfev1`.
4. El resultado se persiste en `FiscalVoucher` y se resume en `Order.fiscalStatus`.

### 4.2 Verificar comprobantes en AFIP

Para confirmar que una factura emitida figura correctamente en AFIP:

- **Desde el panel:** En **Fiscalización ARCA** → lista de comprobantes recientes → **Ver** en una factura emitida. En el modal de detalle aparece el botón **Verificar en AFIP**, que ejecuta `FECompConsultar` contra AFIP y muestra si el comprobante existe y si el CAE coincide con el guardado.
- **Por API:** `GET /api/arca/orders/:id/verify` (requiere rol ADMIN). La respuesta indica `verified`, `message`, datos devueltos por AFIP (CAE, vencimiento, importe) y si el CAE coincide con el almacenado.

---

## 5. Autenticación (opcional)

- Si **no** hay SSO con ARCA: los usuarios siguen entrando con email/contraseña de Nova; ARCA solo se usa como backend de datos/facturación.
- Si ARCA ofrece **OAuth/OpenID**: en `AuthService` (NestJS) agregá una estrategia “login con ARCA” que intercambie código por token y cree o actualice usuario en Nova; en el front, en la pantalla de login agregá el botón “Entrar con ARCA” y el redirect al proveedor ARCA.

---

## 6. Resumen de pasos

1. Configurar certificado, clave, CUIT, entorno y punto de venta.
2. Probar `POST /api/arca/wsaa/test-login` en homologación.
3. Verificar parámetros fiscales con `GET /api/arca/wsfev1/params`.
4. Cerrar una orden POS con comprobante y revisar `FiscalVoucher`.
5. Reintentar manualmente con `POST /api/arca/orders/:id/retry` si ARCA devuelve error.
6. Recién después pasar URLs y certificados a producción.

---

## 7. Checklist Operativo

Antes de habilitar ARCA en un local:

1. Confirmar que `ARCA_ENABLED`, `ARCA_ENV`, `ARCA_CUIT`, `ARCA_CERT_PATH`, `ARCA_KEY_PATH` y `ARCA_PTO_VTA` estén cargadas.
2. Verificar que el certificado y la clave correspondan al mismo CUIT emisor.
3. Ejecutar `POST /api/arca/wsaa/test-login` y confirmar autenticación correcta.
4. Ejecutar `GET /api/arca/wsfev1/params` y validar que el punto de venta configurado exista en `pointOfSales`.

Antes de emitir desde POS:

1. Para `Factura A`, exigir cliente con `CUIT` y condición IVA compatible.
2. Para `Factura B` y `Factura C`, permitir consumidor final o cliente con documento según corresponda.
3. Confirmar que la caja y el flujo de cierre de orden estén operativos.

Si una orden queda con error fiscal:

1. Revisar `Order.fiscalStatus` y `Order.fiscalLastError`.
2. Revisar `FiscalVoucher.errorMessage`.
3. Corregir datos fiscales del cliente o configuración ARCA.
4. Reintentar con `POST /api/arca/orders/:id/retry`.

Validación mínima antes de pasar a producción:

1. Emitir al menos una `Factura A` en homologación.
2. Emitir al menos una `Factura B` en homologación.
3. Emitir al menos una `Factura C` en homologación.
4. Confirmar persistencia de `CAE`, número de comprobante y vencimiento en `FiscalVoucher`.

Estado validado en este proyecto:

- Homologación OK para `Factura A`, `Factura B` y `Factura C`.
- Se validó `WSAA`, consulta de parámetros `wsfev1`, emisión automática post-cierre y reintento manual.

---

## 8. Procedimiento de Soporte

Si una orden queda en `pending`:

1. Verificar si el cierre de la orden terminó correctamente.
2. Consultar `GET /api/arca/orders/:id/status`.
3. Si sigue en `pending`, ejecutar `POST /api/arca/orders/:id/emit` o `POST /api/arca/orders/:id/retry`.

Si una orden queda en `processing`:

1. Esperar unos segundos y volver a consultar el estado.
2. Revisar logs de la API por si hubo timeout, error SOAP o excepción interna.
3. Si no avanza a `issued` ni a `error`, reintentar manualmente una sola vez.

Si una orden queda en `error`:

1. Leer `fiscalLastError` y `FiscalVoucher.errorMessage`.
2. Confirmar que el cliente tenga documento y condición IVA válidos para el tipo de comprobante.
3. Confirmar que el punto de venta configurado exista en AFIP y corresponda al CUIT/certificado.
4. Confirmar que `ARCA_SERVICE=wsfe` y que el certificado no esté vencido.
5. Corregir el dato faltante y reintentar con `POST /api/arca/orders/:id/retry`.

Señales rápidas para diagnosticar:

- `alreadyAuthenticated`: se estaba pidiendo un TA nuevo en lugar de reutilizar el actual.
- `Campo Auth no fue ingresado o esta mal formado`: problema de namespace o estructura SOAP.
- `Condicion Frente al IVA del receptor es obligatorio`: falta `CondicionIVAReceptorId`.
- `Si ImpNeto es mayor a 0 el objeto IVA es obligatorio`: falta informar IVA en `Factura A/B`.

Buenas prácticas operativas:

1. No reintentar muchas veces seguidas la misma orden sin leer el error.
2. No cambiar manualmente CAE o numeración en base de datos.
3. Guardar siempre el `requestPayload` y `responsePayload` para soporte.
4. Validar en homologación cualquier cambio fiscal antes de moverlo a producción.

---

## 9. Referencias en el repo

| Recurso | Ubicación |
|---------|-----------|
| API REST Nova | `docs/API_SPEC.md` |
| Modelo de datos | `docs/DATA_MODEL.md` |
| Auth (JWT, roles) | `apps/api/src/auth/` |
| Productos | `apps/api/src/products/` |
| Órdenes de compra | `apps/api/src/purchase-orders/` |
| Cierres de caja | `apps/api/src/cash-registers/` |
| Cliente HTTP (ConfigService) | `apps/api/src/arca/arca.service.ts` (base) |

Si tenés la documentación concreta de ARCA (PDF, Postman, Swagger), podés agregar un `docs/ARCA_API.md` con los endpoints y ejemplos para que todo el equipo tenga la misma referencia.
