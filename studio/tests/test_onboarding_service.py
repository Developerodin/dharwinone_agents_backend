"""Onboarding service tests."""

import pytest
from studio import config, db
from studio.repositories import conversations_repo, profiles_repo, projects_repo
from studio.services import onboarding_service


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def _project():
    return projects_repo.create("Acme Corp", initial_prompt="Build my site")


def test_first_message_starts_onboarding_not_generation():
    project = _project()
    result = onboarding_service.handle_message(project["projectId"], "Create a website")
    assert result["assistantMessage"]
    assert (
        "website" in result["assistantMessage"].lower()
        or "brand" in result["assistantMessage"].lower()
    )
    assert result["readyToGenerate"] is False
    assert result["completeness"]["percent"] < 100


def test_high_confidence_brand_extraction():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Create a website")
    onboarding_service.handle_message(project["projectId"], "Coffee shop website")
    result = onboarding_service.handle_message(
        project["projectId"], "My company is called Dharwin One"
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["brand"]["brandName"] == "Dharwin One"
    assert result["completeness"]["percent"] > 0


def test_sequential_chat_increases_completeness():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Build a site")
    r1 = onboarding_service.handle_message(project["projectId"], "We are Dharwin One")
    onboarding_service.handle_message(
        project["projectId"], "We sell HRMS and ATS software"
    )
    r3 = onboarding_service.handle_message(
        project["projectId"], "Target audience is HR teams at mid-size companies"
    )
    r4 = onboarding_service.handle_message(
        project["projectId"], "Contact us at hello@dharwin.com"
    )
    assert r4["completeness"]["percent"] >= r3["completeness"]["percent"]
    assert r4["completeness"]["percent"] >= r1["completeness"]["percent"]
    assert "email" not in r4["completeness"]["missingFields"]


def test_conversation_turns_persisted():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Hello")
    onboarding_service.handle_message(project["projectId"], "Dharwin One")
    turns = conversations_repo.list_turns(project["projectId"])
    assert len(turns) >= 4
    assert turns[0]["role"] == "user"


def test_confidence_routing_low_clarifies():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Build site")
    onboarding_service.handle_message(project["projectId"], "maybe tech")
    result = onboarding_service.handle_message(project["projectId"], "stuff")
    assert result["assistantMessage"]
    assert result["readyToGenerate"] is False
