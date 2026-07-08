"""Orchestrator: gated pipeline per task. FuguNano discipline, hatchback body."""
import argparse
import json
import os
import shutil
import time

import yaml

from harness import gitops, guard, packets, review, runner
from harness.llm import Ollama


class RunPaused(Exception):
    """Circuit breaker tripped: too many consecutive infra failures."""


class RunCancelled(Exception):
    """Cooperative abort requested by control-plane hooks."""


class Hooks:
    """Optional seam for studio driver; harness only calls when provided."""

    def emit(self, event, **fields):
        pass

    def check(self):
        pass


def plan_task(ollama, cfg, task):
    prompt = (
        "Plan this coding task. Respond ONLY with JSON: "
        '{"approach": "one paragraph", "files": ["paths you will touch"]}\n'
        f"Task: {task['title']}\n{task['prompt']}\n"
        f"Allowed paths: {task['allow_paths']}")
    for _ in range(2):
        try:
            obj = json.loads(ollama.generate(
                cfg["models"]["planner"], prompt, json_mode=True))
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(obj, dict) and obj.get("approach") \
                and isinstance(obj.get("files"), list):
            if len(obj["files"]) > cfg["limits"]["max_plan_files"]:
                return None  # scope explosion: reject before burning GPU time
            return obj
    return None


def default_implementer(task, wt, model, fmt, message, cfg):
    """Run aider non-interactively inside the worktree."""
    msg_file = os.path.join(wt, ".harness_msg.txt")
    with open(msg_file, "w", encoding="utf-8") as f:
        f.write(message)
    # list form, no shell: model/format come from config, path from us,
    # and the task prompt travels via --message-file, never the command line
    cmd = ["aider", "--model", f"ollama_chat/{model}", "--edit-format", fmt,
           "--yes-always", "--no-stream", "--no-show-model-warnings",
           "--no-gitignore",  # else aider edits .gitignore -> path-gate escalation
           "--map-tokens", "1024", "--message-file", msg_file]
    # explicit file scope from the PLAN packet: weak local models succeed far
    # more often when told which files to edit than when left to repo-map search
    cmd += task.get("plan_files", [])
    code, out = runner.run_cmd(
        cmd, cwd=wt, timeout_s=cfg["limits"]["task_timeout_min"] * 60,
        extra_env={"OLLAMA_API_BASE": cfg["ollama_url"]})
    if os.path.exists(msg_file):
        os.remove(msg_file)
    return code, out


def _verify(task, wt, cfg):
    return runner.run_cmd(task["accept"], cwd=wt,
                          timeout_s=cfg["limits"]["task_timeout_min"] * 60)


def plan_stage(ollama, cfg, task, hooks=None):
    """Plan a task; emit plan_start/plan_ready when hooks are present."""
    if hooks:
        hooks.emit("plan_start", model=cfg["models"]["planner"])
    plan = plan_task(ollama, cfg, task)
    if plan is not None and hooks:
        hooks.emit("plan_ready")
    return plan


def merge_shipped(cfg, task, branch_name=None):
    """Merge a reviewed task branch into the integration worktree."""
    repo = cfg["repo_root"]
    branch = cfg["integration_branch"]
    bname = branch_name or f"harness/task/{task['id']}"
    int_wt = gitops.integration_worktree(repo, cfg["worktree_root"], branch)
    gitops.merge_task(int_wt, task["id"], branch_name=bname)


