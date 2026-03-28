-- Notas de incidencia al recepcionar mercadería
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "reception_issue_notes" TEXT;
