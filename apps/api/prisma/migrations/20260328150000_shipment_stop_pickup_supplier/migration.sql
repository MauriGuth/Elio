-- AlterTable
ALTER TABLE "shipment_stops" ADD COLUMN "pickup_supplier_id" TEXT;

-- AddForeignKey
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_pickup_supplier_id_fkey" FOREIGN KEY ("pickup_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "shipment_stops_pickup_supplier_id_idx" ON "shipment_stops"("pickup_supplier_id");
