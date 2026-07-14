"""Build the tagged image library: Wikimedia -> S3 -> vision tags -> image_catalog.json.

Only CC0 / public-domain images are kept, so generated sites carry no attribution
obligation. Every image is tagged by a vision model, which is what lets image selection
match a photo to a business instead of to a template.

Wikimedia is used because it needs no API key. Openverse's anonymous tier rate-limits to
uselessness, and Unsplash requires a key. The fetcher is one function: swap search_wikimedia
for an Unsplash call if photo quality needs to go up.

Usage:
    python -m studio.scripts.seed_image_library --category cafe
    python -m studio.scripts.seed_image_library                 # all categories
    python -m studio.scripts.seed_image_library --per-category 50 --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import threading
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from studio.env_loader import load_backend_env
from studio.storage import s3

_CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "image_catalog.json"
_COMMONS = "https://commons.wikimedia.org/w/api.php"
_UA = "DharwinStudio/1.0 (prakhar@theodin.in) image-library-seeder"
_MIN_BYTES = 15_000
_MIN_WIDTH = 800
_THUMB_WIDTH = 1400  # originals run to 8000px; ask Commons for a sane render
_FREE_LICENCES = ("cc0", "public domain", "pd-")
_VISION_MODEL = "gpt-4o-mini"
_MIN_QUALITY = 3  # vision-rated marketing usability, 1-5
_WORKERS = 6

# Several queries per category: one query gives 50 near-identical photos, which is how
# you end up with a gallery of the same latte from six angles.
CATEGORY_QUERIES = {
    "cafe": [
        "coffee shop interior", "espresso cup", "barista pouring coffee",
        "bakery pastries", "cafe table breakfast", "restaurant dining room",
        "seafood dish plated", "steak dinner", "pizza restaurant", "indian curry dish",
    ],
    "shop": [
        "retail store interior", "clothing rack boutique", "sneakers product shot",
        "shopping bags", "product on shelf", "cosmetics display",
    ],
    "saas": [
        "laptop dashboard screen", "office team meeting", "data analytics chart",
        "software developer working", "modern office workspace", "server room",
    ],
    "portfolio": [
        "photographer camera", "wedding couple portrait", "art studio painting",
        "design workspace", "portrait photography studio", "landscape photography",
    ],
    "fitness": [
        "gym equipment", "person lifting weights", "yoga class",
        "running outdoors", "fitness training session", "crossfit workout",
    ],
    "agency": [
        "creative team brainstorming", "office whiteboard meeting", "marketing agency office",
        "business handshake", "presentation to clients", "designer at desk",
    ],
    "construction": [
        "construction site crane", "builder with helmet", "house under construction",
        "architecture blueprint", "excavator machinery", "finished modern building",
    ],
    "medical": [
        "dental clinic chair", "doctor with patient", "medical clinic interior",
        "stethoscope equipment", "hospital corridor", "pharmacy shelves",
    ],
    "education": [
        "classroom students", "teacher at whiteboard", "library books study",
        "graduation ceremony", "online learning laptop", "science lab students",
    ],
    "travel": [
        "mountain landscape travel", "beach resort", "city skyline tourism",
        "hiking trail", "hotel room interior", "airplane window view",
    ],
    "generic": [
        "modern office building", "team working together", "abstract background texture",
        "city street", "nature landscape", "handshake business",
    ],
}

_catalog_lock = threading.Lock()


def _load_catalog() -> dict:
    if _CATALOG_PATH.exists():
        return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    return {"version": 1, "images": []}


def _save_catalog(catalog: dict) -> None:
    _CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _CATALOG_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(catalog, indent=1, ensure_ascii=False), encoding="utf-8")
    tmp.replace(_CATALOG_PATH)


def _get_json(url: str, timeout: float = 25.0) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def _is_free(licence: str) -> bool:
    low = licence.lower()
    if "by-sa" in low or "by-nc" in low or low.startswith("cc by"):
        return False  # attribution/share-alike: not worth the obligation on a client site
    return any(tag in low for tag in _FREE_LICENCES)


def search_wikimedia(query: str, want: int) -> list[dict]:
    """CC0/public-domain images only: no attribution obligation on generated sites."""
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {query}",
            "gsrlimit": str(min(50, max(want * 3, 20))),
            "gsrnamespace": "6",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": str(_THUMB_WIDTH),
        }
    )
    try:
        data = _get_json(f"{_COMMONS}?{params}")
    except Exception as exc:
        print(f"    [warn] commons '{query}': {exc}")
        return []

    out = []
    for page in ((data.get("query") or {}).get("pages") or {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        licence = str((meta.get("LicenseShortName") or {}).get("value") or "")
        url = info.get("thumburl") or info.get("url")
        if not url or not _is_free(licence):
            continue
        if (info.get("width") or 0) < _MIN_WIDTH:
            continue
        out.append(
            {
                "url": url,
                "descriptionurl": info.get("descriptionurl"),
                "license": licence,
                "title": page.get("title") or "",
            }
        )
    return out[:want]


def _download(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=30) as resp:
            if not (resp.headers.get("Content-Type") or "").lower().startswith("image/"):
                return None
            data = resp.read(6_000_000)
    except Exception:
        return None
    if len(data) < _MIN_BYTES or not data.startswith((b"\xff\xd8", b"\x89PNG")):
        return None  # too small, or not actually a jpeg/png
    return data


def _vision_tag(public_url: str) -> dict | None:
    """Ask the vision model what is in the photo. This is the whole point of the catalog."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    body = {
        "model": _VISION_MODEL,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Describe this photo for a website image catalog. Return JSON: "
                            '{"description": "<= 12 words", "tags": [6-10 lowercase words], '
                            '"quality": 1-5}. '
                            "Tags must name the subject, setting and food/product if any "
                            "(e.g. crab, seafood, plate, restaurant, dinner). No punctuation.\n"
                            "quality = how usable this is as a marketing photo on a real "
                            "business website. 5 = clean, well-lit, appetising, professional. "
                            "1 = blurry, cluttered, dark, unappetising, damaged goods, waste, "
                            "a screenshot, a diagram, or a photo of people posing at an event."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": public_url}},
                ],
            }
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        parsed = json.loads(payload["choices"][0]["message"]["content"])
    except Exception as exc:
        print(f"    [warn] vision tag failed: {exc}")
        return None
    tags = [str(t).strip().lower() for t in (parsed.get("tags") or []) if str(t).strip()]
    desc = str(parsed.get("description") or "").strip()
    if not tags:
        return None
    try:
        quality = int(parsed.get("quality") or 0)
    except (TypeError, ValueError):
        quality = 0
    return {"description": desc, "tags": tags[:10], "quality": quality}


