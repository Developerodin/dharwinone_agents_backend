import json
import os
import subprocess
import sys

import pytest
from harness import gitops, packets, supervisor
from studio import config, driver, gates, projects

PY = sys.executable
FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "happy_path_journal.jsonl"
)


class FakeProvider:
    def generate(self, model, prompt, **kw):
        if "Plan this coding task" in prompt:
            return '{"approach": "edit VALUE", "files": ["src/app.py"]}'
        if "Summarize this coding plan" in prompt:
            return '{"summary": "Bump VALUE", "files": ["src/app.py"]}'
        return '{"verdict": "ACCEPT", "findings": []}'

    def healthy(self, model, deadline_s=60):
        return True


def good_implementer(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "src", "app.py"), "w", encoding="utf-8") as f:
        f.write("VALUE = 2\n")
    return 0, "edited"


def tracking_implementer(task, wt, model, fmt, message, cfg):
    tracking_implementer.message = message
    tracking_implementer.plan_files = list(task.get("plan_files", []))
    return good_implementer(task, wt, model, fmt, message, cfg)


tracking_implementer.message = ""
tracking_implementer.plan_files = []


ACCEPT_OK = (
    f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); '
    'import app; sys.exit(0 if app.VALUE == 2 else 1)"'
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path / "studio-data"))
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
    project = projects.create({"name": "Drv", "repo_root": str(repo)})
    run_id = "run-1"
    cfg = projects.derive_harness_cfg(project, run_id)
    wt_root = tmp_path / "wt"
    wt_root.mkdir()
    cfg["worktree_root"] = str(wt_root)
    os.makedirs(cfg["packets_dir"], exist_ok=True)
    run_dir = config.run_dir(project["id"], run_id)
    os.makedirs(run_dir, exist_ok=True)
    (tmp_path / "sk.yaml").write_text("all: []\n")
    cfg["skeptic_path"] = str(tmp_path / "sk.yaml")
    task = {
        "id": "demo-1",
        "category": "feature",
        "title": "bump value",
        "prompt": "set VALUE to 2 in src/app.py",
        "accept": ACCEPT_OK,
        "allow_paths": ["src/"],
    }
    yield project, run_id, cfg, task, run_dir
    supervisor.recover(cfg)
    config.reset_for_tests()


def _seed_approvals(run_dir, plan_payload=None, accept_decision="approve"):
    gates.write_approval(
        run_dir,
        "plan",
        "approve",
        plan_payload
        or {
            "approach": "edit VALUE",
            "files": ["src/app.py"],
        },
    )
    gates.write_approval(run_dir, "accept", accept_decision, {})


def test_build_waits_at_design_gate_and_applies_choice(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    task = {
        **task,
        "category": "build",
        "title": "coffee shop site",
        "prompt": "build a landing page for a coffee shop",
    }
    _seed_approvals(run_dir)
    gates.write_approval(
        run_dir,
        "design",
        "approve",
        {"id": "sleek-dark", "label": "Sleek Dark", "variant": 1},
    )
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    status = driver.run_task(
        project, run_id, task, cfg, tracking_implementer, gate_timeout_s=30
    )
    assert status == "SHIPPED"
    events = [e["event"] for e in packets.journal_read(cfg["journal_path"])]
    # design gate opens (and resolves) before any planning happens
    assert events.index("gate_open") < events.index("plan_start")
    assert os.path.exists(os.path.join(run_dir, "draft-1.html"))
    assert "Sleek Dark" in tracking_implementer.message


def test_happy_path_event_order(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    _seed_approvals(run_dir)
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    status = driver.run_task(
        project, run_id, task, cfg, good_implementer, gate_timeout_s=30
    )
    assert status == "SHIPPED"
    events = packets.journal_read(cfg["journal_path"])
    with open(FIXTURE, encoding="utf-8") as f:
        expected = [json.loads(line)["event"] for line in f if line.strip()]
    assert [e["event"] for e in events] == expected
    md_path = os.path.join(cfg["packets_dir"], task["id"], "plan.md")
    with open(md_path, encoding="utf-8") as f:
        md = f.read()
    assert "## Approach" in md and "## Blast radius" in md


def test_plan_reject_no_worktree(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    gates.write_approval(run_dir, "plan", "reject", {})
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    status = driver.run_task(
        project, run_id, task, cfg, good_implementer, gate_timeout_s=10
    )
    assert status == "REJECTED"
    events = packets.journal_read(cfg["journal_path"])
    assert events[-1]["event"] == "rejected_by_user"
    assert not os.path.exists(os.path.join(cfg["worktree_root"], task["id"]))


def test_plan_timeout_paused(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    status = driver.run_task(
        project, run_id, task, cfg, good_implementer, gate_timeout_s=0.1
    )
    assert status == "PAUSED"
    events = packets.journal_read(cfg["journal_path"])
    assert events[-1]["event"] == "paused"
    assert events[-1]["gate"] == "plan"


def test_edited_files_in_implementer_message(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    gates.write_approval(
        run_dir,
        "plan",
        "approve",
        {
            "approach": "custom approach",
            "files": ["src/app.py", "src/extra.py"],
        },
    )
    gates.write_approval(run_dir, "accept", "approve", {})
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    driver.run_task(project, run_id, task, cfg, tracking_implementer, gate_timeout_s=30)
    assert "custom approach" in tracking_implementer.message
    assert "src/extra.py" in tracking_implementer.plan_files


def test_accept_reject_discards_worktree(env, monkeypatch):
    project, run_id, cfg, task, run_dir = env
    _seed_approvals(run_dir, accept_decision="reject")
    monkeypatch.setattr(driver, "_stage_provider", lambda *a, **k: FakeProvider())
    status = driver.run_task(
        project, run_id, task, cfg, good_implementer, gate_timeout_s=30
    )
    assert status == "REJECTED"
    assert not os.path.exists(os.path.join(cfg["worktree_root"], task["id"]))
    events = packets.journal_read(cfg["journal_path"])
    assert events[-1]["event"] == "rejected_by_user"
    assert events[-1]["gate"] == "accept"
