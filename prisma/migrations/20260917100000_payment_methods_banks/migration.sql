ALTER TABLE "Payment"
ADD COLUMN "methodConfigId" TEXT,
ADD COLUMN "methodSnapshotName" TEXT,
ADD COLUMN "methodType" TEXT,
ADD COLUMN "currency" TEXT DEFAULT 'NIO',
ADD COLUMN "originalAmount" DECIMAL(12,2),
ADD COLUMN "exchangeRate" DECIMAL(12,4),
ADD COLUMN "commissionRate" DECIMAL(7,4),
ADD COLUMN "commissionAmount" DECIMAL(12,2);

CREATE INDEX "Payment_methodConfigId_idx" ON "Payment"("methodConfigId");

ALTER TABLE "Shift"
ADD COLUMN "paymentBreakdown" JSONB,
ADD COLUMN "totalPaymentCommission" DECIMAL(12,2),
ADD COLUMN "netSales" DECIMAL(12,2);
