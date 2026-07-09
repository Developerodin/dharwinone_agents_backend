"""Conversational onboarding state machine."""

import json
import os
import re
import time

import yaml
from harness import providers

from studio import draft
from studio.paths import backend_path
from studio.repositories import conversations_repo, profiles_repo, projects_repo
from studio.services.profile_service import compute_completeness

_QUESTIONS = {
    "business.type": "What kind of website are we building (coffee shop, portfolio, agency, online store, etc.)?",
    "brand.brandName": "Great. What should we call your brand on the site?",
    "business.services": "What are the main services or products you want highlighted?",
    "business.description": (
        "What should the intro line on your homepage say? "
        "One or two lines about what you offer."
    ),
    "business.targetAudience": "Who are your ideal customers?",
    "location.country": "Which country should we show for your business location?",
    "location.city": "And which city should we mention?",
}

_GENERIC_PROMPT_RE = re.compile(
    r"^(?:create|build|make|design)\s+(?:a\s+)?(?:website|site|web\s*page|landing\s*page)"
    r"|^(?:i\s+)?(?:want|need)\s+(?:a\s+)?(?:website|site)",
    re.I,
)
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_GENERATE_INTENT_RE = re.compile(
    r"\b("
    r"generate(?:\s+templates?)?|"
    r"go\s+ahead|"
    r"please\s+do|"
    r"do\s+it|"
    r"proceed|"
    r"start|"
    r"start\s+generation|"
    r"build\s+it|"
    r"create\s+it|"
    r"ship\s+it"
    r")\b",
    re.I,
)
_CLARIFY_REQUEST_RE = re.compile(
    # first-person anchored so answers like "customers who don't get results"
    # or "confused beginners" are not mistaken for clarification requests
    r"\bi\s+(?:really\s+)?(?:don'?t|do\s+not|didn'?t)\s+(?:understand|get|follow)\b"
    r"|what\s+(?:do\s+you\s+mean|are\s+you\s+asking|does\s+(?:that|this|it)\s+mean)"
    r"|(?:can|could)\s+you\s+(?:elaborate|explain|clarify|rephrase)"
    r"|please\s+(?:elaborate|explain|clarify)"
    r"|\b(?:i'?m|i\s+am)\s+(?:so\s+)?confused\b"
    r"|\b(?:i'?m|i\s+am|i)\s+not\s+sure\s+what\b",
    re.I,
)
_FIELD_HINTS = {
    "business.type": 'For example: "coffee shop", "fitness app", or "photography portfolio".',
    "brand.brandName": "It's the name visitors will see in the site header.",
    "business.services": 'For example: "photo editing, filters, one-click exports".',
    "business.description": "It appears right under the big headline on your homepage.",
    "business.targetAudience": (
        'For example: "beginner photographers and content creators".'
    ),
    "location.country": "It appears in your contact section.",
    "location.city": "It appears in your contact section.",
    "contact.email": "It's shown on the site so customers can reach you.",
    "contact.phone": "It's shown on the site so customers can call you.",
}
_SKIP_REQUEST_RE = re.compile(
    r"\bskip\b"
    r"|\b(?:add|do|fill|provide|give)\s+(?:it|this|that)?\s*later\b"
    r"|\bnot\s+(?:now|yet)\b"
    r"|\bi\s+don'?t\s+have\s+(?:an?y?\s+)?(?:email|phone|number|website|one|it)\b"
    r"|\bno\s+(?:email|phone|number)\b",
    re.I,
)
_STYLE_DIRECTIVE_RE = re.compile(
    r"^(?:please\s+)?(?:make|keep)\b"
    r".*\b(?:minim\w+|sleek|clean|modern|simple|elegant|premium|bold|dark|light)\b",
    re.I,
)
_INITIAL_VERB_RE = re.compile(
    r"^(?:please\s+)?(?:create|build|make|design|i\s+(?:want|need))\s+(?:an?\s+)?",
    re.I,
)
_INITIAL_WITH_RE = re.compile(
    r"^(?:an?\s+)?([a-z][a-z\s&/-]{2,40}?)\s+(?:website|site|page)\s+with\s+(.+)$",
    re.I,
)
_COUNTRY_HINT_WORDS = {
    "republic",
    "kingdom",
    "states",
    "emirates",
    "federation",
    "islands",
    "nation",
}
_COUNTRY_HINT_PREFIXES = {"united", "south", "north", "new", "saudi", "sri"}
_TRUTHY = {"1", "true", "yes", "on"}
_ONBOARDING_LLM_CFG = backend_path("harness/config.yaml")
_ONBOARDING_PROVIDER = None
_ONBOARDING_MODEL = None
_ONBOARDING_LLM_DISABLED_UNTIL = 0.0


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


