-- AlterTable: add reclub_user_id to player_profiles
ALTER TABLE "player_profiles" ADD COLUMN "reclub_user_id" BIGINT;

-- CreateTable: follows (social graph)
CREATE TABLE "follows" (
    "id" SERIAL NOT NULL,
    "follower_id" TEXT NOT NULL,
    "followee_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_reclub_user_id_key" ON "player_profiles"("reclub_user_id");
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");
CREATE INDEX "follows_followee_id_idx" ON "follows"("followee_id");
CREATE UNIQUE INDEX "follows_follower_id_followee_id_key" ON "follows"("follower_id", "followee_id");

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_reclub_user_id_fkey" FOREIGN KEY ("reclub_user_id") REFERENCES "players"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "players"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
