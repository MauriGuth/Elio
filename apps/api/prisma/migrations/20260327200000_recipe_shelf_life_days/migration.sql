-- Días de vida útil de la receta (referencia)
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "shelf_life_days" INTEGER;
