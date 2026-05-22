-- Add optional cash register name snapshot to Shift
ALTER TABLE "Shift" ADD COLUMN "cashRegisterName" TEXT;

-- Add index for filtering/reporting
CREATE INDEX "Shift_cashRegisterName_idx" ON "Shift"("cashRegisterName");
