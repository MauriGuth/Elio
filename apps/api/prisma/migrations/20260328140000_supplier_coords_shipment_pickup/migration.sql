-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN "pickup_supplier_id" TEXT;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pickup_supplier_id_fkey" FOREIGN KEY ("pickup_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "shipments_pickup_supplier_id_idx" ON "shipments"("pickup_supplier_id");