def _question_for(profile, path):
    base = _QUESTIONS[path]
    if path == "business.services":
        business_type = (_get_nested(profile, "business.type") or "").strip()
        context = (
            f"business type: {business_type}" if business_type else "business type unknown"
        )
        llm = _llm_phrase("ask_services", base, user_message=context)
        if llm and "?" not in llm:
            llm = llm.rstrip(".") + "?"
        return llm or base
    if path == "business.description":
        return f"{base} {_description_example(profile)}"
    return base


def _services_for_example(profile):
    raw = _get_nested(profile, "business.services")
    if isinstance(raw, list):
        items = [str(item).strip(" .,") for item in raw if str(item).strip(" .,")]
    elif isinstance(raw, str):
        items = [
            part.strip(" .,")
            for part in re.split(r",|/|\band\b", raw, flags=re.I)
            if part.strip(" .,")
        ]
    else:
        items = []
    deduped = []
    seen = set()
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        deduped.append(item)
        seen.add(key)
    return deduped[:2]


def _description_example(profile):
    brand = str(_get_nested(profile, "brand.brandName") or "").strip(" .,")
    business_type = str(_get_nested(profile, "business.type") or "").strip(" .,")
    services = _services_for_example(profile)
    if len(services) == 2:
        services_text = f"{services[0]} and {services[1]}"
    elif len(services) == 1:
        services_text = services[0]
    else:
        services_text = ""

    if brand and services_text:
        return f'For example: "{brand} helps you improve with {services_text}."'
    if services_text and business_type:
        return f'For example: "A {business_type} focused on {services_text}."'
    if services_text:
        return f'For example: "We offer {services_text} with clear, practical guidance."'
    if brand and business_type:
        return f'For example: "{brand} is a {business_type} built for real results."'
    if brand:
        return f'For example: "{brand} helps customers get better outcomes, faster."'
    return (
        'For example: "We help customers solve their goals with simple, reliable service."'
    )


def _next_question(profile):
    skipped = set(profile.get("skipped") or [])
    for path in _QUESTIONS:
        if path in skipped:
            continue
        val = _get_nested(profile, path)
        if path == "business.services":
            if not val:
                return _question_for(profile, path), path
        elif not val:
            return _question_for(profile, path), path
    return None, None


def _normalize_place_text(text):
    cleaned = text.strip().strip(" .,!?:;")
    cleaned = re.sub(
        r"^(?:i(?:'m| am)?\s+)?(?:we(?:'re| are)?\s+)?(?:are\s+)?(?:based|located)\s+in\s+",
        "",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"^(?:in|at|from)\s+", "", cleaned, flags=re.I)
    cleaned = re.sub(r"^(?:my\s+)?(?:country|city)\s*(?:is|:)\s+", "", cleaned, flags=re.I)
    return cleaned.strip(" .,!?:;")


def _split_place_parts(text):
    return [
        part.strip(" .,!?:;")
        for part in re.split(r",|/|\band\b", text, flags=re.I)
        if part.strip(" .,!?:;")
    ]


def _title_case_words(text):
    return " ".join(word.capitalize() for word in text.split())


