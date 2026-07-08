"""Approval gate polling for studio runs."""

import json
import os
import time

from harness.packets import atomic_write_json


def _approval_path(run_dir, gate):
    return os.path.join(run_dir, "approvals", f"{gate}.json")


def wait(run_dir, gate, timeout_s, jw):
    """Poll for human approval; never auto-approves."""
    jw.emit("gate_open", gate=gate)
    deadline = time.time() + timeout_s
    path = _approval_path(run_dir, gate)
    while time.time() < deadline:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            jw.emit("gate_result", gate=gate, decision=data.get("decision", ""))
            return data
        time.sleep(0.5)
    jw.emit("gate_timeout", gate=gate)
    return {"decision": "timeout"}


def write_approval(run_dir, gate, decision, payload=None):
    """Atomically write an approval file."""
    os.makedirs(os.path.join(run_dir, "approvals"), exist_ok=True)
    atomic_write_json(
        _approval_path(run_dir, gate),
        {
            "decision": decision,
            "payload": payload or {},
            "ts": time.time(),
        },
    )


def is_gate_open(journal_path, gate):
    """True if journal has an unanswered gate_open for this gate."""
    from harness.packets import journal_read

    journal = journal_read(journal_path)
    last_open = last_result = None
    for e in journal:
        if e.get("event") == "gate_open" and e.get("gate") == gate:
            last_open = e
        if e.get("event") == "gate_result" and e.get("gate") == gate:
            last_result = e
    if not last_open:
        return False
    if not last_result:
        return True
    return last_open.get("seq", 0) > last_result.get("seq", 0)
