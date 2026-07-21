"""Conversation turn persistence."""

import time

from studio import db
from studio.models import Conversation, to_doc


def ensure(project_id):
    with db.session() as s:
        row = s.query(Conversation).filter_by(projectId=project_id).first()
        if row:
            return to_doc(row)
        row = Conversation(projectId=project_id, turns=[])
        s.add(row)
        s.commit()
        return to_doc(row)


def append_turn(project_id, role, text, meta=None):
    turn = {
        "role": role,
        "text": text,
        "ts": time.time(),
        "meta": meta or {},
    }
    with db.session() as s:
        row = s.query(Conversation).filter_by(projectId=project_id).first()
        if not row:
            row = Conversation(projectId=project_id, turns=[])
            s.add(row)
            s.flush()
        turns = list(row.turns or [])
        turns.append(turn)
        row.turns = turns
        s.commit()
    return turn


def list_turns(project_id):
    doc = ensure(project_id)
    return list(doc.get("turns", []))
