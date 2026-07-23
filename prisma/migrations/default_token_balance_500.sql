-- New signups receive 500 starter tokens (was 100).
ALTER TABLE users ALTER COLUMN "tokenBalance" SET DEFAULT 500;
