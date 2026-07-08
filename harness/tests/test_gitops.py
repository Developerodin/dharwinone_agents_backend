import os
import subprocess

import pytest

from harness import gitops


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    for args in (["init", "-b", "main"],
                 ["config", "user.email", "t@t.t"],
                 ["config", "user.name", "t"]):
        subprocess.run(["git"] + args, cwd=r, check=True, capture_output=True)
    (r / "a.txt").write_text("one\n")
    subprocess.run(["git", "add", "."], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=r, check=True,
                   capture_output=True)
    return str(r)


def test_git_error_raises(repo):
    with pytest.raises(gitops.GitError):
        gitops.git(["merge", "no-such-branch"], repo)


def test_ensure_integration_idempotent(repo):
    gitops.ensure_integration(repo, "harness/integration")
    gitops.ensure_integration(repo, "harness/integration")
    assert "harness/integration" in gitops.git(["branch"], repo)


def test_worktree_lifecycle(repo, tmp_path):
    wt_root = str(tmp_path / "wt")
    os.makedirs(wt_root)
    gitops.ensure_integration(repo, "harness/integration")
    wt = gitops.create_worktree(repo, wt_root, "T1", "harness/integration")
    assert os.path.exists(os.path.join(wt, "a.txt"))

    with open(os.path.join(wt, "b.txt"), "w") as f:
        f.write("new\n")
    gitops.commit_all(wt, "add b")
    assert gitops.changed_paths(wt, "harness/integration") == ["b.txt"]
    assert "+new" in gitops.diff_text(wt, "harness/integration")

    int_wt = gitops.integration_worktree(repo, wt_root, "harness/integration")
    gitops.merge_task(int_wt, "T1")
    assert os.path.exists(os.path.join(int_wt, "b.txt"))

    gitops.remove_worktree(repo, wt, "T1", keep_branch=False)
    assert not os.path.exists(wt)
    assert "harness/task/T1" not in gitops.git(["branch"], repo)


def test_stale_worktrees(tmp_path):
    wt_root = tmp_path / "wt"
    (wt_root / "T9").mkdir(parents=True)
    (wt_root / "_integration").mkdir()
    assert gitops.stale_worktrees(str(wt_root)) == [str(wt_root / "T9")]
