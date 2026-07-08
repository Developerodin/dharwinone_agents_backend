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
