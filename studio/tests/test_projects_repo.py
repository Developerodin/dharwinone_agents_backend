"""Builder project repository tests."""

import pytest
from studio import config, db
from studio.models import Project
from studio.repositories import projects_repo


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def test_create_list_get():
    created = projects_repo.create("Dharwin One", initial_prompt="Build a site")
    assert created["projectId"] == "dharwin-one"
    assert created["status"] == "onboarding"
    assert created["initialPrompt"] == "Build a site"

    listed = projects_repo.list_all()
    assert len(listed) == 1
    assert listed[0]["projectId"] == "dharwin-one"

    fetched = projects_repo.get("dharwin-one")
    assert fetched["projectName"] == "Dharwin One"


def test_create_slug_collision():
    first = projects_repo.create("My Site")
    second = projects_repo.create("My Site")
    assert first["projectId"] == "my-site"
    assert second["projectId"] == "my-site-2"


def test_get_missing_returns_none():
    assert projects_repo.get("missing") is None


def test_list_all_sorts_by_created_at_desc():
    with db.session() as s:
        s.add(
            Project(
                projectId="older",
                projectName="Old",
                status="onboarding",
                createdAt=1,
                updatedAt=1,
            )
        )
        s.add(
            Project(
                projectId="newer",
                projectName="New",
                status="onboarding",
                createdAt=2,
                updatedAt=2,
            )
        )
        s.commit()

    listed = projects_repo.list_all()
    assert [row["projectId"] for row in listed] == ["newer", "older"]


def test_public_docs_strip_internal_id():
    created = projects_repo.create("Public Doc Test")
    assert "id" not in created

    listed = projects_repo.list_all()
    assert listed
    assert "id" not in listed[0]

    fetched = projects_repo.get(created["projectId"])
    assert fetched is not None
    assert "id" not in fetched
