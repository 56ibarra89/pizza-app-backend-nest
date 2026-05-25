-- AlterTable
ALTER TABLE "HappyHourPromotion" ALTER COLUMN "endMinutes" DROP DEFAULT,
ALTER COLUMN "startMinutes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "cashierSnapshotName" DROP DEFAULT;
