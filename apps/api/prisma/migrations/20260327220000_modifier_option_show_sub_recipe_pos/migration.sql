-- AlterTable
ALTER TABLE "product_modifier_options" ADD COLUMN IF NOT EXISTS "show_sub_recipe_in_pos" BOOLEAN NOT NULL DEFAULT true;
