import json
import os

from harness import packets


def test_atomic_write_json(tmp_path):
    p = tmp_path / "out.json"
    packets.atomic_write_json(str(p), {"a": 1})
    assert json.loads(p.read_text()) == {"a": 1}
    assert not os.path.exists(str(p) + ".tmp")


def test_journal_roundtrip_and_torn_tail(tmp_path):
    j = str(tmp_path / "journal.jsonl")
    packets.journal_append(j, {"event": "start", "task": "T1"})
    packets.journal_append(j, {"event": "ship", "task": "T1"})
    with open(j, "a", encoding="utf-8") as f:
        f.write('{"event": "torn')  # simulated crash mid-write
    events = packets.journal_read(j)
    assert [e["event"] for e in events] == ["start", "ship"]
    assert all("ts" in e for e in events)


def test_packet_shape():
    p = packets.packet("BUILD", "T1", exit=0)
    assert p["kind"] == "BUILD" and p["task"] == "T1" and p["exit"] == 0
    assert "id" in p and "ts" in p


def test_parse_verdict_valid():
    v = packets.parse_verdict('{"verdict": "ACCEPT", "findings": []}')
    assert v["verdict"] == "ACCEPT"


def test_parse_verdict_garbage_returns_none():
    assert packets.parse_verdict("not json") is None
    assert packets.parse_verdict('{"verdict": "MAYBE"}') is None


def test_needs_fix_without_citation_downgrades():
    v = packets.parse_verdict('{"verdict": "NEEDS_FIX", "findings": [{"issue": "vague"}]}')
    assert v["verdict"] == "ACCEPT" and v["downgraded"] is True


def test_needs_fix_with_citation_stands():
    raw = '{"verdict": "NEEDS_FIX", "findings": [{"file": "a.py", "line": 3, "issue": "bug"}]}'
    assert packets.parse_verdict(raw)["verdict"] == "NEEDS_FIX"
