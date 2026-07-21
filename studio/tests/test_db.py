"""SQLAlchemy lifecycle tests."""

import pytest
from studio import config, db
from studio.repositories import projects_repo


@pytest.fixture(autouse=True)
def reset_config(monkeypatch):
    monkeypatch.delenv("STUDIO_DATABASE_URL", raising=False)
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def test_memory_backend_ping(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    assert db.ping() is True


def test_repo_roundtrip_on_memory(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    created = projects_repo.create("Demo")
    fetched = projects_repo.get(created["projectId"])
    assert fetched["projectName"] == "Demo"
    assert "id" not in fetched
