"""Working-html edits with safety policy."""

import html as html_lib
import re

import yaml
from harness import providers
from studio import draft
from studio.repositories import (
    edits_repo,
    profiles_repo,
    templates_repo,
    versions_repo,
    working_html_repo,
)
from studio.services import onboarding_service

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


def _apply_llm_edit(project_id, html, prompt):
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
