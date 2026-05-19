/*
  Warnings:

  - You are about to drop the column `linkedTables` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "linkedTables",
ADD COLUMN     "cashierId" TEXT,
ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "cashierId" TEXT;

-- AlterTable
ALTER TABLE "SystemLog" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "OrderTable" (
    "orderId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTable_pkey" PRIMARY KEY ("orderId","tableId")
);

-- CreateIndex
CREATE INDEX "OrderTable_tableId_idx" ON "OrderTable"("tableId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_cashierId_idx" ON "Order"("cashierId");

-- CreateIndex
CREATE INDEX "Shift_cashierId_idx" ON "Shift"("cashierId");

-- CreateIndex
CREATE INDEX "SystemLog_userId_idx" ON "SystemLog"("userId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTable" ADD CONSTRAINT "OrderTable_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTable" ADD CONSTRAINT "OrderTable_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
