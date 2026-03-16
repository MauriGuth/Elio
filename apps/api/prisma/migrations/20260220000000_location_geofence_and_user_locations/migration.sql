-- Location: coordenadas y radio para geofence
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "geofence_radius_meters" INTEGER;

-- Tabla many-to-many: usuarios con múltiples ubicaciones
CREATE TABLE IF NOT EXISTS "user_locations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_locations_user_id_location_id_key" ON "user_locations"("user_id", "location_id");
CREATE INDEX IF NOT EXISTS "user_locations_user_id_idx" ON "user_locations"("user_id");
CREATE INDEX IF NOT EXISTS "user_locations_location_id_idx" ON "user_locations"("location_id");

ALTER TABLE "user_locations" DROP CONSTRAINT IF EXISTS "user_locations_user_id_fkey";
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_locations" DROP CONSTRAINT IF EXISTS "user_locations_location_id_fkey";
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
