"""Asset service + S3 presign tests."""

import pytest
from studio import config, db
from studio.repositories import projects_repo
from studio.services import asset_service


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


def test_presign_returns_upload_contract():
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    presign = asset_service.create_presign(
        project["projectId"],
        filename="logo.png",
        content_type="image/png",
        asset_type="logo",
    )
    assert presign["assetId"]
    assert presign["uploadUrl"].startswith("mock+s3://")
    assert presign["s3Key"].startswith(f"projects/{project['projectId']}/assets/")
    assert presign["headers"]["Content-Type"] == "image/png"


def test_confirm_lists_asset_metadata():
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    presign = asset_service.create_presign(
        project["projectId"],
        filename="hero.jpg",
        content_type="image/jpeg",
        asset_type="brand",
    )
    asset = asset_service.confirm_upload(
        project["projectId"],
        asset_id=presign["assetId"],
        s3_key=presign["s3Key"],
        content_type="image/jpeg",
        size_bytes=4096,
    )
    assert asset["status"] == "ready"
    listed = asset_service.list_assets(project["projectId"])
    assert len(listed) == 1
    assert listed[0]["assetType"] == "brand"


def test_presign_rejects_invalid_asset_type():
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    with pytest.raises(asset_service.AssetValidationError):
        asset_service.create_presign(
            project["projectId"],
            filename="x.png",
            content_type="image/png",
            asset_type="invalid",
        )
