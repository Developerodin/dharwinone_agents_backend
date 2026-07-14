"""S3 presign helpers with mock-mode support."""

import os
import re
import time
from urllib.parse import quote

from studio import config

_ALLOWED_PREFIXES = ("projects/", "studio/placeholders/", "studio/cache/")
_PLACEHOLDER_PREFIX = "studio/placeholders/"
_MOCK_S3_RE = re.compile(r"^mock\+s3://[^/]+/(.+)$")


def _validate_key(key):
    if not key or key.startswith("/"):
        raise ValueError("invalid s3 key prefix")
    if not any(key.startswith(prefix) for prefix in _ALLOWED_PREFIXES):
        raise ValueError("invalid s3 key prefix")
    return key


def build_asset_key(project_id, asset_id, filename):
    safe = "".join(c if c.isalnum() or c in "._-" else "-" for c in filename)
    safe = safe.strip(".-") or "asset.bin"
    return _validate_key(f"projects/{project_id}/assets/{asset_id}/{safe}")


def build_placeholder_key(genre, slot):
    safe_genre = re.sub(r"[^a-z0-9-]+", "-", (genre or "generic").lower()).strip("-")
    safe_genre = safe_genre or "generic"
    return _validate_key(f"{_PLACEHOLDER_PREFIX}{safe_genre}/{int(slot)}.jpg")


def public_urls_available():
    """True when img src can resolve to browser-loadable public URLs."""
    base = os.environ.get("STUDIO_ASSET_PUBLIC_BASE_URL", "").strip()
    if base:
        return True
    return not config.s3_mock_enabled()


def key_from_mock_url(url):
    if not url:
        return None
    match = _MOCK_S3_RE.match(url.strip())
    return match.group(1) if match else None


def resolve_img_src(url):
    """Rewrite mock+s3:// or bare S3 keys to public URLs when available."""
    if not url:
        return None
    src = url.strip()
    key = key_from_mock_url(src)
    if key:
        return public_asset_url(key)
    if public_urls_available() and not src.startswith(("http://", "https://", "data:")):
        if any(src.startswith(prefix) for prefix in _ALLOWED_PREFIXES):
            return public_asset_url(src)
    return src


def _s3_client():
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 is required when STUDIO_S3_MOCK=false"
        ) from exc

    kwargs = {}
    region = os.environ.get("AWS_REGION", "").strip()
    endpoint = os.environ.get("AWS_S3_ENDPOINT_URL", "").strip()
    if region:
        kwargs["region_name"] = region
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def object_exists(key):
    _validate_key(key)
    if config.s3_mock_enabled():
        return False
    client = _s3_client()
    try:
        client.head_object(Bucket=config.s3_bucket(), Key=key)
        return True
    except client.exceptions.ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def upload_bytes(key, data, content_type="application/octet-stream"):
    _validate_key(key)
    if config.s3_mock_enabled():
        return
    client = _s3_client()
    client.put_object(
        Bucket=config.s3_bucket(),
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def _fetch_bytes(url, timeout=15.0):
    import httpx

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "image/jpeg")
        return resp.content, content_type.split(";")[0].strip() or "image/jpeg"


def ensure_genre_placeholder_url(genre, slot, source_url):
    """Ensure a genre placeholder exists in S3; return its public URL."""
    if not public_urls_available():
        return None
    key = build_placeholder_key(genre, slot)
    public = public_asset_url(key)
    if not public:
        return None
    if config.s3_mock_enabled():
        return public
    if not object_exists(key):
        try:
            data, content_type = _fetch_bytes(source_url)
            upload_bytes(key, data, content_type)
        except Exception:
            return None
    return public


def create_presigned_put(key, content_type, expires_s=3600):
    _validate_key(key)
    if config.s3_mock_enabled():
        bucket = config.s3_bucket()
        return {
            "url": f"mock+s3://{bucket}/{key}",
            "method": "PUT",
            "headers": {"Content-Type": content_type},
            "expiresAt": time.time() + expires_s,
        }
    bucket = config.s3_bucket()
    client = _s3_client()
    url = client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=int(expires_s),
        HttpMethod="PUT",
    )
    return {
        "url": url,
        "method": "PUT",
        "headers": {"Content-Type": content_type},
        "expiresAt": time.time() + expires_s,
    }


def public_asset_url(key):
    """Resolve a browser-safe public URL for an asset key.

    Priority:
    1) STUDIO_ASSET_PUBLIC_BASE_URL (recommended, env-based),
    2) direct S3 URL when real S3 mode is enabled,
    3) None in mock mode (prevents injecting unusable mock+s3:// URLs).
    """
    if not key:
        return None
    if key.startswith(("http://", "https://")):
        return key

    normalized = key.lstrip("/")
    base = os.environ.get("STUDIO_ASSET_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if base:
        # Keep path separators; escape only unsafe characters within segments.
        safe_key = "/".join(quote(part, safe="") for part in normalized.split("/"))
        return f"{base}/{safe_key}"

    if config.s3_mock_enabled():
        return None

    bucket = config.s3_bucket()
    region = os.environ.get("AWS_REGION", "").strip()
    if region:
        return f"https://{bucket}.s3.{region}.amazonaws.com/{normalized}"
    return f"https://{bucket}.s3.amazonaws.com/{normalized}"
