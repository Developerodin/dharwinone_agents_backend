"""S3 presign helpers with mock-mode support."""

import os
import time
from urllib.parse import quote

from studio import config

_ALLOWED_PREFIX = "projects/"


def build_asset_key(project_id, asset_id, filename):
    safe = "".join(c if c.isalnum() or c in "._-" else "-" for c in filename)
    safe = safe.strip(".-") or "asset.bin"
    return f"projects/{project_id}/assets/{asset_id}/{safe}"


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


def create_presigned_put(key, content_type, expires_s=3600):
    if not key.startswith(_ALLOWED_PREFIX):
        raise ValueError("invalid s3 key prefix")
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
