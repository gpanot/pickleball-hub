-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."app_config" (
  "key"        TEXT PRIMARY KEY,
  "value"      JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the support config row (placeholder number must be updated before go-live)
INSERT INTO "public"."app_config" ("key", "value") VALUES (
  'support',
  '{"enabled":true,"default":{"channel":"whatsapp","number":"<PLACEHOLDER>","hours":"Mon to Fri, 9:00 to 18:00 CET"},"regions":{}}'::jsonb
) ON CONFLICT ("key") DO NOTHING;
