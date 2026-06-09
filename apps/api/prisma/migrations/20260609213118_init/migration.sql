-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'PASSIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "MonetaryLedgerType" AS ENUM ('DEBT', 'PAYMENT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE');

-- CreateEnum
CREATE TYPE "MonetaryLedgerSource" AS ENUM ('MANUAL', 'SEEDLING_DEBT', 'CORRECTION', 'ADMIN_PANEL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('MEDICINE', 'FERTILIZER', 'OTHER');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('PIECE', 'KG', 'GRAM', 'LITER', 'ML', 'SACK', 'PACKAGE');

-- CreateEnum
CREATE TYPE "ProductPurchaseStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "SeedUnit" AS ENUM ('ENVELOPE', 'GRAM');

-- CreateEnum
CREATE TYPE "SeedlingOrderStatus" AS ENUM ('PENDING', 'REMINDED', 'DELIVERED', 'CANCELLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PromissoryNoteStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('PROMISSORY_NOTE_3_DAYS', 'PROMISSORY_NOTE_1_DAY', 'SEEDLING_PICKUP_3_DAYS');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "baseName" TEXT NOT NULL,
    "identifier" TEXT,
    "normalizedBaseName" TEXT NOT NULL,
    "normalizedIdentifier" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "note" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetaryLedgerEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "MonetaryLedgerType" NOT NULL,
    "source" "MonetaryLedgerSource" NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "description" TEXT,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdByPhone" TEXT,
    "relatedSeedlingOrderId" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonetaryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "defaultUnit" "QuantityUnit",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPurchase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "estimatedAmountKurus" INTEGER,
    "status" "ProductPurchaseStatus" NOT NULL DEFAULT 'OPEN',
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPurchaseItem" (
    "id" TEXT NOT NULL,
    "productPurchaseId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "normalizedProductName" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "remainingQuantity" DECIMAL(12,3) NOT NULL,
    "unit" "QuantityUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPayment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "totalAmountKurus" INTEGER NOT NULL,
    "note" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPaymentItem" (
    "id" TEXT NOT NULL,
    "productPaymentId" TEXT NOT NULL,
    "productPurchaseItemId" TEXT NOT NULL,
    "paidQuantity" DECIMAL(12,3) NOT NULL,
    "amountKurus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedlingOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "plantName" TEXT NOT NULL,
    "normalizedPlantName" TEXT NOT NULL,
    "seedGiven" BOOLEAN NOT NULL DEFAULT false,
    "seedPlantName" TEXT,
    "seedAmount" DECIMAL(12,3),
    "seedUnit" "SeedUnit",
    "requestedPickupDate" TIMESTAMP(3) NOT NULL,
    "status" "SeedlingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SeedlingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromissoryNote" (
    "id" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL,
    "normalizedPayeeName" TEXT NOT NULL,
    "amountKurus" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PromissoryNoteStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PromissoryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "id" TEXT NOT NULL,
    "whatsappPhone" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "selectedCustomerId" TEXT,
    "temporaryData" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingWhatsappMessage" (
    "id" TEXT NOT NULL,
    "whatsappMessageId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingWhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorPhone" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_phone_key" ON "AppUser"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "Customer_normalizedBaseName_idx" ON "Customer"("normalizedBaseName");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_normalizedBaseName_normalizedIdentifier_key" ON "Customer"("normalizedBaseName", "normalizedIdentifier");

-- CreateIndex
CREATE INDEX "MonetaryLedgerEntry_customerId_idx" ON "MonetaryLedgerEntry"("customerId");

-- CreateIndex
CREATE INDEX "MonetaryLedgerEntry_businessDate_idx" ON "MonetaryLedgerEntry"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Product_normalizedName_category_key" ON "Product"("normalizedName", "category");

-- CreateIndex
CREATE INDEX "ProductPurchase_customerId_idx" ON "ProductPurchase"("customerId");

-- CreateIndex
CREATE INDEX "ProductPurchase_businessDate_idx" ON "ProductPurchase"("businessDate");

-- CreateIndex
CREATE INDEX "ProductPurchaseItem_productPurchaseId_idx" ON "ProductPurchaseItem"("productPurchaseId");

-- CreateIndex
CREATE INDEX "ProductPurchaseItem_normalizedProductName_idx" ON "ProductPurchaseItem"("normalizedProductName");

-- CreateIndex
CREATE INDEX "ProductPayment_customerId_idx" ON "ProductPayment"("customerId");

-- CreateIndex
CREATE INDEX "ProductPayment_businessDate_idx" ON "ProductPayment"("businessDate");

-- CreateIndex
CREATE INDEX "ProductPaymentItem_productPaymentId_idx" ON "ProductPaymentItem"("productPaymentId");

-- CreateIndex
CREATE INDEX "ProductPaymentItem_productPurchaseItemId_idx" ON "ProductPaymentItem"("productPurchaseItemId");

-- CreateIndex
CREATE INDEX "SeedlingOrder_customerId_idx" ON "SeedlingOrder"("customerId");

-- CreateIndex
CREATE INDEX "SeedlingOrder_requestedPickupDate_idx" ON "SeedlingOrder"("requestedPickupDate");

-- CreateIndex
CREATE INDEX "PromissoryNote_dueDate_idx" ON "PromissoryNote"("dueDate");

-- CreateIndex
CREATE INDEX "PromissoryNote_status_idx" ON "PromissoryNote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BotSession_whatsappPhone_key" ON "BotSession"("whatsappPhone");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingWhatsappMessage_whatsappMessageId_key" ON "IncomingWhatsappMessage"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Reminder_scheduledFor_idx" ON "Reminder"("scheduledFor");

-- CreateIndex
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_type_targetEntityId_scheduledFor_key" ON "Reminder"("type", "targetEntityId", "scheduledFor");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MonetaryLedgerEntry" ADD CONSTRAINT "MonetaryLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetaryLedgerEntry" ADD CONSTRAINT "MonetaryLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetaryLedgerEntry" ADD CONSTRAINT "MonetaryLedgerEntry_relatedSeedlingOrderId_fkey" FOREIGN KEY ("relatedSeedlingOrderId") REFERENCES "SeedlingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchase" ADD CONSTRAINT "ProductPurchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchaseItem" ADD CONSTRAINT "ProductPurchaseItem_productPurchaseId_fkey" FOREIGN KEY ("productPurchaseId") REFERENCES "ProductPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchaseItem" ADD CONSTRAINT "ProductPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPayment" ADD CONSTRAINT "ProductPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPaymentItem" ADD CONSTRAINT "ProductPaymentItem_productPaymentId_fkey" FOREIGN KEY ("productPaymentId") REFERENCES "ProductPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPaymentItem" ADD CONSTRAINT "ProductPaymentItem_productPurchaseItemId_fkey" FOREIGN KEY ("productPurchaseItemId") REFERENCES "ProductPurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedlingOrder" ADD CONSTRAINT "SeedlingOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
