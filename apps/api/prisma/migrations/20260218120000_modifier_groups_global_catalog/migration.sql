-- Catálogo global de modificadores: grupos sin producto fijo se listan en todas las recetas.

ALTER TABLE "product_modifier_groups" ALTER COLUMN "product_id" DROP NOT NULL;

-- Grupos existentes pasan a catálogo compartido (mismos IDs; enlaces en recipe_ingredients siguen válidos).
UPDATE "product_modifier_groups" SET "product_id" = NULL WHERE "product_id" IS NOT NULL;
