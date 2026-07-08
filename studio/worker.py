"""Studio worker subprocess — runs gated driver for one run."""

import argparse
import importlib.util
import os
import signal
import sys
import threading
import time

from harness import packets, runner, supervisor
from harness.packets import atomic_write_json

from studio import config, driver, projects


def _load_run(run_dir):
    path = os.path.join(run_dir, "run.json")
    with open(path, encoding="utf-8") as f:
        import json

        return json.load(f)


def _save_run(run_dir, run_data):
    atomic_write_json(os.path.join(run_dir, "run.json"), run_data)


def _last_gate_result(journal, gate):
    for e in reversed(journal):
        if e.get("event") == "gate_result" and e.get("gate") == gate:
            return e
    return None


def detect_resume_point(run_dir, cfg, task_id):
    """Return 'plan', 'accept', or None based on journal + packets."""
    journal = packets.journal_read(cfg["journal_path"])
    plan_path = os.path.join(cfg["packets_dir"], task_id, "plan.json")
    has_plan = os.path.exists(plan_path)
    has_accept_ready = any(e.get("event") == "accept_ready" for e in journal)
    if has_accept_ready and not _last_gate_result(journal, "accept"):
        return "accept"
    if has_plan and not _last_gate_result(journal, "plan"):
        return "plan"
    return None


def _resolve_implementer(run_data):
    script = run_data.get("fake_implementer")
    if not script:
        return supervisor.default_implementer
    spec = importlib.util.spec_from_file_location("fake_impl", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.implementer


def _heartbeat_loop(jw, run_dir, run_data, stop_event):
    interval = config.heartbeat_interval_s()
    while not stop_event.wait(interval):
        jw.emit("heartbeat")
        run_data["heartbeat_ts"] = time.time()
        _save_run(run_dir, run_data)


def _sigbreak_handler(signum, frame, run_id, jw, stop_event):
    runner.kill_tag(run_id)
    jw.emit("killed")
    stop_event.set()
    sys.exit(3)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="studio.worker")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args(argv)

    run_dir = os.path.abspath(args.run_dir)
    run_data = _load_run(run_dir)
    run_id = run_data["run_id"]
    project = projects.get(run_data["project_id"])
    if not project:
        print(f"unknown project: {run_data['project_id']}", file=sys.stderr)
        return 1

    cfg = projects.derive_harness_cfg(project, run_id)
    cfg["worktree_root"] = run_data.get("worktree_root", cfg["worktree_root"])
    task = run_data["task"]
    task_id = task["id"]

    jw = packets.JournalWriter(cfg["journal_path"], run_id)
    stop_event = threading.Event()

    from studio import consent

    policy = consent.make_policy(project, run_id)

    hb = threading.Thread(
        target=_heartbeat_loop,
        args=(jw, run_dir, run_data, stop_event),
        daemon=True,
    )
    hb.start()

    def handler(signum, frame):
        _sigbreak_handler(signum, frame, run_id, jw, stop_event)

    signal.signal(signal.SIGBREAK, handler)

    resume_from = detect_resume_point(run_dir, cfg, task_id) if args.resume else None
    implementer = _resolve_implementer(run_data)

    test_prov = os.environ.get("STUDIO_TEST_PROVIDER")
    if test_prov:
        spec = importlib.util.spec_from_file_location("test_prov", test_prov)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _orig = driver._stage_provider
        driver._stage_provider = lambda c, p, s, policy=None, run_id=None: (
            mod.FakeProvider()
        )

    try:
        driver.run_task(
            project,
            run_id,
            task,
            cfg,
            implementer,
            gate_timeout_s=float(os.environ.get("STUDIO_GATE_TIMEOUT", "3600")),
            resume_from=resume_from,
            policy=policy,
        )
    finally:
        if test_prov:
            driver._stage_provider = _orig
        stop_event.set()
    return 0


if __name__ == "__main__":
    sys.exit(main())
