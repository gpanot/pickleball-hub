-- AlterTable
ALTER TABLE "squads" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "squads_latitude_longitude_idx" ON "squads"("latitude", "longitude");
