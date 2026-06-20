-- Gang-first onboarding: make Pod.squad_id nullable (solo Gangs have no clubhouse yet)
-- and add invite_type discriminator to squad_invites.
-- Both statements are idempotent.

-- 1. Make pods.squad_id nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pods' AND column_name = 'squad_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "pods" ALTER COLUMN "squad_id" DROP NOT NULL;
  END IF;
END $$;

-- 2. Add index on pods.founder_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'pods' AND indexname = 'pods_founder_id_idx'
  ) THEN
    CREATE INDEX "pods_founder_id_idx" ON "pods"("founder_id");
  END IF;
END $$;

-- 3. Add invite_type column to squad_invites with default 'gang'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'squad_invites' AND column_name = 'invite_type'
  ) THEN
    ALTER TABLE "squad_invites" ADD COLUMN "invite_type" TEXT NOT NULL DEFAULT 'gang';
  END IF;
END $$;

-- 4. Make squad_invites.squad_id nullable (solo Gang invites have no clubhouse yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'squad_invites' AND column_name = 'squad_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "squad_invites" ALTER COLUMN "squad_id" DROP NOT NULL;
  END IF;
END $$;
