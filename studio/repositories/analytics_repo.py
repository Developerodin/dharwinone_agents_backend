"""Analytics event persistence."""

import time
import uuid

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "builder_analytics"


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def track(project_id, event_type, *, metadata=None):
    doc = {
        "eventId": uuid.uuid4().hex[:12],
        "projectId": project_id,
        "eventType": event_type,
        "metadata": metadata or {},
        "ts": time.time(),
    }
    _collection().insert_one(doc)
    return doc


def list_for_project(project_id):
    items = list(_collection().find({"projectId": project_id}))
    items.sort(key=lambda d: d.get("ts", 0), reverse=True)
    return items


def summarize(project_id):
    events = list_for_project(project_id)
    counts = {}
    for event in events:
        key = event.get("eventType", "unknown")
        counts[key] = counts.get(key, 0) + 1
    return {"projectId": project_id, "counts": counts, "total": len(events)}
