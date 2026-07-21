"""Asset repository tests."""

import pytest
from studio import config, db
from studio.repositories import assets_repo, projects_repo


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_DATABASE_URL", "memory://")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def test_create_and_list_assets():
    project = projects_repo.create("Asset Co", initial_prompt="Logo")
    asset = assets_repo.create_pending(
        project["projectId"],
        asset_id="asset-1",
        asset_type="logo",
        s3_key="projects/asset-co/assets/asset-1/logo.png",
        filename="logo.png",
        content_type="image/png",
    )
    assert asset["status"] == "pending"
    assets_repo.confirm(
        project["projectId"],
        "asset-1",
        size_bytes=1024,
        width=200,
        height=80,
    )
    items = assets_repo.list_for_project(project["projectId"])
    assert len(items) == 1
    assert items[0]["status"] == "ready"
    assert items[0]["sizeBytes"] == 1024
