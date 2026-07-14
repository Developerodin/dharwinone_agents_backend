"""Working-html edits with safety policy."""

import html as html_lib
import logging
import re

import yaml
from harness import providers
from studio import componentizer, draft
from studio.repositories import (
    edits_repo,
    profiles_repo,
    templates_repo,
    versions_repo,
    working_html_repo,
)
from studio.services import onboarding_service

_log = logging.getLogger(__name__)

_BASE_SECTION_ALIASES = {
    section_type: tuple(keywords)
    for section_type, keywords in componentizer._TYPE_KEYWORDS
}
_SECTION_ALIASES = {
    **_BASE_SECTION_ALIASES,
    "hero": ("hero", "headline", "banner", "header"),
    "nav": ("nav", "menu", "navigation"),
    "footer": ("footer",),
    "features": _BASE_SECTION_ALIASES.get("features", ())
    + ("features", "benefits"),
    "cta": _BASE_SECTION_ALIASES.get("cta", ()) + ("call to action", "button"),
    "testimonials": _BASE_SECTION_ALIASES.get("testimonials", ())
    + ("testimonials", "reviews", "quotes"),
    "faq": _BASE_SECTION_ALIASES.get("faq", ()) + ("questions",),
    "pricing": _BASE_SECTION_ALIASES.get("pricing", ()) + ("plans", "price"),
}

_TAGLINE_RE = re.compile(
    r'(<p class="tagline[^"]*"[^>]*>)(.*?)(</p>)',
    re.I | re.S,
)
_H1_RE = re.compile(r"(<h1[^>]*>)(.*?)(</h1>)", re.I | re.S)
_AMBIGUOUS_EDIT_RE = re.compile(
    r"\b(?:change|update|edit|fix)\b.*\b(?:this|it|site|website|page)\b",
    re.I,
)
_BRAND_ALIGN_RE = re.compile(r"\bmatch\b.*\bbrand\b", re.I)
_EXPLICIT_TARGET_RE = re.compile(
    r"\b(?:headline|tagline|title|hero|subheading|button|cta|nav|menu|footer|section|font|color|logo)\b",
    re.I,
)
_HAS_DIRECTIVE_RE = re.compile(
    r"\b(?:change|replace|update|set)\b.+\bto\b.+",
    re.I,
)
# Whole-page restyle: served deterministically from draft.STYLE_PACKS, never
# the LLM (a 27KB full-page rewrite reliably guts the component CSS).
_THEME_EDIT_RE = re.compile(
    r"\b(?:theme|palette|colou?r scheme|colou?rs|look and feel|vibe|"
    r"dark mode|light mode|restyle|redesign)\b",
    re.I,
)
# ...but only when nothing narrower is being targeted.
_THEME_TARGETED_RE = re.compile(
    r'"|\b(?:headline|tagline|subheading|text|copy|wording|word|image|photo|logo|'
    r"section|paragraph)\b",
    re.I,
)


class EditValidationError(ValueError):
    pass


def _needs_clarification(prompt):
    text = (prompt or "").strip()
    if not text:
        return True
    low = text.lower()
    if low.startswith("change tagline to ") or low.startswith("change headline to "):
        return False
    if _HAS_DIRECTIVE_RE.search(text) and _EXPLICIT_TARGET_RE.search(text):
        return False
    if _AMBIGUOUS_EDIT_RE.search(text):
        return True
    if _BRAND_ALIGN_RE.search(text) and not _EXPLICIT_TARGET_RE.search(text):
        return True
    return False


def _is_theme_request(prompt):
    text = (prompt or "").strip()
    return bool(_THEME_EDIT_RE.search(text)) and not _THEME_TARGETED_RE.search(text)


def _apply_theme_edit(html, prompt):
    pack = draft.pick_style_pack(prompt, draft.current_pack_id(html))
    _log.info("edit_path=style-pack pack=%s", pack["id"])
    return draft.apply_pack(html, pack)


def _clarification_message():
    return (
        "Tell me exactly what to change. Examples: "
        "1) Change hero headline to \"Flutoi serves handcrafted coffee\" "
        "2) Replace subheading under hero with \"Fresh bakes daily in Jaipur\" "
        "3) Update button text \"See today's board\" to \"View menu\"."
    )


def _apply_content_edit(html, prompt):
    text = prompt.strip()
    low = text.lower()
    if low.startswith("change tagline to "):
        value = html_lib.escape(text[18:].strip().strip('"'), quote=False)
        if _TAGLINE_RE.search(html):
            return _TAGLINE_RE.sub(rf"\1{value}\3", html, count=1)
    if low.startswith("change headline to "):
        value = html_lib.escape(text[19:].strip().strip('"'), quote=False)
        if _H1_RE.search(html):
            return _H1_RE.sub(rf"\1{value}\3", html, count=1)
    return None


def _apply_structural_edit(html, prompt):
    section = html_lib.escape(prompt.strip()[:120] or "New section", quote=False)
    block = (
        f'<section class="builder-added"><h2>{section}</h2>'
        f"<p>Added via advanced structural edit.</p></section>"
    )
    return html.replace("</body>", f"{block}</body>", 1)


def _selected_template_id(project_id):
    doc = working_html_repo.get(project_id) or {}
    return doc.get("selectedTemplateId")


