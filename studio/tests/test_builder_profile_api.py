"""Business profile API + generation gate tests."""

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


def _create_project(client):
    r = client.post(
        "/builder/projects",
        json={"projectName": "Gate Test", "initialPrompt": "Build site"},
    )
    assert r.status_code == 201
    return r.json()["projectId"]


def test_get_business_profile_returns_completeness(client, memory_db):
    project_id = _create_project(client)
    r = client.get(f"/builder/projects/{project_id}/business-profile")
    assert r.status_code == 200
    body = r.json()
    assert body["projectId"] == project_id
    assert body["completeness"]["percent"] == 0
    assert body["gate"]["ready"] is False


def test_put_business_profile_patches_fields(client, memory_db):
    project_id = _create_project(client)
    r = client.put(
        f"/builder/projects/{project_id}/business-profile",
        json={
            "brand": {"brandName": "Gate Test Co"},
            "business": {
                "type": "Retail",
                "services": ["Shoes"],
                "targetAudience": "Runners",
            },
            "contact": {"email": "shop@example.com", "phone": "555-123-4567"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["brand"]["brandName"] == "Gate Test Co"
    assert body["gate"]["ready"] is True


def test_put_business_profile_persists_design_preferences(client, memory_db):
    project_id = _create_project(client)
    r = client.put(
        f"/builder/projects/{project_id}/business-profile",
        json={"design": {"stylePreference": "minimal and sleek"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["design"]["stylePreference"] == "minimal and sleek"


def test_put_business_profile_rejects_invalid_email(client, memory_db):
    project_id = _create_project(client)
    r = client.put(
        f"/builder/projects/{project_id}/business-profile",
        json={"contact": {"email": "bad"}},
    )
    assert r.status_code == 422


def test_generate_templates_blocked_until_gate_passes(client, memory_db):
    project_id = _create_project(client)
    blocked = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert blocked.status_code == 422
    detail = blocked.json()["detail"]
    assert detail["code"] == "profile_incomplete"
    assert detail["missingFields"]

    profiles_repo.save(
        {
            "projectId": project_id,
            "brand": {"brandName": "Gate Test Co"},
            "business": {
                "type": "Retail",
                "services": ["Shoes"],
                "targetAudience": "Runners",
            },
            "contact": {"email": "shop@example.com", "phone": "555-123-4567"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    allowed = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["status"] == "ready"
    assert len(body["templates"]) >= 3
