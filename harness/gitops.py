"""Git worktree isolation: bad runs never dirty the integration branch."""
import os
import subprocess


class GitError(RuntimeError):
    pass


def git(args, cwd):
    r = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise GitError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout.strip()


def ensure_integration(repo, branch):
    if not git(["branch", "--list", branch], repo):
        git(["branch", branch], repo)


def create_worktree(repo, wt_root, task_id, branch, branch_name=None):
    path = os.path.join(wt_root, task_id)
    bname = branch_name or f"harness/task/{task_id}"
    # -B not -b: blocked tasks keep their branch for audit, and retries
    # (alt-model, rerun) must reset it rather than crash on "already exists"
    git(["worktree", "add", "-B", bname, path, branch], repo)
    return path


def commit_all(wt, msg):
    git(["add", "-A"], wt)
    r = subprocess.run(["git", "commit", "-m", msg], cwd=wt,
                       capture_output=True, text=True)
    # nonzero with "nothing to commit" is fine; anything else is real
    if r.returncode != 0 and "nothing to commit" not in r.stdout + r.stderr:
        raise GitError(f"commit: {r.stderr.strip() or r.stdout.strip()}")


def changed_paths(wt, base_branch):
    out = git(["diff", "--name-only", base_branch], wt)
    return [l for l in out.splitlines() if l.strip()]


def diff_text(wt, base_branch):
    return git(["diff", base_branch], wt)


def integration_worktree(repo, wt_root, branch):
    path = os.path.join(wt_root, "_integration")
    if not os.path.exists(path):
        git(["worktree", "add", path, branch], repo)
    return path


def merge_task(int_wt, task_id, branch_name=None):
    bname = branch_name or f"harness/task/{task_id}"
    git(["merge", "--no-ff", "-m", f"harness: ship {task_id}",
         bname], int_wt)


def remove_worktree(repo, path, task_id, keep_branch, branch_name=None):
    git(["worktree", "remove", "--force", path], repo)
    if not keep_branch:
        bname = branch_name or f"harness/task/{task_id}"
        git(["branch", "-D", bname], repo)


def stale_worktrees(wt_root):
    if not os.path.isdir(wt_root):
        return []
    return [os.path.join(wt_root, d) for d in os.listdir(wt_root)
            if d != "_integration"]
