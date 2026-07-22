# Backend migration phases (Python → Next.js)

Tracks the Python `studio/` → Next.js backend port at `backend/`. **Next.js on `:8787` is the only runtime required for dev/prod.**

## Phase A — Site pipeline + deprecate duplicated Python API surface

**Status: complete**

## Phase B — Knowledge / privacy / consent + project harness APIs

**Status: complete**

## Phase C — Cutover

**Status: complete**

Next.js on `:8787` serves auth, builder, projects, knowledge/privacy/consent/stats, sites.

## Phase D — Harness / runs API port

**Status: complete**

| Item | Status |
|------|--------|
| TS worker engine (`worker.ts`, `driver.ts`, `harness/*`) | done |
| Cloud LLM implementer (`harness/cloudImplementer.ts`) | done |
| Env-driven providers (`harness/providerConfig.ts`) | done |
| Privacy policy + consent ledger (`consent.ts`) | done |
| `/runs/*` Next.js routes | done |

## Phase E — Phase 1 static-site builder (backend API layer)

**Status: partial (M3 publish/assets/payments scaffold; frontend editor deferred)**

| Item | Status |
|------|--------|
| Prisma models: `Site`, `SiteVersion`, `TokenTransaction`, `Category` | done |
| Token ledger (reserve/commit/refund, idempotency) | done |
| Content agent (structured JSON, fallback ladder) | done |
| Category seed + `/api/categories` (+ rewrite `/categories`) | done |
| Site CRUD `/api/sites`, generate, publish checklist | done |
| Section regenerate `/api/sites/{id}/sections/{key}/regenerate` | done |
| AI rewrite `/api/sites/{id}/sections/{key}/rewrite` | done |
| **M3 publish checklist** (placeholders, contrast stub, CTA, SEO, favicon, page-weight) | done |
| **Subdomain slugging** (reserved list, collision suffix) | done |
| **Atomic publish** (version snapshot + status flip, `revalidateTag`) | done |
| **Public snapshot** `GET /api/public/sites/{subdomain}` + `/sites/preview/{subdomain}` | done (SSR stub) |
| **Site version rollback** `GET/POST /api/sites/{id}/versions[/restore]` | done |
| **Site assets** presign/confirm/list with `slotKey` + logo minPx warnings | done (MVP) |
| **Image resolver** upload → pack → template default + text logo fallback | done (stub pack refs) |
| **Razorpay webhook stub** + idempotent token credit (`RAZORPAY_ENABLED`) | done (scaffold) |
| **Token packs** config + `GET /api/token-packs` | done |
| **AI soft rate limit** on generate/regenerate/rewrite | done |
| Frontend client (`site-api.ts`, token balance in dashboard header) | done |
| Visual editor / Zustand / templates | **deferred** (frontend) |
| Smart intake (AI prefill, gap-check) | **done** |
| Template matcher + launch templates | **partial** (registry + rule matcher; 2 placeholders) |
| Asset pipeline (rembg worker, WebP/LQIP, Unsplash cache) | **deferred** |
| Razorpay checkout UI + reconciliation | **deferred** |
| ISR subdomain routing on production domain | **deferred** (preview route only) |
| Moderation gate on business_profile | **done** (rules + OpenAI when key set) |

### Phase 1 DB (manual apply once per environment)

```powershell
cd backend
npx prisma db execute --file prisma/migrations/phase1_static_sites.sql
```

Tables: `sites`, `site_versions`, `token_transactions`, `categories`. Category seed runs on first `/api/categories` request.

### Frontend Phase 1 wiring (`frontend-separate/dharwinone_agents_frontend`)

| Client function | Backend path | UI wired |
|-----------------|--------------|----------|
| `listCategories` | `GET /categories` | manual (no intake UI yet) |
| `getTokenBalance` | `GET /tokens/balance` | dashboard header badge |
| `listTokenTransactions` | `GET /tokens/transactions` | manual |
| `listSites` / CRUD | `/sites` | manual |
| `generateSiteContent` | `POST /sites/{id}/generate` | manual |
| `getPublishChecklist` / `publishSite` | `/sites/{id}/publish` | manual |
| `listSiteVersions` / `restoreSiteVersion` | `/sites/{id}/versions` | manual |
| `listSiteAssets` / presign / confirm | `/sites/{id}/assets` | manual |
| `getPublishedSite` | `/public/sites/{subdomain}` | manual |
| `listTokenPacks` | `GET /token-packs` | manual |
| `regenerateSiteSection` / `rewriteSiteSection` | section routes | manual |
| `prefillIntake` | `POST /sites/intake/prefill` | manual |
| `gapCheckIntake` | `POST /sites/intake/gap-check` | manual |
| `listTemplates` / `matchTemplates` | `GET /templates`, `POST /templates/match` | manual |

Env: `NEXT_PUBLIC_STUDIO_API=http://127.0.0.1:8787` (see `.env.example`). Builder chat/templates still use `builder-api.ts` on the same base URL.

### Local dev (Next-only)

```powershell
cd backend
npm run dev:8787   # or start-all.ps1
```

Set `STUDIO_FAKE_WORKER=1` for vitest/E2E (no real LLM subprocess).

Cloud LLM (no Ollama/aider):

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:STUDIO_IMPLEMENTER="cloud"
npm run dev:8787
```

### Dev gate (Next-only)

```powershell
cd backend
npm run check:next   # vitest + build
```

Legacy Python gate (optional, not required to run the app):

```powershell
backend\.venv\Scripts\python backend\scripts\check_studio.py
```

### Deprecated (kept for reference only)

| Component | Notes |
|-----------|--------|
| `backend/harness/*.py`, `studio/` | Legacy reference; not spawned by Next.js |
| `npm run studio:python` | Optional A/B only — conflicts with Next on :8787 |
| `backend/scripts/check_studio.py` | 397 Python tests; optional |
| Alembic / SQLAlchemy | DB tooling for legacy migrations |

Python source is **not deleted** — nothing in the TS runtime requires it.
