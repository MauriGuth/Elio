-- AlterTable
ALTER TABLE "recipe_ingredients" ADD COLUMN "modifier_group_id" TEXT;

-- CreateIndex
CREATE INDEX "recipe_ingredients_modifier_group_id_idx" ON "recipe_ingredients"("modifier_group_id");

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "product_modifier_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
