"""Builder API tests for selection, working html, edits, versions."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app
from studio.repositories import profiles_repo
from studio.services import personalization_service


@pytest.fixture
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def client():
    return TestClient(create_app())


def _ready_with_templates(client):
    created = client.post(
        "/builder/projects",
        json={"projectName": "Edit Co", "initialPrompt": "Coffee shop"},
    )
    pid = created.json()["projectId"]
    profiles_repo.save(
        {
            "projectId": pid,
            "brand": {"brandName": "Edit Cafe"},
            "business": {
                "type": "Cafe",
                "services": ["Espresso"],
                "targetAudience": "Locals",
            },
            "contact": {"email": "hi@cafe.com", "phone": "555-1111"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    templates = personalization_service.generate_for_project(pid)
    return pid, templates[0]["templateId"]


def test_select_get_put_working_html(client, memory_db):
    pid, tid = _ready_with_templates(client)
    sel = client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    assert sel.status_code == 200
    assert sel.json()["html"]

    got = client.get(f"/builder/projects/{pid}/working-html")
    assert got.status_code == 200
    assert "Edit Cafe" in got.json()["html"]

    updated = client.put(
        f"/builder/projects/{pid}/working-html",
        json={"html": "<!DOCTYPE html><html><body><h1>Manual</h1></body></html>"},
    )
    assert updated.status_code == 200


def test_edit_and_history(client, memory_db):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    edit = client.post(
        f"/builder/projects/{pid}/edit",
        json={"prompt": "change tagline to Fresh every morning"},
    )
    assert edit.status_code == 200
    assert "Fresh every morning" in edit.json()["html"]

    edits = client.get(f"/builder/projects/{pid}/edits")
    assert edits.status_code == 200
    assert len(edits.json()) >= 1


def test_versions_restore(client, memory_db):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    client.put(
        f"/builder/projects/{pid}/working-html",
        json={"html": "<!DOCTYPE html><html><body><h1>Version A</h1></body></html>"},
    )
    versions_after_a = client.get(f"/builder/projects/{pid}/versions").json()
    version_a_id = versions_after_a[0]["versionId"]
    client.put(
        f"/builder/projects/{pid}/working-html",
        json={"html": "<!DOCTYPE html><html><body><h1>Version B</h1></body></html>"},
    )
    restore = client.post(
        f"/builder/projects/{pid}/versions/restore",
        json={"versionId": version_a_id},
    )
    assert restore.status_code == 200
    got = client.get(f"/builder/projects/{pid}/working-html")
    assert "Version A" in got.json()["html"]


def test_context_hydration(client, memory_db):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    ctx = client.get(f"/builder/projects/{pid}/context")
    assert ctx.status_code == 200
    body = ctx.json()
    assert body["project"]["projectId"] == pid
    assert body["workingHtml"]
    assert body["templates"]
