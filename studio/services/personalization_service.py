"""Personalized template generation from base templates + business profile."""

import html as html_lib
import logging
import os
import re
import time

from studio import draft
from studio.repositories import assets_repo, profiles_repo, projects_repo, templates_repo
from studio.services import composition_service, onboarding_service
from studio.services import component_rewrite_service
from studio.services.profile_facts import business_facts
from studio.services.profile_service import is_multi_place_value, split_multi_place_value
from studio.storage import s3

_log = logging.getLogger(__name__)

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")
_EMAIL_TEXT_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_PHONE_TEXT_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_MAX_PACKS = 2
_STYLE_PREF_PACK_KEYWORDS = {
    "sleek-dark": ("sleek", "dark", "night", "moody"),
    "minimal-light": ("minimal", "clean", "simple", "light"),
    "bold-pop": ("bold", "pop", "vibrant", "neon", "colorful"),
    "frosted": ("glass", "frosted", "blur", "translucent"),
    "luxe-serif": ("luxe", "luxury", "premium", "elegant", "serif"),
    "high-contrast": ("high contrast", "contrast", "accessible"),
    "ocean-calm": ("ocean", "calm", "teal", "coastal", "aqua"),
}


class PersonalizationError(ValueError):
    """Raised when personalized HTML is invalid."""


def _brand(profile):
    name = (profile.get("brand") or {}).get("brandName")
    return html_lib.escape(name or "Your Brand", quote=True)


def _brand_slug(profile):
    brand = (profile.get("brand") or {}).get("brandName") or ""
    base = re.sub(r"[^a-z0-9]+", "-", str(brand).lower()).strip("-")
    return base or "yourbrand"


def _tagline(profile, genre):
    business = profile.get("business") or {}
    if business.get("description"):
        return html_lib.escape(business["description"], quote=True)
    services = business.get("services") or []
    btype = business.get("type") or "We"
    if services:
        text = f"{btype} — {', '.join(services[:3])}."
        return html_lib.escape(text, quote=True)
    default = draft.DEFAULT_TAGLINES.get(genre, draft.DEFAULT_TAGLINES["generic"])
    return html_lib.escape(default, quote=True)


def _location_display_text(profile):
    location = profile.get("location") or {}
    country = str(location.get("country") or "").strip()
    city = str(location.get("city") or "").strip()
    street = str(location.get("address") or "").strip()

    if country and is_multi_place_value(country):
        names = ", ".join(split_multi_place_value(country))
        return f"We work in many countries — {names}"

    if city and is_multi_place_value(city):
        names = ", ".join(split_multi_place_value(city))
        return f"Serving {names}"

    if street and city:
        return ", ".join([street, city])
    if city:
        return city
    if country:
        return country
    return "Your city"


def _apply_contact(html, profile):
    contact = profile.get("contact") or {}
    location = profile.get("location") or {}
    raw_email = str(contact.get("email") or "").strip()
    if not raw_email:
        raw_email = f"hello@{_brand_slug(profile)}.site"
    raw_phone = str(contact.get("phone") or "").strip() or "Add your phone number"

    email = html_lib.escape(raw_email, quote=True)
    phone = html_lib.escape(raw_phone, quote=True)
    phone_href = re.sub(r"\D", "", raw_phone)
    if phone_href and raw_phone.startswith("+"):
        phone_href = f"+{phone_href}"
    phone_href = html_lib.escape(phone_href, quote=True)
    address = html_lib.escape(_location_display_text(profile), quote=True)

    html = re.sub(r"(?i)\bAdd your number here\b", phone, html)
    html = re.sub(r"(?i)\bAdd your phone number\b", phone, html)
    html = re.sub(r"(?i)\bAdd your phone\b", phone, html)
    html = re.sub(r"(?i)hello@yourdomain\.com", email, html)
    html = re.sub(r"(?i)hello@[A-Za-z0-9.-]+\.example", email, html)
    html = re.sub(r"(?i)hello@example\.com", email, html)
    html = re.sub(r"Your street, your city", address, html)

    # Normalize any template-provided contact literals.
    html = _EMAIL_TEXT_RE.sub(email, html)
    html = _PHONE_TEXT_RE.sub(phone, html)

    html = re.sub(
        r'(?i)(href\s*=\s*["\'])mailto:[^"\']+(["\'])',
        rf"\1mailto:{email}\2",
        html,
    )
    if phone_href:
        html = re.sub(
            r'(?i)(href\s*=\s*["\'])tel:[^"\']*(["\'])',
            rf"\1tel:{phone_href}\2",
            html,
        )

    lower = html.lower()
    has_email = email.lower() in lower or f"mailto:{email.lower()}" in lower
    has_phone = phone.lower() in lower or (bool(phone_href) and f"tel:{phone_href.lower()}" in lower)
    if has_email and has_phone:
        return html

    phone_line = (
        f'<a href="tel:{phone_href}">{phone}</a>' if phone_href else f"{phone}"
    )
    section = (
        '<section id="contact" class="builder-contact" '
        'style="padding:48px 24px;border-top:1px solid #e5e7eb;">'
        '<div style="max-width:960px;margin:0 auto;">'
        '<h2 style="margin:0 0 12px;">Contact</h2>'
        f'<p style="margin:0 0 8px;">Email: <a href="mailto:{email}">{email}</a></p>'
        f"<p style=\"margin:0 0 8px;\">Phone: {phone_line}</p>"
        f'<p style="margin:0;">Location: {address}</p>'
        "</div></section>"
    )
    if re.search(r"</body>", html, flags=re.I):
        return re.sub(r"</body>", f"{section}</body>", html, count=1, flags=re.I)
    return f"{html}{section}"


