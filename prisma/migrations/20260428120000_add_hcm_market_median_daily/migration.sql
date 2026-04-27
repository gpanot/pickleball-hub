-- CreateTable
CREATE TABLE "hcm_market_median_daily" (
    "date" TEXT NOT NULL,
    "median_cost_per_hour" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hcm_market_median_daily_pkey" PRIMARY KEY ("date")
);
