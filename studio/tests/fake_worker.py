"""Scripted worker for studio tests and E2E (STUDIO_FAKE_WORKER).

Replays happy_path_journal.jsonl, writes gate packets, and blocks on
approvals/<gate>.json before continuing past gate_open events.
"""

import argparse
import json
import os
import sys
import time

# spawned as a script: repo root is not on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from harness.packets import JournalWriter, atomic_write_json, packet

FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "happy_path_journal.jsonl"
)
POLL = float(os.environ.get("STUDIO_GATE_POLL", "0.25"))


def _load_fixture():
    events = []
    with open(FIXTURE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def _write_packets(run_dir, task_id):
    pdir = os.path.join(run_dir, "packets", task_id)
    os.makedirs(pdir, exist_ok=True)
    atomic_write_json(
        os.path.join(pdir, "plan.json"),
        packet(
            "PLAN", task_id, approach="Demo approach for E2E.", files=["src/demo.txt"]
        ),
    )
    atomic_write_json(
        os.path.join(pdir, "explain.json"),
        packet(
            "EXPLAIN",
            task_id,
            summary="Adds demo.txt with hello content.",
            files=["src/demo.txt"],
        ),
    )
    atomic_write_json(
        os.path.join(pdir, "simulate.json"),
        packet(
            "SIMULATE",
            task_id,
            blast_files=["src/demo.txt"],
            blast_count=1,
            size_band="S",
            risk="low",
        ),
    )


def _wait_gate(run_dir, gate):
    path = os.path.join(run_dir, "approvals", f"{gate}.json")
    while not os.path.exists(path):
        time.sleep(POLL)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def replay_happy(run_dir, jw, task_id):
    approvals = os.path.join(run_dir, "approvals")
    os.makedirs(approvals, exist_ok=True)
    _write_packets(run_dir, task_id)
    for ev in _load_fixture():
        name = ev["event"]
        fields = {
            k: v for k, v in ev.items() if k not in ("ts", "seq", "run_id", "event")
        }
        if name == "gate_result":
            continue
        if name == "gate_open":
            jw.emit(name, **fields)
            approval = _wait_gate(run_dir, fields["gate"])
            jw.emit(
                "gate_result",
                gate=fields["gate"],
                decision=approval.get("decision", "approve"),
            )
            continue
        jw.emit(name, **fields)
        time.sleep(float(os.environ.get("STUDIO_FAKE_EVENT_DELAY", "0.05")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    run_dir = os.path.abspath(args.run_dir)
    with open(os.path.join(run_dir, "run.json"), encoding="utf-8") as f:
        run_data = json.load(f)
    run_id = run_data["run_id"]
    task_id = run_data["task"]["id"]
    journal_path = os.path.join(run_dir, "journal.jsonl")
    jw = JournalWriter(journal_path, run_id)
    mode = os.environ.get("STUDIO_FAKE_WORKER_MODE", "happy")

    if mode == "silent_death":
        time.sleep(0.5)
        return 0

    if mode == "heartbeat_only":
        jw.emit("run_start", task=task_id)
        for _ in range(3):
            jw.emit("heartbeat")
            time.sleep(float(os.environ.get("STUDIO_HEARTBEAT_INTERVAL", "0.2")))
        time.sleep(60)
        return 0

    if mode == "plan_pause":
        if not args.resume:
            jw.emit("run_start", task=task_id)
            jw.emit("plan_start", model="fake")
            jw.emit("plan_ready")
            jw.emit("explain_start")
            jw.emit("explain_ready")
            jw.emit("simulate_ready")
            jw.emit("gate_open", gate="plan")
            run_data["state"] = "paused"
            atomic_write_json(os.path.join(run_dir, "run.json"), run_data)
            time.sleep(30)
        else:
            jw.emit("gate_result", gate="plan", decision="timeout")
            jw.emit("paused", gate="plan")
        return 0

    if mode == "terminal_shipped":
        jw.emit("run_start", task=task_id)
        jw.emit("shipped", task=task_id, evidence={})
        run_data["state"] = "shipped"
        atomic_write_json(os.path.join(run_dir, "run.json"), run_data)
        return 0

    if mode == "happy":
        replay_happy(run_dir, jw, task_id)
        run_data["state"] = "shipped"
        atomic_write_json(os.path.join(run_dir, "run.json"), run_data)
        return 0

    jw.emit("run_start", task=task_id)
    jw.emit("shipped", task=task_id, evidence={})
    return 0


if __name__ == "__main__":
    sys.exit(main())
