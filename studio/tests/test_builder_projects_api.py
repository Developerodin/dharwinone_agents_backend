"""Builder v2 project API tests."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app


@pytest.fixture
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def client():
    return TestClient(create_app())


def test_builder_projects_disabled_returns_404(client, monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "false")
    config.reset_for_tests()
    r = client.get("/builder/projects")
    assert r.status_code == 404


def test_create_list_get_builder_project(client, memory_db):
    created = client.post(
        "/builder/projects",
        json={"projectName": "Dharwin One", "initialPrompt": "Build site"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["projectId"] == "dharwin-one"
    assert body["status"] == "onboarding"

    listed = client.get("/builder/projects")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["projectName"] == "Dharwin One"

    fetched = client.get("/builder/projects/dharwin-one")
    assert fetched.status_code == 200
    assert fetched.json()["initialPrompt"] == "Build site"


def test_get_missing_builder_project_404(client, memory_db):
    r = client.get("/builder/projects/missing")
    assert r.status_code == 404
