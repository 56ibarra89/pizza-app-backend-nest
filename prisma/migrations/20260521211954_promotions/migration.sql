-- CreateEnum
CREATE TYPE "PromoActiveStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "HappyHourPromotionType" AS ENUM ('DOSXUNO', 'PORCENTAJE', 'MONTO_FIJO');

-- CreateEnum
CREATE TYPE "CuponDiscountType" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- CreateEnum
CREATE TYPE "CuponManualStatus" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "CertificadoStatus" AS ENUM ('DISPONIBLE', 'ENTREGADO', 'ANULADO');

-- CreateTable
CREATE TABLE "HappyHourPromotion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "daysOfWeek" TEXT[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "promotionType" "HappyHourPromotionType" NOT NULL,
    "promotionValue" TEXT NOT NULL DEFAULT '',
    "status" "PromoActiveStatus" NOT NULL DEFAULT 'ACTIVO',
    "appliesTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HappyHourPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountPromotion" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "CuponDiscountType" NOT NULL,
    "discountValue" TEXT NOT NULL,
    "status" "PromoActiveStatus" NOT NULL DEFAULT 'ACTIVO',
    "appliesTo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cupon" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "CuponDiscountType" NOT NULL,
    "discountValue" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "expiresDate" TEXT NOT NULL DEFAULT '',
    "manualStatus" "CuponManualStatus" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificado" (
    "id" SERIAL NOT NULL,
    "serial" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CertificadoStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HappyHourPromotion_status_idx" ON "HappyHourPromotion"("status");

-- CreateIndex
CREATE INDEX "DiscountPromotion_status_idx" ON "DiscountPromotion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Cupon_code_key" ON "Cupon"("code");

-- CreateIndex
CREATE INDEX "Cupon_manualStatus_idx" ON "Cupon"("manualStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Certificado_serial_key" ON "Certificado"("serial");

-- CreateIndex
CREATE INDEX "Certificado_status_idx" ON "Certificado"("status");
