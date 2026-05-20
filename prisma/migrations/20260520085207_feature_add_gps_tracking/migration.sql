/*
  Warnings:

  - You are about to drop the column `bgGradient` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `desc` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Promo` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `RiderProfile` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ShiftLog` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `ShiftLog` table. All the data in the column will be lost.
  - You are about to drop the column `riderId` on the `ShiftLog` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `ShiftLog` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `ShiftLog` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ShiftLog" DROP CONSTRAINT "ShiftLog_riderId_fkey";

-- DropIndex
DROP INDEX "Promo_businessId_idx";

-- DropIndex
DROP INDEX "ShiftLog_riderId_idx";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Promo" DROP COLUMN "bgGradient",
DROP COLUMN "createdAt",
DROP COLUMN "desc",
DROP COLUMN "expiresAt",
DROP COLUMN "isActive",
DROP COLUMN "title",
ADD COLUMN     "code" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RiderProfile" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "ShiftLog" DROP COLUMN "createdAt",
DROP COLUMN "endTime",
DROP COLUMN "riderId",
DROP COLUMN "startTime",
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "ShiftLog_userId_key" ON "ShiftLog"("userId");

-- CreateIndex
CREATE INDEX "ShiftLog_userId_idx" ON "ShiftLog"("userId");

-- AddForeignKey
ALTER TABLE "ShiftLog" ADD CONSTRAINT "ShiftLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
