-- Tras commit del enum en la migración anterior
INSERT INTO "locations" (
  "id",
  "name",
  "slug",
  "type",
  "is_active",
  "is_production",
  "has_tables",
  "created_at",
  "updated_at"
)
SELECT
  'cmretiromercaderia01proveedor',
  'Retiro de mercadería o proveedor',
  'retiro-mercaderia-proveedor',
  'SUPPLIER_PICKUP',
  true,
  false,
  false,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "locations" WHERE "slug" = 'retiro-mercaderia-proveedor'
);
