"""Dev preview server manager for studio runs."""

import os
import socket
import subprocess
import time
import urllib.request

from harness import runner

from studio import projects

CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
PREVIEW_TAG_PREFIX = "preview-"
_ACTIVE = {}


def _find_free_port(project):
    lo, hi = project.get("dev_port_range", [4310, 4399])
    for port in range(lo, hi + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port in dev_port_range")


def _worktree_path(project, run_data):
    cfg = projects.derive_harness_cfg(project, run_data["run_id"])
    wt_root = run_data.get("worktree_root") or cfg["worktree_root"]
    task_id = run_data["task"]["id"]
    return os.path.join(wt_root, task_id)


def _wait_ready(port, timeout_s=60):
    deadline = time.time() + timeout_s
    url = f"http://127.0.0.1:{port}/"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status < 600:
                    return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def start(run_data):
    run_id = run_data["run_id"]
    if run_id in _ACTIVE:
        return _ACTIVE[run_id]
    project = projects.get(run_data["project_id"])
    wt = _worktree_path(project, run_data)
    if not os.path.isdir(wt):
        raise FileNotFoundError(f"worktree not found: {wt}")
    port = _find_free_port(project)
    env = {**os.environ, "PORT": str(port)}
    cmd = project.get("dev_cmd", "npm run dev")
    proc = subprocess.Popen(
        cmd,
        cwd=wt,
        env=env,
        shell=True,
        creationflags=CREATE_NEW_PROCESS_GROUP,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    tag = f"{PREVIEW_TAG_PREFIX}{run_id}"
    runner.ACTIVE.setdefault(tag, set()).add(proc.pid)
    ready = _wait_ready(
        port, timeout_s=float(os.environ.get("STUDIO_PREVIEW_READY_SEC", "60"))
    )
    status = "ready" if ready else "starting"
    info = {"url": f"http://127.0.0.1:{port}/", "port": port, "status": status}
    _ACTIVE[run_id] = {**info, "pid": proc.pid, "tag": tag}
    return info


def get_status(run_id):
    return _ACTIVE.get(run_id, {"url": None, "port": None, "status": "stopped"})


def stop(run_id):
    info = _ACTIVE.pop(run_id, None)
    if info:
        runner.kill_tag(info.get("tag", f"{PREVIEW_TAG_PREFIX}{run_id}"))
    return {"url": None, "port": None, "status": "stopped"}
