import os
import subprocess
import sys
import threading
import time

from harness import gitops, runner, supervisor

PY = sys.executable


def test_recover_only_task_ids(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    for args in (["init", "-b", "main"],
                 ["config", "user.email", "t@t.t"],
                 ["config", "user.name", "t"]):
        subprocess.run(["git"] + args, cwd=repo, check=True, capture_output=True)
    (repo / "f.txt").write_text("x")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "i"], cwd=repo, check=True, capture_output=True)
    gitops.ensure_integration(str(repo), "harness/integration")
    wt_root = tmp_path / "wt"
    wt_root.mkdir()
    gitops.create_worktree(str(repo), str(wt_root), "a", "harness/integration")
    gitops.create_worktree(str(repo), str(wt_root), "b", "harness/integration")
    cfg = {"repo_root": str(repo), "worktree_root": str(wt_root)}
    supervisor.recover(cfg, only_task_ids={"a"})
    left = {os.path.basename(p) for p in gitops.stale_worktrees(str(wt_root))}
    assert left == {"b"}


def test_kill_tag_terminates_process():
    tag = "test-kill"
    done = threading.Event()

    def run_sleep():
        try:
            runner.run_cmd([PY, "-c", "import time; time.sleep(60)"],
                             cwd=os.getcwd(), timeout_s=120, tag=tag)
        finally:
            done.set()

    t = threading.Thread(target=run_sleep, daemon=True)
    t.start()
    for _ in range(50):
        if tag in runner.ACTIVE and runner.ACTIVE[tag]:
            break
        time.sleep(0.05)
    assert tag in runner.ACTIVE and runner.ACTIVE[tag]
    runner.kill_tag(tag)
    done.wait(timeout=5)
    assert tag not in runner.ACTIVE
