-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'appeal_evidence';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "suspensionType" TEXT;