def _sanitize_location_phrase(text):
    cleaned = re.sub(r"[^a-zA-Z\s.-]", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned


def _looks_country_like(text):
    words = text.lower().split()
    if not words:
        return False
    if words[0] in _COUNTRY_HINT_PREFIXES and len(words) > 1:
        return True
    return any(word in _COUNTRY_HINT_WORDS for word in words)


def _location_from_llm(text):
    global _ONBOARDING_LLM_DISABLED_UNTIL
    provider, model = _load_onboarding_provider()
    if provider is None or not model:
        return {}
    prompt = (
        "Extract location entities from this user reply for website onboarding.\n"
        f"User reply: {text[:160]}\n\n"
        'Return JSON only: {"country": string|null, "city": string|null}.\n'
        "Rules:\n"
        "- If both city and country are present, return both.\n"
        "- Do not invent missing values.\n"
        "- Keep values short (1-4 words each)."
    )
    try:
        out = provider.generate(model, prompt, num_ctx=2048, timeout_s=15)
    except Exception:
        _ONBOARDING_LLM_DISABLED_UNTIL = time.time() + 30.0
        return {}
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (out or "").strip())
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    parsed = {}
    for key in ("country", "city"):
        value = data.get(key)
        if not isinstance(value, str):
            continue
        clean = _sanitize_location_phrase(value)
        if not clean:
            continue
        words = clean.split()
        if 1 <= len(words) <= 4:
            parsed[key] = _title_case_words(clean)
    return parsed


def _extract(message, field_path, profile=None):
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

    if field_path == "location.country":

        def _stash_city(city):
            # "Jaipur, India" answers both questions — don't ask city again.
            if city and profile is not None and not _get_nested(profile, "location.city"):
                _set_nested(profile, "location.city", city)

        llm_loc = _location_from_llm(text)
        llm_country = llm_loc.get("country")
        if llm_country:
            _stash_city(llm_loc.get("city"))
            return llm_country, "high"

        country_match = re.search(
            r"\b(?:country|nation)\b\s*(?:is|:)?\s*(.+)$",
            text,
            re.I,
        )
        if country_match:
            country = _sanitize_location_phrase(country_match.group(1))
            if 1 <= len(country.split()) <= 4:
                return _title_case_words(country), "high"

        from_match = re.search(r"\bfrom\s+([a-z][a-z\s.-]{1,40})$", text, re.I)
        if from_match:
            country = _sanitize_location_phrase(from_match.group(1))
            if 1 <= len(country.split()) <= 4:
                return _title_case_words(country), "high"

        candidate = _normalize_place_text(text)
        if (
            not candidate
            or _EMAIL_RE.search(candidate)
            or _PHONE_RE.search(candidate)
            or re.search(r"\d", candidate)
        ):
            return None, "low"
        parts = _split_place_parts(candidate)
        if not parts:
            return None, "low"
        if len(parts) >= 2:
            country = _sanitize_location_phrase(parts[-1])
            if country:
                city = _sanitize_location_phrase(parts[0])
                if city and not _looks_country_like(city):
                    _stash_city(_title_case_words(city))
                return _title_case_words(country), "high"
        if len(parts) == 1:
            country = _sanitize_location_phrase(parts[0])
            tokens = country.split()
            if len(tokens) == 1 and tokens[0].isalpha() and len(tokens[0]) >= 3:
                return _title_case_words(country), "medium"
            if len(tokens) == 2 and _looks_country_like(country):
                return _title_case_words(country), "medium"
        return None, "low"

    if field_path == "location.city":
        llm_loc = _location_from_llm(text)
        llm_city = llm_loc.get("city")
        if llm_city:
            return llm_city, "high"

        city_match = re.search(r"\b(?:city|town)\b\s*(?:is|:)?\s*(.+)$", text, re.I)
        if city_match:
            city = _sanitize_location_phrase(city_match.group(1))
            if 1 <= len(city.split()) <= 4:
                return _title_case_words(city), "high"

        candidate = _normalize_place_text(text)
        if (
            not candidate
            or _EMAIL_RE.search(candidate)
            or _PHONE_RE.search(candidate)
            or re.search(r"\d", candidate)
        ):
            return None, "low"
        parts = _split_place_parts(candidate)
        if not parts:
            return None, "low"
        city = parts[0]
        if len(parts) >= 2 and _looks_country_like(city):
            city = parts[1]
        tokens = city.split()
        for size in range(min(4, len(tokens)), 0, -1):
            tail = " ".join(tokens[-size:])
            if _looks_country_like(tail):
                city = " ".join(tokens[:-size]).strip()
                break
        if not city:
            return None, "low"
        city = _sanitize_location_phrase(city)
        words = city.split()
        if len(words) > 4:
            return None, "low"
        if _looks_country_like(city) and len(parts) == 1:
            return None, "low"
        return _title_case_words(city), "high" if len(parts) >= 2 else "medium"

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


