"""Asset service + S3 presign tests."""

import pytest
from studio import config, db
from studio.repositories import projects_repo
from studio.services import asset_service
from studio.storage import s3


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


def test_confirm_and_list_include_public_url_when_cdn_configured(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    config.reset_for_tests()
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    presign = asset_service.create_presign(
        project["projectId"],
        filename="logo.png",
        content_type="image/png",
        asset_type="logo",
    )
    asset = asset_service.confirm_upload(
        project["projectId"],
        asset_id=presign["assetId"],
        s3_key=presign["s3Key"],
        content_type="image/png",
        size_bytes=1200,
    )
    assert asset["publicUrl"] == f"https://cdn.dharwinone.com/{presign['s3Key']}"
    listed = asset_service.list_assets(project["projectId"])
    assert listed[0]["publicUrl"] == asset["publicUrl"]


def test_presign_rejects_invalid_asset_type():
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    with pytest.raises(asset_service.AssetValidationError):
        asset_service.create_presign(
            project["projectId"],
            filename="x.png",
            content_type="image/png",
            asset_type="invalid",
        )


def test_presign_uses_real_s3_client_when_mock_disabled(monkeypatch):
    project = projects_repo.create("Upload Co", initial_prompt="Site")
    monkeypatch.setenv("STUDIO_S3_MOCK", "false")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    config.reset_for_tests()
    calls = {}

    class FakeS3Client:
        def generate_presigned_url(
            self, method, Params=None, ExpiresIn=None, HttpMethod=None
        ):
            calls["method"] = method
            calls["params"] = Params
            calls["expires"] = ExpiresIn
            calls["http_method"] = HttpMethod
            return "https://uploads.example.com/presigned-put"

    monkeypatch.setattr(s3, "_s3_client", lambda: FakeS3Client())
    presign = asset_service.create_presign(
        project["projectId"],
        filename="logo.png",
        content_type="image/png",
        asset_type="logo",
    )
    assert presign["uploadUrl"] == "https://uploads.example.com/presigned-put"
    assert presign["method"] == "PUT"
    assert calls["method"] == "put_object"
    assert calls["params"]["Bucket"] == "dharwin-studio-dev"
    assert calls["params"]["ContentType"] == "image/png"
    assert calls["params"]["Key"].startswith(f"projects/{project['projectId']}/assets/")
