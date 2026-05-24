-- Persist applied promotion info on Order
ALTER TABLE "Order"
  ADD COLUMN "discountAmount" DECIMAL(12,2),
  ADD COLUMN "promotionCode" TEXT;

CREATE INDEX "Order_promotionCode_idx" ON "Order"("promotionCode");
