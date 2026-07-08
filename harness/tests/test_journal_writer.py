import json

from harness import packets


def test_fresh_file_starts_at_seq_zero(tmp_path):
    j = str(tmp_path / "journal.jsonl")
    w = packets.JournalWriter(j, "run-1")
    e0 = w.emit("run_start", task="T1")
    e1 = w.emit("plan_start", model="planner")
    assert e0["seq"] == 0
    assert e1["seq"] == 1
    assert e0["run_id"] == "run-1"
    assert e0["event"] == "run_start"
    assert "ts" in e0


def test_resumes_from_last_seq(tmp_path):
    j = str(tmp_path / "journal.jsonl")
    w1 = packets.JournalWriter(j, "run-1")
    w1.emit("run_start", task="T1")
    w1.emit("plan_start", model="planner")
    w2 = packets.JournalWriter(j, "run-2")
    e = w2.emit("plan_ready")
    assert e["seq"] == 2
    assert e["run_id"] == "run-2"


def test_seq_is_file_order_regardless_of_writer(tmp_path):
    # concurrent writers keep independent counters, so journal_read
    # renumbers by file position — the only sequence that can't collide
    j = str(tmp_path / "journal.jsonl")
    packets.journal_append(j, {"event": "start", "task": "legacy"})
    w1 = packets.JournalWriter(j, "run-1")
    w1.emit("run_start", task="T1")
    w2 = packets.JournalWriter(j, "run-2")
    w2.emit("heartbeat")
    w1.emit("plan_ready")  # would collide with w2's counter pre-renumber
    events = packets.journal_read(j)
    assert [e["seq"] for e in events] == [0, 1, 2, 3]


def test_emitted_lines_readable_by_journal_read(tmp_path):
    j = str(tmp_path / "journal.jsonl")
    w = packets.JournalWriter(j, "run-abc")
    w.emit("run_start", task="T1")
    w.emit("shipped", evidence={"ok": True})
    events = packets.journal_read(j)
    assert len(events) == 2
    assert events[0]["seq"] == 0 and events[1]["seq"] == 1
    assert events[1]["event"] == "shipped"
    assert events[1]["evidence"] == {"ok": True}
