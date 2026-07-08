r"""Studio implementation gate. Run after every task; red = task not done.

Usage (from repo root):
  backend\.venv\Scripts\python backend\scripts\check_studio.py

Usage (from backend/):
  .venv\Scripts\python scripts\check_studio.py
"""
import ast
import hashlib
import json
import os
import subprocess
import sys

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_ROOT)
MANIFEST = os.path.join(BACKEND_ROOT, "scripts", "legacy-test-manifest.json")
VENV_PY = os.path.join(BACKEND_ROOT, ".venv", "Scripts", "python.exe")

# ponytail: pre-existing test files only; new studio-era harness tests are exempt
FORBIDDEN_DIFF_PREFIXES = (
    "Frontend/Dharwin-One/src/sections/",
    "Frontend/Dharwin-One/src/components/",
    "Frontend/Dharwin-One/src/content/",
    ".github/",
)
FORBIDDEN_DIFF_EXACT = ("backend/harness/config.yaml",)
HARNESS_ALLOWED_MODULES = set(getattr(sys, "stdlib_module_names", ())) | {"yaml", "harness"}

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print(f"  FAIL: {msg}")


def hash_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def manifest_paths():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def update_manifest():
    tests_dir = os.path.join(BACKEND_ROOT, "harness", "tests")
    out = {}
    for name in sorted(os.listdir(tests_dir)):
        if name.endswith(".py"):
            rel = f"harness/tests/{name}"
            out[rel] = hash_file(os.path.join(BACKEND_ROOT, rel))
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Manifest written: {len(out)} files")


def check_legacy_unmodified():
    print("[1/5] Legacy test files unmodified...")
    for rel, expected in manifest_paths().items():
        path = os.path.join(BACKEND_ROOT, rel)
        if not os.path.exists(path):
            fail(f"legacy test file deleted: {rel}")
        elif hash_file(path) != expected:
            fail(f"legacy test file modified: {rel} (revert it; fix your change instead)")


def check_harness_imports():
    print("[2/5] harness/ imports stdlib+yaml only...")
    hdir = os.path.join(BACKEND_ROOT, "harness")
    for name in os.listdir(hdir):
        if not name.endswith(".py"):
            continue
        with open(os.path.join(hdir, name), encoding="utf-8") as f:
            try:
                tree = ast.parse(f.read())
            except SyntaxError as e:
                fail(f"harness/{name}: syntax error: {e}")
                continue
        for node in ast.walk(tree):
            mods = []
            if isinstance(node, ast.Import):
                mods = [a.name.split(".")[0] for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                mods = [node.module.split(".")[0]]
            for m in mods:
                if m not in HARNESS_ALLOWED_MODULES:
                    fail(f"harness/{name}: forbidden import '{m}' (stdlib+yaml only)")


def check_forbidden_paths():
    print("[3/5] No forbidden paths in branch diff vs main...")
    r = subprocess.run(
        ["git", "-C", REPO_ROOT, "diff", "--name-only", "main...HEAD"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        fail(f"git diff failed: {r.stderr.strip()}")
        return
    for line in r.stdout.splitlines():
        p = line.strip().replace("\\", "/")
        if not p:
            continue
        if p in FORBIDDEN_DIFF_EXACT or any(
            p.startswith(x) for x in FORBIDDEN_DIFF_PREFIXES
        ):
            fail(f"forbidden path changed on branch: {p}")


def run_pytest(target, label):
    env = os.environ.copy()
    env["PYTHONPATH"] = BACKEND_ROOT
    r = subprocess.run(
        [VENV_PY, "-m", "pytest", target, "-q"],
        cwd=BACKEND_ROOT,
        env=env,
    )
    if r.returncode != 0:
        fail(f"{label} tests red")


def main():
    if "--update-manifest" in sys.argv:
        update_manifest()
        return 0
    check_legacy_unmodified()
    check_harness_imports()
    check_forbidden_paths()
    print("[4/5] harness tests...")
    run_pytest("harness/tests", "harness")
    if os.path.isdir(os.path.join(BACKEND_ROOT, "studio", "tests")):
        print("[5/5] studio tests...")
        run_pytest("studio/tests", "studio")
    else:
        print("[5/5] studio tests... (skipped, studio/ not created yet)")
    if FAILURES:
        print(f"\nCHECK FAILED ({len(FAILURES)} problem(s)). Task is NOT done.")
        return 1
    print("\nCHECK PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
