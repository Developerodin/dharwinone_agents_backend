"""Analytics event persistence."""

import time
import uuid

from studio import db
from studio.models import Analytics, to_doc


def track(project_id, event_type, *, metadata=None):
    row = Analytics(
        eventId=uuid.uuid4().hex[:12],
        projectId=project_id,
        eventType=event_type,
        metadata_=metadata or {},
        ts=time.time(),
    )
    with db.session() as s:
        s.add(row)
        s.commit()
        return to_doc(row)


def list_for_project(project_id):
    with db.session() as s:
        rows = (
            s.query(Analytics)
            .filter_by(projectId=project_id)
            .order_by(Analytics.ts.desc())
            .all()
        )
        return [to_doc(r) for r in rows]


def summarize(project_id):
    events = list_for_project(project_id)
    counts = {}
    for event in events:
        key = event.get("eventType", "unknown")
        counts[key] = counts.get(key, 0) + 1
    return {"projectId": project_id, "counts": counts, "total": len(events)}
