"""Project registry and per-run harness config derivation."""

import os
import re

import yaml
from harness.packets import atomic_write_json

from studio import config
from studio.paths import VENV_PY, backend_path

HARNESS_DEFAULTS_PATH = backend_path("harness/config.yaml")

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ProjectError(Exception):
    pass


def _slug(name):
    s = _SLUG_RE.sub("-", name.lower().strip())[:24].strip("-")
    return s or "project"


def _load_defaults():
    with open(HARNESS_DEFAULTS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _ensure_data_dir():
    os.makedirs(config.data_dir(), exist_ok=True)


def load_all():
    path = config.projects_path()
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or []
    return data if isinstance(data, list) else []


def _save_all(projects):
    _ensure_data_dir()
    atomic_write_json(config.projects_path(), projects)


def get(project_id):
    for p in load_all():
        if p["id"] == project_id:
            return p
    return None


def _default_accept_templates(_repo_root):
    py = VENV_PY if os.path.isfile(VENV_PY) else "python"
    return {
        "default": [py, "-c", "import sys; sys.exit(0)"],
    }


def create(fields):
    repo_root = os.path.abspath(fields["repo_root"])
    if not os.path.isdir(os.path.join(repo_root, ".git")):
        raise ProjectError(f"repo_root is not a git repository: {repo_root}")
    pid = _slug(fields["name"])
    existing = {p["id"] for p in load_all()}
    base = pid
    n = 2
    while pid in existing:
        suffix = f"-{n}"
        pid = (base[: 24 - len(suffix)] + suffix).strip("-")
        n += 1
    project = {
        "id": pid,
        "name": fields["name"],
        "repo_root": repo_root,
        "integration_branch": fields.get("integration_branch", "harness/integration"),
        "dev_cmd": fields.get("dev_cmd", "npm run dev"),
        "dev_port_range": fields.get("dev_port_range", [4310, 4399]),
        "accept_templates": fields.get("accept_templates")
        or _default_accept_templates(repo_root),
        "privacy": fields.get("privacy", "local_only"),
        "stage_consents": fields.get("stage_consents", []),
        "providers": fields.get("providers"),
        "knowledge_path": fields.get("knowledge_path", "knowledge.yaml"),
    }
    all_p = load_all()
    all_p.append(project)
    _save_all(all_p)
    return project


def derive_harness_cfg(project, run_id):
    defaults = _load_defaults()
    run_root = config.run_dir(project["id"], run_id)
    wt_root = os.path.join("C:/wt", project["id"])
    return {
        "ollama_url": defaults["ollama_url"],
        "repo_root": project["repo_root"],
        "worktree_root": wt_root,
        "integration_branch": project["integration_branch"],
        "skeptic_path": backend_path(defaults.get("skeptic_path", "harness/skeptic.yaml")),
        "tasks_path": backend_path(defaults.get("tasks_path", "harness/tasks.yaml")),
        "generated_tasks_path": backend_path(
            defaults.get("generated_tasks_path", "harness/generated_tasks.yaml")
        ),
        "journal_path": os.path.join(run_root, "journal.jsonl"),
        "stats_path": config.stats_path(project["id"]),
        "packets_dir": os.path.join(run_root, "packets"),
        "report_path": os.path.join(run_root, "report.md"),
        "models": defaults["models"],
        "edit_format": defaults["edit_format"],
        "limits": defaults["limits"],
        "accept_templates": project.get("accept_templates", {}),
    }
