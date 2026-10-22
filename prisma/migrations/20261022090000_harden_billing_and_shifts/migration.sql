-- A paid order belongs to the shift that actually collected it, not the shift
-- in which the order was first opened.
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "pendingCertificateSerials" JSONB;

UPDATE "Order"
SET "paidAt" = COALESCE("invoiceIssuedAt", "timestamp")
WHERE "status" = 'PAID';

CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");

-- Persist the business meaning of a close instead of reconstructing it from
-- free-form audit JSON.
CREATE TYPE "ShiftCloseType" AS ENUM ('HANDOVER', 'END_OF_DAY');
ALTER TABLE "Shift" ADD COLUMN "closeType" "ShiftCloseType";

UPDATE "Shift" AS shift
SET "closeType" = 'END_OF_DAY'
WHERE shift."status" = 'CLOSED'
  AND EXISTS (
    SELECT 1
    FROM "SystemLog" AS log
    WHERE log."action" IN (
      'SHIFT_CLOSED_END_OF_DAY',
      'SHIFT_CLOSED_END_OF_DAY_WITH_DISCREPANCY'
    )
      AND log."details" LIKE '%' || shift."id" || '%'
  );

UPDATE "Shift"
SET "closeType" = 'HANDOVER'
WHERE "status" = 'CLOSED' AND "closeType" IS NULL;

-- Close any legacy duplicate OPEN shifts (keeping only the most recent one)
-- so the partial unique index creation below cannot fail on dirty data.
WITH ranked_open_shifts AS (
  SELECT "id",
         ROW_NUMBER() OVER (ORDER BY "startTime" DESC, "createdAt" DESC, "id" DESC) AS rn
  FROM "Shift"
  WHERE "status" = 'OPEN'
)
UPDATE "Shift"
SET "status" = 'CLOSED',
    "endTime" = COALESCE("endTime", CURRENT_TIMESTAMP),
    "closeType" = COALESCE("closeType", 'HANDOVER')
WHERE "id" IN (
  SELECT "id" FROM ranked_open_shifts WHERE rn > 1
);

-- The service-level pre-check remains useful for a friendly response, while
-- this partial index closes the race between concurrent open requests.
CREATE UNIQUE INDEX "Shift_only_one_open_idx"
ON "Shift" ((1))
WHERE "status" = 'OPEN';
