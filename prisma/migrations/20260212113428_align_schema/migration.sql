/*
  Warnings:

  - You are about to drop the column `address` on the `Business` table. All the data in the column will be lost.
  - Added the required column `businessEmail` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessPhone` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `streetAddress` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileName` to the `BusinessDocument` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BusinessBankDetail" DROP CONSTRAINT "BusinessBankDetail_businessId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessDocument" DROP CONSTRAINT "BusinessDocument_businessId_fkey";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "address",
ADD COLUMN     "businessEmail" TEXT NOT NULL,
ADD COLUMN     "businessPhone" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "streetAddress" TEXT NOT NULL,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "BusinessDocument" ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessBankDetail" ADD CONSTRAINT "BusinessBankDetail_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
