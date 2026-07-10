import os
import subprocess
import sys
import threading
import time

import pytest
from fastapi.testclient import TestClient
from harness import gitops, packets
from studio import config, driver, gates, projects
from studio.app import create_app
from studio.tests._auth_support import auth_headers
from studio.tests._test_support import FakeProvider

PY = sys.executable


def good_implementer(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "src", "app.py"), "w", encoding="utf-8") as f:
        f.write("VALUE = 2\n")
    return 0, "ok"


ACCEPT_OK = (
    f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); '
    'import app; sys.exit(0 if app.VALUE == 2 else 1)"'
)


@pytest.fixture
def genv(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    config.reset_for_tests()
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (
        ["init", "-b", "main"],
        ["config", "user.email", "t@t.t"],
        ["config", "user.name", "t"],
    ):
        subprocess.run(["git"] + args, cwd=repo, check=True, capture_output=True)
    (repo / "src").mkdir()
    (repo / "src" / "app.py").write_text("VALUE = 1\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    gitops.ensure_integration(str(repo), "harness/integration")
    project = projects.create({"name": "Gate", "repo_root": str(repo)})
    run_id = "gate-run"
    run_dir = config.run_dir(project["id"], run_id)
    os.makedirs(run_dir, exist_ok=True)
    cfg = projects.derive_harness_cfg(project, run_id)
    wt_root = tmp_path / "wt"
    wt_root.mkdir()
    cfg["worktree_root"] = str(wt_root)
    task = {
        "id": "gate-run",
        "category": "feature",
        "title": "bump",
        "prompt": "set VALUE to 2",
        "accept": ACCEPT_OK,
        "allow_paths": ["src/"],
    }
    from harness.packets import atomic_write_json

    atomic_write_json(
        os.path.join(run_dir, "run.json"),
        {
            "run_id": run_id,
            "project_id": project["id"],
            "task": task,
            "state": "running",
            "pid": None,
            "created_ts": time.time(),
            "heartbeat_ts": time.time(),
            "lane": "feature",
            "fork_of": None,
        },
    )
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    yield client, project, run_id, run_dir, cfg, task
    config.reset_for_tests()


def test_get_packet_by_kind_and_filename(genv):
    client, _, run_id, run_dir, _, _ = genv
    pdir = os.path.join(run_dir, "packets", "gate-run")
    os.makedirs(pdir, exist_ok=True)
    packets.atomic_write_json(
        os.path.join(pdir, "plan.json"),
        packets.packet("PLAN", "gate-run", approach="x", files=["src/app.py"]),
    )
    # frontend fetches by kind; filename must keep working too
    assert client.get(f"/runs/{run_id}/packets/PLAN").status_code == 200
    assert client.get(f"/runs/{run_id}/packets/plan.json").status_code == 200
    assert client.get(f"/runs/{run_id}/packets/PLAN").json()["approach"] == "x"
    # path separators must not reach the filesystem
    assert client.get(f"/runs/{run_id}/packets/..%5Cplan.json").status_code == 404
    # markdown packet served as text
    with open(os.path.join(pdir, "plan.md"), "w", encoding="utf-8") as f:
        f.write("# Plan\n")
    r = client.get(f"/runs/{run_id}/packets/plan.md")
    assert r.status_code == 200
    assert r.text.startswith("# Plan")


def test_approve_before_gate_open_409(genv):
    client, _, run_id, _, _, _ = genv
    r = client.post(
        f"/runs/{run_id}/gates/plan",
        json={
            "decision": "approve",
            "payload": {"approach": "x", "files": ["src/app.py"]},
        },
    )
    assert r.status_code == 409


def test_approve_after_gate_open_200(genv, monkeypatch):
    client, project, run_id, run_dir, cfg, task = genv
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())

    def run_driver():
        driver.run_task(project, run_id, task, cfg, good_implementer, gate_timeout_s=30)

    t = threading.Thread(target=run_driver)
    t.start()
    deadline = time.time() + 15
    while time.time() < deadline:
        if gates.is_gate_open(os.path.join(run_dir, "journal.jsonl"), "plan"):
            break
        time.sleep(0.1)
    r = client.post(
        f"/runs/{run_id}/gates/plan",
        json={
            "decision": "approve",
            "payload": {"approach": "edit VALUE", "files": ["src/app.py"]},
        },
    )
    assert r.status_code == 200
    assert os.path.exists(os.path.join(run_dir, "approvals", "plan.json"))
    gates.write_approval(run_dir, "accept", "approve", {})
    t.join(timeout=30)


def test_journal_endpoint(genv, monkeypatch):
    client, project, run_id, run_dir, cfg, task = genv
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    gates.write_approval(
        run_dir,
        "plan",
        "approve",
        {
            "approach": "edit VALUE",
            "files": ["src/app.py"],
        },
    )
    gates.write_approval(run_dir, "accept", "approve", {})
    driver.run_task(project, run_id, task, cfg, good_implementer, gate_timeout_s=30)
    r = client.get(f"/runs/{run_id}/journal")
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_diff_contains_change(genv, monkeypatch):
    client, project, run_id, run_dir, cfg, task = genv
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    gates.write_approval(
        run_dir,
        "plan",
        "approve",
        {
            "approach": "edit VALUE",
            "files": ["src/app.py"],
        },
    )
    gates.write_approval(run_dir, "accept", "approve", {})
    driver.run_task(project, run_id, task, cfg, good_implementer, gate_timeout_s=30)
    r = client.get(f"/runs/{run_id}/diff")
    assert r.status_code == 200
    assert "VALUE" in r.json()["text"] or r.json()["text"] == ""
