"""Personalization engine tests."""

import re

import pytest
from studio import config, db
from studio.repositories import profiles_repo, projects_repo, templates_repo
from studio.services import personalization_service


@pytest.fixture(autouse=True)
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


def _seed_ready_project():
    project = projects_repo.create(
        "Dharwin One",
        initial_prompt="Build a website for HR software",
    )
    profiles_repo.save(
        {
            "projectId": project["projectId"],
            "brand": {"brandName": "Dharwin One"},
            "business": {
                "type": "SaaS",
                "services": ["HRMS", "ATS"],
                "description": "HR software for growing teams",
                "targetAudience": "HR teams",
            },
            "contact": {"email": "hello@dharwin.com", "phone": "+1 555 0100"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    return project


def test_personalize_html_has_no_unresolved_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Acme"},
        "business": {
            "type": "Retail",
            "services": ["Shoes", "Bags"],
            "description": "Premium footwear",
        },
        "contact": {"email": "shop@acme.com", "phone": "555-1234"},
        "location": {"city": "Austin"},
    }
    from studio import draft

    raw = open(
        f"{draft.TEMPLATES_DIR}/generic.html",
        encoding="utf-8",
    ).read()
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert "{{" not in html
    assert "Acme" in html
    assert "shop@acme.com" in html


def test_generate_persists_templates_with_s3_keys():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    assert len(result) >= 3
    stored = templates_repo.list_for_project(project["projectId"])
    assert len(stored) == len(result)
    assert all(t["s3HtmlKey"].startswith(f"projects/{project['projectId']}/templates/") for t in stored)
    assert all("{{" not in t["htmlContent"] for t in stored)
    assert re.search(r"Dharwin One", stored[0]["htmlContent"])


def test_generate_picks_genre_from_profile_and_prompt():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    assert result[0]["style"] in {"saas", "generic"}


def test_generate_rewrites_template_copy_via_llm(monkeypatch):
    from studio.services import onboarding_service

    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            return (
                "<!DOCTYPE html><html><head><title>x</title></head>"
                "<body><h1>HR software that hires for you.</h1></body></html>"
            )

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    assert "HR software that hires for you." in result[0]["htmlContent"]


def test_generate_uses_style_preference_for_pack_selection():
    project = _seed_ready_project()
    profile = profiles_repo.get(project["projectId"])
    profile.setdefault("design", {})["stylePreference"] = "Ocean calm style with teal accents"
    profiles_repo.save(profile)
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    pack_ids = [t["templateId"] for t in result if "-" in t["templateId"]]
    assert any(pid.endswith("ocean-calm") for pid in pack_ids)


def test_personalize_html_replaces_tel_and_email_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Hurcules"},
        "business": {"type": "Fitness app"},
        "contact": {"email": "team@hurcules.app", "phone": "+1 555 0100"},
        "location": {"city": "Austin"},
    }
    raw = (
        "<!DOCTYPE html><html><body>"
        '<a href="tel:+910000000000">Call 000 000 0000</a>'
        '<a href="mailto:hello@yourdomain.com">hello@yourdomain.com</a>'
        "</body></html>"
    )
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert "team@hurcules.app" in html
    assert "mailto:team@hurcules.app" in html
    assert "tel:+15550100" in html
    assert "000 000 0000" not in html


def test_personalize_html_injects_contact_section_when_missing():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Hurcules"},
        "business": {"type": "Fitness app"},
        "contact": {"email": "team@hurcules.app", "phone": "+1 555 0100"},
        "location": {"city": "Austin"},
    }
    raw = "<!DOCTYPE html><html><body><h1>Hero</h1></body></html>"
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert 'id="contact"' in html
    assert "team@hurcules.app" in html
    assert "+1 555 0100" in html


def test_personalize_html_replaces_existing_template_contact_literals():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Jotei"},
        "business": {"type": "Portfolio"},
        "contact": {"email": "jotei@gmail.com", "phone": "+1 568646846"},
        "location": {"city": "New York"},
    }
    raw = (
        "<!DOCTYPE html><html><body>"
        '<a href="#">studio@jotei.pt</a>'
        '<a href="#">+1 555 022 7180</a>'
        "</body></html>"
    )
    html = personalization_service.personalize_html(raw, profile, [], "portfolio")
    assert "studio@jotei.pt" not in html
    assert "+1 555 022 7180" not in html
    assert "jotei@gmail.com" in html
    assert "+1 568646846" in html


def test_personalize_html_uses_brand_based_contact_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Jotei Studio"},
        "business": {"type": "Portfolio"},
        "contact": {},
        "location": {"city": "New York"},
    }
    raw = "<!DOCTYPE html><html><body><h1>Hero</h1></body></html>"
    html = personalization_service.personalize_html(raw, profile, [], "portfolio")
    assert "hello@jotei-studio.site" in html
    assert "Add your phone number" in html
