-- Revert certificados to a single selected product
-- If any records were created with products[], copy first entry into product
UPDATE "Certificado"
SET "product" = "products"[1]
WHERE "product" IS NULL AND array_length("products", 1) >= 1;

-- If still null, keep a safe placeholder to allow NOT NULL constraint
UPDATE "Certificado"
SET "product" = 'UNKNOWN'
WHERE "product" IS NULL;

ALTER TABLE "Certificado"
  ALTER COLUMN "product" SET NOT NULL;

ALTER TABLE "Certificado"
  DROP COLUMN "products";
