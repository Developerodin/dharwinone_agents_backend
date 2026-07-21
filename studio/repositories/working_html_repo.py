"""Project working HTML persistence."""

import time

from studio import db
from studio.models import WorkingHtml, to_doc

_MAX_BYTES = 512 * 1024


class WorkingHtmlError(ValueError):
    pass


def _validate(html):
    if len(html.encode("utf-8")) > _MAX_BYTES:
        raise WorkingHtmlError("working html exceeds 512KB")
    low = html.lower()
    if "<html" not in low or "</html>" not in low:
        raise WorkingHtmlError("working html must be a full document")


def get(project_id):
    from studio import draft

    with db.session() as s:
        row = s.query(WorkingHtml).filter_by(projectId=project_id).first()
        doc = to_doc(row)
    if doc and doc.get("html"):
        doc["html"] = draft.sanitize_html(doc["html"])
    return doc


def put(project_id, html, *, template_id=None):
    from studio import draft

    _validate(html)
    html = draft.sanitize_html(html)
    now = time.time()
    with db.session() as s:
        row = s.query(WorkingHtml).filter_by(projectId=project_id).first()
        if row:
            row.html = html
            row.selectedTemplateId = template_id
            row.updatedAt = now
        else:
            row = WorkingHtml(
                projectId=project_id,
                html=html,
                selectedTemplateId=template_id,
                updatedAt=now,
            )
            s.add(row)
        s.commit()
        return to_doc(row)


def require_html(project_id):
    doc = get(project_id)
    if not doc or not doc.get("html"):
        raise WorkingHtmlError("working html not found")
    return doc["html"]
