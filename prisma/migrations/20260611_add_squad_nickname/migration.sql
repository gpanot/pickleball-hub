-- AddColumn: squadNickname on player_profiles
ALTER TABLE "player_profiles" ADD COLUMN "squad_nickname" TEXT;
ALTER TABLE "player_profiles" ADD COLUMN "squad_nickname_set_at" TIMESTAMP(3);

-- UniqueConstraint
CREATE UNIQUE INDEX "player_profiles_squad_nickname_key" ON "player_profiles"("squad_nickname");
