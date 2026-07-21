"""Mock publish pipeline."""

import time
import uuid

from studio import db
from studio.models import Quality, Release, to_doc
from studio.quality.engine import run_quality
from studio.repositories import analytics_repo, profiles_repo, working_html_repo


def run_quality_gate(project_id):
    profile = profiles_repo.get(project_id)
    html = working_html_repo.require_html(project_id)
    result = run_quality(html, profile)
    with db.session() as s:
        s.add(
            Quality(projectId=project_id, result=result, ts=time.time())
        )
        s.commit()
    return result


def latest_quality(project_id):
    with db.session() as s:
        row = (
            s.query(Quality)
            .filter_by(projectId=project_id)
            .order_by(Quality.ts.desc())
            .first()
        )
        return row.result if row else None


def publish(project_id, *, channel="preview", version_id=None):
    gate = run_quality_gate(project_id)
    if gate["verdict"] == "fail":
        raise ValueError("quality gate failed")
    release_id = uuid.uuid4().hex[:12]
    row = Release(
        releaseId=release_id,
        projectId=project_id,
        channel=channel,
        versionId=version_id,
        status="success",
        createdAt=time.time(),
    )
    with db.session() as s:
        s.add(row)
        s.commit()
        doc = to_doc(row)
    analytics_repo.track(project_id, "publish_success", metadata={"channel": channel})
    return doc


def list_releases(project_id):
    with db.session() as s:
        rows = (
            s.query(Release)
            .filter_by(projectId=project_id)
            .order_by(Release.createdAt.desc())
            .all()
        )
        return [to_doc(r) for r in rows]
