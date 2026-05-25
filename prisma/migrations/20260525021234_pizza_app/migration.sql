/*
  Warnings:

  - The values [MIXTO] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `notes` on the `Certificado` table. All the data in the column will be lost.
  - You are about to drop the column `product` on the `Certificado` table. All the data in the column will be lost.
  - The `expiresDate` column on the `Cupon` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `appliesTo` on the `DiscountPromotion` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `HappyHourPromotion` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `HappyHourPromotion` table. All the data in the column will be lost.
  - The `daysOfWeek` column on the `HappyHourPromotion` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `promotionValue` column on the `HappyHourPromotion` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `cashierName` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `customerName` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `promotionCode` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `splitEfectivo` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `splitTarjeta` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `cashRegisterName` on the `Shift` table. All the data in the column will be lost.
  - You are about to drop the column `cashierName` on the `Shift` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[floor,number]` on the table `Mesa` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `issueDate` on the `Certificado` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `discountValue` on the `Cupon` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `discountValue` on the `DiscountPromotion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `endMinutes` to the `HappyHourPromotion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startMinutes` to the `HappyHourPromotion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cashierSnapshotName` to the `Shift` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- DropIndex
DROP INDEX "Mesa_number_key";

-- DropIndex
DROP INDEX "Order_customerName_idx";

-- DropIndex
DROP INDEX "Order_promotionCode_idx";

-- DropIndex
DROP INDEX "Shift_cashRegisterName_idx";

-- DropIndex
DROP INDEX "Shift_cashierName_idx";

-- AlterTable - Drop columns from Order (including paymentMethod) first
ALTER TABLE "Order" DROP COLUMN "cashierName",
DROP COLUMN "customerName",
DROP COLUMN "paymentMethod",
DROP COLUMN "promotionCode",
DROP COLUMN "splitEfectivo",
DROP COLUMN "splitTarjeta",
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cashierSnapshotName" TEXT,
ADD COLUMN     "cuponId" INTEGER,
ADD COLUMN     "customerSnapshotName" TEXT;

-- AlterEnum - Now we can safely drop and recreate the enum
DROP TYPE "PaymentMethod" CASCADE;
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'APP');

-- AlterTable
ALTER TABLE "AppConfig" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Certificado" DROP COLUMN "notes",
DROP COLUMN "product",
ADD COLUMN     "amount" DECIMAL(10,2),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "redeemedAt" TIMESTAMP(3),
ADD COLUMN     "redeemedOrderId" TEXT,
DROP COLUMN "issueDate",
ADD COLUMN     "issueDate" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Cupon" ADD COLUMN     "deletedAt" TIMESTAMP(3),
DROP COLUMN "discountValue",
ADD COLUMN     "discountValue" DECIMAL(10,4) NOT NULL,
DROP COLUMN "expiresDate",
ADD COLUMN     "expiresDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DiscountPromotion" DROP COLUMN "appliesTo",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
DROP COLUMN "discountValue",
ADD COLUMN     "discountValue" DECIMAL(10,4) NOT NULL;

-- AlterTable
ALTER TABLE "HappyHourPromotion" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "endMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startMinutes" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "daysOfWeek",
ADD COLUMN     "daysOfWeek" "WeekDay"[],
DROP COLUMN "promotionValue",
ADD COLUMN     "promotionValue" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "Mesa" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "Mesa_number_seq";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Shift" DROP COLUMN "cashRegisterName",
DROP COLUMN "cashierName",
ADD COLUMN     "cashRegisterSnapshotName" TEXT,
ADD COLUMN     "cashierSnapshotName" TEXT NOT NULL DEFAULT 'N/A';

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "cashierId" TEXT,
    "cashierSnapshotName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HappyHourProduct" (
    "happyHourId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "HappyHourProduct_pkey" PRIMARY KEY ("happyHourId","productId")
);

-- CreateTable
CREATE TABLE "HappyHourCategory" (
    "happyHourId" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "HappyHourCategory_pkey" PRIMARY KEY ("happyHourId","categoryId")
);

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "discountId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("discountId","productId")
);

-- CreateTable
CREATE TABLE "DiscountCategory" (
    "discountId" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("discountId","categoryId")
);

-- CreateTable
CREATE TABLE "CertificadoItem" (
    "id" SERIAL NOT NULL,
    "certificadoId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CertificadoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "HappyHourProduct_productId_idx" ON "HappyHourProduct"("productId");

-- CreateIndex
CREATE INDEX "HappyHourCategory_categoryId_idx" ON "HappyHourCategory"("categoryId");

-- CreateIndex
CREATE INDEX "DiscountProduct_productId_idx" ON "DiscountProduct"("productId");

-- CreateIndex
CREATE INDEX "DiscountCategory_categoryId_idx" ON "DiscountCategory"("categoryId");

-- CreateIndex
CREATE INDEX "CertificadoItem_certificadoId_idx" ON "CertificadoItem"("certificadoId");

-- CreateIndex
CREATE INDEX "CertificadoItem_productId_idx" ON "CertificadoItem"("productId");

-- CreateIndex
CREATE INDEX "Certificado_deletedAt_idx" ON "Certificado"("deletedAt");

-- CreateIndex
CREATE INDEX "Cupon_code_idx" ON "Cupon"("code");

-- CreateIndex
CREATE INDEX "Cupon_deletedAt_idx" ON "Cupon"("deletedAt");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "DiscountPromotion_deletedAt_idx" ON "DiscountPromotion"("deletedAt");

-- CreateIndex
CREATE INDEX "HappyHourPromotion_deletedAt_idx" ON "HappyHourPromotion"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_floor_number_key" ON "Mesa"("floor", "number");

-- CreateIndex
CREATE INDEX "Order_customerSnapshotName_idx" ON "Order"("customerSnapshotName");

-- CreateIndex
CREATE INDEX "Order_cuponId_idx" ON "Order"("cuponId");

-- CreateIndex
CREATE INDEX "Shift_cashierSnapshotName_idx" ON "Shift"("cashierSnapshotName");

-- CreateIndex
CREATE INDEX "Shift_cashRegisterSnapshotName_idx" ON "Shift"("cashRegisterSnapshotName");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cuponId_fkey" FOREIGN KEY ("cuponId") REFERENCES "Cupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappyHourProduct" ADD CONSTRAINT "HappyHourProduct_happyHourId_fkey" FOREIGN KEY ("happyHourId") REFERENCES "HappyHourPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappyHourProduct" ADD CONSTRAINT "HappyHourProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappyHourCategory" ADD CONSTRAINT "HappyHourCategory_happyHourId_fkey" FOREIGN KEY ("happyHourId") REFERENCES "HappyHourPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappyHourCategory" ADD CONSTRAINT "HappyHourCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "DiscountPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "DiscountPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_redeemedOrderId_fkey" FOREIGN KEY ("redeemedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoItem" ADD CONSTRAINT "CertificadoItem_certificadoId_fkey" FOREIGN KEY ("certificadoId") REFERENCES "Certificado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoItem" ADD CONSTRAINT "CertificadoItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
