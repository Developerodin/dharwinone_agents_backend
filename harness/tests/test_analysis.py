import hashlib
import os

import pytest

from harness import analysis, guard

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "miniapp")


def _tree_hash(root):
    h = hashlib.sha256()
    for dirpath, _, files in os.walk(root):
        for name in sorted(files):
            rel = os.path.relpath(os.path.join(dirpath, name), root)
            h.update(rel.encode())
            with open(os.path.join(dirpath, name), "rb") as f:
                h.update(f.read())
    return h.hexdigest()


class FakeProvider:
    def generate(self, model, prompt, **kw):
        return '{"summary": "Will edit b.py", "files": ["src/b.py"]}'

    def healthy(self, model, deadline_s=60):
        return True


class BrokenProvider:
    def generate(self, model, prompt, **kw):
        raise OSError("down")

    def healthy(self, model, deadline_s=60):
        return False


def test_simulate_finds_direct_importer():
    out = analysis.simulate(FIXTURE, ["src/b.py"])
    assert "src/a.py" in out["blast_files"]


def test_simulate_finds_transitive_importer():
    out = analysis.simulate(FIXTURE, ["src/b.py"])
    assert "src/e.py" in out["blast_files"]


def test_simulate_js_imports():
    out = analysis.simulate(FIXTURE, ["src/d.ts"])
    assert "src/c.ts" in out["blast_files"]


def test_simulate_protected_touch_high_risk():
    out = analysis.simulate(FIXTURE, ["src/b.py"])
    orig = guard.PROTECTED
    try:
        guard.PROTECTED = ("src/a.py",) + orig
        out2 = analysis.simulate(FIXTURE, ["src/b.py"])
        assert out2["risk"] == "high"
    finally:
        guard.PROTECTED = orig


def test_simulate_does_not_mutate_repo():
    before = _tree_hash(FIXTURE)
    analysis.simulate(FIXTURE, ["src/b.py"])
    assert _tree_hash(FIXTURE) == before


def test_simulate_shape():
    out = analysis.simulate(FIXTURE, ["src/b.py"])
    assert out["kind"] == "SIMULATE"
    assert out["size_band"] == "S"
    assert out["blast_count"] == len(out["blast_files"])


def test_explain_stable_shape():
    out = analysis.explain(FakeProvider(), "m", {"title": "t", "prompt": "p"},
                           ["src/b.py"], FIXTURE)
    assert out["kind"] == "EXPLAIN"
    assert "edit" in out["summary"].lower()
    assert isinstance(out["files"], list)


def test_explain_unavailable_on_error():
    out = analysis.explain(BrokenProvider(), "m", {"title": "t", "prompt": "p"},
                           ["src/b.py"], FIXTURE)
    assert out["summary"] == "(unavailable)"
    assert out["files"] == ["src/b.py"]
