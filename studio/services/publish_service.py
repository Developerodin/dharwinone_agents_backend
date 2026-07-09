"""Mock publish pipeline."""

import time
import uuid

from studio import db
from studio.quality.engine import run_quality
from studio.repositories import profiles_repo, working_html_repo
from studio.repositories.projects_repo import BuilderV2Disabled, _collection as _projects_collection
from studio.repositories import analytics_repo

_COLLECTION = "builder_releases"
_QUALITY_COLLECTION = "builder_quality"


def _public(doc):
    return db.strip_id(doc)


def _releases():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection(_COLLECTION)
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def _quality():
    coll = db.collection(_QUALITY_COLLECTION)
    return coll


def run_quality_gate(project_id):
    profile = profiles_repo.get(project_id)
    html = working_html_repo.require_html(project_id)
    result = run_quality(html, profile)
    _quality().insert_one(
        {"projectId": project_id, "result": result, "ts": time.time()}
    )
    return result


def latest_quality(project_id):
    items = [_public(item) for item in _quality().find({"projectId": project_id})]
    items.sort(key=lambda d: d.get("ts", 0), reverse=True)
    return items[0]["result"] if items else None


def publish(project_id, *, channel="preview", version_id=None):
    gate = run_quality_gate(project_id)
    if gate["verdict"] == "fail":
        raise ValueError("quality gate failed")
    release_id = uuid.uuid4().hex[:12]
    doc = {
        "releaseId": release_id,
        "projectId": project_id,
        "channel": channel,
        "versionId": version_id,
        "status": "success",
        "createdAt": time.time(),
    }
    _releases().insert_one(doc)
    analytics_repo.track(project_id, "publish_success", metadata={"channel": channel})
    return _public(doc)


def list_releases(project_id):
    items = [_public(item) for item in _releases().find({"projectId": project_id})]
    items.sort(key=lambda d: d.get("createdAt", 0), reverse=True)
    return items
