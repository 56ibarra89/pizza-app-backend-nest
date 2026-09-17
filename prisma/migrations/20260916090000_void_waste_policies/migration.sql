ALTER TABLE "Order"
ADD COLUMN "cancellationReasonId" TEXT,
ADD COLUMN "cancellationReasonLabel" TEXT,
ADD COLUMN "cancellationCategory" TEXT,
ADD COLUMN "cancellationCountsAsWaste" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancellationWasPrepared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancellationRequiresSupervisor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancellationLossAmount" DECIMAL(12,2);

CREATE INDEX "Order_cancelledAt_idx" ON "Order"("cancelledAt");
CREATE INDEX "Order_cancellationCategory_cancelledAt_idx"
ON "Order"("cancellationCategory", "cancelledAt");
CREATE INDEX "Order_cancellationReasonId_cancelledAt_idx"
ON "Order"("cancellationReasonId", "cancelledAt");
