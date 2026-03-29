-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "opening_denominations" JSONB;
