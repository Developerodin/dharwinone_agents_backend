"""Builder API tests for selection, working html, edits, versions."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app
from studio.tests._auth_support import auth_headers
from studio.repositories import profiles_repo
from studio.services import edit_service, personalization_service


@pytest.fixture
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
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


def test_edit_hero_uses_section_scope(client, memory_db, monkeypatch):
    from studio import draft

    def fake_refine_section(provider, model, section_html, section_type, user_prompt, **kwargs):
        assert section_type == "hero"
        assert kwargs.get("style_reference_html")
        return "<h1>API Hero</h1>"

    monkeypatch.setattr(draft, "refine_section", fake_refine_section)
    monkeypatch.setattr(
        edit_service,
        "_load_edit_provider",
        lambda: (object(), "fake-model"),
    )
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    client.put(
        f"/builder/projects/{pid}/working-html",
        json={
            "html": (
                '<!DOCTYPE html><html><body>'
                '<header data-section="hero" class="c-x hero"><h1>Old</h1></header>'
                "</body></html>"
            )
        },
    )
    edit = client.post(
        f"/builder/projects/{pid}/edit",
        json={"prompt": "change hero headline to API Hero"},
    )
    assert edit.status_code == 200
    assert "API Hero" in edit.json()["html"]


def test_edit_uses_llm_for_general_prompt(client, memory_db, monkeypatch):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")

    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            return "<!DOCTYPE html><html><body><h1>Premium Cafe Experience</h1></body></html>"

    monkeypatch.setattr(
        edit_service,
        "_load_edit_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    edit = client.post(
        f"/builder/projects/{pid}/edit",
        json={"prompt": "make the hero copy feel more premium"},
    )
    assert edit.status_code == 200
    assert "Premium Cafe Experience" in edit.json()["html"]


def test_edit_returns_422_when_llm_unavailable_for_general_prompt(client, memory_db, monkeypatch):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    monkeypatch.setattr(edit_service, "_load_edit_provider", lambda: (None, None))
    edit = client.post(
        f"/builder/projects/{pid}/edit",
        json={"prompt": "add a premium hero section"},
    )
    assert edit.status_code == 422
    assert "could not apply edit" in edit.json()["detail"]


def test_edit_requires_clarification_for_ambiguous_prompt(client, memory_db):
    pid, tid = _ready_with_templates(client)
    client.post(f"/builder/projects/{pid}/templates/{tid}/select")
    edit = client.post(
        f"/builder/projects/{pid}/edit",
        json={"prompt": "change this in site to match our brand"},
    )
    assert edit.status_code == 422
    assert "Tell me exactly what to change" in edit.json()["detail"]


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
