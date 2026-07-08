"""Spec success criterion 1: a passing task SHIPs; a failing task ends
BLOCKED within 3 repair rounds with a valid INCIDENT packet."""
import json
import os
import subprocess
import sys

import pytest
import yaml

from harness import gitops, supervisor

PY = sys.executable


class FakeOllama:
    def generate(self, model, prompt, **kw):
        if "Plan this coding task" in prompt:
            return '{"approach": "edit the file", "files": ["src/app.py"]}'
        if "Split it into" in prompt:
            return '{"subtasks": []}'
        return '{"verdict": "ACCEPT", "findings": []}'

    def healthy(self, model, deadline_s=60):
        return True


def implementer(task, wt, model, fmt, message, cfg):
    if task["id"] == "GOOD":
        with open(os.path.join(wt, "src", "app.py"), "w") as f:
            f.write("VALUE = 2\n")
    return 0, "done"


@pytest.fixture
def cfg(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (["init", "-b", "main"],
                 ["config", "user.email", "t@t.t"],
                 ["config", "user.name", "t"]):
        subprocess.run(["git"] + args, cwd=repo, check=True, capture_output=True)
    (repo / "src").mkdir()
    (repo / "src" / "app.py").write_text("VALUE = 1\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True,
                   capture_output=True)

    ok = (f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); '
          'import app; sys.exit(0 if app.VALUE == 2 else 1)"')
    fail = f'"{PY}" -c "import sys; sys.exit(1)"'
    tasks = [
        {"id": "GOOD", "category": "feature", "title": "bump value",
         "prompt": "set VALUE to 2", "accept": ok, "allow_paths": ["src/"]},
        {"id": "BAD", "category": "feature", "title": "impossible",
         "prompt": "cannot pass", "accept": fail, "allow_paths": ["src/"],
         "depth": 1},
    ]
    tasks_path = tmp_path / "tasks.yaml"
    tasks_path.write_text(yaml.safe_dump(tasks))
    (tmp_path / "sk.yaml").write_text("all: []\n")

    return {
        "repo_root": str(repo), "worktree_root": str(tmp_path / "wt"),
        "integration_branch": "harness/integration",
        "skeptic_path": str(tmp_path / "sk.yaml"),
        "tasks_path": str(tasks_path),
        "generated_tasks_path": str(tmp_path / "generated.yaml"),
        "journal_path": str(tmp_path / "journal.jsonl"),
        "stats_path": str(tmp_path / "stats.json"),
        "packets_dir": str(tmp_path / "packets"),
        "report_path": str(tmp_path / "report.md"),
        "models": {"feature": "big", "fix": "small", "planner": "big",
                   "reviewer_for": {"big": "small", "small": "big"}},
        "edit_format": {"big": "diff", "small": "whole"},
        "limits": {"repair_rounds": 3, "review_rounds": 2,
                   "task_timeout_min": 1, "run_cap_hours": 8,
                   "min_disk_gb": 1, "max_diff_kb": 64,
                   "error_tail_lines": 50, "infra_failure_breaker": 3,
                   "weak_winrate": 0.5, "weak_min_attempts": 4,
                   "max_plan_files": 8, "health_deadline_s": 60},
    }


def test_smoke_ship_and_blocked(cfg):
    results = supervisor.run(cfg, FakeOllama(), implementer)
    assert results["GOOD"] == "SHIPPED"
    assert results["BAD"] == "BLOCKED"

    # SHIP: change is on the integration branch
    int_wt = os.path.join(cfg["worktree_root"], "_integration")
    with open(os.path.join(int_wt, "src", "app.py")) as f:
        assert "VALUE = 2" in f.read()

    # BLOCKED: exactly 3 build packets + a valid incident packet
    bad_pdir = os.path.join(cfg["packets_dir"], "BAD")
    builds = [f for f in os.listdir(bad_pdir) if f.startswith("build_")]
    assert len(builds) == 3
    with open(os.path.join(bad_pdir, "incident.json")) as f:
        incident = json.load(f)
    assert incident["kind"] == "INCIDENT" and incident["task"] == "BAD"

    # report exists and names both tasks
    with open(cfg["report_path"], encoding="utf-8") as f:
        report = f.read()
    assert "GOOD" in report and "BAD" in report

    # clean state: no leftover task worktrees
    assert gitops.stale_worktrees(cfg["worktree_root"]) == []


def test_smoke_rerun_skips_shipped(cfg):
    supervisor.run(cfg, FakeOllama(), implementer)
    results2 = supervisor.run(cfg, FakeOllama(), implementer)
    assert "GOOD" not in results2  # journal recovery: shipped tasks skipped
