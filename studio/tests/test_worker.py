import os
import subprocess
import sys
import textwrap
import time

import pytest
from harness import gitops, packets, supervisor
from studio import config, driver, gates, projects, worker
from studio.paths import VENV_PY
from studio.tests._test_support import FakeProvider

PY = sys.executable
SUPPORT = os.path.join(os.path.dirname(__file__), "_test_support.py")


def _write_fake_impl(path):
    path.write_text(
        textwrap.dedent("""
        import os
        def implementer(task, wt, model, fmt, message, cfg):
            with open(os.path.join(wt, "src", "app.py"), "w", encoding="utf-8") as f:
                f.write("VALUE = 2\\n")
            return 0, "ok"
    """)
    )


def _taskkill_tree(pid):
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)


@pytest.fixture
def wenv(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("STUDIO_HEARTBEAT_INTERVAL", "0.3")
    monkeypatch.setenv("STUDIO_GATE_TIMEOUT", "30")
    monkeypatch.setenv("STUDIO_TEST_PROVIDER", SUPPORT)
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
    project = projects.create(
        {
            "name": "Wrk",
            "repo_root": str(repo),
            "accept_templates": {"default": [PY, "-c", "import sys; sys.exit(0)"]},
        }
    )
    run_id = "run-w1"
    run_dir = config.run_dir(project["id"], run_id)
    os.makedirs(run_dir, exist_ok=True)
    cfg = projects.derive_harness_cfg(project, run_id)
    wt_root = tmp_path / "wt"
    wt_root.mkdir()
    cfg["worktree_root"] = str(wt_root)
    impl_path = tmp_path / "fake_impl.py"
    _write_fake_impl(impl_path)
    task = {
        "id": run_id,
        "source": "chat",
        "category": "feature",
        "title": "bump",
        "prompt": "set VALUE to 2",
        "allow_paths": ["src/"],
        "accept_template": "default",
        "accept_args": [],
    }
    run_data = {
        "run_id": run_id,
        "project_id": project["id"],
        "task": task,
        "state": "running",
        "pid": None,
        "created_ts": time.time(),
        "heartbeat_ts": time.time(),
        "lane": "feature",
        "fork_of": None,
        "fake_implementer": str(impl_path),
        "worktree_root": str(wt_root),
    }
    from harness.packets import atomic_write_json

    atomic_write_json(os.path.join(run_dir, "run.json"), run_data)
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
    yield project, run_id, run_dir, cfg, run_data, impl_path
    supervisor.recover(cfg)
    config.reset_for_tests()


def test_heartbeats_in_subprocess(wenv):
    _, _, run_dir, cfg, _, _ = wenv
    proc = subprocess.Popen(
        [VENV_PY, "-m", "studio.worker", "--run-dir", run_dir],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    try:
        deadline = time.time() + 15
        while time.time() < deadline:
            events = packets.journal_read(cfg["journal_path"])
            if any(e.get("event") == "heartbeat" for e in events):
                break
            time.sleep(0.2)
        events = packets.journal_read(cfg["journal_path"])
        assert any(e.get("event") == "heartbeat" for e in events)
    finally:
        _taskkill_tree(proc.pid)
        proc.wait(timeout=10)


def test_taskkill_journal_still_parses(wenv):
    _, _, run_dir, cfg, _, _ = wenv
    proc = subprocess.Popen(
        [VENV_PY, "-m", "studio.worker", "--run-dir", run_dir],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    time.sleep(1)
    _taskkill_tree(proc.pid)
    proc.wait(timeout=10)
    events = packets.journal_read(cfg["journal_path"])
    assert isinstance(events, list)


def test_resume_skips_plan_start(wenv, monkeypatch):
    project, run_id, run_dir, cfg, run_data, impl_path = wenv
    import importlib.util

    spec = importlib.util.spec_from_file_location("fi", impl_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    for gate in ("plan", "accept"):
        p = os.path.join(run_dir, "approvals", f"{gate}.json")
        if os.path.exists(p):
            os.remove(p)
    status = driver.run_task(
        project, run_id, run_data["task"], cfg, mod.implementer, gate_timeout_s=0.1
    )
    assert status == "PAUSED"
    assert worker.detect_resume_point(run_dir, cfg, run_id) == "plan"
    plan_starts = sum(
        1
        for e in packets.journal_read(cfg["journal_path"])
        if e.get("event") == "plan_start"
    )
    gates.write_approval(
        run_dir,
        "plan",
        "approve",
        {
            "approach": "edit VALUE",
            "files": ["src/app.py"],
        },
    )
    driver.run_task(
        project,
        run_id,
        run_data["task"],
        cfg,
        mod.implementer,
        gate_timeout_s=30,
        resume_from="plan",
    )
    plan_starts2 = sum(
        1
        for e in packets.journal_read(cfg["journal_path"])
        if e.get("event") == "plan_start"
    )
    assert plan_starts2 == plan_starts
