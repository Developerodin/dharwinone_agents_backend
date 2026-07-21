"""Business profile persistence."""

import time

from studio import db
from studio.models import BusinessProfile, to_doc


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


def get(project_id):
    with db.session() as s:
        row = s.query(BusinessProfile).filter_by(projectId=project_id).first()
        if not row:
            return _empty_profile(project_id)
        doc = to_doc(row)
        defaults = _empty_profile(project_id)
        for key in (
            "brand",
            "business",
            "location",
            "contact",
            "design",
            "skipped",
            "completeness",
        ):
            if doc.get(key) is None:
                doc[key] = defaults[key]
        return doc


def save(profile):
    profile = dict(profile)
    profile["updatedAt"] = time.time()
    project_id = profile["projectId"]
    cols = {c.name for c in BusinessProfile.__table__.columns}
    fields = {k: v for k, v in profile.items() if k in cols and k != "id"}
    with db.session() as s:
        row = s.query(BusinessProfile).filter_by(projectId=project_id).first()
        if row:
            for key, value in fields.items():
                setattr(row, key, value)
        else:
            s.add(BusinessProfile(**fields))
        s.commit()
    return get(project_id)
