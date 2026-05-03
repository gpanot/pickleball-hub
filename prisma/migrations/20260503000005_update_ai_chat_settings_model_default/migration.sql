-- AlterTable: update the column default for model in ai_chat_settings
ALTER TABLE "ai_chat_settings" ALTER COLUMN "model" SET DEFAULT 'deepseek-chat';

-- Update the singleton row to use deepseek-chat if it still has the old claude default
UPDATE "ai_chat_settings" SET "model" = 'deepseek-chat' WHERE "id" = 'singleton' AND "model" = 'claude-haiku-4-5-20251001';