def attempt(task, model, cfg, ollama, implementer, pdir, hooks=None,
            branch_name=None, merge=True):
    """One full implement+verify+review attempt in a fresh worktree.

    Returns (status, evidence): SHIPPED | REVIEWED | BLOCKED | ESCALATED.
    When merge=False and review passes, returns REVIEWED and keeps worktree.
    """
    repo = cfg["repo_root"]
    branch = cfg["integration_branch"]
    limits = cfg["limits"]
    bname = branch_name or f"harness/task/{task['id']}"
    wt = gitops.create_worktree(repo, cfg["worktree_root"], task["id"], branch,
                                branch_name=bname)
    fmt = cfg["edit_format"][model]
    status, evidence = "BLOCKED", {}
    try:
        message = (f"{task['title']}\n\n{task['prompt']}\n\n"
                   f"Only change files under: {task['allow_paths']}")
        if task.get("plan_approach"):
            message += f"\n\nPlanned approach:\n{task['plan_approach']}"
        code, out = 1, ""
        for rnd in range(1, limits["repair_rounds"] + 1):
            if hooks:
                hooks.check()
            if hooks:
                hooks.emit("build_round_start", round=rnd, model=model)
            implementer(task, wt, model, fmt, message, cfg)
            gitops.commit_all(wt, f"harness: {task['id']} round {rnd}")
            code, out = _verify(task, wt, cfg)
            packets.atomic_write_json(
                os.path.join(pdir, f"build_{rnd}.json"),
                packets.packet("BUILD", task["id"], round=rnd, model=model,
                               exit=code))
            if hooks:
                hooks.emit("verify_done", round=rnd, exit=code)
            if code == 0:
                break
            message = (f"The acceptance command failed. Fix the code.\n"
                       f"Command: {task['accept']}\nOutput (tail):\n"
                       f"{runner.tail(out, limits['error_tail_lines'])}")
        if code != 0:
            evidence = {"reason": "acceptance command failed after "
                                  f"{limits['repair_rounds']} rounds",
                        "log_tail": runner.tail(out, 40)}
            return "BLOCKED", evidence

        changed = gitops.changed_paths(wt, branch)
        bad = guard.path_violations(changed, task["allow_paths"])
        if bad:
            if hooks:
                hooks.emit("path_gate", violations=bad)
            evidence = {"reason": "diff touches paths outside allow_paths "
                                  "or protected paths", "paths": bad}
            return "ESCALATED", evidence

        rmodel = cfg["models"]["reviewer_for"][model]
        notes = []
        for rr in range(1, limits["review_rounds"] + 1):
            if hooks:
                hooks.check()
            verdict = review.review(ollama, rmodel, task,
                                    gitops.diff_text(wt, branch),
                                    cfg["skeptic_path"], limits["max_diff_kb"])
            packets.atomic_write_json(
                os.path.join(pdir, f"review_{rr}.json"),
                packets.packet("REVIEW", task["id"], **verdict))
            if hooks:
                hooks.emit("review_round_done", round=rr,
                           verdict=verdict["verdict"])
            if verdict["verdict"] == "ACCEPT":
                break
            if verdict["verdict"] == "ESCALATE":
                evidence = {"reason": "reviewer escalated",
                            "findings": verdict.get("findings", []),
                            "detail": verdict.get("reason", "")}
                return "ESCALATED", evidence
            notes = verdict["findings"]  # NEEDS_FIX with citations
            fixmsg = "A code reviewer found issues. Address each:\n" + \
                "\n".join(f"- {f['file']}:{f['line']} {f['issue']}"
                          for f in notes)
            implementer(task, wt, model, fmt, fixmsg, cfg)
            gitops.commit_all(wt, f"harness: {task['id']} review fix {rr}")
            code, out = _verify(task, wt, cfg)
            if code != 0:
                evidence = {"reason": "regression while applying review fixes",
                            "log_tail": runner.tail(out, 40)}
                return "BLOCKED", evidence
        # rounds exhausted with NEEDS_FIX remaining -> accept-with-notes (spec)

        evidence = {"paths": changed, "accept_with_notes": notes}
        if merge:
            if hooks:
                hooks.emit("merge_start")
            merge_shipped(cfg, task, branch_name=bname)
            status = "SHIPPED"
        else:
            evidence = {**evidence, "branch": bname, "worktree": wt}
            status = "REVIEWED"
        return status, evidence
    finally:
        keep_reviewed = (not merge and status == "REVIEWED")
        if not keep_reviewed:
            gitops.remove_worktree(repo, wt, task["id"],
                                   keep_branch=(status != "SHIPPED"),
                                   branch_name=bname)


# --- orchestration --------------------------------------------------------

class Breaker:
    def __init__(self, threshold):
        self.threshold = threshold
        self.count = 0

    def ok(self):
        self.count = 0

    def infra_failure(self):
        self.count += 1
        if self.count >= self.threshold:
            raise RunPaused(f"{self.count} consecutive infra failures")


def pick_model(task, cfg):
    lane = "fix" if task["category"] in ("fix", "lint", "test-repair") else "feature"
    return cfg["models"][lane]


def alt_model(model, cfg):
    m = cfg["models"]
    return m["fix"] if model == m["feature"] else m["feature"]


