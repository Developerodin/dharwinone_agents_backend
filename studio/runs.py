"""Run lifecycle — start, kill, resume, monitor."""

import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid

from harness import packets, supervisor
from harness.packets import atomic_write_json

from studio import config, draft, preview, projects
from studio.paths import VENV_PY

CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

JOURNAL_TERMINAL = frozenset(
    {
        "shipped",
        "blocked",
        "escalated",
        "rejected_by_user",
        "killed",
        "failed",
        "paused",
    }
)
EVENT_TO_STATE = {
    "shipped": "shipped",
    "blocked": "blocked",
    "escalated": "escalated",
    "rejected_by_user": "rejected",
    "killed": "killed",
    "failed": "failed",
    "paused": "paused",
}
ACTIVE_STATES = frozenset({"queued", "running", "editing"})


def _run_json_path(run_dir):
    return os.path.join(run_dir, "run.json")


def load_run(run_id):
    for d in _all_run_dirs():
        if os.path.basename(d) == run_id:
            with open(_run_json_path(d), encoding="utf-8") as f:
                return json.load(f)
    return None


def _all_run_dirs():
    data = config.data_dir()
    runs_root = os.path.join(data, "runs")
    if not os.path.isdir(runs_root):
        return
    for project_id in os.listdir(runs_root):
        proj_runs = os.path.join(runs_root, project_id)
        if os.path.isdir(proj_runs):
            for run_id in os.listdir(proj_runs):
                yield os.path.join(proj_runs, run_id)


def find_run_dir(run_id):
    for d in _all_run_dirs():
        if os.path.basename(d) == run_id:
            return d
    return None


def list_runs(project_id):
    root = config.runs_dir(project_id)
    if not os.path.isdir(root):
        return []
    out = []
    for name in os.listdir(root):
        path = os.path.join(root, name, "run.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                import json

                out.append(json.load(f))
    return sorted(out, key=lambda r: r.get("created_ts", 0), reverse=True)


def _pid_alive(pid):
    if not pid:
        return False
    r = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return str(pid) in r.stdout


def _active_run(project_id):
    for run in list_runs(project_id):
        if run["state"] in ACTIVE_STATES:
            return run
        if run["state"] == "paused" and run.get("pid") and _pid_alive(run["pid"]):
            return run
    return None


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower())[:40].strip("-") or "run"


def sync_state_from_journal(run_data, journal_path):
    events = packets.journal_read(journal_path)
    for e in reversed(events):
        ev = e.get("event")
        if ev in EVENT_TO_STATE:
            run_data["state"] = EVENT_TO_STATE[ev]
            return run_data
    return run_data