def _extract_initial_regex(text):
    fields = {}
    cleaned = _INITIAL_VERB_RE.sub("", text.strip())
    m = _INITIAL_WITH_RE.match(cleaned)
    if m:
        fields["business.type"] = m.group(1).strip()
        services = [
            part.strip(" .")
            for part in re.split(r",|\band\b", m.group(2), flags=re.I)
            if len(part.strip(" .")) > 2
        ]
        if services:
            fields["business.services"] = services
    name_m = re.search(r"(?:called|named)\s+([A-Za-z][\w\s&'-]{1,40})", text, re.I)
    if name_m:
        name = name_m.group(1).strip(" .,")
        if len(name.split()) <= 6:
            fields["brand.brandName"] = name
    return fields


def _extract_initial_llm(text):
    global _ONBOARDING_LLM_DISABLED_UNTIL
    provider, model = _load_onboarding_provider()
    if provider is None or not model:
        return None
    prompt = (
        "Extract website-onboarding fields from this user prompt.\n"
        f"Prompt: {text[:300]}\n\n"
        'Reply with only JSON: {"businessType": string or null, '
        '"services": array of strings or null, "brandName": string or null}.\n'
        "Only include values explicitly present in the prompt. Do not guess."
    )
    try:
        out = provider.generate(model, prompt, num_ctx=2048, timeout_s=20)
    except Exception:
        _ONBOARDING_LLM_DISABLED_UNTIL = time.time() + 30.0
        return None
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (out or "").strip())
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _extract_initial(text):
    data = _extract_initial_llm(text)
    if data:
        fields = {}
        btype = data.get("businessType")
        if isinstance(btype, str) and btype.strip():
            fields["business.type"] = btype.strip()
        services = data.get("services")
        if isinstance(services, list):
            cleaned = [s.strip() for s in services if isinstance(s, str) and len(s.strip()) > 2]
            if cleaned:
                fields["business.services"] = cleaned
        brand = data.get("brandName")
        if isinstance(brand, str) and brand.strip():
            fields["brand.brandName"] = brand.strip()
        if fields:
            return fields
    return _extract_initial_regex(text)


def _llm_enabled():
    raw = os.environ.get("STUDIO_ONBOARDING_LLM", "true").strip().lower()
    return raw in _TRUTHY


def _onboarding_provider_override():
    model = (os.environ.get("STUDIO_ONBOARDING_MODEL") or "").strip()
    kind = (os.environ.get("STUDIO_ONBOARDING_PROVIDER") or "").strip().lower()
    base_url = (os.environ.get("STUDIO_ONBOARDING_BASE_URL") or "").strip()
    if not any((model, kind, base_url)):
        return None
    if not kind:
        kind = "openai" if model.lower().startswith("gpt-") else "ollama"
    if not model:
        raise ValueError("STUDIO_ONBOARDING_MODEL must be set when onboarding override is used")
    stage_cfg = {"kind": kind, "model": model}
    if base_url:
        stage_cfg["base_url"] = base_url
    return stage_cfg


