-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "hasBankDetails" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasDocuments" BOOLEAN NOT NULL DEFAULT false;
