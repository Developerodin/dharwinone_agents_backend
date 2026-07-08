"""Edit log persistence."""

import time
import uuid

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "builder_edits"


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def append(
    project_id,
    *,
    source,
    user_prompt,
    action_summary,
    change_scope,
    targets=None,
    version_id=None,
):
    doc = {
        "editId": uuid.uuid4().hex[:12],
        "projectId": project_id,
        "versionId": version_id,
        "ts": time.time(),
        "actor": "user",
        "source": source,
        "userPrompt": user_prompt,
        "actionSummary": action_summary,
        "changeScope": change_scope,
        "targets": targets or [],
    }
    _collection().insert_one(doc)
    return doc


def list_for_project(project_id):
    items = list(_collection().find({"projectId": project_id}))
    items.sort(key=lambda d: d.get("ts", 0), reverse=True)
    return items
