"""One-shot: load backend/mongo-migration-dump/dharwin_studio/*.bson into Postgres (best-effort).

    .venv\\Scripts\\python -m studio.scripts.migrate_mongo_to_pg            # truncates first
    .venv\\Scripts\\python -m studio.scripts.migrate_mongo_to_pg --no-truncate

Self-contained engine (reads STUDIO_DATABASE_URL) so it runs before/after the db.py rewrite.
Data is disposable tester data: rows violating constraints are skipped and logged, never fatal.
"""

import os
import sys
import time

from bson import ObjectId, decode_file_iter  # pymongo, dev-only dep
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from studio import models as m

DUMP = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "mongo-migration-dump",
    "dharwin_studio",
)

# Parent-first load order (children FK to builder_projects).
LOAD_ORDER = [
    ("builder_projects", m.Project),
    ("builder_versions", m.Version),
    ("project_assets", m.Asset),
    ("businessProfiles", m.BusinessProfile),
    ("builder_templates", m.GenTemplate),
    ("builder_edits", m.Edit),
    ("conversations", m.Conversation),
    ("builder_analytics", m.Analytics),
    ("builder_releases", m.Release),
    ("builder_quality", m.Quality),
]


def _session():
    url = os.environ.get(
        "STUDIO_DATABASE_URL",
        "postgresql+psycopg://studio:studio@localhost:5432/dharwin_studio",
    )
    return sessionmaker(bind=create_engine(url), expire_on_commit=False)()


def _sanitize(value):
    """BSON -> JSON-safe: ObjectId -> str, datetime -> epoch float, recursively."""
    if isinstance(value, ObjectId):
        return str(value)
    if hasattr(value, "timestamp") and not isinstance(value, (int, float, str)):
        try:
            return value.timestamp()  # datetime from BSON dates
        except Exception:
            return str(value)
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


def _obj_for(Model, doc):
    doc = {k: _sanitize(v) for k, v in doc.items() if k != "_id"}
    if Model is m.GenTemplate:  # whole item -> doc column
        return Model(
            templateId=doc.get("templateId") or os.urandom(6).hex(),
            projectId=doc.get("projectId"),
            galleryIndex=doc.get("galleryIndex", 0),
            generatedAt=doc.get("generatedAt") or time.time(),
            doc=doc,
        )
    cols = {c.name for c in Model.__table__.columns}
    kw = {k: v for k, v in doc.items() if k in cols}
    if Model is m.Analytics:  # attr is metadata_, column is "metadata"
        kw.pop("metadata", None)
        kw["metadata_"] = doc.get("metadata", {})
    return Model(**kw)


def _seed_local_user(s):
    if not s.query(m.User).filter_by(userId="local-user").first():
        s.add(
            m.User(
                userId="local-user",
                email="local-user@local",
                name="Local User",
                emailVerified=True,
                createdAt=time.time(),
            )
        )
        s.commit()


def run(truncate=True):
    s = _session()
    if truncate:
        for _, Model in reversed(LOAD_ORDER):  # children first for FK safety
            s.query(Model).delete()
        s.query(m.User).filter_by(userId="local-user").delete()
        s.commit()
    _seed_local_user(s)
    for fname, Model in LOAD_ORDER:
        path = os.path.join(DUMP, f"{fname}.bson")
        if not os.path.exists(path):
            print(f"skip {fname}: no dump file")
            continue
        ok = skipped = 0
        with open(path, "rb") as fh:
            for doc in decode_file_iter(fh):
                try:  # per-row savepoint: skip bad rows, never abort the run
                    with s.begin_nested():
                        s.add(_obj_for(Model, doc))
                    ok += 1
                except Exception as exc:
                    skipped += 1
                    print(f"  skip 1 row in {fname}: {type(exc).__name__}")
        s.commit()
        print(f"loaded {ok:>5}, skipped {skipped} -> {fname}")
    s.close()


if __name__ == "__main__":
    run(truncate="--no-truncate" not in sys.argv)
