"""Compose website variants from the extracted component library."""

import json
import logging
import os
import random
import re
import time

from studio.services import onboarding_service

_log = logging.getLogger(__name__)

_STUDIO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPONENTS_DIR = os.path.join(_STUDIO_DIR, "components")
TEMPLATES_DIR = os.path.join(_STUDIO_DIR, "templates")

RECIPE = [
    "nav",
    "hero",
    "features",
    "about",
    "gallery",
    "stats",
    "pricing",
    "testimonials",
    "faq",
    "cta",
    "contact",
    "footer",
]
REQUIRED = frozenset({"nav", "hero", "footer"})
_MAX_HTML_BYTES = 150 * 1024

_index_cache = None
_file_cache = {}

_SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{BRAND}}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
__FONTS__
<style>__BASE__</style>
<style>__PALETTE__</style>
</head>
<body>
__BODY__
</body>
</html>
"""

_SELECT_PROMPT = """Pick the page design that best fits this small business.

Business genre: {genre}
Business:
{facts}

Page designs (JSON) — each is one complete, visually coherent page:
{designs}

Reply with only JSON naming ONE design, like {{"design": "2"}}.
Use only a design id listed above."""


class CompositionError(RuntimeError):
    """Raised when a variant cannot satisfy its recipe."""


def reset_for_tests():
    global _index_cache
    _index_cache = None
    _file_cache.clear()


def _index():
    global _index_cache
    if _index_cache is None:
        path = os.path.join(COMPONENTS_DIR, "manifest.json")
        with open(path, encoding="utf-8") as f:
            entries = json.load(f)
        idx = {}
        for entry in entries:
            idx.setdefault(entry["type"], []).append(entry)
        _index_cache = idx
    return _index_cache


def _read(name):
    if name not in _file_cache:
        with open(os.path.join(COMPONENTS_DIR, name), encoding="utf-8") as f:
            _file_cache[name] = f.read()
    return _file_cache[name]


def _family(entry):
    """Which source page a component was extracted from.

    Ids are {genre}-{page}-{index}-{type} for the multi-page sets and
    {genre}-{index}-{type} for the first page. Components from different pages
    carry different fonts, button shapes and section backgrounds, so mixing them
    produces a page that reads as several sites stapled together.
    """
    parts = entry["id"].split("-")
    return parts[1] if len(parts) == 4 else "0"


def _order(entry):
    """Original position on the source page — keeps the designer's section flow."""
    parts = entry["id"].split("-")
    return int(parts[2]) if len(parts) == 4 else int(parts[1])


def _families(genre):
    """{family: {slot: [entries]}} for families that can build a whole page."""
    fams = {}
    for slot in RECIPE:
        for entry in _index().get(slot, []):
            if entry["genre"] == genre:
                fams.setdefault(_family(entry), {}).setdefault(slot, []).append(entry)
    return {f: slots for f, slots in fams.items() if REQUIRED <= set(slots)}


_ROOT_RE = re.compile(r"(?s):root\s*\{[^}]*\}")


def _palette(entry):
    """The :root palette of the page this component was extracted from.

    base.css ships one palette for the whole library, so without this every
    genre renders in the same colours (saas green) and the "themes" the
    templates actually define never reach a composed page.
    """
    fam = _family(entry)
    name = f"{entry['genre']}.html" if fam == "0" else f"{entry['genre']}-{fam}.html"
    if name not in _file_cache:
        try:
            with open(os.path.join(TEMPLATES_DIR, name), encoding="utf-8") as f:
                found = _ROOT_RE.search(f.read())
        except OSError:
            found = None
        _file_cache[name] = found.group(0) if found else ""
    return _file_cache[name]


def _build(slots, rng):
    chosen = [rng.choice(slots[s]) for s in RECIPE if s in slots]
    return sorted(chosen, key=_order)


def _pick_deterministic(project_id, genre, seed):
    """One whole page family, so every section shares one visual language."""
    fams = _families(genre)
    if not fams:
        raise CompositionError(f"no complete {genre} component family")
    rng = random.Random(f"{project_id}:{seed}")
    return _build(fams[rng.choice(sorted(fams))], rng)


def _pick_llm(genre, business_facts, rng):
    """LLM picks the page family. None = use deterministic path."""
    provider, model = onboarding_service._load_onboarding_provider()
    if provider is None or not model:
        return None
    fams = _families(genre)
    if not fams:
        return None
    designs = {
        f: {
            "sections": [s for s in RECIPE if s in slots],
            "tags": sorted(
                {t for pool in slots.values() for e in pool for t in e["tags"]} - {genre}
            ),
        }
        for f, slots in fams.items()
    }
    prompt = _SELECT_PROMPT.format(
        genre=genre,
        facts=business_facts or "(no details provided)",
        designs=json.dumps(designs, indent=0),
    )
    try:
        out = provider.generate(model, prompt, num_ctx=8192, timeout_s=30)
    except Exception:
        _log.warning("llm selection call failed; using deterministic", exc_info=True)
        return None
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (out or "").strip())
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    slots = fams.get(str(data.get("design")))
    if slots is None:
        return None
    return _build(slots, rng)


def _assemble(entries):
    fonts, seen, parts = [], set(), []
    for entry in entries:
        parts.append(_read(entry["path"]))
        for href in entry.get("fonts", []):
            if href not in seen:
                seen.add(href)
                fonts.append(f'<link href="{href}" rel="stylesheet">')
    html = (
        _SHELL.replace("__FONTS__", "\n".join(fonts))
        .replace("__BASE__", _read("base.css"))
        .replace("__PALETTE__", _palette(entries[0]))
        .replace("__BODY__", "\n".join(parts))
    )
    for slot in ("nav", "hero", "footer"):
        if f'data-section="{slot}"' not in html:
            raise CompositionError(f"assembled html missing data-section={slot}")
    return html


def compose_project_variants(project_id, business_facts, genre, count):
    """Compose up to `count` page variants. Never raises; failures are skipped."""
    if count <= 0:
        return []
    variants = []
    for seed in range(count):
        started = time.perf_counter()
        try:
            entries, via = None, "deterministic"
            if seed == 0:
                try:
                    entries = _pick_llm(
                        genre, business_facts, random.Random(f"{project_id}:llm")
                    )
                except Exception:
                    _log.exception("llm selection crashed; using deterministic")
                    entries = None
                if entries:
                    via = "llm"
            if entries is None:
                entries = _pick_deterministic(project_id, genre, seed)
            html = _assemble(entries)
            if len(html.encode("utf-8")) > _MAX_HTML_BYTES:
                raise CompositionError("composed page exceeds 150KB budget")
        except Exception:
            _log.exception("composition failed project=%s seed=%s", project_id, seed)
            continue
        _log.info(
            "composed project=%s seed=%s via=%s ms=%.1f bytes=%d",
            project_id,
            seed,
            via,
            (time.perf_counter() - started) * 1000,
            len(html),
        )
        variants.append(
            {"html": html, "componentIds": [e["id"] for e in entries], "via": via}
        )
    return variants