def _ingest(item: dict, category: str, dry_run: bool) -> dict | None:
    src = item.get("url")
    if not src:
        return None
    image_id = hashlib.sha256(src.encode("utf-8")).hexdigest()[:16]
    key = f"studio/library/{category}/{image_id}.jpg"

    if dry_run:
        return {"id": image_id, "category": category, "s3_key": key, "source_url": src}

    data = _download(src)
    if not data:
        return None
    is_png = data.startswith(b"\x89PNG")
    key = f"studio/library/{category}/{image_id}.{'png' if is_png else 'jpg'}"
    s3.upload_bytes(key, data, content_type="image/png" if is_png else "image/jpeg")
    public_url = s3.public_asset_url(key)
    if not public_url:
        print("    [warn] no public URL (S3 in mock mode?) - cannot vision-tag")
        return None

    tagged = _vision_tag(public_url)
    if not tagged:
        return None  # untagged image is useless to the selector: don't catalogue it
    if tagged["quality"] < _MIN_QUALITY:
        # Commons is documentary: "discarded bread in dark storage" is a real result.
        print(f"    [drop q{tagged['quality']}] {tagged['description'][:52]}")
        return None

    return {
        "id": image_id,
        "category": category,
        "s3_key": key,
        "public_url": public_url,
        "source_url": item.get("descriptionurl") or src,
        "source": "wikimedia",
        "license": item.get("license"),
        "title": (item.get("title") or "")[:120],
        "description": tagged["description"],
        "tags": tagged["tags"],
        "quality": tagged["quality"],
    }


def seed_category(category: str, per_category: int, dry_run: bool) -> int:
    catalog = _load_catalog()
    have = {img["id"] for img in catalog["images"]}
    have_in_cat = sum(1 for img in catalog["images"] if img["category"] == category)
    need = max(0, per_category - have_in_cat)
    if not need:
        print(f"[{category}] already has {have_in_cat} images, skipping")
        return 0

    queries = CATEGORY_QUERIES[category]
    # Over-fetch hard: most Commons hits are CC-BY-SA (dropped), too small, or fail the
    # quality gate. Roughly 1 in 4 candidates survives to the catalog.
    per_query = max(8, (need * 4) // len(queries) + 3)
    candidates, seen = [], set()
    for q in queries:
        for item in search_wikimedia(q, per_query):
            url = item.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            if hashlib.sha256(url.encode("utf-8")).hexdigest()[:16] in have:
                continue
            candidates.append(item)
    print(f"[{category}] need {need}, {len(candidates)} candidates from {len(queries)} queries")

    added = 0
    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        futures = {pool.submit(_ingest, c, category, dry_run): c for c in candidates}
        for fut in as_completed(futures):
            if added >= need:
                break
            entry = fut.result()
            if not entry:
                continue
            with _catalog_lock:
                catalog = _load_catalog()
                if any(img["id"] == entry["id"] for img in catalog["images"]):
                    continue
                catalog["images"].append(entry)
                _save_catalog(catalog)
                added += 1
            print(f"  + [{added}/{need}] {entry['id']} {entry.get('description','')[:48]}"
                  f" tags={entry.get('tags', [])[:5]}")
    print(f"[{category}] added {added}")
    return added


def main() -> int:
    load_backend_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", action="append", choices=sorted(CATEGORY_QUERIES))
    ap.add_argument("--per-category", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from studio import config

    if not args.dry_run and config.s3_mock_enabled():
        print("S3 is in mock mode; images would not be uploaded. Aborting.")
        return 1

    categories = args.category or sorted(CATEGORY_QUERIES)
    total = 0
    for cat in categories:
        total += seed_category(cat, args.per_category, args.dry_run)
    catalog = _load_catalog()
    by_cat: dict[str, int] = {}
    for img in catalog["images"]:
        by_cat[img["category"]] = by_cat.get(img["category"], 0) + 1
    print(f"\nadded {total}. catalog now: {len(catalog['images'])} images")
    for cat in sorted(by_cat):
        print(f"  {cat:14} {by_cat[cat]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
