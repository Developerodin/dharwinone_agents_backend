# Dharwin Python Backend

Control plane (`studio/`) and task harness (`harness/`) live here.

## One-time setup

```powershell
backend\scripts\setup.bat
```

This creates `backend/.venv`, installs the package in editable mode (no `PYTHONPATH` needed), and copies `backend/.env.example` → `backend/.env`.

## Start Studio API

```powershell
backend\start.bat
```

Or from repo root:

```powershell
scripts\start_backend.bat
```

Edit `backend/.env` to change settings (e.g. `STUDIO_DATABASE_URL`, `STUDIO_PORT`). Values load automatically on startup.

## Layout

```
backend/
├── .env                # local config (gitignored; created by setup)
├── .env.example        # committed template
├── .venv/              # Python virtualenv
├── harness/            # Task orchestrator (stdlib + yaml only)
├── studio/             # FastAPI control plane + UI API
├── scripts/            # setup, check_studio, format_studio
├── start.bat           # start API (loads .env)
└── pyproject.toml      # package + Ruff config
```

## Tests & gate

```powershell
backend\.venv\Scripts\python backend\scripts\check_studio.py
```

Or:

```powershell
scripts\check_studio.bat
```

## Format

```powershell
backend\scripts\format_studio.bat
```
