from harness import guard

CFG = {"limits": {"min_disk_gb": 30}}


def make_task(**over):
    t = {"id": "T1", "category": "feature", "title": "t", "prompt": "p",
         "accept": "pnpm -C backend vitest run", "allow_paths": ["backend/"]}
    t.update(over)
    return t


def test_guard_passes_valid_task():
    assert guard.guard(make_task(), CFG, free_gb=100) == []


def test_guard_rejects_missing_fields():
    v = guard.guard({"id": "T1"}, CFG, free_gb=100)
    assert any("missing field" in x for x in v)


def test_lint_accept_rejects_watch_and_dev():
    assert not guard.lint_accept("npm run dev")
    assert not guard.lint_accept("vitest --watch")
    assert not guard.lint_accept("npx serve dist")
    assert not guard.lint_accept("npm start")
    assert guard.lint_accept("pnpm vitest run")
    assert guard.lint_accept("npm run build")
    assert guard.lint_accept("python devtools_check.py")  # substring, not word


def test_guard_rejects_low_disk():
    v = guard.guard(make_task(), CFG, free_gb=5)
    assert any("low disk" in x for x in v)


def test_path_violations_protected_and_outside():
    bad = guard.path_violations(
        ["harness/supervisor.py", "backend/src/ok.ts", "Frontend/nope.tsx"],
        ["backend/"])
    assert "harness/supervisor.py" in bad
    assert "Frontend/nope.tsx" in bad
    assert "backend/src/ok.ts" not in bad


def test_path_violations_windows_separators():
    assert guard.path_violations(["backend\\src\\ok.ts"], ["backend/"]) == []


def test_probe_unreachable_port():
    assert guard.probe("tcp:59999") is False
