-- AlterTable
ALTER TABLE "BusinessBankDetail" ADD COLUMN "bankCode" TEXT,
ADD COLUMN "paystackSubaccountCode" TEXT,
ADD COLUMN "commissionPercent" DOUBLE PRECISION,
ADD COLUMN "subaccountActive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "settlementMode" TEXT,
ADD COLUMN "platformFee" DOUBLE PRECISION,
ADD COLUMN "restaurantShare" DOUBLE PRECISION;
