"""Independent reviewer: different model + skeptic playbook rules."""
import yaml

from harness.packets import parse_verdict

PROMPT = """You are a strict, skeptical code reviewer. Review this diff for the task below.
Check every rule in the checklist. Cite file and line for every finding.

Task: {title}

Checklist:
{rules}

Diff:
{diff}

Respond ONLY with JSON:
{{"verdict": "ACCEPT" or "NEEDS_FIX" or "ESCALATE", "findings": [{{"file": "path", "line": 1, "issue": "..."}}]}}
Use NEEDS_FIX for fixable problems, ESCALATE only for security issues or if the diff does something fundamentally different from the task."""


def review(ollama, model, task, diff, skeptic_path, max_diff_kb):
    if len(diff.encode("utf-8", errors="replace")) > max_diff_kb * 1024:
        return {"verdict": "ESCALATE", "findings": [],
                "reason": "diff exceeds review size cap"}
    with open(skeptic_path, encoding="utf-8") as f:
        rules = yaml.safe_load(f) or {}
    checklist = (rules.get("all") or []) + (rules.get(task["category"]) or [])
    prompt = PROMPT.format(
        title=task["title"],
        rules="\n".join(f"- {r}" for r in checklist),
        diff=diff)
    for _ in range(2):  # one re-ask on malformed output
        verdict = parse_verdict(ollama.generate(model, prompt, json_mode=True))
        if verdict:
            return verdict
    return {"verdict": "ESCALATE", "findings": [],
            "reason": "reviewer output unparseable twice"}
