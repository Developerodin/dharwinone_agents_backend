"""Generated personalized template persistence."""

import time
import uuid

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "builder_templates"


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _public(doc):
    from studio import draft

    if not doc:
        return None
    clean = dict(doc)
    clean.pop("_id", None)
    # ponytail: heal rows written before fence-stripping landed; writes sanitize too.
    if clean.get("htmlContent"):
        clean["htmlContent"] = draft.sanitize_html(clean["htmlContent"])
    return clean


def replace_for_project(project_id, templates):
    coll = _collection()
    coll.delete_many({"projectId": project_id})
    now = time.time()
    saved = []
    for idx, item in enumerate(templates):
        doc = dict(item)
        doc["projectId"] = project_id
        doc.setdefault("templateId", uuid.uuid4().hex[:12])
        doc.setdefault("galleryIndex", idx)
        doc["generatedAt"] = now
        coll.insert_one(doc)
        saved.append(_public(doc))
    saved.sort(key=lambda d: (d.get("galleryIndex", 999), d.get("templateId", "")))
    return saved


def list_for_project(project_id):
    items = [_public(item) for item in _collection().find({"projectId": project_id})]
    items.sort(
        key=lambda d: (
            d.get("galleryIndex", 999),
            d.get("templateId", ""),
        )
    )
    return items


def get(project_id, template_id):
    return _public(
        _collection().find_one(
        {"projectId": project_id, "templateId": template_id},
        )
    )
