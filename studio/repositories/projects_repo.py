"""CRUD for builder-v2 website projects."""

import re
import time

from studio import config, db

_COLLECTION = "builder_projects"
_SLUG_RE = re.compile(r"[^a-z0-9]+")


class BuilderV2Disabled(Exception):
    pass


def _require_enabled():
    if not config.builder_v2_enabled():
        raise BuilderV2Disabled("STUDIO_BUILDER_V2 is disabled")


def _collection():
    _require_enabled()
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _slug(name):
    s = _SLUG_RE.sub("-", name.lower().strip())[:24].strip("-")
    return s or "project"


def _public(doc):
    if not doc:
        return None
    clean = dict(doc)
    clean.pop("_id", None)
    return clean


def _unique_id(base):
    coll = _collection()
    pid = base
    n = 2
    while coll.find_one({"projectId": pid}):
        suffix = f"-{n}"
        pid = (base[: 24 - len(suffix)] + suffix).strip("-")
        n += 1
    return pid


def create(project_name, initial_prompt=None, owner_user_id="local-user"):
    coll = _collection()
    now = time.time()
    project_id = _unique_id(_slug(project_name))
    doc = {
        "projectId": project_id,
        "projectName": project_name,
        "status": "onboarding",
        "initialPrompt": initial_prompt,
        "selectedTemplateId": None,
        "currentVersionId": None,
        "ownerUserId": owner_user_id,
        "visibility": "private",
        "collaborators": [],
        "createdAt": now,
        "updatedAt": now,
    }
    coll.insert_one(doc)
    return _public(doc)


def list_all():
    coll = _collection()
    docs = [_public(doc) for doc in coll.find({})]
    docs.sort(key=lambda d: d.get("createdAt", 0), reverse=True)
    return docs


def get(project_id):
    coll = _collection()
    return _public(coll.find_one({"projectId": project_id}))


def update_fields(project_id, fields):
    coll = _collection()
    patch = dict(fields)
    patch["updatedAt"] = time.time()
    coll.update_one({"projectId": project_id}, {"$set": patch})
    return get(project_id)
