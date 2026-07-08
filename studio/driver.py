"""Gated task driver — studio orchestration over harness primitives."""

import json
import os
import shutil

from harness import analysis, gitops, guard, packets, providers, supervisor

from studio import config, consent, draft, gates


def build_prompt_context(project):
    from studio import knowledge

    return knowledge.build_prompt_context(project)


class _DriverHooks(supervisor.Hooks):
    def __init__(self, jw):
        self.jw = jw

    def emit(self, event, **fields):
        self.jw.emit(event, **fields)

    def check(self):
        pass


def _planner_model(cfg, project):
    prov = (project.get("providers") or {}).get("planner")
    if prov and prov.get("model"):
        return prov["model"]
    return cfg["models"]["planner"]


def _stage_provider(cfg, project, stage, policy=None, run_id=None):
    merged = {**cfg, "providers": project.get("providers")}
    stage_cfg = (project.get("providers") or {}).get(stage) or {}
    kind = stage_cfg.get("kind", "ollama")
    model = stage_cfg.get("model", "")
    prov = providers.get(merged, stage, policy=policy)
    if run_id and kind in consent._CLOUD_KINDS:
        return consent.wrap_provider(prov, project, run_id, stage, kind, model)
    return prov


def _free_gb(path):
    return shutil.disk_usage(path).free // 2**30


def _task_packets_dir(cfg, task_id):
    return os.path.join(cfg["packets_dir"], task_id)


def _write_packet(cfg, task_id, name, body):
    pdir = _task_packets_dir(cfg, task_id)
    os.makedirs(pdir, exist_ok=True)
    packets.atomic_write_json(os.path.join(pdir, name), body)


def _terminal(jw, event, task_id, **fields):
    jw.emit(event, task=task_id, **fields)


def _incident(cfg, task_id, evidence):
    _write_packet(
        cfg, task_id, "incident.json", packets.packet("INCIDENT", task_id, **evidence)
    )


