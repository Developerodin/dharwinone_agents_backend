"""Filesystem anchors for the Python backend package."""

import os

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PY = os.path.join(BACKEND_ROOT, ".venv", "Scripts", "python.exe")


def backend_path(rel_path: str) -> str:
    if os.path.isabs(rel_path):
        return rel_path
    return os.path.normpath(os.path.join(BACKEND_ROOT, rel_path))
