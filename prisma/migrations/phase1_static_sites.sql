-- Phase 1 static-site tables (manual apply — Alembic owns builder tables).
-- Run: npx prisma db execute --file prisma/migrations/phase1_static_sites.sql

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  "siteId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateVersion" TEXT,
  "businessProfileJson" JSONB,
  "contentJson" JSONB,
  "themeJson" JSONB,
  status TEXT DEFAULT 'draft',
  subdomain TEXT,
  "customDomain" TEXT,
  "createdAt" DOUBLE PRECISION,
  "updatedAt" DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS sites_userId_idx ON sites ("userId");
CREATE INDEX IF NOT EXISTS sites_subdomain_idx ON sites (subdomain);

CREATE TABLE IF NOT EXISTS site_versions (
  id SERIAL PRIMARY KEY,
  "versionId" TEXT NOT NULL UNIQUE,
  "siteId" TEXT NOT NULL REFERENCES sites ("siteId") ON DELETE CASCADE,
  "contentJson" JSONB,
  "themeJson" JSONB,
  label TEXT,
  "createdAt" DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS site_versions_siteId_idx ON site_versions ("siteId");

CREATE TABLE IF NOT EXISTS token_transactions (
  id SERIAL PRIMARY KEY,
  "transactionId" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "actionType" TEXT,
  tokens INTEGER,
  status TEXT DEFAULT 'pending',
  "idempotencyKey" TEXT,
  "siteId" TEXT,
  "createdAt" DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS token_transactions_userId_idx ON token_transactions ("userId");
CREATE INDEX IF NOT EXISTS token_transactions_siteId_idx ON token_transactions ("siteId");
CREATE INDEX IF NOT EXISTS token_transactions_idempotencyKey_idx ON token_transactions ("idempotencyKey");

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  "categoryId" TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  "subcategoriesJson" JSONB,
  "questionnaireConfigJson" JSONB,
  "imagePackRefs" JSONB DEFAULT '[]'::jsonb
);
