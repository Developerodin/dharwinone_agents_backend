"""Builder asset API tests."""

import pytest
from fastapi.testclient import TestClient
from studio import config, db
from studio.app import create_app


@pytest.fixture
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


@pytest.fixture
def client():
    return TestClient(create_app())


def _project_id(client):
    r = client.post(
        "/builder/projects",
        json={"projectName": "Asset API", "initialPrompt": "Site"},
    )
    return r.json()["projectId"]


def test_presign_confirm_list_flow(client, memory_db):
    project_id = _project_id(client)
    presign = client.post(
        f"/builder/projects/{project_id}/assets/presign",
        json={
            "filename": "logo.png",
            "contentType": "image/png",
            "assetType": "logo",
        },
    )
    assert presign.status_code == 200
    body = presign.json()
    assert body["uploadUrl"]
    assert body["s3Key"]

    confirm = client.post(
        f"/builder/projects/{project_id}/assets/confirm",
        json={
            "assetId": body["assetId"],
            "s3Key": body["s3Key"],
            "contentType": "image/png",
            "sizeBytes": 1200,
        },
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "ready"

    listed = client.get(f"/builder/projects/{project_id}/assets")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["assetType"] == "logo"
