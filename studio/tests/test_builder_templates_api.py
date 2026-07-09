"""Template generation API tests."""

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
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def client():
    return TestClient(create_app())


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
