-- DropIndex
DROP INDEX "clubs_market_idx";

-- CreateTable
CREATE TABLE "squads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "show_dupr" BOOLEAN NOT NULL DEFAULT true,
    "app_slug" TEXT NOT NULL DEFAULT 'squadd',
    "founder_id" TEXT NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disbanded_at" TIMESTAMP(3),

    CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_members" (
    "id" SERIAL NOT NULL,
    "squad_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_codes" (
    "id" SERIAL NOT NULL,
    "squad_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "app_slug" TEXT NOT NULL DEFAULT 'squadd',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_invites" (
    "id" SERIAL NOT NULL,
    "squad_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT,
    "invite_channel" TEXT NOT NULL DEFAULT 'push',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "last_resent_at" TIMESTAMP(3),

    CONSTRAINT "squad_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "squads_founder_id_idx" ON "squads"("founder_id");

-- CreateIndex
CREATE INDEX "squad_members_profile_id_idx" ON "squad_members"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "squad_members_squad_id_profile_id_key" ON "squad_members"("squad_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "squad_codes_squad_id_key" ON "squad_codes"("squad_id");

-- CreateIndex
CREATE UNIQUE INDEX "squad_codes_code_key" ON "squad_codes"("code");

-- CreateIndex
CREATE INDEX "squad_invites_squad_id_idx" ON "squad_invites"("squad_id");

-- CreateIndex
CREATE INDEX "squad_invites_invitee_id_idx" ON "squad_invites"("invitee_id");

-- AddForeignKey
ALTER TABLE "squads" ADD CONSTRAINT "squads_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_codes" ADD CONSTRAINT "squad_codes_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_invites" ADD CONSTRAINT "squad_invites_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad_invites" ADD CONSTRAINT "squad_invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
