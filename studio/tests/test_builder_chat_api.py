"""Builder chat API tests."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app


@pytest.fixture(autouse=True)
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


def test_chat_starts_onboarding(client):
    created = client.post("/builder/projects", json={"projectName": "Chat Co"}).json()
    pid = created["projectId"]
    r = client.post(
        f"/builder/projects/{pid}/chat",
        json={"message": "Create a website for my company"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["assistantMessage"]
    assert body["readyToGenerate"] is False

    history = client.get(f"/builder/projects/{pid}/chat")
    assert history.status_code == 200
    assert len(history.json()["turns"]) >= 2
