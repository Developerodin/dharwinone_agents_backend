"""CRUD for website builder projects."""

import re
import time

from sqlalchemy import nulls_last
from sqlalchemy.exc import IntegrityError

from studio import db
from studio.models import Project, to_doc

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(name):
    s = _SLUG_RE.sub("-", name.lower().strip())[:24].strip("-")
    return s or "project"


def _unique_id(base):
    pid, n = base, 2
    with db.session() as s:
        while s.query(Project).filter_by(projectId=pid).first():
            suffix = f"-{n}"
            pid = (base[: 24 - len(suffix)] + suffix).strip("-")
            n += 1
    return pid


def create(project_name, initial_prompt=None, owner_user_id="local-user"):
    now = time.time()
    for _ in range(5):
        row = Project(
            projectId=_unique_id(_slug(project_name)),
            projectName=project_name,
            status="onboarding",
            initialPrompt=initial_prompt,
            selectedTemplateId=None,
            currentVersionId=None,
            ownerUserId=owner_user_id,
            visibility="private",
            collaborators=[],
            createdAt=now,
            updatedAt=now,
        )
        with db.session() as s:
            s.add(row)
            try:
                s.commit()
                return to_doc(row)
            except IntegrityError:
                s.rollback()
    raise RuntimeError("could not allocate a unique projectId")


def list_all():
    with db.session() as s:
        rows = s.query(Project).order_by(nulls_last(Project.createdAt.desc())).all()
        return [to_doc(r) for r in rows]


def list_for_user(user_id):
    return [
        d
        for d in list_all()
        if d.get("ownerUserId") == user_id
        or any(c.get("userId") == user_id for c in d.get("collaborators") or [])
    ]


def get(project_id):
    with db.session() as s:
        return to_doc(s.query(Project).filter_by(projectId=project_id).first())


def update_fields(project_id, fields):
    cols = {c.name for c in Project.__table__.columns}
    patch = {k: v for k, v in fields.items() if k in cols}
    patch["updatedAt"] = time.time()
    with db.session() as s:
        s.query(Project).filter_by(projectId=project_id).update(patch)
        s.commit()
    return get(project_id)
