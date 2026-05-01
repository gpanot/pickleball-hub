-- AlterTable
ALTER TABLE "hcm_market_median_daily" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL,
    "zalo_id" TEXT,
    "display_name" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_zalo_id_key" ON "player_profiles"("zalo_id");
