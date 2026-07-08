"""SSE event stream for run journals."""

import asyncio
import json
import os

from harness import packets

TERMINAL_EVENTS = frozenset(
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


def _format_sse(event):
    data = json.dumps(event)
    seq = event.get("seq", "")
    ev = event.get("event", "message")
    return f"id: {seq}\nevent: {ev}\ndata: {data}\n\n"


async def stream_events(run_dir, run_data, last_event_id=-1):
    """Async generator yielding SSE messages for a run."""
    journal_path = os.path.join(run_dir, "journal.jsonl")
    last_id = int(last_event_id)
    sent = set()

    def new_events():
        events = packets.journal_read(journal_path)
        out = []
        for e in events:
            if "seq" not in e:
                continue
            if e["seq"] > last_id and e["seq"] not in sent:
                out.append(e)
        return out

    for e in new_events():
        sent.add(e["seq"])
        last_id = max(last_id, e["seq"])
        yield _format_sse(e)

    poll_s = float(os.environ.get("STUDIO_SSE_POLL_SEC", "0.25"))
    while True:
        found = False
        for e in new_events():
            found = True
            sent.add(e["seq"])
            last_id = max(last_id, e["seq"])
            yield _format_sse(e)
        state = run_data.get("state", "")
        terminal = state in (
            "shipped",
            "blocked",
            "escalated",
            "rejected",
            "killed",
            "failed",
        )
        if terminal and not found:
            events = packets.journal_read(journal_path)
            pending = [
                e
                for e in events
                if "seq" in e and e["seq"] > last_id and e["seq"] not in sent
            ]
            for e in pending:
                sent.add(e["seq"])
                last_id = max(last_id, e["seq"])
                yield _format_sse(e)
            yield "event: done\ndata: {}\n\n"
            break
        if terminal:
            drained = True
            events = packets.journal_read(journal_path)
            for e in events:
                if "seq" in e and e["seq"] > last_id:
                    drained = False
                    break
            if drained:
                yield "event: done\ndata: {}\n\n"
                break
        await asyncio.sleep(poll_s)
        path = os.path.join(run_dir, "run.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                run_data.update(json.load(f))
