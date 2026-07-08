"""Project asset metadata persistence."""

import time

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "project_assets"
_ALLOWED_TYPES = frozenset({"logo", "brand", "service", "team", "product"})


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


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
    doc = {
        "assetId": asset_id,
        "projectId": project_id,
        "assetType": asset_type,
        "filename": filename,
        "contentType": content_type,
        "s3Key": s3_key,
        "status": "pending",
        "sizeBytes": None,
        "width": None,
        "height": None,
        "uploadedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    _collection().insert_one(doc)
    return doc


def get(project_id, asset_id):
    return _collection().find_one(
        {"projectId": project_id, "assetId": asset_id},
    )


def confirm(project_id, asset_id, *, size_bytes, width=None, height=None):
    now = time.time()
    _collection().update_one(
        {"projectId": project_id, "assetId": asset_id},
        {
            "$set": {
                "status": "ready",
                "sizeBytes": size_bytes,
                "width": width,
                "height": height,
                "uploadedAt": now,
                "updatedAt": now,
            }
        },
    )
    return get(project_id, asset_id)


def list_for_project(project_id):
    items = list(
        _collection().find({"projectId": project_id, "status": "ready"})
    )
    items.sort(key=lambda doc: doc.get("uploadedAt") or 0, reverse=True)
    return items
