# Phase 1 Prisma migration

## Why manual SQL?

The live Postgres database was created by **Alembic** (`alembic_version` table). Prisma `migrate dev` reports drift and would drop Alembic metadata. Do **not** run `prisma migrate reset` on shared dev DBs.

## Apply Phase 1 tables

With Docker Postgres running:

```powershell
cd backend
npx prisma db execute --file prisma/migrations/phase1_static_sites.sql
npx prisma generate
```

Or via psql:

```powershell
psql $env:DATABASE_URL -f prisma/migrations/phase1_static_sites.sql
```

Creates (if missing): `sites`, `site_versions`, `token_transactions`, `categories`.

Existing Alembic-mapped builder tables are unchanged.

## Apply chat history column

```bash
npx prisma db execute --file prisma/migrations/site_chat_history.sql
npx prisma generate
```

Adds nullable `sites.chatHistoryJson` (JSONB, default `[]`) for web-agent cross-device chat sync.

## Optional: baseline Prisma migrations later

When ready to adopt Prisma migrate history without losing Alembic:

1. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
2. Mark baseline applied: `npx prisma migrate resolve --applied 0_init`
3. Use `migrate dev` only for **new** changes after baseline.

Until then, ship Phase 1 DDL via `phase1_static_sites.sql`.

## Verify

```powershell
npx prisma db execute --stdin
# then paste: SELECT tablename FROM pg_tables WHERE tablename IN ('sites','site_versions');
```

Expected: both rows present after apply.