def _selected_template_html(project_id):
    tid = _selected_template_id(project_id)
    if not tid:
        return None
    doc = templates_repo.get(project_id, tid)
    if not doc:
        return None
    return doc.get("htmlContent")


def _identify_sections(prompt):
    text = (prompt or "").lower()
    hits = []
    for section_type, keywords in _SECTION_ALIASES.items():
        if any(kw in text for kw in keywords):
            hits.append(section_type)
    if len(hits) == 1:
        return hits[0]
    return None


def _load_edit_provider():
    provider, model = onboarding_service._load_onboarding_provider()
    if provider is not None and model:
        return provider, model
    try:
        with open(onboarding_service._ONBOARDING_LLM_CFG, encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        override = onboarding_service._onboarding_provider_override()
        if override:
            providers_cfg = dict(cfg.get("providers") or {})
            providers_cfg["planner"] = override
            cfg = {**cfg, "providers": providers_cfg}
            model = override["model"]
        else:
            model = ((cfg.get("models") or {}).get("planner") or "").strip()
            if not model:
                return None, None
        provider = providers.get(cfg, "planner")
        return provider, model
    except Exception:
        return None, None


def _apply_section_edit(project_id, html, prompt, section_type):
    from studio import component_html

    inner = component_html.extract_section_inner(html, section_type)
    if inner is None:
        return None
    provider, model = _load_edit_provider()
    if provider is None or not model:
        return None
    new_inner = draft.refine_section(
        provider,
        model,
        inner,
        section_type,
        prompt,
        style_reference_html=html,
        num_ctx=8192,
    )
    if not new_inner:
        return None
    spliced = component_html.replace_section_inner(html, section_type, new_inner)
    return draft.sanitize_html(spliced)


def _apply_llm_edit(project_id, html, prompt):
    section_type = _identify_sections(prompt)
    if section_type and f'data-section="{section_type}"' in html:
        edited = _apply_section_edit(project_id, html, prompt, section_type)
        if edited:
            _log.info(
                "edit_path=section section_type=%s project=%s",
                section_type,
                project_id,
            )
            return edited
    _log.info("edit_path=full-page project=%s", project_id)
    provider, model = _load_edit_provider()
    if provider is None or not model:
        return None
    prompts = [
        prompt,
        (
            "Apply this website edit exactly and return the full updated HTML document only. "
            f"User request: {prompt}"
        ),
    ]
    for candidate_prompt in prompts:
        try:
            edited = draft.refine(
                provider,
                model,
                html,
                candidate_prompt,
                style_reference_html=_selected_template_html(project_id),
            )
        except Exception:
            continue
        if edited:
            return edited
    return None


def _is_changed(before, after):
    if not isinstance(before, str) or not isinstance(after, str):
        return False
    return before.strip() != after.strip()


def _apply_llm_edit_or_fail(project_id, html, prompt):
    edited = _apply_llm_edit(project_id, html, prompt)
    if edited is None:
        raise EditValidationError(
            "could not apply edit (model unavailable or invalid output)"
        )
    if not _is_changed(html, edited):
        raise EditValidationError("edit produced no visible change")
    return edited


def apply_edit(project_id, prompt, *, structural=False):
    if not prompt.strip():
        raise EditValidationError("prompt required")
    html = working_html_repo.require_html(project_id)
    if structural:
        updated = _apply_structural_edit(html, prompt)
        scope = "structural"
    elif _is_theme_request(prompt):
        updated = _apply_theme_edit(html, prompt)
        scope = "content"
    else:
        if _needs_clarification(prompt):
            raise EditValidationError(_clarification_message())
        updated = _apply_content_edit(html, prompt)
        if updated is None:
            updated = _apply_llm_edit_or_fail(project_id, html, prompt)
        elif not _is_changed(html, updated):
            updated = _apply_llm_edit_or_fail(project_id, html, prompt)
        scope = "content"
    updated = draft.sanitize_html(updated)
    working_html_repo.put(
        project_id,
        updated,
        template_id=_selected_template_id(project_id),
    )
    profile = profiles_repo.get(project_id)
    version = None
    if structural:
        version = versions_repo.create(
            project_id,
            label="Structural edit",
            trigger="structural_edit",
            html=updated,
            profile=profile,
        )
    edits_repo.append(
        project_id,
        source="ai" if not structural else "ai_structural",
        user_prompt=prompt,
        action_summary=f"Applied {scope} edit",
        change_scope=scope,
        targets=["working-html"],
        version_id=version["versionId"] if version else None,
    )
    return {"html": updated, "changeScope": scope}


def save_manual(project_id, html):
    working_html_repo.put(
        project_id,
        html,
        template_id=_selected_template_id(project_id),
    )
    profile = profiles_repo.get(project_id)
    version = versions_repo.create(
        project_id,
        label="Manual save",
        trigger="explicit_save",
        html=draft.sanitize_html(html),
        profile=profile,
    )
    edits_repo.append(
        project_id,
        source="manual",
        user_prompt="",
        action_summary="Manual code save",
        change_scope="manual",
        targets=["working-html"],
        version_id=version["versionId"],
    )
    return {"ok": True, "versionId": version["versionId"]}
