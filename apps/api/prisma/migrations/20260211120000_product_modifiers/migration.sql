-- CreateTable
CREATE TABLE "product_modifier_groups" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifier_options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "price_delta" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "product_modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifier_stock_lines" (
    "id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "product_modifier_stock_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_modifier_groups_product_id_idx" ON "product_modifier_groups"("product_id");

-- CreateIndex
CREATE INDEX "product_modifier_options_group_id_idx" ON "product_modifier_options"("group_id");

-- CreateIndex
CREATE INDEX "product_modifier_stock_lines_option_id_idx" ON "product_modifier_stock_lines"("option_id");

-- CreateIndex
CREATE INDEX "product_modifier_stock_lines_product_id_idx" ON "product_modifier_stock_lines"("product_id");

-- AddForeignKey
ALTER TABLE "product_modifier_groups" ADD CONSTRAINT "product_modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifier_options" ADD CONSTRAINT "product_modifier_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifier_stock_lines" ADD CONSTRAINT "product_modifier_stock_lines_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_modifier_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifier_stock_lines" ADD CONSTRAINT "product_modifier_stock_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "modifier_selections" JSONB;
