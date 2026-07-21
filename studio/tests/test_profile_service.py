"""Business profile gate evaluator tests."""

import pytest
from studio import config, db
from studio.repositories import profiles_repo, projects_repo
from studio.services import profile_service


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def _complete_profile(project_id):
    return {
        "projectId": project_id,
        "brand": {"brandName": "Dharwin One", "businessName": None, "tagline": None},
        "business": {
            "type": "SaaS",
            "services": ["HRMS", "ATS"],
            "description": "HR software",
            "targetAudience": "HR teams",
        },
        "location": {"country": "India", "state": None, "city": "Jaipur", "address": None},
        "contact": {
            "email": "hello@dharwin.com",
            "phone": "+1 555 0100",
            "website": None,
            "socialLinks": [],
        },
        "completeness": {"percent": 100, "missingFields": []},
        "updatedAt": 0,
    }


def test_gate_blocks_incomplete_profile():
    profile = _complete_profile("p1")
    profile["brand"]["brandName"] = None
    gate = profile_service.evaluate_generation_gate(profile)
    assert gate["ready"] is False
    assert "brand name" in gate["missingFields"]


def test_gate_passes_complete_profile():
    profile = _complete_profile("p1")
    gate = profile_service.evaluate_generation_gate(profile)
    assert gate["ready"] is True
    assert gate["missingFields"] == []
    assert gate["percent"] == 100


def test_gate_requires_at_least_one_service():
    profile = _complete_profile("p1")
    profile["business"]["services"] = []
    gate = profile_service.evaluate_generation_gate(profile)
    assert gate["ready"] is False
    assert "at least one service" in gate["missingFields"]


def test_update_profile_merges_and_recomputes_completeness():
    project = projects_repo.create("Acme", initial_prompt="Build site")
    updated = profile_service.update_profile(
        project["projectId"],
        {"brand": {"brandName": "Acme Corp"}, "contact": {"email": "a@acme.com"}},
    )
    assert updated["brand"]["brandName"] == "Acme Corp"
    assert updated["contact"]["email"] == "a@acme.com"
    assert updated["completeness"]["percent"] > 0
    assert "brand name" not in updated["completeness"]["missingFields"]


def test_update_profile_rejects_invalid_email():
    project = projects_repo.create("Acme", initial_prompt="Build site")
    with pytest.raises(profile_service.ProfileValidationError) as exc:
        profile_service.update_profile(
            project["projectId"],
            {"contact": {"email": "not-an-email"}},
        )
    assert "email" in str(exc.value).lower()


def test_get_profile_returns_empty_shell_for_new_project():
    project = projects_repo.create("Fresh", initial_prompt="Hi")
    profile = profile_service.get_profile(project["projectId"])
    assert profile["projectId"] == project["projectId"]
    assert profile["completeness"]["percent"] == 0
    saved = profiles_repo.get(project["projectId"])
    assert saved["brand"]["brandName"] is None
