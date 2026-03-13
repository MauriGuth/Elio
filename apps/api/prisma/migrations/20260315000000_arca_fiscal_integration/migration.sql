ALTER TABLE "orders"
ADD COLUMN "fiscal_status" TEXT NOT NULL DEFAULT 'not_requested',
ADD COLUMN "fiscal_last_error" TEXT,
ADD COLUMN "fiscal_attempted_at" TIMESTAMP(3),
ADD COLUMN "fiscal_issued_at" TIMESTAMP(3);

ALTER TABLE "customers"
ADD COLUMN "legal_name" TEXT,
ADD COLUMN "tax_condition" TEXT,
ADD COLUMN "document_type" TEXT,
ADD COLUMN "document_number" TEXT;

CREATE TABLE "fiscal_vouchers" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invoice_type" TEXT NOT NULL,
  "cbte_tipo" INTEGER,
  "pto_vta" INTEGER,
  "cbte_desde" INTEGER,
  "cbte_hasta" INTEGER,
  "cae" TEXT,
  "cae_vto" TIMESTAMP(3),
  "request_payload" TEXT,
  "response_payload" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "issued_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_vouchers_order_id_key" ON "fiscal_vouchers"("order_id");
CREATE INDEX "orders_fiscal_status_idx" ON "orders"("fiscal_status");
CREATE INDEX "fiscal_vouchers_status_idx" ON "fiscal_vouchers"("status");
CREATE INDEX "fiscal_vouchers_cae_idx" ON "fiscal_vouchers"("cae");

ALTER TABLE "fiscal_vouchers"
ADD CONSTRAINT "fiscal_vouchers_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
