# Dharwin Backend



Next.js API on `:8787` (primary runtime) + in-process TypeScript harness worker. Python studio is **deprecated** and not required to run the stack.



## One-time setup



```powershell

backend\scripts\setup.bat

cd backend

npm install

npx prisma db execute --file prisma/migrations/phase1_static_sites.sql

```



Creates `backend/.venv` (optional, legacy Python only), copies `.env.example` → `.env`, generates Prisma client.



## Start API (Next-only)



```powershell

backend\start-all.ps1

```



Or manually:



```powershell

cd backend

npm run dev:8787

```



Health check: `GET http://127.0.0.1:8787/health` (rewrite → `/api/health`).



| Service | Port | Command |

|---------|------|---------|

| Next.js API | 8787 | `npm run dev:8787` |

| Next.js parallel | 8790 | `npm run dev` |

| Telephony sidecar | 8788 | `npm run telephony` |



Do **not** run `npm run studio:python` on 8787 alongside Next.js.



## Cloud LLM (production)



Set API keys in `.env`:



```

OPENAI_API_KEY=sk-...

ANTHROPIC_API_KEY=sk-ant-...   # optional

STUDIO_IMPLEMENTER=cloud       # or auto (default: cloud when keys present)

STUDIO_HARNESS_PLANNER_MODEL=gpt-4o-mini

STUDIO_HARNESS_IMPLEMENTER_MODEL=gpt-4o

STUDIO_HARNESS_REVIEWER_MODEL=gpt-4o-mini

```



Harness workers use `cloudImplementer` (structured file edits via OpenAI/Anthropic) instead of aider/Ollama.



Privacy: projects default to `local_only`. Set `privacy: per_stage` + `stage_consents` to allow cloud stages; cloud calls are logged in the consent ledger.



## Layout



```

backend/

├── .env.example

├── src/app/api/        # Next.js route handlers

├── src/server/         # services, harness worker, providers

├── harness/            # Legacy Python harness (reference + check_studio.py)

├── studio/             # Legacy FastAPI (deprecated)

├── telephony/          # Express sidecar (:8788)

├── prisma/             # Postgres schema + phase1_static_sites.sql

├── scripts/check_next.mjs   # Next-only dev gate

└── PHASES.md

```



## Tests & gate



```powershell

cd backend

npm run check:next     # recommended — vitest + build



# Optional legacy Python gate (not required):

backend\.venv\Scripts\python backend\scripts\check_studio.py

```



## Phase 1 static-site API (backend)



| Method | Path |

|--------|------|

| GET/POST | `/api/sites` |

| GET/PATCH/DELETE | `/api/sites/{siteId}` |

| POST | `/api/sites/{siteId}/generate` |

| GET/POST | `/api/sites/{siteId}/publish` |

| GET | `/api/categories` |

| GET | `/api/tokens/balance` |

| GET | `/api/tokens/transactions` |



Manual cloud validation:



1. Set `OPENAI_API_KEY` in `.env`

2. `npm run dev:8787`

3. Create site → POST `/api/sites/{id}/generate` with `sectionSchema` + `idempotencyKey`

4. GET `/api/sites/{id}/publish` checklist → POST to publish



## Frontend env



```

NEXT_PUBLIC_STUDIO_API=http://127.0.0.1:8787

NEXT_PUBLIC_TELEPHONY_API_URL=http://127.0.0.1:8788

```

