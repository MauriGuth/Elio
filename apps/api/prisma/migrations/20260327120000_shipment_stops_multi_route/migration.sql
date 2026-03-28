-- AlterTable
ALTER TABLE "shipments" ADD COLUMN "is_multi_stop" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "shipment_stops" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "leg_polyline" TEXT,
    "leg_duration_min" INTEGER,
    "leg_distance_meters" INTEGER,
    "arrived_at" TIMESTAMP(3),
    "reception_control_started_at" TIMESTAMP(3),
    "reception_control_completed_at" TIMESTAMP(3),
    "received_by_name" TEXT,
    "received_by_signature" TEXT,
    "reception_notes" TEXT,

    CONSTRAINT "shipment_stops_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable first for backfill)
ALTER TABLE "shipment_items" ADD COLUMN "shipment_stop_id" TEXT;

-- AddForeignKey
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_stop_id_fkey" FOREIGN KEY ("shipment_stop_id") REFERENCES "shipment_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "shipment_stops_shipment_id_sort_order_key" ON "shipment_stops"("shipment_id", "sort_order");

CREATE INDEX "shipment_stops_shipment_id_idx" ON "shipment_stops"("shipment_id");

CREATE INDEX "shipment_stops_location_id_idx" ON "shipment_stops"("location_id");

CREATE INDEX "shipment_items_shipment_stop_id_idx" ON "shipment_items"("shipment_stop_id");

-- Backfill: one stop per existing shipment (destino)
INSERT INTO "shipment_stops" ("id", "shipment_id", "location_id", "sort_order")
SELECT gen_random_uuid()::text, s.id, s.destination_id, 0
FROM "shipments" s;

UPDATE "shipment_items" si
SET "shipment_stop_id" = st.id
FROM "shipment_stops" st
WHERE st.shipment_id = si.shipment_id AND st.sort_order = 0;
