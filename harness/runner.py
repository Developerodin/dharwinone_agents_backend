"""Run commands non-interactively with hard timeouts (mitigation #2).

cmd may be a list (preferred - no shell interpretation) or a string.
String commands run with shell=True BY DESIGN: acceptance commands in
tasks.yaml are shell one-liners written by the repo owner, and tasks.yaml
sits under harness/ which the guard blocklist forbids models from editing.
That file is the trust boundary; never pass model-generated text as cmd.
"""
import os
import subprocess

ACTIVE = {}


def run_cmd(cmd, cwd, timeout_s, extra_env=None, tag=None):
    env = {**os.environ, "CI": "true", **(extra_env or {})}
    proc = subprocess.Popen(
        cmd, cwd=cwd, shell=isinstance(cmd, str), env=env, text=True,
        encoding="utf-8", errors="replace",  # tool output is UTF-8, not cp1252
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    if tag:
        ACTIVE.setdefault(tag, set()).add(proc.pid)
    try:
        out, _ = proc.communicate(timeout=timeout_s)
        return proc.returncode, out or ""
    except subprocess.TimeoutExpired:
        # kill the whole tree: a plain kill leaves node children holding ports
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
        try:
            out, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            out = ""
        return 124, (out or "") + "\n[TIMEOUT: process tree killed]"
    finally:
        if tag and tag in ACTIVE:
            ACTIVE[tag].discard(proc.pid)
            if not ACTIVE[tag]:
                del ACTIVE[tag]


def kill_tag(tag):
    for pid in list(ACTIVE.get(tag, ())):
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                       capture_output=True)
    ACTIVE.pop(tag, None)


def tail(text, lines):
    return "\n".join(text.splitlines()[-lines:])
