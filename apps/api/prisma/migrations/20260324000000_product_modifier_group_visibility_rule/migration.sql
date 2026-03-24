-- Regla POS (ej. tipo de leche condicionado a preparación): JSON en grupo de modificadores.
ALTER TABLE "product_modifier_groups" ADD COLUMN IF NOT EXISTS "visibility_rule" JSONB;
