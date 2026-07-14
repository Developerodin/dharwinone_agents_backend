"""Seed studio placeholder and cached template images into S3.

Usage:
    python -m studio.scripts.seed_s3_placeholders
    python -m studio.scripts.seed_s3_placeholders --dry-run
    python -m studio.scripts.seed_s3_placeholders --verify-only
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from studio import config, draft
from studio.env_loader import load_backend_env
from studio.scripts._image_inventory import classify_inventory, scan_html_dirs
from studio.storage import s3

_MANIFEST_PATH = Path(__file__).resolve().parents[1] / "data" / "image_manifest.json"


def _genre_fallback_targets() -> list[tuple[str, int, str]]:
    targets: list[tuple[str, int, str]] = []
    for genre, urls in draft._GENRE_IMAGE_FALLBACKS.items():
        for slot, source in enumerate(urls):
            targets.append((genre, slot, source))
    return targets


def _build_manifest(urls: dict[str, dict]) -> dict:
    groups = classify_inventory(urls)
    manifest = {
        "external": {},
        "placeholders": {},
        "broken": groups["broken"],
        "s3_keys": groups["s3_key"],
        "other": groups["other"],
    }
    for url in groups["https"]:
        manifest["external"][url] = s3.build_url_cache_key(url)
    for genre, slot, source in _genre_fallback_targets():
        manifest["placeholders"][f"{genre}/{slot}"] = {
            "key": s3.build_placeholder_key(genre, slot),
            "source": source,
        }
    return manifest


def _seed_external_urls(urls: dict[str, dict], *, dry_run: bool) -> dict[str, int]:
    groups = classify_inventory(urls)
    stats = {"uploaded": 0, "skipped": 0, "failed": 0}
    for url in groups["https"]:
        key = s3.build_url_cache_key(url)
        if dry_run:
            print(f"[dry-run] would cache {url} -> {key}")
            stats["skipped"] += 1
            continue
        if not config.s3_mock_enabled() and s3.object_exists(key):
            print(f"[skip] exists {key}")
            stats["skipped"] += 1
            continue
        public = s3.ensure_url_cached(url)
        if public:
            print(f"[ok] {url} -> {key}")
            stats["uploaded"] += 1
        else:
            print(f"[fail] {url}", file=sys.stderr)
            stats["failed"] += 1
    return stats


def _seed_genre_placeholders(*, dry_run: bool) -> dict[str, int]:
    stats = {"uploaded": 0, "skipped": 0, "failed": 0}
    for genre, slot, source in _genre_fallback_targets():
        key = s3.build_placeholder_key(genre, slot)
        if dry_run:
            print(f"[dry-run] would seed placeholder {key} from {source}")
            stats["skipped"] += 1
            continue
        if not config.s3_mock_enabled() and s3.object_exists(key):
            print(f"[skip] exists {key}")
            stats["skipped"] += 1
            continue
        public = s3.ensure_genre_placeholder_url(genre, slot, source)
        if public:
            print(f"[ok] placeholder {genre}/{slot} -> {key}")
            stats["uploaded"] += 1
        else:
            print(f"[fail] placeholder {genre}/{slot} from {source}", file=sys.stderr)
            stats["failed"] += 1
    return stats


def _write_manifest(manifest: dict) -> None:
    _MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    _MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print actions without uploading")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Inventory and write manifest only; no uploads",
    )
    args = parser.parse_args(argv)

    load_backend_env()
    if not os.environ.get("STUDIO_S3_BUCKET", "").strip():
        fallback = os.environ.get("AWS_S3_BUCKET_NAME", "").strip()
        if fallback:
            os.environ["STUDIO_S3_BUCKET"] = fallback
    config.reset_for_tests()  # clear cached config flags after .env load

    urls = scan_html_dirs()
    groups = classify_inventory(urls)
    total_refs = sum(meta["count"] for meta in urls.values())

    print("Inventory")
    print(f"  unique URLs: {len(urls)}")
    print(f"  total refs:  {total_refs}")
    print(f"  valid https: {len(groups['https'])}")
    print(f"  broken:      {len(groups['broken'])}")
    print(f"  s3 keys:     {len(groups['s3_key'])}")
    print(f"  other:       {len(groups['other'])}")

    manifest = _build_manifest(urls)
    _write_manifest(manifest)
    print(f"Manifest written: {_MANIFEST_PATH}")

    if args.verify_only:
        return 0

    ext_stats = _seed_external_urls(urls, dry_run=args.dry_run)
    ph_stats = _seed_genre_placeholders(dry_run=args.dry_run)

    print("Seed summary")
    print(
        "  external: "
        f"uploaded={ext_stats['uploaded']} "
        f"skipped={ext_stats['skipped']} "
        f"failed={ext_stats['failed']}"
    )
    print(
        "  placeholders: "
        f"uploaded={ph_stats['uploaded']} "
        f"skipped={ph_stats['skipped']} "
        f"failed={ph_stats['failed']}"
    )

    failed = ext_stats["failed"] + ph_stats["failed"]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
