"""Version snapshot persistence."""

import hashlib
import time
import uuid

from studio import db
from studio.models import Version, to_doc


def _profile_hash(profile):
    raw = str(sorted((profile or {}).items()))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def create(project_id, *, label, trigger, html, profile=None):
    version_id = uuid.uuid4().hex[:12]
    now = time.time()
    row = Version(
        versionId=version_id,
        projectId=project_id,
        label=label,
        trigger=trigger,
        createdAt=now,
        snapshotHtml=html,
        snapshotProfileHash=_profile_hash(profile),
        s3HtmlKey=f"projects/{project_id}/versions/{version_id}.html",
    )
    with db.session() as s:
        s.add(row)
        s.commit()
        return to_doc(row)


def list_for_project(project_id):
    with db.session() as s:
        rows = (
            s.query(Version)
            .filter_by(projectId=project_id)
            .order_by(Version.createdAt.desc())
            .all()
        )
        return [to_doc(r) for r in rows]


def get(project_id, version_id):
    with db.session() as s:
        row = (
            s.query(Version)
            .filter_by(projectId=project_id, versionId=version_id)
            .first()
        )
        return to_doc(row)


def head(project_id):
    versions = list_for_project(project_id)
    return versions[0] if versions else None
