"""Conversational onboarding state machine."""

import re

from studio.repositories import conversations_repo, profiles_repo, projects_repo
from studio.services.profile_service import compute_completeness

_QUESTIONS = {
    "business.type": "What kind of website are we building (coffee shop, portfolio, agency, online store, etc.)?",
    "brand.brandName": "Great. What should we call your brand on the site?",
    "business.services": "What are the main services or products you want highlighted?",
    "business.description": "Nice. Give me a short 1-2 line description for your homepage.",
    "business.targetAudience": "Who are your ideal customers?",
    "location.country": "Which country should we show for your business location?",
    "location.city": "And which city should we mention?",
    "contact.email": "What email should people use to contact you?",
    "contact.phone": "What phone number should we display?",
}

_GENERIC_PROMPT_RE = re.compile(
    r"^(?:create|build|make|design)\s+(?:a\s+)?(?:website|site|web\s*page|landing\s*page)"
    r"|^(?:i\s+)?(?:want|need)\s+(?:a\s+)?(?:website|site)",
    re.I,
)
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


def _get_nested(profile, path):
    cur = profile
    for part in path.split("."):
        cur = cur.get(part) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur


def _set_nested(profile, path, value):
    parts = path.split(".")
    cur = profile
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def _next_question(profile):
    for path in _QUESTIONS:
        val = _get_nested(profile, path)
        if path == "business.services":
            if not val:
                return _QUESTIONS[path], path
        elif not val:
            return _QUESTIONS[path], path
    return None, None


def _extract(message, field_path):
    text = message.strip()
    low = text.lower()

    if field_path == "brand.brandName":
        if _GENERIC_PROMPT_RE.search(text):
            return None, "low"
        patterns = [
            r"(?:called|named)\s+(.{2,60})",
            r"(?:we are|i'm|i am)\s+(.{2,60})",
            r"company is\s+(.{2,60})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.I)
            if m:
                name = m.group(1).strip(" .,")
                if len(name.split()) <= 6:
                    return name, "high"
        if len(text.split()) <= 4 and not _GENERIC_PROMPT_RE.search(text):
            return text.rstrip("."), "medium"
        return None, "low"

    if field_path == "business.type":
        if _GENERIC_PROMPT_RE.search(text):
            return None, "low"
        m = re.search(r"(?:for|about)\s+(?:an?\s+)?([a-z][a-z0-9\s&/+.-]{2,50})", text, re.I)
        if m:
            candidate = m.group(1).strip(" .")
            if len(candidate.split()) <= 8:
                return candidate, "high"
        if low.startswith("we are ") or "company is called" in low:
            return None, "low"
        if len(text.split()) >= 2 and low not in {"stuff", "maybe tech", "yes", "no"}:
            return text.rstrip("."), "high"
        if low in {"stuff", "maybe tech"}:
            return None, "low"
        return text.rstrip("."), "medium"

    if field_path == "business.services":
        if "sell" in low or "offer" in low or "provide" in low:
            tail = re.sub(r"^we\s+(sell|offer|provide)\s+", "", text, flags=re.I)
            services = []
            for part in re.split(r",| and ", tail):
                item = part.strip(" .")
                if len(item) > 2:
                    services.append(item)
            if services:
                return services, "high"
        services = []
        for part in re.split(r",| and ", text):
            item = part.strip(" .")
            if len(item) > 2:
                services.append(item)
        if services:
            return services, "high"
        return None, "low"

    if field_path == "business.targetAudience":
        if "audience" in low or "customers" in low or len(text.split()) >= 4:
            return text.rstrip("."), "high"
        return text.rstrip("."), "medium"

    if field_path == "contact.email":
        m = _EMAIL_RE.search(text)
        if m:
            return m.group(0), "high"
        return None, "low"

    if field_path == "contact.phone":
        m = _PHONE_RE.search(text)
        if m:
            return m.group(0), "high"
        return None, "low"

    if text:
        return text.rstrip("."), "medium"
    return None, "low"


def _merge_field(profile, field_path, value, confidence):
    if value is None:
        return profile, False
    if field_path == "business.services" and not value:
        return profile, False
    current = _get_nested(profile, field_path)
    if current and confidence == "low":
        return profile, False
    _set_nested(profile, field_path, value)
    return profile, True


def _friendly_question(question, percent):
    if not question:
        return "Tell me a bit more about your business."
    if percent >= 80:
        return f"Awesome, almost done. {question}"
    if percent >= 40:
        return f"Perfect. {question}"
    return question


def handle_message(project_id, message):
    project = projects_repo.get(project_id)
    if not project:
        raise ValueError("project not found")

    profile = profiles_repo.get(project_id)
    conversations_repo.append_turn(project_id, "user", message)

    _, target_field = _next_question(profile)
    if target_field:
        value, confidence = _extract(message, target_field)
        profile, merged = _merge_field(profile, target_field, value, confidence)
        if confidence == "low" and not merged:
            assistant = f"I didn't catch that clearly yet. {_QUESTIONS[target_field]}"
            conversations_repo.append_turn(
                project_id,
                "assistant",
                assistant,
                {"intent": f"clarify_{target_field}", "confidence": confidence},
            )
            compute_completeness(profile)
            profiles_repo.save(profile)
            return {
                "assistantMessage": assistant,
                "completeness": profile["completeness"],
                "readyToGenerate": False,
            }

    compute_completeness(profile)
    profiles_repo.save(profile)

    missing = profile["completeness"]["missingFields"]
    ready = not missing
    if ready:
        assistant = (
            "I have enough info to generate personalized templates. "
            "Say 'generate' when you're ready, or keep sharing details."
        )
        intent = "ready_to_generate"
    else:
        question, next_field = _next_question(profile)
        assistant = _friendly_question(question, profile["completeness"]["percent"])
        intent = f"ask_{next_field}" if next_field else "ask_more"

    conversations_repo.append_turn(
        project_id,
        "assistant",
        assistant,
        {"intent": intent},
    )
    return {
        "assistantMessage": assistant,
        "completeness": profile["completeness"],
        "readyToGenerate": ready,
    }


def get_chat(project_id):
    return {"turns": conversations_repo.list_turns(project_id)}
