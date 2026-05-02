-- CreateTable
CREATE TABLE "content_posts" (
    "id" TEXT NOT NULL,
    "post_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "generated_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "posted_at" TIMESTAMP(3),
    "post_now" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_posts_status_idx" ON "content_posts"("status");

-- CreateIndex
CREATE INDEX "content_posts_scheduled_date_idx" ON "content_posts"("scheduled_date");
