"""Typed evidence packets, atomic writes, write-ahead journal."""
import json
import os
import time
import uuid

VERDICTS = {"ACCEPT", "NEEDS_FIX", "ESCALATE"}


def atomic_write_json(path, obj):
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def journal_append(path, event):
    event = {"ts": time.time(), **event}
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
    return event


def journal_read(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                pass  # torn tail write from a crash — ignore, WAL semantics
            else:
                # concurrent writers (worker heartbeat thread, driver, kill
                # path) keep independent counters, so stored seqs collide;
                # file append order is the real sequence — renumber on read
                rec["seq"] = len(out)
                out.append(rec)
    return out


class JournalWriter:
    """Run-scoped journal with monotonic seq and run_id on every event."""

    def __init__(self, path, run_id):
        self.path = path
        self.run_id = run_id
        self.seq = 0
        for e in journal_read(path):
            if "seq" in e and isinstance(e["seq"], int):
                self.seq = max(self.seq, e["seq"] + 1)

    def emit(self, event, **fields):
        line = {
            "ts": time.time(),
            "seq": self.seq,
            "run_id": self.run_id,
            "event": event,
            **fields,
        }
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(line) + "\n")
        self.seq += 1
        return line


def packet(kind, task_id, **fields):
    return {"kind": kind, "task": task_id, "id": uuid.uuid4().hex[:8],
            "ts": time.time(), **fields}


def parse_verdict(raw):
    try:
        obj = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(obj, dict) or obj.get("verdict") not in VERDICTS:
        return None
    obj.setdefault("findings", [])
    if obj["verdict"] == "NEEDS_FIX":
        cited = [f for f in obj["findings"]
                 if isinstance(f, dict) and f.get("file") and f.get("line")]
        if not cited:
            obj["verdict"] = "ACCEPT"
            obj["downgraded"] = True
    return obj
