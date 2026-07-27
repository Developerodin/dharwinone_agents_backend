-- project_assets is now polymorphic on projectId: it stores both old builder
-- assets (projectId in builder_projects) AND new sites-engine assets
-- (projectId = siteId, which lives in `sites`). The old DB-level FK still
-- pointed projectId -> builder_projects(projectId), so every site asset presign
-- hit a foreign-key violation (P2003). Prisma's schema never declared this FK.
-- Drop it — no single FK can serve both parent tables.
-- Run: npx prisma db execute --file prisma/migrations/drop_stale_project_assets_fk.sql

ALTER TABLE project_assets
  DROP CONSTRAINT IF EXISTS "project_assets_projectId_fkey";
