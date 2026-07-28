-- Persist web-agent chat transcripts on sites (auth-scoped via site.userId).
-- Run: npx prisma db execute --file prisma/migrations/site_chat_history.sql

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS "chatHistoryJson" JSONB DEFAULT '[]'::jsonb;
