/*
  Warnings:

  - You are about to drop the column `items` on the `Order` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'DELIVERED');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "items";

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "size" "ProductSize" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "giftQuantity" INTEGER,
    "isSentToKitchen" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "kitchenStatus" "KitchenStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemExtra" (
    "id" SERIAL NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItemExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_isSentToKitchen_idx" ON "OrderItem"("isSentToKitchen");

-- CreateIndex
CREATE INDEX "OrderItem_kitchenStatus_idx" ON "OrderItem"("kitchenStatus");

-- CreateIndex
CREATE INDEX "OrderItem_sentAt_idx" ON "OrderItem"("sentAt");

-- CreateIndex
CREATE INDEX "OrderItemExtra_orderItemId_idx" ON "OrderItemExtra"("orderItemId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemExtra" ADD CONSTRAINT "OrderItemExtra_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
