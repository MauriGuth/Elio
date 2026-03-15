# Base de datos PostgreSQL

El proyecto está configurado para **PostgreSQL** (recomendado para producción y gran volumen de datos).

## Requisitos

- PostgreSQL 12+ instalado y en ejecución.
- Variable de entorno `DATABASE_URL` en `apps/api/.env`.

## Configuración

1. **Crear la base de datos** (si no existe):

   ```bash
   createdb elio
   ```

   O desde `psql`:

   ```sql
   CREATE DATABASE elio;
   ```

2. **Configurar `.env`** en `apps/api/`:

   ```
   DATABASE_URL="postgresql://USUARIO:CONTRASEÑA@localhost:5432/elio"
   ```

   Ajusta `USUARIO` y `CONTRASEÑA` según tu instalación de PostgreSQL.

3. **Aplicar migraciones**:

   ```bash
   cd apps/api
   npx prisma migrate deploy
   ```

   En desarrollo, si quieres que Prisma marque la migración como aplicada:

   ```bash
   npx prisma migrate dev
   ```

4. **Opcional: cargar datos iniciales (seed)**:

   ```bash
   npx prisma db seed
   ```

## Nota

- Las migraciones antiguas de SQLite están en `migrations_sqlite_backup/` por referencia.
- La migración inicial para PostgreSQL es `20260213000000_init`.
