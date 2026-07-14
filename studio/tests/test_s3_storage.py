"""S3 storage helpers for image URLs."""

import pytest
from studio import config
from studio.storage import s3


@pytest.fixture(autouse=True)
def reset_config(monkeypatch):
    monkeypatch.delenv("STUDIO_ASSET_PUBLIC_BASE_URL", raising=False)
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    config.reset_for_tests()
    yield
    config.reset_for_tests()


def test_public_asset_url_uses_cdn_base(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    url = s3.public_asset_url("projects/p1/assets/a1/logo.png")
    assert url == "https://cdn.dharwinone.com/projects/p1/assets/a1/logo.png"


def test_public_asset_url_mock_mode_without_cdn_returns_none():
    assert s3.public_asset_url("projects/p1/assets/a1/logo.png") is None


def test_public_asset_url_real_s3_uses_region(monkeypatch):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("STUDIO_S3_BUCKET", "dharwin-studio-dev")  # don't inherit .env's bucket
    config.reset_for_tests()
    url = s3.public_asset_url("studio/placeholders/fitness/0.jpg")
    assert url == "https://dharwin-studio-dev.s3.ap-south-1.amazonaws.com/studio/placeholders/fitness/0.jpg"


def test_key_from_mock_url():
    key = s3.key_from_mock_url("mock+s3://dharwin-studio-dev/projects/p1/assets/a1/logo.png")
    assert key == "projects/p1/assets/a1/logo.png"


def test_resolve_img_src_rewrites_mock_s3(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    src = "mock+s3://dharwin-studio-dev/projects/p1/assets/a1/logo.png"
    assert s3.resolve_img_src(src) == "https://cdn.dharwinone.com/projects/p1/assets/a1/logo.png"


def test_build_placeholder_key():
    assert s3.build_placeholder_key("Fitness Gym", 1) == "studio/placeholders/fitness-gym/1.jpg"


def test_build_url_cache_key():
    url = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"
    assert s3.build_url_cache_key(url).startswith("studio/assets/")
    assert s3.build_url_cache_key(url) == s3.build_url_cache_key(url)


def test_resolve_img_src_rewrites_https_when_cdn_configured(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    source = "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"
    key = s3.build_url_cache_key(source)
    assert s3.resolve_img_src(source) == f"https://cdn.dharwinone.com/{key}"


def test_resolve_img_src_keeps_existing_cdn_asset_urls(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    logo = "https://cdn.dharwinone.com/projects/p1/assets/a1/logo.png"
    assert s3.resolve_img_src(logo) == logo


def test_ensure_genre_placeholder_uploads_when_missing(monkeypatch):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("STUDIO_S3_BUCKET", "dharwin-studio-dev")  # don't inherit .env's bucket
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

    url = s3.ensure_genre_placeholder_url(
        "fitness",
        0,
        "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    )
    assert url == "https://dharwin-studio-dev.s3.ap-south-1.amazonaws.com/studio/placeholders/fitness/0.jpg"
    assert uploaded == [
        ("studio/placeholders/fitness/0.jpg", b"image-bytes", "image/jpeg")
    ]


def test_ensure_genre_placeholder_skips_upload_when_exists(monkeypatch):
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    config.reset_for_tests()
    monkeypatch.setattr(s3, "object_exists", lambda key: True)
    monkeypatch.setattr(
        s3,
        "upload_bytes",
        lambda *args, **kwargs: pytest.fail("upload should not run"),
    )
    url = s3.ensure_genre_placeholder_url("cafe", 0, "https://example.com/x.jpg")
    assert "studio/placeholders/cafe/0.jpg" in url


def test_ensure_genre_placeholder_returns_none_in_mock_without_cdn():
    assert s3.ensure_genre_placeholder_url("cafe", 0, "https://example.com/x.jpg") is None
