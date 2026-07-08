"""Deterministic quality checks for publish candidates."""

import re

from studio import draft

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


def score_html(html, profile=None):
    issues = []
    if _PLACEHOLDER_RE.search(html or ""):
        issues.append(
            {
                "level": "fail",
                "code": "unresolved_placeholder",
                "message": "Unresolved template tokens",
            }
        )
    if profile:
        email = ((profile.get("contact") or {}).get("email") or "").strip()
        if email and email not in html:
            issues.append(
                {
                    "level": "warn",
                    "code": "contact_email_missing",
                    "message": "Contact email not visible",
                }
            )
    if re.search(r"(?is)<script\b", html or ""):
        issues.append(
            {"level": "fail", "code": "script_tag", "message": "Script tags present"}
        )
    if re.search(r"(?i)\son\w+\s*=", html or ""):
        issues.append(
            {
                "level": "fail",
                "code": "inline_handler",
                "message": "Inline handlers present",
            }
        )
    if not re.search(r"<h1\b", html or "", re.I):
        issues.append(
            {"level": "warn", "code": "missing_h1", "message": "No primary heading"}
        )
    fails = [i for i in issues if i["level"] == "fail"]
    verdict = "fail" if fails else ("warn" if issues else "pass")
    return {
        "verdict": verdict,
        "issues": issues,
        "score": max(0, 100 - len(issues) * 15),
    }


def run_quality(html, profile=None):
    clean = draft.sanitize_html(html or "")
    return score_html(clean, profile)
