-- Service SLA timestamps used by KDS and delivery performance monitoring.
ALTER TABLE "Order"
ADD COLUMN "kitchenReadyAt" TIMESTAMP(3),
ADD COLUMN "deliveryStartedAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliverySlaAlertedAt" TIMESTAMP(3);

CREATE INDEX "Order_kitchenReadyAt_idx" ON "Order"("kitchenReadyAt");
CREATE INDEX "Order_deliveryStartedAt_deliveredAt_idx" ON "Order"("deliveryStartedAt", "deliveredAt");
CREATE INDEX "Order_deliverySlaAlertedAt_idx" ON "Order"("deliverySlaAlertedAt");
