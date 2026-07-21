"""SQLAlchemy engine/session lifecycle for Studio."""

import threading
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from studio import config
from studio.models import Base

_engine = None
_Session = None
# StaticPool shares ONE sqlite connection and sqlite connections are NOT thread-safe.
# Serialize memory:// sessions with a lock. Postgres path unaffected.
_sqlite_lock = None


def _build_engine():
    global _sqlite_lock
    url = config.database_url()
    if url == "memory://":
        eng = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(eng)
        _sqlite_lock = threading.Lock()
        return eng
    return create_engine(url, pool_pre_ping=True)


def engine():
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def _session_factory():
    global _Session
    if _Session is None:
        _Session = sessionmaker(bind=engine(), expire_on_commit=False)
    return _Session


@contextmanager
def session():
    if _sqlite_lock is not None:
        with _sqlite_lock:
            s = _session_factory()()
            try:
                yield s
            finally:
                s.close()
        return
    s = _session_factory()()
    try:
        yield s
    finally:
        s.close()


def reset_for_tests():
    global _engine, _Session, _sqlite_lock
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _Session = None
    _sqlite_lock = None


def ping():
    try:
        with engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
