-- Add invoice snapshot fields to Order for printing/reprinting
ALTER TABLE "Order"
  ADD COLUMN "invoiceCorrelativoId" TEXT,
  ADD COLUMN "invoiceDocumentType" "DocumentType",
  ADD COLUMN "invoiceResolutionNumber" TEXT,
  ADD COLUMN "invoicePrefix" TEXT,
  ADD COLUMN "invoiceIssuedNumber" INTEGER,
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "invoiceIssuedAt" TIMESTAMP(3);

-- Unique invoice number (nullable, so multiple NULLs allowed)
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- Helpful indexes
CREATE INDEX "Order_invoiceCorrelativoId_idx" ON "Order"("invoiceCorrelativoId");
CREATE INDEX "Order_invoiceIssuedAt_idx" ON "Order"("invoiceIssuedAt");
CREATE INDEX "Order_invoiceIssuedNumber_idx" ON "Order"("invoiceIssuedNumber");

-- Foreign key to Correlativo (set null on delete)
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceCorrelativoId_fkey"
  FOREIGN KEY ("invoiceCorrelativoId") REFERENCES "Correlativo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
