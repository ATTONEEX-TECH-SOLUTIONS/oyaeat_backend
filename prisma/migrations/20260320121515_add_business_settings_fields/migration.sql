-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "closingHour" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "deliveryFee" DOUBLE PRECISION,
ADD COLUMN     "deliveryRadius" DOUBLE PRECISION,
ADD COLUMN     "minimumOrder" DOUBLE PRECISION,
ADD COLUMN     "notifNewOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifPromotions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifSystemAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "openingHour" TEXT,
ADD COLUMN     "profilePicUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;
