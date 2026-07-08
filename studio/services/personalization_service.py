"""Personalized template generation from base templates + business profile."""

import html as html_lib
import os
import re

from studio import draft
from studio.repositories import assets_repo, profiles_repo, projects_repo, templates_repo

_PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")
_MAX_DESIGNS = 3
_MAX_PACKS = 2


class PersonalizationError(ValueError):
    """Raised when personalized HTML is invalid."""


def _brand(profile):
    name = (profile.get("brand") or {}).get("brandName")
    return html_lib.escape(name or "Your Brand", quote=True)


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


def _apply_contact(html, profile):
    contact = profile.get("contact") or {}
    location = profile.get("location") or {}
    email = html_lib.escape(contact.get("email") or "hello@example.com", quote=True)
    phone = html_lib.escape(contact.get("phone") or "Add your number", quote=True)
    city = location.get("city") or location.get("country") or "Your city"
    address = html_lib.escape(
        ", ".join(x for x in [location.get("address"), city] if x) or "Your city",
        quote=True,
    )
    html = re.sub(r"Add your number here", phone, html)
    html = re.sub(r"hello@yourdomain\.com", email, html, flags=re.I)
    html = re.sub(r"hello@[A-Za-z0-9.-]+\.example", email, html)
    html = re.sub(r"Your street, your city", address, html)
    return html


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
                return f"mock+s3://asset/{key}"
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


def personalize_html(raw_html, profile, assets, genre):
    html = raw_html.replace("{{BRAND}}", _brand(profile))
    html = html.replace("{{TAGLINE}}", _tagline(profile, genre))
    html = _apply_contact(html, profile)
    html = _apply_services(html, profile)
    html = _apply_logo(html, assets)
    if _PLACEHOLDER_RE.search(html):
        raise PersonalizationError("unresolved template placeholders remain")
    return html


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


def generate_for_project(project_id, *, force=False):
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

    design_files = draft.template_files(genre)[:_MAX_DESIGNS]
    for fname in design_files:
        stem = fname[: -len(".html")]
        with open(os.path.join(draft.TEMPLATES_DIR, fname), encoding="utf-8") as f:
            raw = f.read()
        html = personalize_html(raw, profile, assets, genre)
        template_id = stem
        templates.append(
            {
                "templateId": template_id,
                "label": draft._design_label(raw, stem, genre),
                "style": genre,
                "sourceTemplateRef": fname,
                "s3HtmlKey": _persist_key(project_id, template_id),
                "htmlContent": html,
            }
        )

    if design_files:
        with open(
            os.path.join(draft.TEMPLATES_DIR, design_files[0]),
            encoding="utf-8",
        ) as f:
            base_raw = f.read()
        base_html = personalize_html(base_raw, profile, assets, genre)
        for pack in draft.STYLE_PACKS[1 : 1 + _MAX_PACKS]:
            packed = draft._apply_pack(base_html, pack)
            if _PLACEHOLDER_RE.search(packed):
                raise PersonalizationError("unresolved placeholders in style pack")
            template_id = f"{genre}-{pack['id']}"
            templates.append(
                {
                    "templateId": template_id,
                    "label": f"{pack['label']} · {genre.title()}",
                    "style": genre,
                    "sourceTemplateRef": design_files[0],
                    "s3HtmlKey": _persist_key(project_id, template_id),
                    "htmlContent": packed,
                }
            )

    saved = templates_repo.replace_for_project(project_id, templates)
    projects_repo.update_fields(
        project_id,
        {"status": "ready", "templateCount": len(saved)},
    )
    return saved
