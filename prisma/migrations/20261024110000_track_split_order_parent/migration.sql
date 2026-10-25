ALTER TABLE "Order"
ADD COLUMN "parentOrderId" TEXT,
ADD COLUMN "splitAccountName" TEXT,
ADD COLUMN "splitMode" TEXT,
ADD COLUMN "couponConsumptionRecorded" BOOLEAN NOT NULL DEFAULT false;

-- Existing paid coupon orders consumed their coupon before this flag existed.
UPDATE "Order"
SET "couponConsumptionRecorded" = true
WHERE "status" = 'PAID' AND "cuponId" IS NOT NULL;

CREATE INDEX "Order_parentOrderId_idx" ON "Order"("parentOrderId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_parentOrderId_fkey"
FOREIGN KEY ("parentOrderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
