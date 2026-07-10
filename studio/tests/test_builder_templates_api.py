"""Template generation API tests."""

import time

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app
from studio.tests._auth_support import auth_headers
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
    c = TestClient(create_app())
    c.headers.update(auth_headers())
    return c


def _ready_project(client):
    created = client.post(
        "/builder/projects",
        json={"projectName": "Gallery Test", "initialPrompt": "Coffee shop site"},
    )
    project_id = created.json()["projectId"]
    profiles_repo.save(
        {
            "projectId": project_id,
            "brand": {"brandName": "Gallery Cafe"},
            "business": {
                "type": "Cafe",
                "services": ["Espresso", "Pastries"],
                "targetAudience": "Morning commuters",
            },
            "contact": {"email": "hi@gallery.com", "phone": "555-0000"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    return project_id


def test_generate_and_list_templates(client, memory_db):
    project_id = _ready_project(client)
    gen = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert gen.status_code == 200
    body = gen.json()
    assert body["templates"]
    assert body["templates"][0]["templateId"]
    assert "_id" not in body["templates"][0]
    assert "{{" not in body["templates"][0]["htmlContent"]

    listed = client.get(f"/builder/projects/{project_id}/templates")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == len(body["templates"])
    assert "_id" not in items[0]
    assert items[0]["label"]


def test_generate_templates_respects_force(client, memory_db):
    project_id = _ready_project(client)
    first = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert first.status_code == 200
    first_generated_at = first.json()["templates"][0]["generatedAt"]

    second = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert second.status_code == 200
    second_generated_at = second.json()["templates"][0]["generatedAt"]
    assert second_generated_at == first_generated_at

    time.sleep(0.01)
    forced = client.post(f"/builder/projects/{project_id}/generate-templates?force=true")
    assert forced.status_code == 200
    forced_generated_at = forced.json()["templates"][0]["generatedAt"]
    assert forced_generated_at > second_generated_at
