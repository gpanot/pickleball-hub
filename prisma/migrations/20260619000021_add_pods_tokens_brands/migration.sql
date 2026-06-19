-- AlterTable
ALTER TABLE "player_profiles" ADD COLUMN     "welcome_chest_claimed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "squad_invites" ADD COLUMN     "pod_id" TEXT;

-- CreateTable
CREATE TABLE "pods" (
    "id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "founder_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disbanded_at" TIMESTAMP(3),

    CONSTRAINT "pods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_members" (
    "id" SERIAL NOT NULL,
    "pod_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "pod_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_brands" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "support_level" INTEGER NOT NULL DEFAULT 1,
    "brand_xp" INTEGER NOT NULL DEFAULT 0,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "switched_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_wallets" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "club_tokens" INTEGER NOT NULL DEFAULT 0,
    "brand_tokens" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_ledger" (
    "id" SERIAL NOT NULL,
    "profile_id" TEXT NOT NULL,
    "token_type" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "squad_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pods_squad_id_idx" ON "pods"("squad_id");

-- CreateIndex
CREATE INDEX "pod_members_profile_id_idx" ON "pod_members"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_members_pod_id_profile_id_key" ON "pod_members"("pod_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_brands_profile_id_key" ON "player_brands"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_wallets_profile_id_key" ON "player_wallets"("profile_id");

-- CreateIndex
CREATE INDEX "token_ledger_profile_id_created_at_idx" ON "token_ledger"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "squad_invites_pod_id_idx" ON "squad_invites"("pod_id");

-- AddForeignKey
ALTER TABLE "squad_invites" ADD CONSTRAINT "squad_invites_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "pods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pods" ADD CONSTRAINT "pods_squad_id_fkey" FOREIGN KEY ("squad_id") REFERENCES "squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pods" ADD CONSTRAINT "pods_founder_id_fkey" FOREIGN KEY ("founder_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_members" ADD CONSTRAINT "pod_members_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "pods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_members" ADD CONSTRAINT "pod_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_brands" ADD CONSTRAINT "player_brands_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_wallets" ADD CONSTRAINT "player_wallets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "player_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