def _apply_services(html, profile):
    services = (profile.get("business") or {}).get("services") or []
    for idx, service in enumerate(services[:3]):
        safe = html_lib.escape(service, quote=True)
        html = html.replace("Your main offering", safe, 1)
        html = html.replace("Your second strength", safe, 1)
        html = html.replace("The specialist request", safe, 1)
    audience = (profile.get("business") or {}).get("targetAudience")
    if audience:
        safe = html_lib.escape(audience, quote=True)
        html = html.replace("people nearby", safe, 1)
    return html


def _logo_url(assets):
    for asset in assets:
        if asset.get("assetType") == "logo" and asset.get("status") == "ready":
            key = asset.get("s3Key", "")
            if key:
                return s3.public_asset_url(key)
    return None


def _apply_logo(html, assets):
    logo = _logo_url(assets)
    if not logo:
        return html
    safe = html_lib.escape(logo, quote=True)
    if "<img" in html:
        return re.sub(
            r'(<img[^>]+src=")[^"]+(")',
            rf"\1{safe}\2",
            html,
            count=1,
        )
    return html.replace(
        '<a class="brand"',
        f'<img src="{safe}" alt="logo" style="height:32px;margin-right:8px;" /><a class="brand"',
        1,
    )


# Wording must not match draft._VISUAL_STYLE_HINT_RE, or refine() unlocks restyling.
_COPY_REWRITE_PROMPT = (
    "Rewrite the visible text of this page (headings, eyebrows, buttons, nav "
    "links, section copy, footer text) so every line accurately describes this "
    "business:\n{facts}\n"
    "Remove or replace copy about products this business does not offer. "
    "Keep the brand name and contact details exactly as they are. "
    "Change text only; keep every section and its structure."
)


def _rewrite_copy(html, profile):
    """LLM pass that grounds template copy in the business profile.

    Falls back to the string-substituted html when no provider is configured
    or the model returns an invalid document.
    """
    facts = business_facts(profile)
    if not facts:
        return html
    provider, model = onboarding_service._load_onboarding_provider()
    if provider is None or not model:
        return html
    try:
        rewritten = draft.refine(
            provider, model, html, _COPY_REWRITE_PROMPT.format(facts=facts)
        )
    except Exception:
        return html
    return rewritten or html


def personalize_html(raw_html, profile, assets, genre):
    html = raw_html.replace("{{BRAND}}", _brand(profile))
    html = html.replace("{{TAGLINE}}", _tagline(profile, genre))
    html = _apply_contact(html, profile)
    html = _apply_services(html, profile)
    html = _apply_logo(html, assets)
    html = draft.ensure_loadable_images(html, genre)
    if _PLACEHOLDER_RE.search(html):
        raise PersonalizationError("unresolved template placeholders remain")
    html = draft.normalize_cta_anchors(html)
    return draft.sanitize_html(html)


def _genre_hint(project, profile):
    prompt = project.get("initialPrompt") or ""
    business = profile.get("business") or {}
    parts = [
        prompt,
        business.get("type") or "",
        " ".join(business.get("services") or []),
        business.get("targetAudience") or "",
    ]
    return " ".join(p for p in parts if p).strip() or "generic website"


def _persist_key(project_id, template_id):
    return f"projects/{project_id}/templates/{template_id}.html"


def _preferred_pack_ids(profile):
    pref = str(((profile.get("design") or {}).get("stylePreference") or "")).lower().strip()
    if not pref:
        return []
    scored = []
    for idx, pack in enumerate(draft.STYLE_PACKS[1:]):
        pid = pack["id"]
        keywords = _STYLE_PREF_PACK_KEYWORDS.get(pid, ())
        score = sum(1 for kw in keywords if kw in pref)
        if score:
            scored.append((-score, idx, pid))
    scored.sort()
    return [pid for _, __, pid in scored]


