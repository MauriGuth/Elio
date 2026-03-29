-- AlterTable
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "account_kind" TEXT NOT NULL DEFAULT 'client';
