"""Project working HTML persistence."""

import time

from studio import db
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection

_COLLECTION = "builder_working_html"
_MAX_BYTES = 512 * 1024


class WorkingHtmlError(ValueError):
    pass


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _validate(html):
    if len(html.encode("utf-8")) > _MAX_BYTES:
        raise WorkingHtmlError("working html exceeds 512KB")
    low = html.lower()
    if "<html" not in low or "</html>" not in low:
        raise WorkingHtmlError("working html must be a full document")


def get(project_id):
    return _collection().find_one({"projectId": project_id})


def put(project_id, html, *, template_id=None):
    from studio import draft

    _validate(html)
    html = draft.sanitize_html(html)
    now = time.time()
    doc = {
        "projectId": project_id,
        "html": html,
        "selectedTemplateId": template_id,
        "updatedAt": now,
    }
    coll = _collection()
    if coll.find_one({"projectId": project_id}):
        coll.update_one({"projectId": project_id}, {"$set": doc})
    else:
        coll.insert_one(doc)
    return doc


def require_html(project_id):
    doc = get(project_id)
    if not doc or not doc.get("html"):
        raise WorkingHtmlError("working html not found")
    return doc["html"]
