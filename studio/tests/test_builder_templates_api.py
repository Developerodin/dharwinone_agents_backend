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
                "description": "Neighborhood cafe with quick coffee and fresh pastries.",
                "targetAudience": "Morning commuters",
            },
            "location": {"country": "India", "city": "Jaipur"},
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


def test_generate_includes_composed_variant(client, memory_db):
    project_id = _ready_project(client)
    gen = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert gen.status_code == 200
    templates = gen.json()["templates"]
    composed = [t for t in templates if t["templateId"].startswith("composed-")]
    assert len(composed) == 1  # STUDIO_COMPOSED_VARIANTS default
    assert "{{" not in composed[0]["htmlContent"]
    assert composed[0]["htmlContent"].lstrip().startswith("<!DOCTYPE html>")
    # sourceTemplateRef records the component ids used
    assert composed[0]["sourceTemplateRef"].count(",") >= 4
    # legacy variants still present alongside
    assert len(templates) > len(composed)


def test_composed_kill_switch(client, memory_db, monkeypatch):
    monkeypatch.setenv("STUDIO_COMPOSED_VARIANTS", "0")
    project_id = _ready_project(client)
    gen = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert gen.status_code == 200
    templates = gen.json()["templates"]
    assert not [t for t in templates if t["templateId"].startswith("composed-")]


def test_generation_completes_within_budget(client, memory_db):
    """End-to-end guard (no-LLM test env): catches egregious latency regressions
    from the composed path. Real p95 tracking stays in production logs."""
    project_id = _ready_project(client)
    t0 = time.perf_counter()
    gen = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert gen.status_code == 200
    assert time.perf_counter() - t0 < 10.0


def test_composition_failure_never_blocks_generation(client, memory_db, monkeypatch):
    from studio.services import composition_service

    def boom(*args, **kwargs):
        raise RuntimeError("composition exploded")

    monkeypatch.setattr(composition_service, "compose_project_variants", boom)
    project_id = _ready_project(client)
    gen = client.post(f"/builder/projects/{project_id}/generate-templates")
    assert gen.status_code == 200
    assert gen.json()["templates"]  # legacy variants intact
