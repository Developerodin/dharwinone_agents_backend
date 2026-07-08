"""Version snapshot persistence."""

import hashlib
import time
import uuid

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "builder_versions"


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _profile_hash(profile):
    raw = str(sorted((profile or {}).items()))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def create(project_id, *, label, trigger, html, profile=None):
    version_id = uuid.uuid4().hex[:12]
    now = time.time()
    doc = {
        "versionId": version_id,
        "projectId": project_id,
        "label": label,
        "trigger": trigger,
        "createdAt": now,
        "snapshotHtml": html,
        "snapshotProfileHash": _profile_hash(profile),
        "s3HtmlKey": f"projects/{project_id}/versions/{version_id}.html",
    }
    _collection().insert_one(doc)
    return doc


def list_for_project(project_id):
    items = list(_collection().find({"projectId": project_id}))
    items.sort(key=lambda d: d.get("createdAt", 0), reverse=True)
    return items


def get(project_id, version_id):
    return _collection().find_one(
        {"projectId": project_id, "versionId": version_id},
    )


def head(project_id):
    versions = list_for_project(project_id)
    return versions[0] if versions else None
