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

1. Servicio **Nova** (API) → **Settings** → **Deploy**.
2. **+ Add pre-deploy step** (o editar el que ya tengas).
3. Comando (una sola línea):
   ```bash
   npx prisma migrate resolve --rolled-back "20260219000001_goods_receipt_received_by_and_po" 2>/dev/null || true && npx prisma migrate deploy
   ```
   (El `resolve --rolled-back` solo hace falta si alguna vez falló una migración; en deploys siguientes no molesta.)
4. Guardá. En cada deploy se ejecutará esto y luego arrancará la API.

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

## Resumen

| Dónde       | Qué hacer |
|------------|-----------|
| Railway    | Proyecto nuevo → Repo GitHub → Root Directory `apps/api` → PostgreSQL → Variables (DATABASE_URL, JWT_SECRET, FRONTEND_URL) → Generate domain. |
| Primera vez| Correr `prisma migrate deploy` contra la base de Railway. |
| Vercel     | `NEXT_PUBLIC_API_URL` = `https://tu-dominio.up.railway.app/api`. |

Tu **URL de API en producción** es la que te asigna Railway al generar el dominio (ej. `https://elio-api-production-xxxx.up.railway.app`).
