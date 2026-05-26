-- CreateTable
CREATE TABLE IF NOT EXISTS "player_gear" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "gender" TEXT,
    "cap" TEXT,
    "shirt" TEXT,
    "paddle" TEXT,
    "shoes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_gear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "player_gear_profile_id_key" ON "player_gear"("profile_id");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "player_gear" ADD CONSTRAINT "player_gear_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add gender column if table existed without it
ALTER TABLE "player_gear" ADD COLUMN IF NOT EXISTS "gender" TEXT;
