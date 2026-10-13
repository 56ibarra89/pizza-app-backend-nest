-- Supports paid-sales reports filtered by their business timestamp.
CREATE INDEX "Order_status_timestamp_idx" ON "Order"("status", "timestamp");
