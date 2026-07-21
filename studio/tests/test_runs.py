import os
import subprocess
import time

import pytest
from fastapi.testclient import TestClient
from studio import config, projects, runs
from studio.app import create_app
from studio.tests._auth_support import auth_headers

FAKE_WORKER = os.path.join(os.path.dirname(__file__), "fake_worker.py")


@pytest.fixture
def renv(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    monkeypatch.setenv("STUDIO_FAKE_WORKER", FAKE_WORKER)
    monkeypatch.setenv("STUDIO_MONITOR_INTERVAL", "0.5")
    monkeypatch.setenv("STUDIO_HEARTBEAT_STALE_SEC", "1")
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
    project = projects.create({"name": "Runs", "repo_root": str(repo)})
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    yield client, project
    config.reset_for_tests()


def _taskkill(pid):
    if pid:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)


def test_start_returns_201_with_pid(renv):
    client, project = renv
    r = client.post(
        f"/projects/{project['id']}/runs",
        json={
            "prompt": "do thing",
            "lane": "feature",
        },
    )
    assert r.status_code == 201
    run_id = r.json()["run_id"]
    run = client.get(f"/runs/{run_id}").json()
    assert run["pid"] is not None
    _taskkill(run["pid"])


def test_build_lane_gets_build_category_and_whole_repo_scope(renv):
    client, project = renv
    r = client.post(
        f"/projects/{project['id']}/runs",
        json={
            "prompt": "create a website for sports shoes",
            "lane": "build",
        },
    )
    assert r.status_code == 201
    run = client.get(f"/runs/{r.json()['run_id']}").json()
    assert run["lane"] == "build"
    assert run["task"]["category"] == "build"
    assert run["task"]["allow_paths"] == [""]
    _taskkill(run["pid"])


def test_concurrent_start_423(renv, monkeypatch):
    client, project = renv
    monkeypatch.setenv("STUDIO_FAKE_WORKER_MODE", "heartbeat_only")
    r1 = client.post(f"/projects/{project['id']}/runs", json={"prompt": "a"})
    assert r1.status_code == 201
    r2 = client.post(f"/projects/{project['id']}/runs", json={"prompt": "b"})
    assert r2.status_code == 423
    run = client.get(f"/runs/{r1.json()['run_id']}").json()
    _taskkill(run["pid"])


def test_force_start_kills_active_run(renv, monkeypatch):
    client, project = renv
    monkeypatch.setenv("STUDIO_FAKE_WORKER_MODE", "heartbeat_only")
    r1 = client.post(f"/projects/{project['id']}/runs", json={"prompt": "a"})
    assert r1.status_code == 201
    r2 = client.post(
        f"/projects/{project['id']}/runs", json={"prompt": "b", "force": True}
    )
    assert r2.status_code == 201
    old = client.get(f"/runs/{r1.json()['run_id']}").json()
    assert old["state"] == "killed"
    new = client.get(f"/runs/{r2.json()['run_id']}").json()
    _taskkill(new["pid"])


def test_kill_sets_killed(renv, monkeypatch):
    client, project = renv
    monkeypatch.setenv("STUDIO_FAKE_WORKER_MODE", "heartbeat_only")
    r = client.post(f"/projects/{project['id']}/runs", json={"prompt": "killme"})
    run_id = r.json()["run_id"]
    kr = client.post(f"/runs/{run_id}/kill")
    assert kr.status_code == 200
    assert kr.json()["state"] == "killed"


def test_silent_death_becomes_failed(renv, monkeypatch):
    client, project = renv
    monkeypatch.setenv("STUDIO_FAKE_WORKER_MODE", "silent_death")
    r = client.post(f"/projects/{project['id']}/runs", json={"prompt": "die"})
    run_id = r.json()["run_id"]
    deadline = time.time() + 10
    state = "running"
    while time.time() < deadline:
        runs.monitor_once()
        state = client.get(f"/runs/{run_id}").json()["state"]
        if state == "failed":
            break
        time.sleep(0.3)
    assert state == "failed"


def test_terminal_event_syncs_state(renv, monkeypatch):
    client, project = renv
    monkeypatch.setenv("STUDIO_FAKE_WORKER_MODE", "terminal_shipped")
    r = client.post(f"/projects/{project['id']}/runs", json={"prompt": "ship"})
    run_id = r.json()["run_id"]
    deadline = time.time() + 8
    state = "running"
    while time.time() < deadline:
        runs.monitor_once()
        state = client.get(f"/runs/{run_id}").json()["state"]
        if state == "shipped":
            break
        time.sleep(0.3)
    assert state == "shipped"
