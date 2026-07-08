import asyncio

import pytest
from harness import packets
from studio.events import stream_events


@pytest.fixture
def journal(tmp_path):
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    path = run_dir / "journal.jsonl"
    run_id = "r1"
    jw = packets.JournalWriter(str(path), run_id)
    for ev in [
        "run_start",
        "plan_start",
        "plan_ready",
        "gate_open",
        "gate_result",
        "build_round_start",
        "verify_done",
        "accept_ready",
    ]:
        kw = {"gate": "plan"} if "gate" in ev else {}
        if ev == "gate_open":
            kw = {"gate": "plan"}
        elif ev == "gate_result":
            kw = {"gate": "plan", "decision": "approve"}
        jw.emit(ev, task="t1", **kw)
    run_data = {"run_id": run_id, "state": "shipped"}
    return str(run_dir), run_data


def _collect(gen, max_chunks=50):
    async def _run():
        out = []
        n = 0
        async for chunk in gen:
            out.append(chunk)
            n += 1
            if n >= max_chunks:
                break
        return out

    return asyncio.run(_run())


def test_reconnect_from_last_event_id(journal):
    run_dir, run_data = journal
    chunks = _collect(stream_events(run_dir, run_data, last_event_id=3))
    ids = []
    for c in chunks:
        for line in c.split("\n"):
            if line.startswith("id:"):
                ids.append(int(line.split(": ")[1]))
    assert ids[0] == 4
    assert 3 not in ids


def test_no_dupes_on_reconnect(journal):
    run_dir, run_data = journal
    c2 = _collect(stream_events(run_dir, run_data, last_event_id=3))
    ids2 = {
        line.split(": ")[1]
        for c in c2
        for line in c.split("\n")
        if line.startswith("id:")
    }
    assert not any(int(i) <= 3 for i in ids2)


def test_completed_run_emits_done(journal):
    run_dir, run_data = journal
    chunks = _collect(stream_events(run_dir, run_data, last_event_id=-1))
    assert any("event: done" in c for c in chunks)
