-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CAJERO', 'MESERO', 'COCINERO');

-- CreateEnum
CREATE TYPE "MesaEstado" AS ENUM ('DISPONIBLE', 'RESERVADO', 'OCUPADO');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'DELIVERED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA', 'APP', 'MIXTO');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LOCAL', 'LLEVAR', 'DELIVERY');

-- CreateEnum
CREATE TYPE "CorrelativoStatus" AS ENUM ('ACTIVO', 'AGOTADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FACTURA');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVisit" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lastUsed" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "estado" "MesaEstado" NOT NULL,
    "reservationName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "openingAmount" DECIMAL(10,2) NOT NULL,
    "closingAmount" DECIMAL(10,2),
    "cashSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cardSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "appSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ShiftStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "subTotal" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "orderType" "OrderType",
    "tableId" TEXT,
    "paymentMethod" "PaymentMethod",
    "splitEfectivo" DECIMAL(12,2),
    "splitTarjeta" DECIMAL(12,2),
    "cashierName" TEXT,
    "isSentToKitchen" BOOLEAN NOT NULL DEFAULT false,
    "linkedTables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correlativo" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "resolutionNumber" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "CorrelativoStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correlativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT NOT NULL,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_pin_key" ON "User"("pin");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nameLower_key" ON "Customer"("nameLower");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_lastUsed_idx" ON "CustomerAddress"("lastUsed");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAddress_customerId_address_key" ON "CustomerAddress"("customerId", "address");

-- CreateIndex
CREATE INDEX "Mesa_floor_idx" ON "Mesa"("floor");

-- CreateIndex
CREATE INDEX "Mesa_estado_idx" ON "Mesa"("estado");

-- CreateIndex
CREATE INDEX "Shift_cashierName_idx" ON "Shift"("cashierName");

-- CreateIndex
CREATE INDEX "Shift_startTime_idx" ON "Shift"("startTime");

-- CreateIndex
CREATE INDEX "Shift_status_idx" ON "Shift"("status");

-- CreateIndex
CREATE INDEX "Order_timestamp_idx" ON "Order"("timestamp");

-- CreateIndex
CREATE INDEX "Order_customerName_idx" ON "Order"("customerName");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Correlativo_documentType_idx" ON "Correlativo"("documentType");

-- CreateIndex
CREATE INDEX "Correlativo_status_idx" ON "Correlativo"("status");

-- CreateIndex
CREATE INDEX "SystemLog_timestamp_idx" ON "SystemLog"("timestamp");

-- CreateIndex
CREATE INDEX "SystemLog_user_idx" ON "SystemLog"("user");

-- CreateIndex
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
