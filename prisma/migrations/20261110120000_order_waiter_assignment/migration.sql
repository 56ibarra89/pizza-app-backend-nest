ALTER TABLE "Order"
ADD COLUMN "waiterId" TEXT,
ADD COLUMN "waiterSnapshotName" TEXT;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_waiterId_fkey"
FOREIGN KEY ("waiterId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");
