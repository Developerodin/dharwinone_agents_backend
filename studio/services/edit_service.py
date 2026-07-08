"""Working-html edits with safety policy."""

import html as html_lib
import re

from studio import draft
from studio.repositories import edits_repo, profiles_repo, versions_repo, working_html_repo

_TAGLINE_RE = re.compile(
    r'(<p class="tagline[^"]*"[^>]*>)(.*?)(</p>)',
    re.I | re.S,
)
_H1_RE = re.compile(r"(<h1[^>]*>)(.*?)(</h1>)", re.I | re.S)


class EditValidationError(ValueError):
    pass


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
    note = html_lib.escape(text[:240], quote=True)
    return html.replace("</body>", f"<!-- ai-edit: {note} --></body>", 1)


def _apply_structural_edit(html, prompt):
    section = html_lib.escape(prompt.strip()[:120] or "New section", quote=False)
    block = (
        f'<section class="builder-added"><h2>{section}</h2>'
        f"<p>Added via advanced structural edit.</p></section>"
    )
    return html.replace("</body>", f"{block}</body>", 1)


def apply_edit(project_id, prompt, *, structural=False):
    if not prompt.strip():
        raise EditValidationError("prompt required")
    html = working_html_repo.require_html(project_id)
    if structural:
        updated = _apply_structural_edit(html, prompt)
        scope = "structural"
    else:
        updated = _apply_content_edit(html, prompt)
        scope = "content"
    updated = draft.sanitize_html(updated)
    working_html_repo.put(project_id, updated)
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
    working_html_repo.put(project_id, html)
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
