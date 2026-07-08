"""Mongo lifecycle and builder-v2 feature flag tests."""

from unittest.mock import patch

import pytest
from studio import config, db


@pytest.fixture(autouse=True)
def reset_config(monkeypatch):
    monkeypatch.delenv("STUDIO_BUILDER_V2", raising=False)
    monkeypatch.delenv("STUDIO_MONGO_URI", raising=False)
    monkeypatch.delenv("STUDIO_MONGO_DB", raising=False)
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def test_builder_v2_flag_defaults_off():
    assert config.builder_v2_enabled() is False


def test_builder_v2_flag_on(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    config.reset_for_tests()
    assert config.builder_v2_enabled() is True


def test_builder_v2_flag_truthy_values(monkeypatch):
    for val in ("1", "yes", "on", "TRUE"):
        monkeypatch.setenv("STUDIO_BUILDER_V2", val)
        config.reset_for_tests()
        assert config.builder_v2_enabled() is True


def test_mongo_disabled_when_flag_off():
    assert db.mongo_enabled() is False
    assert db.get_database() is None


def test_mongo_memory_backend_when_flag_on(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    database = db.get_database()
    assert database is not None
    assert db.ping() is True


@patch("studio.db._real_ping")
def test_mongo_ping_success(mock_ping, monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "mongodb://127.0.0.1:27017")
    config.reset_for_tests()
    mock_ping.return_value = True
    assert db.ping() is True
    mock_ping.assert_called_once()


@patch("studio.db._real_ping")
def test_mongo_ping_failure(mock_ping, monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "mongodb://127.0.0.1:27017")
    config.reset_for_tests()
    mock_ping.side_effect = ConnectionError("down")
    assert db.ping() is False


def test_collection_returns_none_when_disabled():
    assert db.collection("projects") is None


def test_memory_collection_roundtrip(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    coll = db.collection("projects")
    coll.insert_one({"projectId": "demo", "projectName": "Demo"})
    doc = coll.find_one({"projectId": "demo"})
    assert doc["projectName"] == "Demo"
