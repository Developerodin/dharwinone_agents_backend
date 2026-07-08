"""One-shot: record golden journal from pre-hooks supervisor (S3 step 0)."""
import json
import os
import subprocess
import sys
import tempfile

from harness import gitops, packets, supervisor

PY = sys.executable
FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "golden_journal_pre_hooks.jsonl")


class FakeOllama:
    def generate(self, model, prompt, **kw):
        if "Plan this coding task" in prompt:
            return '{"approach": "edit", "files": ["src/app.py"]}'
        return '{"verdict": "ACCEPT", "findings": []}'

    def healthy(self, model, deadline_s=60):
        return True


def impl(task, wt, model, fmt, message, cfg):
    with open(os.path.join(wt, "src", "app.py"), "w", encoding="utf-8") as f:
        f.write("VALUE = 2\n")
    return 0, "ok"


def main():
    tmp = tempfile.mkdtemp()
    repo = os.path.join(tmp, "repo")
    os.makedirs(os.path.join(repo, "src"))
    for args in (
        ["init", "-b", "main"],
        ["config", "user.email", "t@t.t"],
        ["config", "user.name", "t"],
    ):
        subprocess.run(["git"] + args, cwd=repo, check=True, capture_output=True)
    with open(os.path.join(repo, "src", "app.py"), "w", encoding="utf-8") as f:
        f.write("VALUE = 1\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True,
                   capture_output=True)
    gitops.ensure_integration(repo, "harness/integration")
    ok = (
        f'"{PY}" -c "import sys; sys.path.insert(0, \'src\'); '
        "import app; sys.exit(0 if app.VALUE == 2 else 1)\""
    )
    task = {
        "id": "GOLD", "category": "feature", "title": "bump",
        "prompt": "set VALUE to 2", "accept": ok, "allow_paths": ["src/"],
    }
    cfg = {
        "repo_root": repo,
        "worktree_root": os.path.join(tmp, "wt"),
        "integration_branch": "harness/integration",
        "skeptic_path": os.path.join(tmp, "sk.yaml"),
        "journal_path": os.path.join(tmp, "journal.jsonl"),
        "stats_path": os.path.join(tmp, "stats.json"),
        "packets_dir": os.path.join(tmp, "packets"),
        "report_path": os.path.join(tmp, "report.md"),
        "models": {
            "feature": "big", "fix": "small", "planner": "big",
            "reviewer_for": {"big": "small", "small": "big"},
        },
        "edit_format": {"big": "diff", "small": "whole"},
        "limits": {
            "repair_rounds": 3, "review_rounds": 2,
            "task_timeout_min": 1, "error_tail_lines": 50,
            "max_diff_kb": 64, "max_plan_files": 8, "health_deadline_s": 60,
            "min_disk_gb": 1,
        },
    }
    with open(cfg["skeptic_path"], "w", encoding="utf-8") as f:
        f.write("all: []\n")
    os.makedirs(cfg["worktree_root"])
    os.makedirs(cfg["packets_dir"])
    supervisor.process_task(task, cfg, FakeOllama(), impl)
    events = packets.journal_read(cfg["journal_path"])
    os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
    with open(FIXTURE, "w", encoding="utf-8") as f:
        for e in events:
            stripped = {k: v for k, v in e.items() if k != "ts"}
            f.write(json.dumps(stripped) + "\n")
    print("events:", [e["event"] for e in events])
    print("written", FIXTURE)


if __name__ == "__main__":
    main()
