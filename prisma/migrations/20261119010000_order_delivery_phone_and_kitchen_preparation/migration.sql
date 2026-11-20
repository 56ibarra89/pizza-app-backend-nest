ALTER TABLE "Order" ADD COLUMN "customerPhoneSnapshot" TEXT;
ALTER TABLE "Category" ADD COLUMN "requiresPreparation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrderItem" ADD COLUMN "requiresPreparation" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Category"
SET "requiresPreparation" = false
WHERE lower(btrim("label")) = 'bebidas' AND "deletedAt" IS NULL;
