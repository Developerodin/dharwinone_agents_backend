import os
import subprocess
import textwrap

import pytest
from fastapi.testclient import TestClient
from harness import gitops
from studio import config, preview, projects, runs
from studio.app import create_app
from studio.tests._auth_support import auth_headers

PY = __import__("sys").executable


@pytest.fixture
def penv(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    monkeypatch.setenv("STUDIO_PREVIEW_READY_SEC", "5")
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
    (repo / "src" / "app.py").write_text("x=1\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    gitops.ensure_integration(str(repo), "harness/integration")
    server = tmp_path / "stub_server.py"
    server.write_text(
        textwrap.dedent("""
        import os, sys
        from http.server import HTTPServer, BaseHTTPRequestHandler
        port = int(os.environ.get("PORT", "4310"))
        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
            def log_message(self, *a): pass
        HTTPServer(("127.0.0.1", port), H).serve_forever()
    """)
    )
    project = projects.create(
        {
            "name": "Prev",
            "repo_root": str(repo),
            "dev_cmd": f'"{PY}" "{server}"',
            "dev_port_range": [4310, 4312],
        }
    )
    run_id = "prev-1"
    run_dir = config.run_dir(project["id"], run_id)
    os.makedirs(run_dir, exist_ok=True)
    cfg = projects.derive_harness_cfg(project, run_id)
    wt = tmp_path / "wt" / run_id
    wt.mkdir(parents=True)
    (wt / "marker.txt").write_text("wt")
    cfg["worktree_root"] = str(tmp_path / "wt")
    run_data = {
        "run_id": run_id,
        "project_id": project["id"],
        "task": {"id": run_id},
        "state": "running",
        "pid": None,
        "created_ts": 0,
        "heartbeat_ts": 0,
        "lane": "feature",
        "fork_of": None,
        "worktree_root": str(tmp_path / "wt"),
    }
    from harness.packets import atomic_write_json

    atomic_write_json(os.path.join(run_dir, "run.json"), run_data)
    client = TestClient(create_app())
    client.headers.update(auth_headers())
    yield client, project, run_id, run_data
    preview.stop(run_id)
    config.reset_for_tests()


def test_two_runs_distinct_ports(penv, tmp_path, monkeypatch):
    client, project, run_id, run_data = penv
    r1 = client.post(f"/runs/{run_id}/preview")
    assert r1.status_code == 200
    port1 = r1.json()["port"]
    run_id2 = "prev-2"
    wt2 = tmp_path / "wt" / run_id2
    wt2.mkdir(parents=True)
    run_dir2 = config.run_dir(project["id"], run_id2)
    os.makedirs(run_dir2, exist_ok=True)
    from harness.packets import atomic_write_json

    atomic_write_json(
        os.path.join(run_dir2, "run.json"),
        {
            **run_data,
            "run_id": run_id2,
            "task": {"id": run_id2},
            "worktree_root": str(tmp_path / "wt"),
        },
    )
    r2 = client.post(f"/runs/{run_id2}/preview")
    assert r2.status_code == 200
    assert r2.json()["port"] != port1
    client.delete(f"/runs/{run_id2}/preview")


def test_stop_kills_preview(penv):
    client, _, run_id, _ = penv
    r = client.post(f"/runs/{run_id}/preview")
    port = r.json()["port"]
    dr = client.delete(f"/runs/{run_id}/preview")
    assert dr.status_code == 200
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        assert s.connect_ex(("127.0.0.1", port)) != 0


def test_run_kill_tears_preview_down(penv):
    client, _, run_id, run_data = penv
    r = client.post(f"/runs/{run_id}/preview")
    port = r.json()["port"]
    runs.kill(run_data)
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        assert s.connect_ex(("127.0.0.1", port)) != 0
