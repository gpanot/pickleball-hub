-- AddColumn city, latitude, longitude to app_clubs
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- CreateIndex on (latitude, longitude) for proximity queries
CREATE INDEX IF NOT EXISTS "app_clubs_lat_lng_idx" ON "public"."app_clubs"("latitude", "longitude");
