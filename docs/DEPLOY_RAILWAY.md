# Desplegar la API de Nova en Railway

Pasos para tener tu URL de API en producción (ej. `https://nova-api.up.railway.app`).

---

## 1. Crear cuenta y proyecto en Railway

1. Entrá a **[railway.app](https://railway.app)** e iniciá sesión con **GitHub**.
2. Click en **"New Project"**.
3. Elegí **"Deploy from GitHub repo"**.
4. Autorizá Railway para acceder a GitHub si te lo pide.
5. Seleccioná el repositorio **MauriGuth/Elio** (o el que uses).

---

## 2. Configurar el servicio de la API

Railway crea un servicio por el repo. Tenés que decirle que use solo la carpeta de la API:

1. Entrá al **servicio** (el recuadro que se creó).
2. **Settings** (o el ícono de engranaje).
3. En **"Root Directory"** (o "Source"): poné **`apps/api`**.
4. Guardá si hace falta.

---

## 3. Agregar PostgreSQL

1. En el mismo **proyecto**, click en **"+ New"**.
2. Elegí **"Database"** → **"PostgreSQL"**.
3. Railway crea la base y te asigna una **URL de conexión**.
4. En el servicio de **PostgreSQL**, entrá a **"Variables"** o **"Connect"** y copiá **`DATABASE_URL`** (o la variable que tenga la URL completa).

---

## 4. Variables de entorno del servicio API

En el **servicio de la API** (no en la base de datos):

1. **Variables** (o "Variables" en el menú).
2. Agregá estas variables:

| Variable         | Valor |
|------------------|--------|
| `DATABASE_URL`   | La URL que te dio Railway para PostgreSQL (ej. `postgresql://postgres:xxx@xxx.railway.app:5432/railway`). |
| `JWT_SECRET`     | Una clave larga y aleatoria solo para producción (ej. generá una con un generador de contraseñas). |
| `FRONTEND_URL`   | La URL de tu front en Vercel, ej. `https://elio.vercel.app` (podés poner varias separadas por coma). |
| `PORT`           | No suele hacer falta; Railway la inyecta. Si te pide algo, usá `PORT` y Railway la asigna. |

Opcional (si usás OpenAI en la app):

| Variable         | Valor |
|------------------|--------|
| `OPENAI_API_KEY`| Tu API key de OpenAI. |

Opcional (facturación ARCA/AFIP en producción): `ARCA_ENABLED=true`, `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_WSAA_URL`, `ARCA_WSFEV1_URL` y certificado/clave. En Railway, si no usás volumen, podés definir **`ARCA_CERT_BASE64`** y **`ARCA_KEY_BASE64`** (contenido del cert y de la clave en base64); ver `docs/INTEGRACION_ARCA.md`.

Para **DATABASE_URL**: en el servicio de PostgreSQL en Railway, en "Variables" o "Connect", copiá la variable que tenga la URL (a veces se llama `DATABASE_URL` o `PGURL`). Si te dan otra nombre, creá en la API una variable `DATABASE_URL` con ese valor.

---

## 5. Build y start en Railway

Railway suele detectar Node y usar `npm run build` y `npm start`. Para este proyecto:

- **Build command** (si lo podés configurar):  
  `npm install && npx prisma generate && npm run build`

- **Start command** (si lo podés configurar):  
  `npm run start:prod`  
  (o `npm run start`; en `package.json` `start:prod` es `node dist/main`)

En muchos casos con **Root Directory** = `apps/api` no hace falta tocar nada; Railway usa el `package.json` de esa carpeta.

Si el deploy falla en el build, en **Settings** del servicio revisá que existan **Build Command** y **Start Command** como arriba.

---

## 5b. Desplegar desde la terminal (Railway CLI)

Si tenés Railway instalado en la terminal (`railway` en el PATH):

1. **Enlazar el proyecto** (solo la primera vez, desde la raíz del repo):
   ```bash
   cd /ruta/al/repo/Elio
   railway link
   ```
   Elegí el proyecto y el **servicio de la API** (no el de PostgreSQL).

2. **Subir el código** entrando a la carpeta de la API y haciendo deploy:
   ```bash
   cd apps/api
   railway up
   ```
   Railway empaqueta y sube `apps/api` y dispara un nuevo deploy con ese código.

3. **Migraciones** (si hiciste cambios en Prisma):
   ```bash
   railway run npx prisma migrate deploy
   ```
   (ejecutado desde `apps/api` o con el proyecto ya vinculado y Root Directory = `apps/api` en el servicio).

En el dashboard de Railway el **Root Directory** del servicio debe seguir siendo **`apps/api`** para que el build use el `package.json` correcto. Al hacer `railway up` desde `apps/api`, el contenido que subís es ya esa carpeta, así que coincide.

---

## 6. Dominio público (tu URL de API)

1. En el **servicio de la API**, entrá a **Settings**.
2. Buscá **"Networking"** o **"Public Networking"**.
3. **"Generate domain"** (o "Add domain").
4. Railway te da una URL tipo:  
   `https://elio-api-production-xxxx.up.railway.app`

Esa es **tu URL de API en producción**.

La API tiene prefijo global `/api`, así que las rutas quedan:

- Base: `https://tu-dominio.up.railway.app`
- Ejemplo de ruta: `https://tu-dominio.up.railway.app/api/auth/login`

---

## 7. Pre-deploy: migraciones de Prisma

Las tablas se crean con un **pre-deploy step** en el servicio de la API (no desde tu máquina, porque la base suele no ser accesible por red pública).

1. Servicio de la **API** en Railway → **Settings** → **Deploy** (o **Build**).
2. **Custom Build Command** o **Pre-deploy / Deploy Command**: si Railway permite un comando previo al start, agregá:
   ```bash
   npx prisma migrate deploy
   ```
   Si usás **Build Command** custom, podés dejar:  
   `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`  
   y **Start**: `npm run start:prod`.
3. Si no tenés pre-deploy: después de cada deploy con migraciones nuevas, ejecutá migraciones una vez desde tu máquina con la URL de Railway (si te dan acceso) o desde Railway CLI:  
   `railway run npx prisma migrate deploy` (con el proyecto vinculado y Root Directory `apps/api`).
4. Guardá. En cada deploy se aplicarán las migraciones pendientes y luego arrancará la API.

---

## 8. Conectar el frontend (Vercel)

En tu proyecto en **Vercel**:

1. **Settings** → **Environment Variables**.
2. Definí:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://tu-dominio.up.railway.app/api`  
     (la URL que te dio Railway para la API, **con `/api` al final**).
3. Guardá y **volvé a desplegar** el frontend (Deployments → ⋮ en el último deploy → Redeploy).

**Importante:** Sin esta variable, en producción fallan el login, el Chat Auditor y todas las llamadas a la API (ej. "Cannot GET/POST /api/..."). El front usa un proxy hacia Railway solo cuando `NEXT_PUBLIC_API_URL` está configurado.

---

## 9. Avatares de usuario en la API remota

En Railway el disco del contenedor es **efímero**: si el servicio se reinicia o redepliega, los archivos subidos (avatars, imágenes) se pierden. Para que las fotos de perfil se vean en producción tenés dos opciones:

### Opción A: Volumen persistente (recomendado)

1. En el servicio de la **API** en Railway → **Settings** → **Volumes**.
2. Agregá un volumen y montalo en la ruta donde la API escribe avatares, por ejemplo: **Mount Path** `uploads` (o la ruta que use tu app, ej. `apps/api/uploads` si el working directory es `apps/api`). Revisá en el código que la ruta sea la correcta (en este proyecto es `./uploads/avatars` desde el cwd del proceso, que en Railway suele ser la raíz del servicio, ej. `apps/api`).
3. Así los archivos subidos persisten entre redeploys.

### Opción B: Sincronizar avatares desde tu máquina al remoto

Si los avatares ya existen en tu entorno local (BD local + carpeta `apps/api/uploads/avatars/`), podés subirlos al API remota con el script:

```bash
# Desde la raíz del repo. NODE_PATH hace que encuentre pg (apps/api/node_modules).
REMOTE_API_ORIGIN=https://tu-dominio.up.railway.app \
ADMIN_EMAIL=tu-admin@ejemplo.com \
ADMIN_PASSWORD=tu-password \
NODE_PATH=apps/api/node_modules \
node scripts/sync-avatars-to-remote.js
```

- El script lee de la **BD local** los `avatar_url` de los usuarios, toma cada archivo desde `apps/api/uploads/avatars/` y lo envía a `POST /api/users/sync-avatar?filename=...` en el remoto (requiere usuario Admin).
- Podés usar **ADMIN_TOKEN** en lugar de email/password si ya tenés un JWT:  
  `REMOTE_API_ORIGIN=https://... ADMIN_TOKEN=eyJ... node scripts/sync-avatars-to-remote.js`
- La BD de producción ya debe tener los mismos `avatar_url` (mismas rutas `/uploads/avatars/avatar-xxx.jpg`). Si solo sincronizaste código y migraciones, los usuarios en producción ya tienen esas URLs; solo faltaba tener los archivos en el servidor. Después de correr el script, las fotos se sirven desde la API remota.

Si no usás volumen, cada vez que redeploys la API en Railway tendrás que volver a ejecutar el script para restaurar los avatares, o usar Opción A.

---

## 10. Subir todos los cambios (código, schema y datos)

Cuando en local tenés más productos (u otros datos) que en la API remota y querés dejar el remoto al día:

### 1. Subir el código

**Si Railway está conectado a GitHub** (deploy automático al hacer push):

```bash
cd /ruta/al/repo/Elio
git add -A
git status   # revisar qué se sube
git commit -m "Sync: código y migraciones"
git push origin main
```

**Si desplegás con Railway CLI** (sin depender del push):

```bash
cd /ruta/al/repo/Elio
railway link   # solo la primera vez: elegí proyecto y servicio API
cd apps/api
railway up
```

El frontend (Vercel) suele hacer deploy automático al hacer `git push`; si no, en Vercel → Deployments → Redeploy.

### 2. Aplicar migraciones en la base remota

Después de subir código que incluye cambios en el schema (Prisma):

```bash
cd /ruta/al/repo/Elio/apps/api
railway run npx prisma migrate deploy
```

(Requiere tener el proyecto vinculado con `railway link` y que el servicio API use Root Directory `apps/api`.)

### 3. Copiar datos de la BD local a la remota (productos, etc.)

**Opción A: Clonar toda la BD local → remota**  
Útil si en remoto no tenés datos que quieras conservar (o es un entorno de prueba). **Cuidado:** reemplaza toda la base remota.

En macOS, si `pg_dump` no se encuentra (`command not found`), usá la ruta de **libpq** de Homebrew (o agregá el bin al PATH una vez):

```bash
# Opción: agregar libpq al PATH para esta sesión (Homebrew en Apple Silicon)
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

Luego:

```bash
# 1. Exportar la BD local a un archivo (desde tu máquina)
pg_dump "postgresql://usuario@localhost:5432/elio" --no-owner --no-acl -F c -f elio_local.dump

# 2. Copiá la DATABASE_URL del servicio PostgreSQL en Railway (Variables en el dashboard).

# 3. Restaurar en la BD remota (reemplazá REMOTE_DATABASE_URL por la URL real)
pg_restore --no-owner --no-acl -d "REMOTE_DATABASE_URL" -c elio_local.dump
```

Si preferís no usar PATH, podés llamar a los binarios con la ruta completa:  
`/opt/homebrew/opt/libpq/bin/pg_dump ...` y `/opt/homebrew/opt/libpq/bin/pg_restore ...`

Si `pg_restore` falla por permisos o extensiones, probá sin `-c` la primera vez o revisá que la URL sea la correcta (incluye usuario, contraseña, host y nombre de base).

**Opción B: Solo agregar lo que falta**  
Si en remoto ya hay órdenes, usuarios, etc., y solo querés “subir” productos/categorías que faltan, no hay un comando único. Podés:

- Usar un script que lea de la BD local y llame a la API remota (POST/PATCH de productos y categorías) con un usuario Admin; si lo necesitás, se puede agregar algo tipo `scripts/sync-products-to-remote.js` similar al de avatares.

Mientras tanto, la forma segura de igualar productos es Opción A solo si podés permitirte reemplazar toda la base remota por una copia de la local.

---

## Resumen

| Dónde       | Qué hacer |
|------------|-----------|
| Railway    | Proyecto nuevo → Repo GitHub → Root Directory `apps/api` → PostgreSQL → Variables (DATABASE_URL, JWT_SECRET, FRONTEND_URL) → Generate domain. |
| Primera vez| Correr `prisma migrate deploy` contra la base de Railway. |
| Vercel     | `NEXT_PUBLIC_API_URL` = `https://tu-dominio.up.railway.app/api`. |

Tu **URL de API en producción** es la que te asigna Railway al generar el dominio (ej. `https://elio-api-production-xxxx.up.railway.app`).