def _spawn_worker(run_dir, resume=False):
    fake = os.environ.get("STUDIO_FAKE_WORKER")
    if fake:
        cmd = [sys.executable, fake, "--run-dir", run_dir]
        if resume:
            cmd.append("--resume")
    else:
        cmd = [VENV_PY, "-m", "studio.worker", "--run-dir", run_dir]
        if resume:
            cmd.append("--resume")
    proc = subprocess.Popen(
        cmd,
        creationflags=CREATE_NEW_PROCESS_GROUP,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc.pid


def start(project, body):
    active = _active_run(project["id"])
    if active:
        if not body.get("force"):
            return None, 423
        kill(active)  # caller opted in: replace the active run
    run_id = (
        _slug(body.get("title") or body["prompt"][:30]) + "-" + uuid.uuid4().hex[:6]
    )
    lane = body.get("lane", "feature")
    category = lane if lane in ("fix", "build") else "feature"
    # build lane = greenfield project: whole repo is in scope ("" prefix
    # matches every path; PROTECTED dirs still auto-escalate in the guard)
    default_paths = [""] if lane == "build" else ["src/"]
    task = {
        "id": run_id,
        "source": "chat",
        "category": category,
        "title": body.get("title") or body["prompt"][:80],
        "prompt": body["prompt"],
        "allow_paths": body.get("allow_paths") or default_paths,
        "accept_template": body.get("accept_template", "default"),
        "accept_args": body.get("accept_args", []),
        "requires": [],
    }
    run_dir = config.run_dir(project["id"], run_id)
    os.makedirs(run_dir, exist_ok=True)
    os.makedirs(os.path.join(run_dir, "packets"), exist_ok=True)
    now = time.time()
    run_data = {
        "run_id": run_id,
        "project_id": project["id"],
        "task": task,
        "state": "editing" if lane == "build" else "queued",
        "pid": None,
        "created_ts": now,
        "heartbeat_ts": now,
        "lane": lane,
        "fork_of": body.get("fork_of"),
    }
    atomic_write_json(_run_json_path(run_dir), run_data)
    if lane == "build":
        try:
            tpl, variants = draft.make_variants(body["prompt"])
            draft.write_variants(run_dir, variants)
            draft.write_draft(run_dir, variants[0]["html"])
            cfg = projects.derive_harness_cfg(project, run_id)
            jw = packets.JournalWriter(cfg["journal_path"], run_id)
            jw.emit(
                "draft_ready",
                template=tpl,
                variants=[{"id": v["id"], "label": v["label"]} for v in variants],
            )
        except OSError:
            pass
        return run_data, 201
    pid = _spawn_worker(run_dir)
    run_data["pid"] = pid
    run_data["state"] = "running"
    atomic_write_json(_run_json_path(run_dir), run_data)
    return run_data, 201


def kill(run_data):
    pid = run_data.get("pid")
    if pid:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    run_dir = find_run_dir(run_data["run_id"])
    project = projects.get(run_data["project_id"])
    cfg = projects.derive_harness_cfg(project, run_data["run_id"])
    jw = packets.JournalWriter(cfg["journal_path"], run_data["run_id"])
    jw.emit("killed")
    supervisor.recover(cfg, only_task_ids={run_data["task"]["id"]})
    preview.stop(run_data["run_id"])
    run_data["state"] = "killed"
    run_data["pid"] = None
    atomic_write_json(_run_json_path(run_dir), run_data)
    return run_data


def resume(run_data):
    if run_data["state"] != "paused":
        raise ValueError("run is not paused")
    run_dir = find_run_dir(run_data["run_id"])
    pid = _spawn_worker(run_dir, resume=True)
    run_data["pid"] = pid
    run_data["state"] = "running"
    atomic_write_json(_run_json_path(run_dir), run_data)
    return run_data


def ship(run_data):
    """Exit edit session and start the worker pipeline."""
    if run_data["state"] != "editing":
        raise ValueError("run is not in editing state")
    run_dir = find_run_dir(run_data["run_id"])
    if not run_dir:
        raise ValueError("run directory missing")
    working = os.path.join(run_dir, "working.html")
    if not os.path.exists(working):
        raise ValueError("working draft not found")
    project = projects.get(run_data["project_id"])
    cfg = projects.derive_harness_cfg(project, run_data["run_id"])
    jw = packets.JournalWriter(cfg["journal_path"], run_data["run_id"])
    jw.emit("edit_session_end")
    run_data["task"]["edit_session"] = True
    run_data["task"]["working_file"] = "working.html"
    atomic_write_json(_run_json_path(run_dir), run_data)
    pid = _spawn_worker(run_dir)
    run_data["pid"] = pid
    run_data["state"] = "running"
    run_data["heartbeat_ts"] = time.time()
    atomic_write_json(_run_json_path(run_dir), run_data)
    return run_data


def monitor_once():
    """Single monitor tick: detect dead workers, sync terminal state."""
    for run_dir in _all_run_dirs():
        path = _run_json_path(run_dir)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            run_data = json.load(f)
        journal_path = os.path.join(run_dir, "journal.jsonl")
        if run_data["state"] not in ("running", "paused"):
            sync_state_from_journal(run_data, journal_path)
            atomic_write_json(path, run_data)
            if run_data["state"] in EVENT_TO_STATE.values():
                preview.stop(run_data["run_id"])
            continue
        events = packets.journal_read(journal_path)
        pid = run_data.get("pid")
        if run_data["state"] == "running":
            sync_state_from_journal(run_data, journal_path)
            if run_data["state"] not in ("running", "paused"):
                run_data["pid"] = None
                preview.stop(run_data["run_id"])
                atomic_write_json(path, run_data)
                continue
            if events:
                last_ts = events[-1].get("ts", 0)
            else:
                last_ts = run_data.get("created_ts", 0)
            stale = time.time() - last_ts > config.heartbeat_stale_s()
            if stale and pid and not _pid_alive(pid):
                sync_state_from_journal(run_data, journal_path)
                has_terminal = any(e.get("event") in JOURNAL_TERMINAL for e in events)
                if run_data["state"] in ("running", "paused") and not has_terminal:
                    jw = packets.JournalWriter(journal_path, run_data["run_id"])
                    jw.emit("failed", reason="worker died")
                    run_data["state"] = "failed"
                    run_data["pid"] = None
                    preview.stop(run_data["run_id"])
        sync_state_from_journal(run_data, journal_path)
        if run_data["state"] in EVENT_TO_STATE.values():
            run_data["pid"] = None
            preview.stop(run_data["run_id"])
        atomic_write_json(path, run_data)


_monitor_stop = threading.Event()
_monitor_thread = None


def start_monitor():
    global _monitor_thread
    if _monitor_thread and _monitor_thread.is_alive():
        return

    def loop():
        while not _monitor_stop.wait(config.monitor_interval_s()):
            try:
                monitor_once()
            except Exception:
                pass

    _monitor_thread = threading.Thread(target=loop, daemon=True)
    _monitor_thread.start()


def stop_monitor():
    _monitor_stop.set()
