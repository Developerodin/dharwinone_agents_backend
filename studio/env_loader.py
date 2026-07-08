"""Load backend/.env into os.environ before config is read."""

import os
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_ENV_FILE = _BACKEND_ROOT / ".env"
_loaded = False


def backend_env_path() -> Path:
    return _ENV_FILE


def load_backend_env() -> None:
    global _loaded
    if _loaded or not _ENV_FILE.is_file():
        _loaded = True
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(_ENV_FILE, override=False)
    except ImportError:
        _load_env_fallback(_ENV_FILE)
    _loaded = True


def _load_env_fallback(env_file: Path) -> None:
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