def learn(stats_path, category, model, shipped):
    lock_path = stats_path + ".lock"
    fd = None
    for _ in range(600):
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(lock_path) > 30:
                    os.remove(lock_path)
                    continue
            except OSError:
                pass
            time.sleep(0.05)
    else:
        raise RuntimeError(f"could not acquire stats lock: {lock_path}")
    try:
        stats = {}
        if os.path.exists(stats_path):
            with open(stats_path, encoding="utf-8") as f:
                stats = json.load(f)
        s = stats.setdefault(category, {}).setdefault(
            model, {"ship": 0, "block": 0})
        s["ship" if shipped else "block"] += 1
        packets.atomic_write_json(stats_path, stats)
        return stats
    finally:
        if fd is not None:
            os.close(fd)
        try:
            os.remove(lock_path)
        except OSError:
            pass


def is_weak(category, model, stats, cfg):
    s = stats.get(category, {}).get(model, {"ship": 0, "block": 0})
    n = s["ship"] + s["block"]
    return (n >= cfg["limits"]["weak_min_attempts"]
            and s["ship"] / n < cfg["limits"]["weak_winrate"])


def decompose(ollama, cfg, task, evidence):
    if task.get("depth", 0) >= 1:
        return []
    prompt = (
        "This coding task failed repeatedly. Split it into 2-4 smaller, "
        "independent subtasks that together achieve it. Respond ONLY with "
        'JSON: {"subtasks": [{"title": "...", "prompt": "..."}]}\n'
        f"Task: {task['title']}\n{task['prompt']}\n"
        f"Failure evidence: {json.dumps(evidence)[:2000]}")
    try:
        obj = json.loads(ollama.generate(cfg["models"]["planner"], prompt,
                                         json_mode=True))
        subs = obj.get("subtasks", [])[:4]
    except (json.JSONDecodeError, OSError):
        return []
    out = []
    for i, s in enumerate(subs, 1):
        if not (isinstance(s, dict) and s.get("title") and s.get("prompt")):
            continue
        out.append({**task, "id": f"{task['id']}.{i}", "title": s["title"],
                    "prompt": s["prompt"], "depth": 1})
    return out


