"""Project asset metadata persistence."""

import time

from studio import db
from studio.models import Asset, to_doc

_ALLOWED_TYPES = frozenset({"logo", "brand", "service", "team", "product"})


def allowed_asset_types():
    return sorted(_ALLOWED_TYPES)


def create_pending(
    project_id,
    *,
    asset_id,
    asset_type,
    s3_key,
    filename,
    content_type,
):
    if asset_type not in _ALLOWED_TYPES:
        raise ValueError("invalid asset type")
    now = time.time()
    row = Asset(
        assetId=asset_id,
        projectId=project_id,
        assetType=asset_type,
        filename=filename,
        contentType=content_type,
        s3Key=s3_key,
        status="pending",
        sizeBytes=None,
        width=None,
        height=None,
        uploadedAt=None,
        createdAt=now,
        updatedAt=now,
    )
    with db.session() as s:
        s.add(row)
        s.commit()
        return to_doc(row)


def get(project_id, asset_id):
    with db.session() as s:
        row = (
            s.query(Asset)
            .filter_by(projectId=project_id, assetId=asset_id)
            .first()
        )
        return to_doc(row)


def confirm(project_id, asset_id, *, size_bytes, width=None, height=None):
    now = time.time()
    with db.session() as s:
        s.query(Asset).filter_by(projectId=project_id, assetId=asset_id).update(
            {
                "status": "ready",
                "sizeBytes": size_bytes,
                "width": width,
                "height": height,
                "uploadedAt": now,
                "updatedAt": now,
            }
        )
        s.commit()
    return get(project_id, asset_id)


def list_for_project(project_id):
    with db.session() as s:
        rows = (
            s.query(Asset)
            .filter_by(projectId=project_id, status="ready")
            .order_by(Asset.uploadedAt.desc())
            .all()
        )
        return [to_doc(r) for r in rows]
