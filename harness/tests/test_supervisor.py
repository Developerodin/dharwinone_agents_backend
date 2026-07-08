import os
import subprocess
import sys

import pytest
import yaml

from harness import gitops, supervisor

PY = sys.executable


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
        "models": {"feature": "big", "fix": "small", "planner": "big",
                   "reviewer_for": {"big": "small", "small": "big"}},
        "edit_format": {"big": "diff", "small": "whole"},
        "limits": {"repair_rounds": 3, "review_rounds": 2,
                   "task_timeout_min": 1, "error_tail_lines": 50,
                   "max_diff_kb": 64, "max_plan_files": 8},
    }
    (tmp_path / "sk.yaml").write_text("all: []\n")
    return cfg, str(pdir)


class FakeOllama:
    """Always accepts on review, returns a valid plan."""

    def __init__(self, review_reply='{"verdict": "ACCEPT", "findings": []}'):
        self.review_reply = review_reply

    def generate(self, model, prompt, **kw):
        if '"approach"' in prompt or "Plan this coding task" in prompt:
            return '{"approach": "edit VALUE", "files": ["src/app.py"]}'
        return self.review_reply


def make_task(accept, **over):
    t = {"id": "T1", "category": "feature", "title": "bump value",
         "prompt": "set VALUE to 2 in src/app.py", "accept": accept,
         "allow_paths": ["src/"]}
    t.update(over)
    return t


def good_implementer(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "src", "app.py"), "w") as f:
        f.write("VALUE = 2\n")
    return 0, "edited"


def noop_implementer(task, wt, model, fmt, message, cfg):
    return 0, "did nothing"


def rogue_implementer(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "escaped.txt"), "w") as f:
        f.write("outside allow_paths\n")
    return 0, "escaped"


ACCEPT_OK = f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); import app; sys.exit(0 if app.VALUE == 2 else 1)"'


def test_attempt_ships_good_change(env):
    cfg, pdir = env
    status, ev = supervisor.attempt(make_task(ACCEPT_OK), "big", cfg,
                                    FakeOllama(), good_implementer, pdir)
    assert status == "SHIPPED"
    int_wt = os.path.join(cfg["worktree_root"], "_integration")
    with open(os.path.join(int_wt, "src", "app.py")) as f:
        assert "VALUE = 2" in f.read()
    assert not os.path.exists(os.path.join(cfg["worktree_root"], "T1"))


def test_attempt_blocks_after_repair_rounds(env):
    cfg, pdir = env
    status, ev = supervisor.attempt(make_task(ACCEPT_OK), "big", cfg,
                                    FakeOllama(), noop_implementer, pdir)
    assert status == "BLOCKED"
    builds = [f for f in os.listdir(pdir) if f.startswith("build_")]
    assert len(builds) == 3  # exactly repair_rounds attempts


def test_attempt_escalates_on_path_violation(env):
    cfg, pdir = env
    always_pass = f'"{PY}" -c "import sys; sys.exit(0)"'
    status, ev = supervisor.attempt(make_task(always_pass), "big", cfg,
                                    FakeOllama(), rogue_implementer, pdir)
    assert status == "ESCALATED"
    assert "escaped.txt" in str(ev)


def test_attempt_escalates_on_reviewer_escalate(env):
    cfg, pdir = env
    fake = FakeOllama('{"verdict": "ESCALATE", "findings": []}')
    status, ev = supervisor.attempt(make_task(ACCEPT_OK), "big", cfg,
                                    fake, good_implementer, pdir)
    assert status == "ESCALATED"


def test_plan_task_rejects_scope_explosion(env):
    cfg, _ = env

    class Exploder:
        def generate(self, model, prompt, **kw):
            files = ", ".join(f'"f{i}.py"' for i in range(20))
            return f'{{"approach": "x", "files": [{files}]}}'

    assert supervisor.plan_task(Exploder(), cfg, make_task(ACCEPT_OK)) is None
