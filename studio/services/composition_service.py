"""Compose website variants from the extracted component library."""

import json
import logging
import os
import random
import re
import time

from studio.services import onboarding_service

_log = logging.getLogger(__name__)

COMPONENTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "components"
)

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
_TOP_K = 5
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
</head>
<body>
__BODY__
</body>
</html>
"""

_SELECT_PROMPT = """Pick the best component for each section of a small-business website.

Business:
{facts}

Candidates per section (JSON):
{candidates}

Reply with only JSON mapping section names to ONE candidate id each, like
{{"nav": "saas-1-nav", "hero": "cafe-2-2-hero"}}.
Rules:
- Use only ids listed above, under their own section.
- Always include nav, hero and footer.
- Omit sections that do not fit this business."""


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


def _keywords(business_facts):
    return frozenset(re.findall(r"[a-z]+", (business_facts or "").lower()))


def _rank(pool, genre, keywords):
    """Spec ranking: same-genre first, then tag overlap with business keywords."""

    def score(entry):
        overlap = len(keywords & set(entry["tags"]))
        return (entry["genre"] != genre, -overlap, entry["id"])

    return sorted(pool, key=score)


def _candidates(type_, genre, keywords=frozenset()):
    return _rank(_index().get(type_, []), genre, keywords)[:_TOP_K]


def _pick_deterministic(project_id, genre, seed, keywords):
    """Same-genre components when available (style coherence); cross-genre fill
    ranked by tag overlap. Broad cross-genre mixing stays the LLM path's job."""
    rng = random.Random(f"{project_id}:{seed}")
    chosen = []
    for slot in RECIPE:
        pool = _index().get(slot, [])
        same_genre = [e for e in pool if e["genre"] == genre]
        pool = same_genre or _rank(pool, genre, keywords)[:_TOP_K]
        if not pool:
            if slot in REQUIRED:
                raise CompositionError(f"no candidates for required slot: {slot}")
            continue
        chosen.append(rng.choice(pool))
    return chosen


def _pick_llm(genre, business_facts):
    """LLM slot selection over top-K candidates. None = use deterministic path.

    Returns FULL manifest entries (with type/path/fonts) so _assemble can read
    the component files; the prompt sees only a reduced projection of them.
    """
    provider, model = onboarding_service._load_onboarding_provider()
    if provider is None or not model:
        return None
    keywords = _keywords(business_facts)
    pools = {}
    for slot in RECIPE:
        pool = _candidates(slot, genre, keywords)
        if pool:
            pools[slot] = pool
    prompt = _SELECT_PROMPT.format(
        facts=business_facts or "(no details provided)",
        candidates=json.dumps(
            {
                slot: [
                    {"id": e["id"], "tags": e["tags"], "description": e["description"]}
                    for e in pool
                ]
                for slot, pool in pools.items()
            },
            indent=0,
        ),
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
    if not isinstance(data, dict) or not REQUIRED <= set(data):
        return None
    chosen = []
    for slot in RECIPE:
        cid = data.get(slot)
        if cid is None:
            continue
        # id must be one of the candidates offered for THIS slot — covers both
        # hallucinated ids and valid ids placed under the wrong section
        entry = next((e for e in pools.get(slot, []) if e["id"] == str(cid)), None)
        if entry is None:
            return None  # full fallback
        chosen.append(entry)
    return chosen


def _assemble(entries):
    fonts, seen, parts = [], set(), []
    for entry in entries:
        parts.append(_read(entry["path"]))
        for href in entry.get("fonts", []):
            if href not in seen:
                seen.add(href)
                fonts.append(f'<link href="{href}" rel="stylesheet">')
    return (
        _SHELL.replace("__FONTS__", "\n".join(fonts))
        .replace("__BASE__", _read("base.css"))
        .replace("__BODY__", "\n".join(parts))
    )


def compose_project_variants(project_id, business_facts, genre, count):
    """Compose up to `count` page variants. Never raises; failures are skipped."""
    if count <= 0:
        return []
    keywords = _keywords(business_facts)
    variants = []
    for seed in range(count):
        started = time.perf_counter()
        try:
            entries, via = None, "deterministic"
            if seed == 0:
                try:
                    entries = _pick_llm(genre, business_facts)
                except Exception:
                    _log.exception("llm selection crashed; using deterministic")
                    entries = None
                if entries:
                    via = "llm"
            if entries is None:
                entries = _pick_deterministic(project_id, genre, seed, keywords)
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
