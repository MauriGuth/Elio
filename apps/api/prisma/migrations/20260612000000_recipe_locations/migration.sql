-- CreateTable
CREATE TABLE "recipe_locations" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "prep_time_min" INTEGER,

    CONSTRAINT "recipe_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_locations_recipe_id_location_id_key" ON "recipe_locations"("recipe_id", "location_id");

-- CreateIndex
CREATE INDEX "recipe_locations_recipe_id_idx" ON "recipe_locations"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_locations_location_id_idx" ON "recipe_locations"("location_id");

-- AddForeignKey
ALTER TABLE "recipe_locations" ADD CONSTRAINT "recipe_locations_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_locations" ADD CONSTRAINT "recipe_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
