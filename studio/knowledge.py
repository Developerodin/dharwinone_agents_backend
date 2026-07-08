"""Project knowledge.yaml validation and prompt context."""

import os

import yaml

SCHEMA_KEYS = frozenset({"stack", "rules", "design_tokens", "deploy_branch"})


class KnowledgeError(Exception):
    pass


def _validate(data, path="$"):
    if not isinstance(data, dict):
        raise KnowledgeError(f"{path}: must be an object")
    for key in data:
        if key not in SCHEMA_KEYS:
            raise KnowledgeError(f"{path}.{key}: unknown key")
    if "stack" in data and not isinstance(data["stack"], list):
        raise KnowledgeError(f"{path}.stack: must be a list")
    if "rules" in data and not isinstance(data["rules"], list):
        raise KnowledgeError(f"{path}.rules: must be a list")
    if "design_tokens" in data:
        if not isinstance(data["design_tokens"], dict):
            raise KnowledgeError(f"{path}.design_tokens: must be an object")
        for k, v in data["design_tokens"].items():
            if not isinstance(v, str):
                raise KnowledgeError(f"{path}.design_tokens.{k}: must be a string")
    if "deploy_branch" in data and not isinstance(data["deploy_branch"], str):
        raise KnowledgeError(f"{path}.deploy_branch: must be a string")
    return data


def knowledge_path(project):
    return os.path.join(
        project["repo_root"], project.get("knowledge_path", "knowledge.yaml")
    )


def read(project):
    path = knowledge_path(project)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return _validate(data)


def write(project, data):
    validated = _validate(data)
    path = knowledge_path(project)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(validated, f, default_flow_style=False)
    return validated


def build_prompt_context(project):
    """Render PROJECT KNOWLEDGE block for planner/implementer prompts."""
    try:
        data = read(project)
    except (KnowledgeError, OSError):
        return ""
    if not data:
        return ""
    lines = ["PROJECT KNOWLEDGE:"]
    if data.get("stack"):
        lines.append("Stack: " + ", ".join(data["stack"]))
    if data.get("rules"):
        lines.append("Rules:")
        for r in data["rules"]:
            lines.append(f"  - {r}")
    if data.get("design_tokens"):
        lines.append("Design tokens:")
        for k, v in data["design_tokens"].items():
            lines.append(f"  {k}: {v}")
    if data.get("deploy_branch"):
        lines.append(f"Deploy branch: {data['deploy_branch']}")
    return "\n".join(lines)
