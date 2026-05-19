-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'verified', 'active', 'inactive');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'pending';
