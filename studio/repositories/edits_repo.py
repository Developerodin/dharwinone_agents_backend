"""Edit log persistence."""

import time
import uuid

from studio import db
from studio.models import Edit, to_doc


def append(
    project_id,
    *,
    source,
    user_prompt,
    action_summary,
    change_scope,
    targets=None,
    version_id=None,
):
    row = Edit(
        editId=uuid.uuid4().hex[:12],
        projectId=project_id,
        versionId=version_id,
        ts=time.time(),
        actor="user",
        source=source,
        userPrompt=user_prompt,
        actionSummary=action_summary,
        changeScope=change_scope,
        targets=targets or [],
    )
    with db.session() as s:
        s.add(row)
        s.commit()
        return to_doc(row)


def list_for_project(project_id):
    with db.session() as s:
        rows = (
            s.query(Edit)
            .filter_by(projectId=project_id)
            .order_by(Edit.ts.desc())
            .all()
        )
        return [to_doc(r) for r in rows]
