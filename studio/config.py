"""Studio control-plane configuration."""

import os

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_DATA = os.path.join(_ROOT, "studio", "data")
_DEFAULT_PORT = 8787

_data_dir = None
_port = None
_builder_v2 = None
_mongo_uri = None
_mongo_db = None
_s3_mock = None
_s3_bucket = None

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def data_dir():
    global _data_dir
    if _data_dir is None:
        _data_dir = os.environ.get("STUDIO_DATA", _DEFAULT_DATA)
    return _data_dir


def port():
    global _port
    if _port is None:
        _port = int(os.environ.get("STUDIO_PORT", str(_DEFAULT_PORT)))
    return _port


def projects_path():
    return os.path.join(data_dir(), "projects.json")


def runs_dir(project_id):
    return os.path.join(data_dir(), "runs", project_id)


def run_dir(project_id, run_id):
    return os.path.join(runs_dir(project_id), run_id)


def stats_path(project_id):
    return os.path.join(data_dir(), f"{project_id}-stats.json")


def consent_path(project_id):
    return os.path.join(data_dir(), f"{project_id}-consent.jsonl")


def heartbeat_interval_s():
    return float(os.environ.get("STUDIO_HEARTBEAT_INTERVAL", "10"))


def monitor_interval_s():
    return float(os.environ.get("STUDIO_MONITOR_INTERVAL", "5"))


def heartbeat_stale_s():
    return float(os.environ.get("STUDIO_HEARTBEAT_STALE_SEC", "45"))


def builder_v2_enabled():
    global _builder_v2
    if _builder_v2 is None:
        raw = os.environ.get("STUDIO_BUILDER_V2", "").strip().lower()
        _builder_v2 = raw in _TRUTHY
    return _builder_v2


def mongo_uri():
    global _mongo_uri
    if _mongo_uri is None:
        _mongo_uri = os.environ.get("STUDIO_MONGO_URI", "mongodb://127.0.0.1:27017")
    return _mongo_uri


def mongo_db_name():
    global _mongo_db
    if _mongo_db is None:
        _mongo_db = os.environ.get("STUDIO_MONGO_DB", "dharwin_studio")
    return _mongo_db


def s3_mock_enabled():
    """Mock unless a real bucket and credentials are configured.

    STUDIO_S3_MOCK always wins when set. Without it, mocking on while real creds sit
    in .env is how images silently never reached S3; tests pin it to true explicitly.
    """
    global _s3_mock
    if _s3_mock is None:
        raw = os.environ.get("STUDIO_S3_MOCK", "").strip().lower()
        if raw:
            _s3_mock = raw in _TRUTHY
        else:
            _s3_mock = not (
                _configured_bucket()
                and os.environ.get("AWS_ACCESS_KEY_ID")
                and os.environ.get("AWS_SECRET_ACCESS_KEY")
            )
    return _s3_mock


def _configured_bucket():
    return (
        os.environ.get("STUDIO_S3_BUCKET")
        or os.environ.get("AWS_S3_BUCKET_NAME")
        or ""
    ).strip()


def s3_bucket():
    global _s3_bucket
    if _s3_bucket is None:
        _s3_bucket = _configured_bucket() or "dharwin-studio-dev"
    return _s3_bucket


def reset_for_tests():
    """Clear cached paths (tests only)."""
    global _data_dir, _port, _builder_v2, _mongo_uri, _mongo_db, _s3_mock, _s3_bucket
    _data_dir = None
    _port = None
    _builder_v2 = None
    _mongo_uri = None
    _mongo_db = None
    _s3_mock = None
    _s3_bucket = None
