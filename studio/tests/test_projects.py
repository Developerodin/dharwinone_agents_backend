import os
import subprocess

import pytest
from fastapi.testclient import TestClient
from studio import config, projects
from studio.app import create_app
from studio.tests._auth_support import auth_headers


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    config.reset_for_tests()
    yield tmp_path
    config.reset_for_tests()


@pytest.fixture
def git_repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=root, check=True)
    (root / "README.md").write_text("hi")
    subprocess.run(["git", "add", "."], cwd=root, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True
    )
    return str(root)


def test_create_persisted_and_reload(data_dir, git_repo):
    p = projects.create({"name": "My App", "repo_root": git_repo})
    assert p["id"] == "my-app"
    assert projects.get("my-app")["name"] == "My App"
    all_p = projects.load_all()
    assert len(all_p) == 1 and all_p[0]["id"] == "my-app"


def test_create_missing_git_returns_422(data_dir, tmp_path):
    bad = str(tmp_path / "not-git")
    os.makedirs(bad)
    with pytest.raises(projects.ProjectError) as exc:
        projects.create({"name": "Bad", "repo_root": bad})
    assert "git" in str(exc.value).lower()


def test_derive_harness_cfg_paths_isolated(data_dir, git_repo):
    p = projects.create({"name": "Iso", "repo_root": git_repo})
    c1 = projects.derive_harness_cfg(p, "run-a")
    c2 = projects.derive_harness_cfg(p, "run-b")
    assert c1["journal_path"] != c2["journal_path"]
    assert c1["packets_dir"] != c2["packets_dir"]
    assert c1["report_path"] != c2["report_path"]
    assert c1["journal_path"] not in {
        c2["journal_path"],
        c2["packets_dir"],
        c2["report_path"],
    }
    assert c1["worktree_root"] == c2["worktree_root"]
    assert c1["stats_path"] == c2["stats_path"]
    assert c1["repo_root"] == git_repo
    assert "models" in c1 and "limits" in c1


def test_api_get_post_projects(data_dir, git_repo):
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    r = client.post("/projects", json={"name": "Api Proj", "repo_root": git_repo})
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "api-proj"
    r2 = client.get("/projects")
    assert r2.status_code == 200
    assert len(r2.json()) == 1


def test_api_post_non_git_422(data_dir, tmp_path):
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    bad = str(tmp_path / "nope")
    os.makedirs(bad)
    r = client.post("/projects", json={"name": "X", "repo_root": bad})
    assert r.status_code == 422
