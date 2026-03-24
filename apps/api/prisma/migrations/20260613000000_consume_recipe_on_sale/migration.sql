-- Descuento de insumos por receta al vender (café elaborado al momento) + exclusiones POS
ALTER TABLE "products" ADD COLUMN "consume_recipe_on_sale" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "order_items" ADD COLUMN "excluded_recipe_ingredient_ids" JSONB;