def _write_plan_md(cfg, task_id, task, plan, explain_fields, sim_fields):
    """Human-readable plan document next to the JSON packets."""
    blast = sim_fields.get("blast_files") or []
    lines = [
        f"# Plan — {task['title']}",
        "",
        f"Run: `{task_id}`",
        "",
        "## Approach",
        "",
        plan["approach"],
        "",
        "## Files",
        "",
        *[f"- `{p}`" for p in plan["files"]],
        "",
        "## Summary",
        "",
        explain_fields.get("summary", "(unavailable)"),
        "",
        "## Blast radius",
        "",
        f"Risk: {sim_fields.get('risk', '—')} · "
        f"{sim_fields.get('blast_count', 0)} files touched "
        f"({sim_fields.get('size_band', '—')})",
        "",
        *([f"- `{p}`" for p in blast] or ["- no direct importers detected"]),
        "",
    ]
    path = os.path.join(_task_packets_dir(cfg, task_id), "plan.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _load_plan_packet(cfg, task_id):
    path = os.path.join(_task_packets_dir(cfg, task_id), "plan.json")
    with open(path, encoding="utf-8") as f:
        body = json.load(f)
    return {"approach": body["approach"], "files": body["files"]}


def _accept_evidence(cfg, task_id):
    wt = os.path.join(cfg["worktree_root"], task_id)
    branch = gitops.git(["rev-parse", "--abbrev-ref", "HEAD"], wt).strip()
    return {"worktree": wt, "branch": branch}


def _personalize_draft(cfg, project, run_dir, task, choice, jw, policy, run_id):
    """LLM-customize a copy of the chosen draft into draft-custom.html.

    Best-effort: reads the run-dir copy, never the template files, and any
    failure just leaves the un-personalized draft in place.
    """
    try:
        idx = int(choice.get("variant", 0))
        with open(os.path.join(run_dir, f"draft-{idx}.html"), encoding="utf-8") as f:
            base = f.read()
        prov = _stage_provider(cfg, project, "planner", policy=policy, run_id=run_id)
        custom = draft.customize(
            prov, _planner_model(cfg, project), base, task["prompt"]
        )
        if custom:
            draft.write_custom(run_dir, custom)
            jw.emit("draft_custom_ready")
    except Exception:
        pass


def run_task(
    project,
    run_id,
    task,
    cfg,
    implementer,
    gate_timeout_s=3600,
    resume_from=None,
    policy=None,
):
    """Execute one gated studio task; returns terminal status string."""
    run_dir = config.run_dir(project["id"], run_id)
    jw = packets.JournalWriter(cfg["journal_path"], run_id)
    hooks = _DriverHooks(jw)
    task_id = task["id"]
    pdir = _task_packets_dir(cfg, task_id)
    os.makedirs(pdir, exist_ok=True)
    os.makedirs(cfg["worktree_root"], exist_ok=True)
    gitops.ensure_integration(cfg["repo_root"], cfg["integration_branch"])

    ctx = build_prompt_context(project)
    work_task = dict(task)
    if ctx:
        work_task = {**work_task, "prompt": f"{ctx}\n\n{work_task['prompt']}"}

    if work_task.get("category") == "build":
        # greenfield builds legitimately touch many files; the default
        # max_plan_files cap is sized for fix/feature diffs and would
        # reject every new-site plan as "scope explosion"
        cfg = {
            **cfg,
            "limits": {
                **cfg["limits"],
                "max_plan_files": max(30, cfg["limits"]["max_plan_files"]),
            },
        }

    if resume_from == "accept":
        evidence = _accept_evidence(cfg, task_id)
        jw.emit("accept_ready")
        accept_gate = gates.wait(run_dir, "accept", gate_timeout_s, jw)
        if accept_gate.get("decision") == "approve":
            branch = evidence["branch"]
            wt = evidence["worktree"]
            gitops.remove_worktree(
                cfg["repo_root"], wt, task_id, keep_branch=True, branch_name=branch
            )
            hooks.emit("merge_start")
            supervisor.merge_shipped(cfg, work_task, branch_name=branch)
            gitops.git(["branch", "-D", branch], cfg["repo_root"])
            _terminal(jw, "shipped", task_id, evidence=evidence)
            return "SHIPPED"
        if accept_gate.get("decision") == "reject":
            gitops.remove_worktree(
                cfg["repo_root"],
                evidence["worktree"],
                task_id,
                keep_branch=False,
                branch_name=evidence["branch"],
            )
            _terminal(jw, "rejected_by_user", task_id, gate="accept")
            return "REJECTED"
        _terminal(jw, "paused", task_id, gate="accept")
        return "PAUSED"

    if resume_from != "plan":
        jw.emit("run_start", task=task_id)
        if work_task.get("category") == "build" and not work_task.get("edit_session"):
            # instant template draft variants; the user picks a design (or
            # skips) BEFORE any planning starts — a real gate, like plan/accept
            drafted = False
            try:
                tpl, variants = draft.make_variants(task["prompt"])
                draft.write_variants(run_dir, variants)
                draft.write_draft(run_dir, variants[0]["html"])
                jw.emit(
                    "draft_ready",
                    template=tpl,
                    variants=[{"id": v["id"], "label": v["label"]} for v in variants],
                )
                drafted = True
            except OSError:
                pass  # drafts are best-effort; skip the gate if they failed
            if drafted:
                design_gate = gates.wait(run_dir, "design", gate_timeout_s, jw)
                if design_gate.get("decision") == "timeout":
                    _terminal(jw, "paused", task_id, gate="design")
                    return "PAUSED"
                choice = design_gate.get("payload") or {}
                if choice.get("id"):
                    packets.atomic_write_json(
                        os.path.join(run_dir, "draft-choice.json"), choice
                    )
                    _personalize_draft(
                        cfg, project, run_dir, task, choice, jw, policy, run_id
                    )
        violations = guard.guard(work_task, cfg, _free_gb(cfg["repo_root"]))
        if violations:
            jw.emit("guard_reject", violations=violations)
            evidence = {"reason": "guard", "violations": violations}
            _incident(cfg, task_id, evidence)
            _terminal(jw, "escalated", task_id, evidence=evidence)
            return "ESCALATED"

        planner = _stage_provider(cfg, project, "planner", policy=policy, run_id=run_id)
        planner_model = _planner_model(cfg, project)
        hooks.emit("plan_start", model=planner_model)
        plan = supervisor.plan_task(planner, cfg, work_task)
        if plan is None:
            evidence = {"reason": "unplannable or scope explosion"}
            _incident(cfg, task_id, evidence)
            _terminal(jw, "escalated", task_id, evidence=evidence)
            return "ESCALATED"
        _write_packet(
            cfg, task_id, "plan.json", packets.packet("PLAN", task_id, **plan)
        )
        hooks.emit("plan_ready")

        jw.emit("explain_start")
        explain_body = analysis.explain(
            planner, planner_model, work_task, plan["files"], cfg["repo_root"]
        )
        explain_fields = {k: v for k, v in explain_body.items() if k != "kind"}
        _write_packet(
            cfg,
            task_id,
            "explain.json",
            packets.packet("EXPLAIN", task_id, **explain_fields),
        )
        jw.emit("explain_ready")

        sim_body = analysis.simulate(cfg["repo_root"], plan["files"])
        sim_fields = {k: v for k, v in sim_body.items() if k != "kind"}
        _write_packet(
            cfg,
            task_id,
            "simulate.json",
            packets.packet("SIMULATE", task_id, **sim_fields),
        )
        _write_plan_md(cfg, task_id, work_task, plan, explain_fields, sim_fields)
        jw.emit("simulate_ready")
    else:
        plan = _load_plan_packet(cfg, task_id)
        guard.guard(work_task, cfg, _free_gb(cfg["repo_root"]))

    plan_gate = gates.wait(run_dir, "plan", gate_timeout_s, jw)
    if plan_gate.get("decision") == "reject":
        _terminal(jw, "rejected_by_user", task_id, gate="plan")
        return "REJECTED"
    if plan_gate.get("decision") == "timeout":
        _terminal(jw, "paused", task_id, gate="plan")
        return "PAUSED"

    payload = plan_gate.get("payload") or {}
    approach = payload.get("approach", plan["approach"])
    files = payload.get("files", plan["files"])
    work_task = {
        **work_task,
        "plan_approach": approach,
        "plan_files": files,
    }

    working_file = work_task.get("working_file", "working.html")
    working_path = os.path.join(run_dir, working_file)
    if os.path.exists(working_path):
        work_task["prompt"] = (
            f"{work_task['prompt']}\n\n"
            f"Use {working_file} in the run directory as the approved static"
            " design source. Keep its sections and visual language unless"
            " the user plan explicitly asks for structural changes."
        )

    choice = draft.read_choice(run_dir)
    if choice:
        pack = next((p for p in draft.STYLE_PACKS if p["id"] == choice.get("id")), None)
        style = f"Visual direction: the user chose the '{choice.get('label')}' design draft."
        if pack and pack.get("accent"):
            style += (
                f" Use this palette — accent {pack['accent']},"
                f" text {pack['ink']}, background {pack['bg']},"
                f" surfaces {pack['surface']}; font stack {pack['font']}."
            )
        elif os.path.exists(os.path.join(run_dir, "draft-custom.html")):
            style += (
                " A personalized copy of that template is at"
                " draft-custom.html in the run directory; match its"
                " layout, sections, and content."
            )
        work_task["prompt"] = f"{work_task['prompt']}\n\n{style}"

    model = supervisor.pick_model(work_task, cfg)
    implementer_provider = _stage_provider(
        cfg, project, "implementer_llm", policy=policy, run_id=run_id
    )
    status, evidence = supervisor.attempt(
        work_task,
        model,
        cfg,
        implementer_provider,
        implementer,
        pdir,
        hooks=hooks,
        merge=False,
    )

    if status == "REVIEWED":
        jw.emit("accept_ready")
        accept_gate = gates.wait(run_dir, "accept", gate_timeout_s, jw)
        if accept_gate.get("decision") == "approve":
            branch = evidence["branch"]
            wt = evidence["worktree"]
            gitops.remove_worktree(
                cfg["repo_root"], wt, task_id, keep_branch=True, branch_name=branch
            )
            hooks.emit("merge_start")
            supervisor.merge_shipped(cfg, work_task, branch_name=branch)
            gitops.git(["branch", "-D", branch], cfg["repo_root"])
            _terminal(jw, "shipped", task_id, evidence=evidence)
            return "SHIPPED"
        if accept_gate.get("decision") == "reject":
            gitops.remove_worktree(
                cfg["repo_root"],
                evidence["worktree"],
                task_id,
                keep_branch=False,
                branch_name=evidence["branch"],
            )
            _terminal(jw, "rejected_by_user", task_id, gate="accept")
            return "REJECTED"
        _terminal(jw, "paused", task_id, gate="accept")
        return "PAUSED"

    _incident(cfg, task_id, evidence)
    event = status.lower()
    _terminal(jw, event, task_id, evidence=evidence)
    return status
