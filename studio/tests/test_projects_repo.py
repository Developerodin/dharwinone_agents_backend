"""Builder v2 project repository tests."""

import pytest
from studio import config, db
from studio.repositories import projects_repo


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
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


def test_repo_disabled_when_flag_off(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "false")
    config.reset_for_tests()
    db.reset_for_tests()
    with pytest.raises(projects_repo.BuilderV2Disabled):
        projects_repo.create("X")


def test_list_all_uses_cursor_sort_signature(monkeypatch):
    class FakeCursor:
        def __init__(self, docs):
            self._docs = docs

        def sort(self, field, direction):
            reverse = direction == -1
            ordered = sorted(
                self._docs,
                key=lambda d: d.get(field, 0),
                reverse=reverse,
            )
            return FakeCursor(ordered)

        def __iter__(self):
            return iter(self._docs)

    class FakeCollection:
        def find(self, query):
            assert query == {}
            return FakeCursor(
                [
                    {"projectId": "older", "createdAt": 1},
                    {"projectId": "newer", "createdAt": 2},
                ]
            )

    monkeypatch.setattr(projects_repo, "_collection", lambda: FakeCollection())

    listed = projects_repo.list_all()

    assert [row["projectId"] for row in listed] == ["newer", "older"]


def test_public_docs_strip_internal_id(monkeypatch):
    class FakeCollection:
        def __init__(self):
            self.docs = []

        def find_one(self, query):
            pid = query.get("projectId")
            for doc in self.docs:
                if doc.get("projectId") == pid:
                    return doc
            return None

        def insert_one(self, doc):
            doc["_id"] = object()
            self.docs.append(dict(doc))

        def find(self, query):
            assert query == {}
            return [dict(doc) for doc in self.docs]

    fake = FakeCollection()
    monkeypatch.setattr(projects_repo, "_collection", lambda: fake)

    created = projects_repo.create("Public Doc Test")
    assert "_id" not in created

    listed = projects_repo.list_all()
    assert listed
    assert "_id" not in listed[0]

    fetched = projects_repo.get(created["projectId"])
    assert fetched is not None
    assert "_id" not in fetched
