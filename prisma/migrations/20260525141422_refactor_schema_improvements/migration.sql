/*
  Warnings:

  - You are about to drop the column `nameLower` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `tableId` on the `Order` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_tableId_fkey";

-- DropIndex
DROP INDEX "Customer_nameLower_key";

-- DropIndex
DROP INDEX "Product_categoryId_name_key";

-- AlterTable
ALTER TABLE "Certificado" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Cupon" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "nameLower";

-- AlterTable
ALTER TABLE "DiscountPromotion" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "HappyHourPromotion" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "tableId";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "giftReason" TEXT;

-- CreateIndex
CREATE INDEX "Certificado_createdById_idx" ON "Certificado"("createdById");

-- CreateIndex
CREATE INDEX "Certificado_updatedById_idx" ON "Certificado"("updatedById");

-- CreateIndex
CREATE INDEX "Cupon_createdById_idx" ON "Cupon"("createdById");

-- CreateIndex
CREATE INDEX "Cupon_updatedById_idx" ON "Cupon"("updatedById");

-- CreateIndex
CREATE INDEX "DiscountPromotion_createdById_idx" ON "DiscountPromotion"("createdById");

-- CreateIndex
CREATE INDEX "DiscountPromotion_updatedById_idx" ON "DiscountPromotion"("updatedById");

-- CreateIndex
CREATE INDEX "HappyHourPromotion_createdById_idx" ON "HappyHourPromotion"("createdById");

-- CreateIndex
CREATE INDEX "HappyHourPromotion_updatedById_idx" ON "HappyHourPromotion"("updatedById");

-- AddForeignKey
ALTER TABLE "HappyHourPromotion" ADD CONSTRAINT "HappyHourPromotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappyHourPromotion" ADD CONSTRAINT "HappyHourPromotion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountPromotion" ADD CONSTRAINT "DiscountPromotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountPromotion" ADD CONSTRAINT "DiscountPromotion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificado" ADD CONSTRAINT "Certificado_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
