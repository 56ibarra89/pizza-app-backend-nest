/*
  Warnings:

  - A unique constraint covering the columns `[categoryId,name]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Product_categoryId_name_key" ON "Product"("categoryId", "name");