def _selected_style_packs(profile):
    selected = []
    by_id = {pack["id"]: pack for pack in draft.STYLE_PACKS[1:]}
    for pid in _preferred_pack_ids(profile):
        pack = by_id.get(pid)
        if pack and pack not in selected:
            selected.append(pack)
        if len(selected) >= _MAX_PACKS:
            return selected
    for pack in draft.STYLE_PACKS[1:]:
        if pack not in selected:
            selected.append(pack)
        if len(selected) >= _MAX_PACKS:
            break
    return selected


def _composed_count():
    raw = os.environ.get("STUDIO_COMPOSED_VARIANTS", "2")
    try:
        n = int(raw)
    except ValueError:
        n = 2
    return max(0, min(n, 3))


def _composed_templates(project_id, profile, assets, genre):
    """Composed variants as template dicts. Any failure returns what succeeded."""
    out = []
    section_ms = 0.0
    try:
        composed = composition_service.compose_project_variants(
            project_id, business_facts(profile), genre, _composed_count()
        )
        for idx, comp in enumerate(composed):
            try:
                html = personalize_html(comp["html"], profile, assets, genre)
                if idx == 0:
                    rw_start = time.perf_counter()
                    if os.environ.get("STUDIO_COMPONENT_REWRITE", "1").strip().lower() in (
                        "0",
                        "false",
                        "no",
                    ):
                        html = _rewrite_copy(html, profile)
                    else:
                        html = component_rewrite_service.rewrite_components_parallel(
                            html, profile
                        )
                    section_ms = (time.perf_counter() - rw_start) * 1000
            except PersonalizationError:
                _log.warning("composed variant %s failed personalization", idx)
                continue
            template_id = f"composed-{idx + 1}"
            out.append(
                {
                    "templateId": template_id,
                    "label": f"Composed {idx + 1} · {genre.title()}",
                    "style": genre,
                    "sourceTemplateRef": ",".join(comp["componentIds"]),
                    "s3HtmlKey": _persist_key(project_id, template_id),
                    "htmlContent": html,
                }
            )
    except Exception:
        _log.exception("composed variants skipped for project %s", project_id)
    return out, section_ms


def generate_for_project(project_id, *, force=False):
    started = time.perf_counter()
    project = projects_repo.get(project_id)
    if not project:
        raise ValueError("project not found")
    existing = templates_repo.list_for_project(project_id)
    if existing and not force:
        return existing
    profile = profiles_repo.get(project_id)
    assets = assets_repo.list_for_project(project_id)
    genre = draft.pick_template(_genre_hint(project, profile))
    templates = []
    compose_ms = 0.0
    section_ms = 0.0

    compose_started = time.perf_counter()
    composed, section_ms = _composed_templates(project_id, profile, assets, genre)
    compose_ms = (time.perf_counter() - compose_started) * 1000 - section_ms
    if composed:
        for i, t in enumerate(composed):
            t["sourceKind"] = "composed"
            t["galleryIndex"] = i
            templates.append(t)
        base_html = composed[0]["htmlContent"]
        for j, pack in enumerate(_selected_style_packs(profile)):
            packed = draft._apply_pack(base_html, pack)
            if _PLACEHOLDER_RE.search(packed):
                raise PersonalizationError("unresolved placeholders in style pack")
            template_id = f"{genre}-{pack['id']}"
            templates.append(
                {
                    "templateId": template_id,
                    "label": f"{pack['label']} · {genre.title()}",
                    "style": genre,
                    "sourceTemplateRef": composed[0].get("sourceTemplateRef", ""),
                    "s3HtmlKey": _persist_key(project_id, template_id),
                    "htmlContent": packed,
                    "sourceKind": "pack",
                    "galleryIndex": len(composed) + j,
                }
            )
    else:
        design_files = draft.template_files(genre)
        if design_files:
            fname = design_files[0]
            stem = fname[: -len(".html")]
            with open(os.path.join(draft.TEMPLATES_DIR, fname), encoding="utf-8") as f:
                raw = f.read()
            html = personalize_html(raw, profile, assets, genre)
            templates.append(
                {
                    "templateId": stem,
                    "label": draft._design_label(raw, stem, genre),
                    "style": genre,
                    "sourceTemplateRef": fname,
                    "s3HtmlKey": _persist_key(project_id, stem),
                    "htmlContent": html,
                    "sourceKind": "fallback",
                    "galleryIndex": 0,
                }
            )

    templates.sort(key=lambda t: (t.get("galleryIndex", 999), t.get("templateId", "")))

    saved = templates_repo.replace_for_project(project_id, templates)
    projects_repo.update_fields(
        project_id,
        {"status": "ready", "templateCount": len(saved)},
    )
    _log.info(
        "generate_timing project=%s compose_ms=%.1f section_batch_ms=%.1f templates=%d total_ms=%.1f",
        project_id,
        compose_ms,
        section_ms,
        len(saved),
        (time.perf_counter() - started) * 1000,
    )
    return saved
