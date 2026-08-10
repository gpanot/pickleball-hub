-- AddColumn tagline, cover_image_url, vibe_tag to app_clubs
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "cover_image_url" TEXT;
ALTER TABLE "public"."app_clubs" ADD COLUMN IF NOT EXISTS "vibe_tag" TEXT;
