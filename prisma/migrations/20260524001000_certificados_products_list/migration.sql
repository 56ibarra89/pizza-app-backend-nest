-- Add list of products to Certificado and allow selected product to be nullable
ALTER TABLE "Certificado"
  ADD COLUMN "products" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Certificado"
  ALTER COLUMN "product" DROP NOT NULL;
