# Conexión Frontend ↔ API ↔ Base de datos

## Resumen

| Componente   | Puerto / URL                    | Archivo de config      |
|-------------|----------------------------------|------------------------|
| **Frontend** (Next.js) | http://localhost:3000 o 3001     | `apps/web/.env.local`  |
| **API** (Nest)        | http://localhost:4010/api       | `apps/api/.env`        |
| **Base de datos**     | PostgreSQL local (puerto 5432)   | `apps/api/.env`        |

## Configuración actual

### Frontend (`apps/web/.env.local`)
- `NEXT_PUBLIC_API_URL=http://localhost:4010/api` → todas las llamadas (login, proveedores, etc.) van a la API en 4010.
- Si no existe `.env.local`, el código usa por defecto `http://localhost:4010/api`.

### API (`apps/api/.env`)
- `PORT=4010` → la API escucha en el puerto 4010.
- `FRONTEND_URL=http://localhost:3000,http://localhost:3001,...` → CORS permite esos orígenes.
- `DATABASE_URL=postgresql://mauriciohuentelaf@localhost:5432/elio` → conexión a PostgreSQL.

### CORS
- La API permite peticiones desde `localhost` y `127.0.0.1` en cualquier puerto.
- Con `FRONTEND_URL` definido, solo se permiten explícitamente 3000 y 3001.

## Cómo levantar todo

1. **Base de datos**: PostgreSQL debe estar corriendo (ej. Postgres.app) con la base `elio` creada (`createdb elio`).
2. **API**:  
   `cd apps/api && npm run start:dev`  
   (usa `PORT=4010` del `.env`).
3. **Frontend**:  
   `cd apps/web && npm run dev`  
   (por ejemplo en http://localhost:3001 si 3000 está ocupado).

## Verificar

- **API**: abrir http://localhost:4010/api → debe devolver `{"ok":true,"message":"Nova API",...}`.
- **Frontend**: abrir http://localhost:3001 (o 3000) → dashboard; el login y los datos usan la API en 4010.
- **Prisma**: `cd apps/api && npx prisma validate` → el schema es válido. Si la DB está arriba, la API podrá conectarse al arrancar.

## Si /login no funciona

1. **La página no carga (ERR_CONNECTION_REFUSED en localhost:3000)**  
   El frontend no está corriendo. En otra terminal:  
   `cd apps/web && npm run dev`  
   Luego abre de nuevo http://localhost:3000/login (o el puerto que indique Next.js, ej. 3001).

2. **La página carga pero el login falla con error de red / CORS**  
   La API debe estar en 4010. Comprueba:  
   `curl -s http://localhost:4010/api`  
   Si no responde, levanta la API:  
   `cd apps/api && npm run start:dev`

3. **"Correo o contraseña incorrectos"**  
   Es validación de la API: usuario/contraseña no existen o no coinciden. No es un problema de conexión.
