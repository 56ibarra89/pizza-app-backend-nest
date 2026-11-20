-- Reconciliación aditiva para instalaciones creadas con migraciones anteriores.
-- Las conversiones de tamaño preservan el valor de cada fila.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CashExpenseCategory" AS ENUM ('SERVICIOS_BASICOS', 'INSUMOS_URGENTES', 'LIMPIEZA_MANTENIMIENTO', 'PAGO_PROVEEDOR', 'ADELANTO_SUELDO', 'TRANSPORTE_FLETE', 'OTROS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CAJERO_PRINCIPAL';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MOTORIZADO';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DESPACHADOR';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "kitchenId" TEXT;

-- AlterTable
ALTER TABLE "CategoryExtra" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "lastUsed" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Mesa" ADD COLUMN IF NOT EXISTS "expirationTime" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "reservationAmount" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "reservationTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerTendered" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "deliveryChange" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "driverId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "comboSelections" JSONB,
ADD COLUMN IF NOT EXISTS "isCombo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "kitchenId" TEXT;
ALTER TABLE "OrderItem" ALTER COLUMN "size" TYPE TEXT USING "size"::text;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "comboPrice" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductPrice" ALTER COLUMN "size" TYPE TEXT USING "size"::text;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "appDifference" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "cardDifference" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "declaredAppAmount" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "declaredCardAmount" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "totalDeclaredAmount" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "totalDifference" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lockoutLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "themePreference" TEXT NOT NULL DEFAULT 'light',
ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "workDays" "WeekDay"[] DEFAULT ARRAY[]::"WeekDay"[];

-- DropEnum
-- El tipo anterior se conserva para no afectar otras dependencias.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerPhone" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Kitchen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CookKitchenAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "dayOfWeek" "WeekDay" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookKitchenAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComboGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComboGroupOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "itemProductId" TEXT NOT NULL,
    "size" TEXT,
    "extraPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboGroupOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserExtraDay" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExtraDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WaiterZoneAssignment" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "day" "WeekDay" NOT NULL,
    "floor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaiterZoneAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CashExpense" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" "CashExpenseCategory" NOT NULL DEFAULT 'OTROS',
    "reason" TEXT NOT NULL,
    "voucherNumber" TEXT,
    "notes" TEXT,
    "cashierId" TEXT,
    "cashierSnapshotName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerPhone_customerId_idx" ON "CustomerPhone"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerPhone_phone_idx" ON "CustomerPhone"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerPhone_lastUsed_idx" ON "CustomerPhone"("lastUsed");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPhone_customerId_phone_key" ON "CustomerPhone"("customerId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Kitchen_name_key" ON "Kitchen"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CookKitchenAssignment_kitchenId_idx" ON "CookKitchenAssignment"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CookKitchenAssignment_userId_dayOfWeek_key" ON "CookKitchenAssignment"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComboGroup_productId_idx" ON "ComboGroup"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComboGroupOption_groupId_idx" ON "ComboGroupOption"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ComboGroupOption_itemProductId_idx" ON "ComboGroupOption"("itemProductId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserExtraDay_date_idx" ON "UserExtraDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserExtraDay_userId_date_key" ON "UserExtraDay"("userId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaiterZoneAssignment_userId_idx" ON "WaiterZoneAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WaiterZoneAssignment_userId_day_key" ON "WaiterZoneAssignment"("userId", "day");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashExpense_shiftId_idx" ON "CashExpense"("shiftId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashExpense_createdAt_idx" ON "CashExpense"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashExpense_category_idx" ON "CashExpense"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashExpense_cashierId_idx" ON "CashExpense"("cashierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_kitchenId_idx" ON "Category"("kitchenId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Mesa_isActive_idx" ON "Mesa"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_driverId_idx" ON "Order"("driverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_status_paidAt_idx" ON "Order"("status", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_shiftId_status_idx" ON "Order"("shiftId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_orderType_status_idx" ON "Order"("orderType", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_kitchenId_idx" ON "OrderItem"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrice_productId_size_key" ON "ProductPrice"("productId", "size");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerPhone_customerId_fkey' AND conrelid = '"CustomerPhone"'::regclass) THEN
    ALTER TABLE "CustomerPhone" ADD CONSTRAINT "CustomerPhone_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_driverId_fkey' AND conrelid = '"Order"'::regclass) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_kitchenId_fkey' AND conrelid = '"OrderItem"'::regclass) THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Category_kitchenId_fkey' AND conrelid = '"Category"'::regclass) THEN
    ALTER TABLE "Category" ADD CONSTRAINT "Category_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CookKitchenAssignment_userId_fkey' AND conrelid = '"CookKitchenAssignment"'::regclass) THEN
    ALTER TABLE "CookKitchenAssignment" ADD CONSTRAINT "CookKitchenAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CookKitchenAssignment_kitchenId_fkey' AND conrelid = '"CookKitchenAssignment"'::regclass) THEN
    ALTER TABLE "CookKitchenAssignment" ADD CONSTRAINT "CookKitchenAssignment_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboGroup_productId_fkey' AND conrelid = '"ComboGroup"'::regclass) THEN
    ALTER TABLE "ComboGroup" ADD CONSTRAINT "ComboGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboGroupOption_groupId_fkey' AND conrelid = '"ComboGroupOption"'::regclass) THEN
    ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ComboGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComboGroupOption_itemProductId_fkey' AND conrelid = '"ComboGroupOption"'::regclass) THEN
    ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_itemProductId_fkey" FOREIGN KEY ("itemProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserExtraDay_userId_fkey' AND conrelid = '"UserExtraDay"'::regclass) THEN
    ALTER TABLE "UserExtraDay" ADD CONSTRAINT "UserExtraDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WaiterZoneAssignment_userId_fkey' AND conrelid = '"WaiterZoneAssignment"'::regclass) THEN
    ALTER TABLE "WaiterZoneAssignment" ADD CONSTRAINT "WaiterZoneAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashExpense_shiftId_fkey' AND conrelid = '"CashExpense"'::regclass) THEN
    ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashExpense_cashierId_fkey' AND conrelid = '"CashExpense"'::regclass) THEN
    ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