def _load_onboarding_provider():
    global _ONBOARDING_PROVIDER, _ONBOARDING_MODEL, _ONBOARDING_LLM_DISABLED_UNTIL
    if not _llm_enabled():
        return None, None
    now = time.time()
    if now < _ONBOARDING_LLM_DISABLED_UNTIL:
        return None, None
    if _ONBOARDING_PROVIDER is not None and _ONBOARDING_MODEL:
        return _ONBOARDING_PROVIDER, _ONBOARDING_MODEL
    try:
        with open(_ONBOARDING_LLM_CFG, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        override = _onboarding_provider_override()
        if override:
            providers_cfg = dict(cfg.get("providers") or {})
            providers_cfg["planner"] = override
            cfg = {**cfg, "providers": providers_cfg}
            model = override["model"]
        else:
            model = ((cfg.get("models") or {}).get("planner") or "").strip()
            if not model:
                raise ValueError("planner model not configured")
        provider = providers.get(cfg, "planner")
        _ONBOARDING_PROVIDER = provider
        _ONBOARDING_MODEL = model
        return provider, model
    except Exception:
        _ONBOARDING_LLM_DISABLED_UNTIL = now + 30.0
        return None, None


def _clean_model_text(text):
    msg = (text or "").strip()
    if not msg:
        return ""
    msg = msg.splitlines()[0].strip()
    msg = msg.strip("`*\"'")
    msg = re.sub(r"^\s*[-•]+\s*", "", msg)
    msg = re.sub(r"\s+", " ", msg).strip()
    if len(msg) > 220:
        msg = msg[:220].rstrip()
    return msg


def _business_context(profile):
    if not profile:
        return ""
    btype = _get_nested(profile, "business.type")
    brand = _get_nested(profile, "brand.brandName")
    parts = []
    if brand:
        parts.append(f'brand "{str(brand)[:60]}"')
    if btype:
        parts.append(f"a {str(btype)[:60]} business")
    return ", ".join(parts)


def _llm_phrase(kind, fallback_text, user_message=None, profile=None):
    global _ONBOARDING_LLM_DISABLED_UNTIL
    provider, model = _load_onboarding_provider()
    if provider is None or not model:
        return None
    context = _business_context(profile)
    prompt = (
        "Rewrite the following website-builder assistant line to sound natural and human.\n"
        f"Mode: {kind}\n"
        + (f"Known business: {context}\n" if context else "")
        + f"Last user message: {str(user_message or '')[:140]}\n"
        f"Original line: {fallback_text}\n\n"
        "Rules:\n"
        "- Keep the original intent exactly.\n"
        "- Do not guess or mention any business type; only the known business above may be referenced.\n"
        "- Keep it one sentence, max 22 words.\n"
        "- Plain text only. No markdown, no bullets."
    )
    try:
        out = provider.generate(model, prompt, num_ctx=2048, timeout_s=20)
        msg = _clean_model_text(out)
        if not msg:
            return None
        if kind == "ready_trigger" and not re.search(
            r"generat|template|build|kicking off|starting",
            msg,
            re.I,
        ):
            return None
        if kind == "ask_services" and "?" not in msg:
            return None
        if kind in {"clarify", "ask_next"} and "?" in fallback_text and "?" not in msg:
            return None
        return msg
    except Exception:
        _ONBOARDING_LLM_DISABLED_UNTIL = time.time() + 30.0
        return None


_DEFAULT_AUDIENCES = {
    "cafe": "Locals, families, and food lovers nearby",
    "shop": "Shoppers looking for quality products",
    "medical": "Patients and families seeking trusted care nearby",
    "fitness": "People who want to get fit with expert guidance",
    "education": "Students and parents exploring programs",
    "construction": "Homeowners and businesses planning projects",
    "travel": "Travelers planning their next trip",
    "portfolio": "Potential clients and collaborators",
    "agency": "Businesses looking to grow their brand",
    "saas": "Teams that want to streamline their work",
}


def _prefill_defaults(profile):
    """Fill fields whose answer is obvious from the business type, so the
    chat never asks questions like 'who are a restaurant's customers?'."""
    if _get_nested(profile, "business.targetAudience"):
        return
    btype = _get_nested(profile, "business.type")
    if not btype:
        return
    services = _get_nested(profile, "business.services") or []
    genre = draft.pick_template(" ".join([btype, *services]))
    default = _DEFAULT_AUDIENCES.get(genre)
    if default:
        _set_nested(profile, "business.targetAudience", default)


_ROUTE_INTENTS = frozenset({"answer", "clarify", "style", "skip", "other"})


def _llm_route(message, target_field, profile):
    """Classify a user message against the current onboarding question.

    Returns {"intent": ..., "value": ...} or None when the LLM is
    unavailable or returns garbage (callers then fall back to regexes).
    """
    global _ONBOARDING_LLM_DISABLED_UNTIL
    provider, model = _load_onboarding_provider()
    if provider is None or not model:
        return None
    question = _QUESTIONS.get(target_field, "")
    context = _business_context(profile)
    prompt = (
        "You route user messages in a website-builder onboarding chat.\n"
        f'Question the assistant just asked: "{question}"\n'
        f"Field being collected: {target_field}\n"
        + (f"Known business: {context}\n" if context else "")
        + f"User message: {str(message)[:300]}\n\n"
        'Return JSON only: {"intent": "answer"|"clarify"|"style"|"other", "value": string|null}\n'
        "Rules:\n"
        '- "answer": the message answers the question; put the cleaned, short answer in "value".\n'
        '- "clarify": the user does not understand the question or asks what it means.\n'
        '- "style": the message is a design/style instruction for the website (look, colors, vibe), not an answer.\n'
        '- "skip": the user declines or defers this question ("skip", "add it later", "I don\'t have one").\n'
        '- "other": greetings, small talk, or anything unrelated to the question.\n'
        "- Never invent an answer. Keep value under 40 words."
    )
    try:
        out = provider.generate(model, prompt, num_ctx=2048, timeout_s=15)
    except Exception:
        _ONBOARDING_LLM_DISABLED_UNTIL = time.time() + 30.0
        return None
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (out or "").strip())
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("intent") not in _ROUTE_INTENTS:
        return None
    value = data.get("value")
    if not isinstance(value, str) or not value.strip():
        value = None
    return {"intent": data["intent"], "value": value}


