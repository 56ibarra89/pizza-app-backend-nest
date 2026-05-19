-- CreateEnum
CREATE TYPE "ProductSize" AS ENUM ('FAMILIAR', 'MEDIANA', 'PERSONAL', 'UNICO');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hasMultipleSizes" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" "ProductSize" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraIngredient" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExtraIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraPrice" (
    "id" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "size" "ProductSize" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ExtraPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_label_key" ON "Category"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Product_categoryId_name_key" ON "Product"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_productId_size_key" ON "ProductPrice"("productId", "size");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraIngredient_productId_name_key" ON "ExtraIngredient"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraPrice_extraId_size_key" ON "ExtraPrice"("extraId", "size");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraIngredient" ADD CONSTRAINT "ExtraIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraPrice" ADD CONSTRAINT "ExtraPrice_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "ExtraIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
