-- Enforce single-use idempotency keys on token_transactions (BUG 2 — double-charge/credit).
-- Postgres unique indexes permit multiple NULLs, so zero-cost actions with a null key are unaffected.
-- Run: npx prisma db execute --file prisma/migrations/unique_idempotency_key.sql

-- Drop the plain index if it exists (superseded by the unique constraint's own index).
DROP INDEX IF EXISTS token_transactions_idempotencyKey_idx;

-- Unique index. CONCURRENTLY is avoided so this stays runnable inside a single transaction.
CREATE UNIQUE INDEX IF NOT EXISTS token_transactions_idempotencyKey_key
  ON token_transactions ("idempotencyKey");
