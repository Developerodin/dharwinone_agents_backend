import sys

from harness import runner

PY = sys.executable


def test_run_cmd_success(tmp_path):
    code, out = runner.run_cmd(f'"{PY}" -c "print(\'hello\')"', str(tmp_path), 30)
    assert code == 0
    assert "hello" in out


def test_run_cmd_sets_ci_env(tmp_path):
    code, out = runner.run_cmd(
        f'"{PY}" -c "import os; print(os.environ[\'CI\'])"', str(tmp_path), 30)
    assert code == 0 and "true" in out


def test_run_cmd_timeout_kills_tree(tmp_path):
    code, out = runner.run_cmd(
        f'"{PY}" -c "import time; time.sleep(60)"', str(tmp_path), 3)
    assert code == 124
    assert "TIMEOUT" in out


def test_run_cmd_accepts_list_without_shell(tmp_path):
    code, out = runner.run_cmd([PY, "-c", "print('$CI & echo pwned')"],
                               str(tmp_path), 30)
    assert code == 0
    assert "$CI & echo pwned" in out  # metacharacters inert - no shell


def test_tail():
    text = "\n".join(str(i) for i in range(200))
    assert runner.tail(text, 3) == "197\n198\n199"
