"""Publish and releases API tests."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app
from studio.repositories import profiles_repo


@pytest.fixture
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    monkeypatch.setenv("STUDIO_ONBOARDING_LLM", "false")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def client():
    return TestClient(create_app())


def _ready_selected_template(client):
    created = client.post(
        "/builder/projects",
        json={"projectName": "Publish Test", "initialPrompt": "Coffee shop site"},
    )
    project_id = created.json()["projectId"]
    profiles_repo.save(
        {
            "projectId": project_id,
            "brand": {"brandName": "Publish Cafe"},
            "business": {
                "type": "Cafe",
                "services": ["Espresso", "Pastries"],
                "targetAudience": "Morning commuters",
            },
            "contact": {"email": "hi@publish.com", "phone": "555-9000"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    generated = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert generated.status_code == 200
    template_id = generated.json()["templates"][0]["templateId"]
    selected = client.post(f"/builder/projects/{project_id}/templates/{template_id}/select")
    assert selected.status_code == 200
    return project_id


def test_publish_and_releases_strip_internal_id(client, memory_db):
    project_id = _ready_selected_template(client)
    publish = client.post(f"/builder/projects/{project_id}/publish", json={})
    assert publish.status_code == 200
    release = publish.json()
    assert release["releaseId"]
    assert "_id" not in release

    releases = client.get(f"/builder/projects/{project_id}/releases")
    assert releases.status_code == 200
    items = releases.json()
    assert items
    assert items[0]["releaseId"] == release["releaseId"]
    assert "_id" not in items[0]
