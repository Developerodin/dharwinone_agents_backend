"""Business profile persistence for builder v2."""

import time

from studio import db
from studio.repositories.projects_repo import (
    BuilderV2Disabled,
)
from studio.repositories.projects_repo import (
    _collection as _projects_collection,
)


def _empty_profile(project_id):
    return {
        "projectId": project_id,
        "brand": {"brandName": None, "businessName": None, "tagline": None},
        "business": {
            "type": None,
            "services": [],
            "description": None,
            "targetAudience": None,
        },
        "location": {
            "country": None,
            "state": None,
            "city": None,
            "address": None,
        },
        "contact": {
            "email": None,
            "phone": None,
            "website": None,
            "socialLinks": [],
        },
        "design": {"stylePreference": None},
        "skipped": [],
        "completeness": {"percent": 0, "missingFields": []},
        "updatedAt": time.time(),
    }


def _collection():
    try:
        _projects_collection()
    except BuilderV2Disabled as exc:
        raise exc
    coll = db.collection("businessProfiles")
    if coll is None:
        raise BuilderV2Disabled("builder-v2 database unavailable")
    return coll


def get(project_id):
    coll = _collection()
    doc = coll.find_one({"projectId": project_id})
    if not doc:
        return _empty_profile(project_id)
    return db.strip_id(doc)


def save(profile):
    coll = _collection()
    profile = dict(profile)
    profile["updatedAt"] = time.time()
    if coll.find_one({"projectId": profile["projectId"]}):
        coll.update_one(
            {"projectId": profile["projectId"]},
            {"$set": profile},
        )
    else:
        coll.insert_one(profile)
    return db.strip_id(profile)
