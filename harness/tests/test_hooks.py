import json
import os
import subprocess
import sys

import pytest

from harness import gitops, packets, supervisor

PY = sys.executable
GOLDEN = os.path.join(os.path.dirname(__file__), "fixtures",
                      "golden_journal_pre_hooks.jsonl")


class FakeOllama:
    def generate(self, model, prompt, **kw):
        if "Plan this coding task" in prompt:
            return '{"approach": "edit VALUE", "files": ["src/app.py"]}'
        return '{"verdict": "ACCEPT", "findings": []}'

    def healthy(self, model, deadline_s=60):
        return True


class RecordingHooks(supervisor.Hooks):
    def __init__(self, cancel_at_round=None):
        self.events = []
        self._repair_round = 0
        self.cancel_at_round = cancel_at_round

    def emit(self, event, **fields):
        self.events.append((event, fields))

    def check(self):
        self._repair_round += 1
        if self.cancel_at_round and self._repair_round >= self.cancel_at_round:
            raise supervisor.RunCancelled()


def good_implementer(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "src", "app.py"), "w", encoding="utf-8") as f:
        f.write("VALUE = 2\n")
    return 0, "edited"


def make_task(accept):
    return {
        "id": "T1", "category": "feature", "title": "bump value",
        "prompt": "set VALUE to 2 in src/app.py", "accept": accept,
        "allow_paths": ["src/"],
    }


ACCEPT_OK = (
    f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); '
    "import app; sys.exit(0 if app.VALUE == 2 else 1)\""
)


@pytest.fixture
def env(tmp_path):
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
    gitops.ensure_integration(str(repo), "harness/integration")
    wt_root = tmp_path / "wt"
    wt_root.mkdir()
    pdir = tmp_path / "packets"
    pdir.mkdir()
    cfg = {
        "repo_root": str(repo), "worktree_root": str(wt_root),
        "integration_branch": "harness/integration",
        "skeptic_path": str(tmp_path / "sk.yaml"),
        "journal_path": str(tmp_path / "journal.jsonl"),
        "stats_path": str(tmp_path / "stats.json"),
        "packets_dir": str(pdir), "report_path": str(tmp_path / "report.md"),
        "models": {"feature": "big", "fix": "small", "planner": "big",
                   "reviewer_for": {"big": "small", "small": "big"}},
        "edit_format": {"big": "diff", "small": "whole"},
        "limits": {"repair_rounds": 3, "review_rounds": 2,
                   "task_timeout_min": 1, "error_tail_lines": 50,
                   "max_diff_kb": 64, "max_plan_files": 8,
                   "health_deadline_s": 60, "min_disk_gb": 1},
    }
    (tmp_path / "sk.yaml").write_text("all: []\n")
    return cfg, str(pdir)


def test_hooks_happy_path_event_order(env):
    cfg, pdir = env
    hooks = RecordingHooks()
    task = make_task(ACCEPT_OK)
    plan = supervisor.plan_stage(FakeOllama(), cfg, task, hooks=hooks)
    assert plan is not None
    task = {**task, "plan_approach": plan["approach"],
            "plan_files": plan["files"]}
    status, _ = supervisor.attempt(task, "big", cfg, FakeOllama(),
                                   good_implementer, pdir, hooks=hooks)
    assert status == "SHIPPED"
    names = [e[0] for e in hooks.events]
    assert names == [
        "plan_start", "plan_ready",
        "build_round_start", "verify_done",
        "review_round_done", "merge_start",
    ]


def test_run_cancelled_removes_worktree_no_merge(env):
    cfg, pdir = env
    hooks = RecordingHooks(cancel_at_round=2)
    task = make_task(ACCEPT_OK)
    task = {**task, "plan_approach": "x", "plan_files": ["src/app.py"]}
    with pytest.raises(supervisor.RunCancelled):
        supervisor.attempt(task, "big", cfg, FakeOllama(), good_implementer,
                           pdir, hooks=hooks)
    assert not os.path.exists(os.path.join(cfg["worktree_root"], "T1"))
    with open(os.path.join(cfg["repo_root"], "src", "app.py"), encoding="utf-8") as f:
        assert "VALUE = 1" in f.read()


def test_hooks_none_matches_golden_journal(env):
    cfg, _ = env
    task = make_task(ACCEPT_OK)
    supervisor.process_task(task, cfg, FakeOllama(), good_implementer)
    events = packets.journal_read(cfg["journal_path"])
    with open(GOLDEN, encoding="utf-8") as f:
        golden = [json.loads(line) for line in f if line.strip()]

    def norm(e):
        return {k: v for k, v in e.items() if k not in ("ts", "task", "seq")}

    assert [norm(e) for e in events] == [norm(g) for g in golden]
    assert [e["event"] for e in events] == [g["event"] for g in golden]


def test_merge_false_keeps_worktree(env):
    cfg, pdir = env
    task = make_task(ACCEPT_OK)
    task = {**task, "plan_approach": "x", "plan_files": ["src/app.py"]}
    status, ev = supervisor.attempt(task, "big", cfg, FakeOllama(),
                                    good_implementer, pdir, merge=False)
    assert status == "REVIEWED"
    assert os.path.exists(ev["worktree"])
    assert os.path.exists(os.path.join(cfg["worktree_root"], "T1"))
