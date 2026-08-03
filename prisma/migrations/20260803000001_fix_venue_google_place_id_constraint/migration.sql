-- Fix: replace partial unique index with a full unique constraint so
-- Prisma's upsert ON CONFLICT works correctly (partial indexes cause 42P10).
DROP INDEX IF EXISTS venues_google_place_id_key;
ALTER TABLE venues ADD CONSTRAINT venues_google_place_id_key UNIQUE (google_place_id);
