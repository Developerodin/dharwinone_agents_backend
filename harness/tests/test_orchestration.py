import json
import os

import pytest

from harness import supervisor


CFG_LIMITS = {"repair_rounds": 3, "review_rounds": 2, "task_timeout_min": 1,
              "error_tail_lines": 50, "max_diff_kb": 64, "max_plan_files": 8,
              "infra_failure_breaker": 3, "weak_winrate": 0.5,
              "weak_min_attempts": 4, "min_disk_gb": 30, "run_cap_hours": 8,
              "health_deadline_s": 60}


def minimal_cfg(tmp_path):
    return {"limits": dict(CFG_LIMITS),
            "stats_path": str(tmp_path / "stats.json"),
            "models": {"feature": "big", "fix": "small", "planner": "big",
                       "reviewer_for": {"big": "small", "small": "big"}}}


def test_pick_model_routes_by_category(tmp_path):
    cfg = minimal_cfg(tmp_path)
    assert supervisor.pick_model({"category": "fix"}, cfg) == "small"
    assert supervisor.pick_model({"category": "feature"}, cfg) == "big"


def test_alt_model_flips(tmp_path):
    cfg = minimal_cfg(tmp_path)
    assert supervisor.alt_model("big", cfg) == "small"
    assert supervisor.alt_model("small", cfg) == "big"


def test_learn_accumulates_and_is_weak(tmp_path):
    cfg = minimal_cfg(tmp_path)
    sp = cfg["stats_path"]
    for shipped in (False, False, False, True):
        stats = supervisor.learn(sp, "feature", "big", shipped)
    assert stats["feature"]["big"] == {"ship": 1, "block": 3}
    assert supervisor.is_weak("feature", "big", stats, cfg) is True
    assert supervisor.is_weak("feature", "small", stats, cfg) is False  # no data


def test_decompose_depth_capped(tmp_path):
    cfg = minimal_cfg(tmp_path)
    task = {"id": "T1.1", "depth": 1, "title": "t", "prompt": "p",
            "category": "feature", "accept": "x", "allow_paths": ["src/"]}
    assert supervisor.decompose(None, cfg, task, {}) == []


def test_decompose_generates_subtasks(tmp_path):
    cfg = minimal_cfg(tmp_path)

    class Fake:
        def generate(self, model, prompt, **kw):
            return json.dumps({"subtasks": [
                {"title": "part 1", "prompt": "do 1"},
                {"title": "part 2", "prompt": "do 2"}]})

    parent = {"id": "T1", "title": "big", "prompt": "p", "category": "feature",
              "accept": "cmd run", "allow_paths": ["src/"]}
    subs = supervisor.decompose(Fake(), cfg, parent, {"reason": "blocked"})
    assert [s["id"] for s in subs] == ["T1.1", "T1.2"]
    assert all(s["depth"] == 1 for s in subs)
    assert all(s["accept"] == "cmd run" for s in subs)


def test_circuit_breaker_pauses_run(tmp_path):
    cfg = minimal_cfg(tmp_path)
    breaker = supervisor.Breaker(cfg["limits"]["infra_failure_breaker"])
    breaker.infra_failure()
    breaker.infra_failure()
    with pytest.raises(supervisor.RunPaused):
        breaker.infra_failure()
    breaker2 = supervisor.Breaker(3)
    breaker2.infra_failure()
    breaker2.ok()  # success resets the count
    breaker2.infra_failure()
    breaker2.infra_failure()  # only 2 consecutive - no raise
