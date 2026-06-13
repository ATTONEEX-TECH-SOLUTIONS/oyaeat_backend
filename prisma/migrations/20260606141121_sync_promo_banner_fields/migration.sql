-- AlterTable
ALTER TABLE "Promo" ADD COLUMN     "bgGradient" TEXT,
ADD COLUMN     "desc" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN DEFAULT true,
ADD COLUMN     "title" TEXT;
