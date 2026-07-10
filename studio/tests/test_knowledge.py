import subprocess

import pytest
from fastapi.testclient import TestClient
from studio import config, knowledge, projects
from studio.app import create_app
from studio.tests._auth_support import auth_headers


@pytest.fixture
def kenv(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    config.reset_for_tests()
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(
        ["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True
    )
    subprocess.run(["git", "config", "user.email", "t@t.t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "README.md").write_text("hi")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    project = projects.create({"name": "Know", "repo_root": str(repo)})
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    yield client, project
    config.reset_for_tests()


def test_put_invalid_422(kenv):
    client, project = kenv
    r = client.put(
        f"/projects/{project['id']}/knowledge",
        json={
            "stack": "not-a-list",
        },
    )
    assert r.status_code == 422
    assert "stack" in r.json()["detail"]


def test_round_trip(kenv):
    client, project = kenv
    body = {
        "stack": ["Python", "FastAPI"],
        "rules": ["no shell=True"],
        "design_tokens": {"primary": "#000"},
        "deploy_branch": "main",
    }
    r = client.put(f"/projects/{project['id']}/knowledge", json=body)
    assert r.status_code == 200
    r2 = client.get(f"/projects/{project['id']}/knowledge")
    assert r2.json() == body


def test_knowledge_in_implementer_message(kenv, monkeypatch, tmp_path):
    client, project = kenv
    client.put(
        f"/projects/{project['id']}/knowledge",
        json={
            "stack": ["Python"],
            "rules": ["Use type hints"],
        },
    )
    ctx = knowledge.build_prompt_context(project)
    assert "PROJECT KNOWLEDGE" in ctx
    assert "type hints" in ctx
