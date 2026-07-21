"""Generated personalized template persistence."""

import time
import uuid

from studio import db
from studio.models import GenTemplate


def _public(row):
    from studio import draft

    if not row:
        return None
    if isinstance(row, dict):
        clean = dict(row)
        clean.pop("_id", None)
        if clean.get("htmlContent"):
            clean["htmlContent"] = draft.sanitize_html(clean["htmlContent"])
        return clean
    clean = {
        **(row.doc or {}),
        "templateId": row.templateId,
        "projectId": row.projectId,
        "galleryIndex": row.galleryIndex,
        "generatedAt": row.generatedAt,
    }
    if clean.get("htmlContent"):
        clean["htmlContent"] = draft.sanitize_html(clean["htmlContent"])
    return clean


def replace_for_project(project_id, templates):
    now = time.time()
    saved = []
    with db.session() as s:
        s.query(GenTemplate).filter_by(projectId=project_id).delete()
        for idx, item in enumerate(templates):
            doc = dict(item)
            template_id = doc.get("templateId") or uuid.uuid4().hex[:12]
            row = GenTemplate(
                templateId=template_id,
                projectId=project_id,
                galleryIndex=doc.get("galleryIndex", idx),
                generatedAt=now,
                doc=doc,
            )
            s.add(row)
            saved.append(_public(row))
        s.commit()
    saved.sort(key=lambda d: (d.get("galleryIndex", 999), d.get("templateId", "")))
    return saved


def list_for_project(project_id):
    with db.session() as s:
        rows = (
            s.query(GenTemplate)
            .filter_by(projectId=project_id)
            .order_by(GenTemplate.galleryIndex, GenTemplate.templateId)
            .all()
        )
        return [_public(r) for r in rows]


def get(project_id, template_id):
    with db.session() as s:
        row = (
            s.query(GenTemplate)
            .filter_by(projectId=project_id, templateId=template_id)
            .first()
        )
        return _public(row)
