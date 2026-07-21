"""Tests for S3 image seeding and catalog resolution."""

import json
from pathlib import Path

import pytest

from studio import config
from studio.scripts import seed_s3_placeholders
from studio.scripts._image_inventory import classify_inventory, scan_html_dirs
from studio.storage import s3


@pytest.fixture(autouse=True)
def reset_config(monkeypatch):
    monkeypatch.delenv("STUDIO_ASSET_PUBLIC_BASE_URL", raising=False)
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    config.reset_for_tests()
    yield
    config.reset_for_tests()


def test_inventory_finds_https_urls():
    urls = scan_html_dirs()
    groups = classify_inventory(urls)
    assert len(urls) > 0
    assert len(groups["https"]) > 0
    assert not any(url.startswith("mock+") for url in groups["broken"])


def test_build_url_cache_key_is_deterministic():
    url = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"
    assert s3.build_url_cache_key(url) == s3.build_url_cache_key(url)
    assert s3.build_url_cache_key(url).startswith("studio/assets/")


def test_resolve_img_src_rewrites_https_when_cdn_configured(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    source = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"
    key = s3.build_url_cache_key(source)
    resolved = s3.resolve_img_src(source)
    assert resolved == f"https://cdn.dharwinone.com/{key}"


def test_ensure_url_cached_skips_upload_when_exists(monkeypatch):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    config.reset_for_tests()
    monkeypatch.setattr(s3, "object_exists", lambda key: True)
    monkeypatch.setattr(
        s3,
        "upload_bytes",
        lambda *args, **kwargs: pytest.fail("upload should not run"),
    )
    url = s3.ensure_url_cached("https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800")
    assert url and "studio/assets/" in url


def test_ensure_url_cached_uploads_when_missing(monkeypatch):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    config.reset_for_tests()
    uploaded = []
    monkeypatch.setattr(s3, "object_exists", lambda key: False)
    monkeypatch.setattr(
        s3,
        "_fetch_bytes",
        lambda url: (b"image-bytes", "image/jpeg"),
    )
    monkeypatch.setattr(
        s3,
        "upload_bytes",
        lambda key, data, content_type: uploaded.append((key, data, content_type)),
    )
    source = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"
    url = s3.ensure_url_cached(source)
    assert url and "studio/assets/" in url
    assert uploaded and uploaded[0][0] == s3.build_url_cache_key(source)


def test_all_genre_slots_resolve_to_loadable_urls(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    from studio import draft

    for genre, sources in draft._GENRE_IMAGE_FALLBACKS.items():
        for slot in range(len(sources)):
            url = s3.ensure_genre_placeholder_url(genre, slot, sources[slot])
            assert url
            assert url.startswith("https://cdn.dharwinone.com/studio/placeholders/")
            assert draft._img_src_ok(url)


def test_seed_script_dry_run_writes_manifest(tmp_path, monkeypatch):
    manifest_path = tmp_path / "image_manifest.json"
    monkeypatch.setattr(seed_s3_placeholders, "_MANIFEST_PATH", manifest_path)
    rc = seed_s3_placeholders.main(["--dry-run"])
    assert rc == 0
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["external"]
    assert data["placeholders"]


def test_seed_script_idempotent_skip_existing(monkeypatch, capsys):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    config.reset_for_tests()
    monkeypatch.setattr(s3, "object_exists", lambda key: True)
    monkeypatch.setattr(
        s3,
        "upload_bytes",
        lambda *args, **kwargs: pytest.fail("upload should not run"),
    )
    urls = scan_html_dirs()
    stats = seed_s3_placeholders._seed_external_urls(urls, dry_run=False)
    assert stats["uploaded"] == 0
    assert stats["skipped"] > 0
    assert stats["failed"] == 0
    assert "[skip] exists" in capsys.readouterr().out
