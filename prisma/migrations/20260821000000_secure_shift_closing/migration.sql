ALTER TABLE "Shift"
ADD COLUMN "expectedCash" DECIMAL(12,2),
ADD COLUMN "totalExpensesSnapshot" DECIMAL(12,2),
ADD COLUMN "cashDifference" DECIMAL(12,2),
ADD COLUMN "discrepancyReason" TEXT,
ADD COLUMN "authorizedById" TEXT,
ADD COLUMN "authorizedBySnapshotName" TEXT,
ADD COLUMN "authorizedByRole" TEXT,
ADD COLUMN "denominationBreakdown" JSONB;

CREATE INDEX "Shift_authorizedById_idx" ON "Shift"("authorizedById");
