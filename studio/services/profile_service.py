"""Business profile persistence, validation, and generation gate."""

import re

from studio.repositories import profiles_repo, projects_repo

_REQUIRED_FIELDS = [
    ("brand.brandName", "brand name"),
    ("business.type", "business type"),
    ("business.services", "at least one service"),
    ("business.targetAudience", "target audience"),
    ("contact.email", "contact email"),
    ("contact.phone", "contact phone"),
]

_EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.I)
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")

_MERGE_KEYS = frozenset({"brand", "business", "location", "contact"})


class ProfileValidationError(ValueError):
    """Raised when a profile patch fails validation."""


class ProfileIncompleteError(Exception):
    """Raised when generation is requested before the minimum profile gate passes."""

    def __init__(self, missing_fields):
        self.missing_fields = list(missing_fields)
        super().__init__("profile incomplete")


def _get_nested(profile, path):
    cur = profile
    for part in path.split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur


def _missing_fields(profile):
    missing = []
    for path, label in _REQUIRED_FIELDS:
        val = _get_nested(profile, path)
        if path == "business.services":
            if not val:
                missing.append(label)
        elif not val:
            missing.append(label)
    return missing


def compute_completeness(profile):
    total = len(_REQUIRED_FIELDS)
    missing = _missing_fields(profile)
    done = total - len(missing)
    percent = int(round((done / total) * 100)) if total else 0
    profile["completeness"] = {"percent": percent, "missingFields": missing}
    return profile["completeness"]


def evaluate_generation_gate(profile):
    completeness = compute_completeness(profile)
    return {
        "ready": not completeness["missingFields"],
        "percent": completeness["percent"],
        "missingFields": completeness["missingFields"],
    }


def _deep_merge(base, patch):
    for key, value in patch.items():
        if key not in _MERGE_KEYS:
            continue
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged = dict(base[key])
            merged.update(value)
            base[key] = merged
        else:
            base[key] = value
    return base


def _validate_profile(profile):
    email = _get_nested(profile, "contact.email")
    if email and not _EMAIL_RE.match(str(email)):
        raise ProfileValidationError("invalid contact email")
    phone = _get_nested(profile, "contact.phone")
    if phone and not _PHONE_RE.search(str(phone)):
        raise ProfileValidationError("invalid contact phone")
    services = _get_nested(profile, "business.services")
    if services is not None and not isinstance(services, list):
        raise ProfileValidationError("business.services must be a list")


def get_profile(project_id):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")
    profile = profiles_repo.get(project_id)
    gate = evaluate_generation_gate(profile)
    profile["gate"] = gate
    return profile


def update_profile(project_id, patch):
    if not projects_repo.get(project_id):
        raise ValueError("project not found")
    profile = profiles_repo.get(project_id)
    _deep_merge(profile, patch or {})
    _validate_profile(profile)
    compute_completeness(profile)
    profiles_repo.save(profile)
    gate = evaluate_generation_gate(profile)
    profile["gate"] = gate
    return profile


def require_generation_ready(project_id):
    profile = profiles_repo.get(project_id)
    gate = evaluate_generation_gate(profile)
    if not gate["ready"]:
        raise ProfileIncompleteError(gate["missingFields"])
    return profile