def _load_cfg(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _free_gb(path):
    return shutil.disk_usage(path).free // 2 ** 30


def _incident(cfg, task, evidence):
    pdir = os.path.join(cfg["packets_dir"], task["id"])
    os.makedirs(pdir, exist_ok=True)
    packets.atomic_write_json(
        os.path.join(pdir, "incident.json"),
        packets.packet("INCIDENT", task["id"], **evidence))


def process_task(task, cfg, ollama, implementer):
    """Full lifecycle for one task. Returns terminal status string."""
    jp = cfg["journal_path"]
    pdir = os.path.join(cfg["packets_dir"], task["id"])
    os.makedirs(pdir, exist_ok=True)

    if task["category"] == "scaffold":
        packets.journal_append(jp, {"event": "skipped_manual", "task": task["id"]})
        return "SKIPPED_MANUAL"  # OpenHands/human lane, not the unattended loop

    violations = guard.guard(task, cfg, _free_gb(cfg["repo_root"]))
    if violations:
        packets.journal_append(jp, {"event": "guard_reject", "task": task["id"],
                                    "violations": violations})
        _incident(cfg, task, {"reason": "guard", "violations": violations})
        return "GUARD_REJECTED"

    model = pick_model(task, cfg)
    if not ollama.healthy(model, cfg["limits"]["health_deadline_s"]):
        raise RunPaused(f"model {model} unhealthy (dead or CPU-fallback slow)")

    plan = plan_stage(ollama, cfg, task)
    if plan is None:
        packets.journal_append(jp, {"event": "plan_reject", "task": task["id"]})
        _incident(cfg, task, {"reason": "unplannable or scope explosion"})
        return "PLAN_REJECTED"
    packets.atomic_write_json(os.path.join(pdir, "plan.json"),
                              packets.packet("PLAN", task["id"], **plan))
    # feed the plan forward: approach into the prompt, files into aider's args
    task = {**task, "plan_approach": plan["approach"],
            "plan_files": plan["files"]}

    packets.journal_append(jp, {"event": "start", "task": task["id"],
                                "model": model})
    status, evidence = attempt(task, model, cfg, ollama, implementer, pdir)

    stats = learn(cfg["stats_path"], task["category"], model,
                  status == "SHIPPED")
    if status == "BLOCKED" and is_weak(task["category"], model, stats, cfg):
        # ponytail: sequential retry-with-alternate stands in for true
        # best-of-2; verifier is binary so first green ships either way
        other = alt_model(model, cfg)
        packets.journal_append(jp, {"event": "alt_retry", "task": task["id"],
                                    "model": other})
        status, evidence = attempt(task, other, cfg, ollama, implementer, pdir)
        learn(cfg["stats_path"], task["category"], other, status == "SHIPPED")

    packets.journal_append(jp, {"event": status.lower(), "task": task["id"],
                                "evidence": evidence})
    if status != "SHIPPED":
        _incident(cfg, task, evidence)
    return status


def recover(cfg, only_task_ids=None):
    """Idempotent startup: remove orphaned worktrees from a crashed run."""
    for path in gitops.stale_worktrees(cfg["worktree_root"]):
        name = os.path.basename(path)
        if only_task_ids is not None and name not in only_task_ids:
            continue
        try:
            gitops.git(["worktree", "remove", "--force", path],
                       cfg["repo_root"])
        except gitops.GitError:
            shutil.rmtree(path, ignore_errors=True)
    try:
        gitops.git(["worktree", "prune"], cfg["repo_root"])
    except gitops.GitError:
        pass


def _load_tasks(cfg):
    with open(cfg["tasks_path"], encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def run(cfg, ollama, implementer, max_tasks=0):
    gitops.ensure_integration(cfg["repo_root"], cfg["integration_branch"])
    os.makedirs(cfg["worktree_root"], exist_ok=True)
    os.makedirs(cfg["packets_dir"], exist_ok=True)
    recover(cfg)

    done = {e["task"] for e in packets.journal_read(cfg["journal_path"])
            if e.get("event") in ("shipped", "skipped_manual")}
    queue = [t for t in _load_tasks(cfg) if t["id"] not in done]
    breaker = Breaker(cfg["limits"]["infra_failure_breaker"])
    deadline = time.time() + cfg["limits"]["run_cap_hours"] * 3600
    results = {}
    processed = 0

    try:
        while queue:
            if time.time() > deadline:
                packets.journal_append(cfg["journal_path"], {"event": "run_cap"})
                break
            if max_tasks and processed >= max_tasks:
                break
            task = queue.pop(0)
            try:
                status = process_task(task, cfg, ollama, implementer)
                breaker.ok()
            except RunPaused:
                raise
            except (gitops.GitError, OSError) as exc:
                packets.journal_append(cfg["journal_path"],
                                       {"event": "infra_error", "task": task["id"],
                                        "error": str(exc)})
                recover(cfg)
                breaker.infra_failure()
                status = "INFRA_ERROR"
            results[task["id"]] = status
            processed += 1
            if status == "BLOCKED":  # ESCALATED means "needs a human", not retries
                subs = decompose(ollama, cfg, task, {"status": status})
                if subs:
                    with open(cfg["generated_tasks_path"], "a",
                              encoding="utf-8") as f:
                        yaml.safe_dump(subs, f)
                    queue = subs + queue  # subtasks run next, before the rest
    finally:
        # a circuit-breaker pause must still leave a report behind
        write_report(cfg, results)
    return results


def write_report(cfg, results=None):
    lines = ["# Harness run report", ""]
    events = packets.journal_read(cfg["journal_path"])
    terminal = {}
    for e in events:
        if e.get("event") in ("shipped", "blocked", "escalated",
                              "guard_reject", "plan_reject", "skipped_manual",
                              "infra_error"):
            terminal[e["task"]] = e
    for task_id, e in sorted(terminal.items()):
        lines.append(f"## {task_id}: {e['event'].upper()}")
        ev = e.get("evidence") or e.get("violations") or ""
        if ev:
            lines.append(f"```\n{json.dumps(ev, indent=2)[:1500]}\n```")
        lines.append("")
    with open(cfg["report_path"], "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Local AI dev harness")
    ap.add_argument("--config", default="harness/config.yaml")
    ap.add_argument("--max-tasks", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true",
                    help="guard-check the queue, no execution")
    args = ap.parse_args(argv)
    cfg = _load_cfg(args.config)
    if args.dry_run:
        for task in _load_tasks(cfg):
            v = guard.guard(task, cfg, _free_gb(cfg["repo_root"]))
            print(f"{task['id']}: {'OK' if not v else v}")
        return 0
    ollama = Ollama(cfg["ollama_url"])
    try:
        results = run(cfg, ollama, default_implementer,
                      max_tasks=args.max_tasks)
    except RunPaused as exc:
        print(f"RUN PAUSED: {exc}")
        return 2
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
