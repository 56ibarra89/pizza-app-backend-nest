/*
  Warnings:

  - Made the column `giftQuantity` on table `OrderItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "giftQuantity" SET NOT NULL,
ALTER COLUMN "giftQuantity" SET DEFAULT 0;
