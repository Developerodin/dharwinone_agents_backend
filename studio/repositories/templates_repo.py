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


def replace_for_project(project_id, templates):
    coll = _collection()
    coll.delete_many({"projectId": project_id})
    now = time.time()
    saved = []
    for item in templates:
        doc = dict(item)
        doc["projectId"] = project_id
        doc.setdefault("templateId", uuid.uuid4().hex[:12])
        doc["generatedAt"] = now
        coll.insert_one(doc)
        saved.append(doc)
    return saved


def list_for_project(project_id):
    items = list(_collection().find({"projectId": project_id}))
    items.sort(key=lambda d: d.get("generatedAt", 0), reverse=True)
    return items


def get(project_id, template_id):
    return _collection().find_one(
        {"projectId": project_id, "templateId": template_id},
    )
