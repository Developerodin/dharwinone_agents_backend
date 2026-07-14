"""Parallel section-level copy rewrite for composed templates."""

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from studio import component_html, draft
from studio.services import onboarding_service
from studio.services.profile_facts import business_facts

_log = logging.getLogger(__name__)

_TEXT_SECTIONS = ("hero", "features", "about", "cta")
_MAX_WORKERS = 3
_RATE_LIMIT_RE = re.compile(r"\b429\b|rate\s*limit", re.I)

_SECTION_GEN_PROMPT = (
    "Rewrite this {section_type} section copy to accurately describe the business.\n"
    "Business facts:\n{facts}\n"
    "Keep brand name and contact details unchanged. Text only."
)


def _load_provider():
    return onboarding_service._load_onboarding_provider()


def _is_rate_limit(exc):
    return _RATE_LIMIT_RE.search(str(exc) or "") is not None


def _rewrite_one(provider, model, html, section_type, facts):
    """Worker: returns (section_type, new_inner, rate_limited). No HTML mutation."""
    inner = component_html.extract_section_inner(html, section_type)
    if inner is None:
        return section_type, None, False
    prompt = _SECTION_GEN_PROMPT.format(section_type=section_type, facts=facts)
    try:
        new_inner = draft.refine_section(
            provider,
            model,
            inner,
            section_type,
            prompt,
            style_reference_html=html,
            num_ctx=8192,
        )
    except Exception as exc:
        _log.warning("section rewrite failed type=%s err=%s", section_type, exc)
        return section_type, None, _is_rate_limit(exc)
    if not new_inner:
        return section_type, None, False
    return section_type, new_inner, False


def rewrite_components_parallel(html, profile):
    """Rewrite text-bearing sections in parallel. Never raises."""
    if os.environ.get("STUDIO_COMPONENT_REWRITE", "1").strip().lower() in (
        "0",
        "false",
        "no",
    ):
        return html  # caller falls back to _rewrite_copy on primary composed (W9)
    provider, model = _load_provider()
    if provider is None or not model:
        return html
    facts = business_facts(profile)
    if not facts:
        return html

    targets = [t for t in _TEXT_SECTIONS if component_html.extract_section_inner(html, t)]
    if not targets:
        return html

    current = html
    sequential_only = False

    def run_batch(sections, workers):
        nonlocal current, sequential_only
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_rewrite_one, provider, model, current, st, facts): st
                for st in sections
            }
            for fut in as_completed(futures):
                section_type, new_inner, rate_limited = fut.result()
                if rate_limited:
                    sequential_only = True
                elif new_inner is not None:
                    current = component_html.replace_section_inner(
                        current, section_type, new_inner
                    )

    run_batch(targets, 1 if sequential_only else _MAX_WORKERS)
    if sequential_only:
        for st in targets:
            _, new_inner, _ = _rewrite_one(provider, model, current, st, facts)
            if new_inner is not None:
                current = component_html.replace_section_inner(current, st, new_inner)

    if len(component_html.list_section_types(current)) < len(
        component_html.list_section_types(html)
    ):
        _log.warning("post-splice marker validation failed; reverting section rewrites")
        return html
    return current
