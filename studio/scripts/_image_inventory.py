"""Scan studio HTML sources for image URLs."""

from __future__ import annotations

import re
from pathlib import Path

_STUDIO_ROOT = Path(__file__).resolve().parents[1]
_COMPONENTS_DIR = _STUDIO_ROOT / "components"
_TEMPLATES_DIR = _STUDIO_ROOT / "templates"

_IMG_SRC_RE = re.compile(r"""\bsrc\s*=\s*(["'])([^"']*)\1""", re.I)
_BG_URL_RE = re.compile(
    r"""background(?:-image)?\s*:\s*[^;]*url\(\s*(["']?)([^"')]+)\1\s*\)""",
    re.I,
)
_INLINE_URL_RE = re.compile(r"""url\(\s*(["']?)([^"')]+)\1\s*\)""", re.I)

INVALID_IMG_RE = re.compile(r"^(?:mock\+|s3://|\{\{|#|\s*$)", re.I)
VALID_IMG_RE = re.compile(r"^(?:https?://|data:image/)", re.I)
S3_KEY_RE = re.compile(r"^(?:studio/(?:placeholders|assets|cache)/|projects/)", re.I)


def scan_html_dirs() -> dict[str, dict]:
    """Return unique URLs -> {count, files, kinds}."""
    urls: dict[str, dict] = {}
    for directory in (_COMPONENTS_DIR, _TEMPLATES_DIR):
        for path in sorted(directory.glob("*.html")):
            _collect_from_file(path, urls)
    return urls


def _collect_from_file(path: Path, urls: dict[str, dict]) -> None:
    text = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(_STUDIO_ROOT))
    for pattern, kind in (
        (_IMG_SRC_RE, "img_src"),
        (_BG_URL_RE, "background"),
        (_INLINE_URL_RE, "inline_url"),
    ):
        for match in pattern.finditer(text):
            url = match.group(2).strip()
            if not url or url.startswith("data:"):
                continue
            entry = urls.setdefault(
                url,
                {"count": 0, "files": set(), "kinds": set()},
            )
            entry["count"] += 1
            entry["files"].add(rel)
            entry["kinds"].add(kind)


def classify_url(url: str) -> str:
    if INVALID_IMG_RE.match(url):
        return "broken"
    if S3_KEY_RE.match(url):
        return "s3_key"
    if VALID_IMG_RE.match(url):
        return "https"
    return "other"


def classify_inventory(urls: dict[str, dict]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {
        "broken": [],
        "https": [],
        "s3_key": [],
        "other": [],
    }
    for url in urls:
        groups[classify_url(url)].append(url)
    for key in groups:
        groups[key].sort()
    return groups
