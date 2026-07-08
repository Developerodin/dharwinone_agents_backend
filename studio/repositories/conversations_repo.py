"""Conversation turn persistence."""

import time

from studio import db
from studio.repositories.projects_repo import (
    BuilderV2Disabled,
)
from studio.repositories.projects_repo import (
    _collection as _projects_collection,
)


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection("conversations")
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _doc_id(project_id):
    return project_id


def ensure(project_id):
    coll = _collection()
    doc = coll.find_one({"projectId": project_id})
    if doc:
        return doc
    doc = {"projectId": project_id, "turns": []}
    coll.insert_one(doc)
    return doc


def append_turn(project_id, role, text, meta=None):
    coll = _collection()
    turn = {
        "role": role,
        "text": text,
        "ts": time.time(),
        "meta": meta or {},
    }
    doc = ensure(project_id)
    turns = list(doc.get("turns", []))
    turns.append(turn)
    coll.update_one(
        {"projectId": project_id},
        {"$set": {"turns": turns}},
    )
    return turn


def list_turns(project_id):
    doc = ensure(project_id)
    return list(doc.get("turns", []))
