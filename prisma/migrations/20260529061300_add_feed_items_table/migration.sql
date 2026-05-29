-- CreateTable
CREATE TABLE "feed_items" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "player_user_id" TEXT,
    "payload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_items_profile_id_timestamp_idx" ON "feed_items"("profile_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "feed_items_profile_id_type_idx" ON "feed_items"("profile_id", "type");

-- AddForeignKey
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
