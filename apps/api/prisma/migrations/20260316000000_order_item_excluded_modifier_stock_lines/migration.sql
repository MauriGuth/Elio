-- Excluir líneas de stock de modificadores (preparación) en POS → comanda "Sin: …" y menos consumo al cerrar.
ALTER TABLE "order_items" ADD COLUMN "excluded_modifier_stock_line_ids" JSONB;
