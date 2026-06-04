-- CreateTable (idempotent: table may exist from prior db push)
CREATE TABLE IF NOT EXISTS "squad_waitlist" (
    "id" SERIAL NOT NULL,
    "squad_name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "friend_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "squad_waitlist_pkey" PRIMARY KEY ("id")
);