def _ready_reply(message, profile):
    completeness = profile.get("completeness") or {}
    missing = completeness.get("missingFields") or []
    percent = completeness.get("percent")
    if _GENERATE_INTENT_RE.search(message or ""):
        fallback = "Perfect, kicking off personalized template generation now."
        llm = _llm_phrase(
            "ready_trigger",
            fallback,
            user_message=message,
            profile=profile,
        )
        return (llm or fallback), "trigger_generate"
    fallback = (
        "Great, your profile is complete. I can generate personalized templates when you say go ahead, or we can refine details first."
    )
    llm = _llm_phrase(
        "ready_waiting",
        fallback,
        user_message=message,
        profile=profile,
    )
    return (llm or fallback), "ready_to_generate"


def handle_message(project_id, message):
    project = projects_repo.get(project_id)
    if not project:
        raise ValueError("project not found")

    profile = profiles_repo.get(project_id)
    conversations_repo.append_turn(project_id, "user", message)

    merged_initial = False
    if not _get_nested(profile, "business.type"):
        for path, value in _extract_initial(message).items():
            profile, did_merge = _merge_field(profile, path, value, "high")
            merged_initial = merged_initial or did_merge

    _prefill_defaults(profile)
    target_field = None
    if not merged_initial:
        _, target_field = _next_question(profile)

    # LLM decides what the message is; regexes only cover for it when it's
    # unavailable or returns garbage. Wrong-intent input never breaks the chat
    # and never lands in the profile.
    route = _llm_route(message, target_field, profile) if target_field else None
    intent = route["intent"] if route else None

    if target_field and (
        intent == "clarify"
        or (route is None and _CLARIFY_REQUEST_RE.search(message))
    ):
        # The user is asking what we mean — explain and re-ask, never store it.
        hint = _FIELD_HINTS.get(target_field, "")
        # No LLM rewrite here: its one-sentence cap would drop the example.
        assistant = f"No problem. {_question_for(profile, target_field)} {hint}".strip()
        conversations_repo.append_turn(
            project_id,
            "assistant",
            assistant,
            {"intent": f"explain_{target_field}"},
        )
        compute_completeness(profile)
        profiles_repo.save(profile)
        return {
            "assistantMessage": assistant,
            "completeness": profile["completeness"],
            "readyToGenerate": False,
        }
    if target_field and (
        intent == "style"
        or (
            route is None
            and target_field == "business.description"
            and _STYLE_DIRECTIVE_RE.search(message)
        )
    ):
        # A style instruction ("make it minimalist"), not an answer — never
        # echo it into the site. Keep it as a design preference and re-ask.
        existing = _get_nested(profile, "design.stylePreference")
        pref = message.strip()
        if existing and pref.lower() not in existing.lower():
            pref = f"{existing}; {pref}"
        _set_nested(profile, "design.stylePreference", pref)
        compute_completeness(profile)
        profiles_repo.save(profile)
        assistant = (
            "Noted — I'll keep the design that way. "
            f"{_question_for(profile, target_field)}"
        )
        conversations_repo.append_turn(
            project_id,
            "assistant",
            assistant,
            {"intent": "style_preference"},
        )
        return {
            "assistantMessage": assistant,
            "completeness": profile["completeness"],
            "readyToGenerate": False,
        }
    if target_field and intent == "other":
        # Small talk or an unrelated request — keep the session moving.
        assistant = f"Sure! Meanwhile — {_question_for(profile, target_field)}"
        conversations_repo.append_turn(
            project_id,
            "assistant",
            assistant,
            {"intent": f"redirect_{target_field}"},
        )
        compute_completeness(profile)
        profiles_repo.save(profile)
        return {
            "assistantMessage": assistant,
            "completeness": profile["completeness"],
            "readyToGenerate": False,
        }
    skipped_now = False
    if target_field and (
        intent == "skip"
        or (route is None and _SKIP_REQUEST_RE.search(message))
    ):
        # Never trap the user: mark the field skipped, stop asking, and let
        # generation proceed with template defaults for it.
        skipped = list(profile.get("skipped") or [])
        if target_field not in skipped:
            skipped.append(target_field)
        profile["skipped"] = skipped
        skipped_now = True
        target_field = None
    if target_field:
        # Prefer the router's cleaned answer; fall back to the raw message
        # if the cleaned value fails the field's own validation. Location
        # answers keep the raw message — "Jaipur, India" carries two entities
        # and the cleaned value may keep only one.
        use_cleaned = (
            intent == "answer"
            and route.get("value")
            and not target_field.startswith("location.")
        )
        source = route["value"] if use_cleaned else message
        value, confidence = _extract(source, target_field, profile)
        if (value is None or confidence == "low") and source != message:
            value, confidence = _extract(message, target_field, profile)
        profile, merged = _merge_field(profile, target_field, value, confidence)
        if confidence == "low" and not merged:
            fallback = f"I didn't catch that clearly yet. {_question_for(profile, target_field)}"
            assistant = _llm_phrase(
                "clarify",
                fallback,
                user_message=message,
                profile=profile,
            ) or fallback
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
        assistant, intent = _ready_reply(message, profile)
    else:
        question, next_field = _next_question(profile)
        fallback = _friendly_question(question, profile["completeness"]["percent"])
        # Keep business-description prompts deterministic so contextual examples
        # from the user's own profile are never dropped by LLM shortening.
        if next_field == "business.description":
            assistant = fallback
        else:
            assistant = _llm_phrase(
                "ask_next",
                fallback,
                user_message=message,
                profile=profile,
            ) or fallback
        intent = f"ask_{next_field}" if next_field else "ask_more"
    if skipped_now:
        assistant = f"No problem — you can add it later from your profile. {assistant}"

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
