ALTER TABLE "Order"
  ADD COLUMN "discountId" INTEGER,
  ADD COLUMN "happyHourId" INTEGER;

CREATE INDEX "Order_discountId_idx" ON "Order"("discountId");
CREATE INDEX "Order_happyHourId_idx" ON "Order"("happyHourId");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_discountId_fkey"
  FOREIGN KEY ("discountId") REFERENCES "DiscountPromotion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_happyHourId_fkey"
  FOREIGN KEY ("happyHourId") REFERENCES "HappyHourPromotion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
