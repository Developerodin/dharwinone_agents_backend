"""Deterministic zero-token checks before any GPU time is spent."""
import re
import socket

BAD_ACCEPT = re.compile(r"\b(dev|watch|serve|start)\b")
ARG_RE = re.compile(r"^[A-Za-z0-9_./:\-]+$")
REQUIRED = ("id", "category", "title", "prompt", "accept", "allow_paths")
# diffs touching these auto-escalate (mitigation #3: test-gaming / self-editing)
PROTECTED = ("backend/harness/", ".github/", "docs/superpowers/")


def lint_accept(cmd):
    return not BAD_ACCEPT.search(cmd)


def probe(req):
    parts = req.split(":")
    host, port = ("127.0.0.1", parts[1]) if len(parts) == 2 else (parts[1], parts[2])
    try:
        with socket.create_connection((host, int(port)), timeout=3):
            return True
    except OSError:
        return False


def path_violations(changed_paths, allow_paths):
    bad = []
    for p in changed_paths:
        p = p.replace("\\", "/")
        if any(p.startswith(x) for x in PROTECTED) or \
                not any(p.startswith(a) for a in allow_paths):
            bad.append(p)
    return bad


def _resolve_chat_accept(task, cfg, violations):
    if isinstance(task.get("accept"), str):
        violations.append("chat tasks must use accept_template, not string accept")
        return
    tpl_name = task.get("accept_template")
    templates = cfg.get("accept_templates") or {}
    if not tpl_name or tpl_name not in templates:
        violations.append(f"unknown accept_template: {tpl_name!r}")
        return
    args = task.get("accept_args") or []
    for arg in args:
        if not isinstance(arg, str) or not ARG_RE.match(arg) or ".." in arg:
            violations.append(f"invalid accept_arg: {arg!r}")
            return
    argv = []
    for part in templates[tpl_name]:
        if part == "{args}":
            argv.extend(args)
        else:
            argv.append(part)
    task["accept"] = argv


def guard(task, cfg, free_gb):
    violations = []
    if task.get("source") == "chat":
        _resolve_chat_accept(task, cfg, violations)
    for k in REQUIRED:
        if not task.get(k):
            violations.append(f"missing field: {k}")
    if task.get("source") != "chat" and task.get("accept") \
            and isinstance(task["accept"], str) and not lint_accept(task["accept"]):
        violations.append(
            f"acceptance command looks interactive/watch-mode: {task['accept']}")
    if free_gb < cfg["limits"]["min_disk_gb"]:
        violations.append(f"low disk: {free_gb}GB free")
    for req in task.get("requires", []):
        if not probe(req):
            violations.append(f"service unavailable: {req}")
    return violations
