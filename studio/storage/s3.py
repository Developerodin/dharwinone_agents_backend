"""S3 presign helpers — mock mode for local dev and tests."""

import time

from studio import config

_ALLOWED_PREFIX = "projects/"


def build_asset_key(project_id, asset_id, filename):
    safe = "".join(c if c.isalnum() or c in "._-" else "-" for c in filename)
    safe = safe.strip(".-") or "asset.bin"
    return f"projects/{project_id}/assets/{asset_id}/{safe}"


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
    raise NotImplementedError(
        "Real S3 uploads require STUDIO_S3_MOCK=false and boto3 configuration"
    )
