"""Asset upload orchestration."""

import re
import uuid

from studio.repositories import assets_repo, projects_repo
from studio.storage import s3

_ALLOWED_TYPES = frozenset(assets_repo.allowed_asset_types())
_FILENAME_RE = re.compile(r"^[\w.\- ]{1,120}$", re.I)


class AssetValidationError(ValueError):
    """Raised when an asset request fails validation."""


def _require_project(project_id):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")


def create_presign(project_id, *, filename, content_type, asset_type):
    _require_project(project_id)
    if asset_type not in _ALLOWED_TYPES:
        raise AssetValidationError("invalid asset type")
    if not filename or not _FILENAME_RE.match(filename):
        raise AssetValidationError("invalid filename")
    if not content_type or "/" not in content_type:
        raise AssetValidationError("invalid content type")

    asset_id = uuid.uuid4().hex[:12]
    s3_key = s3.build_asset_key(project_id, asset_id, filename)
    signed = s3.create_presigned_put(s3_key, content_type)
    assets_repo.create_pending(
        project_id,
        asset_id=asset_id,
        asset_type=asset_type,
        s3_key=s3_key,
        filename=filename,
        content_type=content_type,
    )
    return {
        "assetId": asset_id,
        "s3Key": s3_key,
        "uploadUrl": signed["url"],
        "method": signed["method"],
        "headers": signed["headers"],
        "expiresAt": signed["expiresAt"],
    }


def _with_public_url(asset):
    if not asset:
        return asset
    out = dict(asset)
    public = s3.public_asset_url(asset.get("s3Key", ""))
    if public:
        out["publicUrl"] = public
    return out


def confirm_upload(
    project_id,
    *,
    asset_id,
    s3_key,
    content_type,
    size_bytes,
    width=None,
    height=None,
):
    _require_project(project_id)
    pending = assets_repo.get(project_id, asset_id)
    if not pending:
        raise AssetValidationError("asset not found")
    if pending["s3Key"] != s3_key:
        raise AssetValidationError("s3 key mismatch")
    if pending["contentType"] != content_type:
        raise AssetValidationError("content type mismatch")
    if size_bytes <= 0:
        raise AssetValidationError("invalid file size")
    asset = assets_repo.confirm(
        project_id,
        asset_id,
        size_bytes=size_bytes,
        width=width,
        height=height,
    )
    return _with_public_url(asset)


def list_assets(project_id):
    _require_project(project_id)
    return [_with_public_url(asset) for asset in assets_repo.list_for_project(project_id)]
