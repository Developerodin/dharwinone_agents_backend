"""Extract/replace inner HTML for data-section marked component roots."""

import re

_SECTION_ROOT_RE = re.compile(
    r'(<(?P<tag>\w+)(?P<attrs>[^>]*)\bdata-section="(?P<type>[^"]+)"[^>]*>)'
    r"(?P<inner>.*?)"
    r"(?P<close></(?P=tag)>)",
    re.I | re.S,
)


def list_section_types(html):
    return [m.group("type") for m in _SECTION_ROOT_RE.finditer(html)]


def extract_section_inner(html, section_type):
    for m in _SECTION_ROOT_RE.finditer(html):
        if m.group("type") == section_type:
            return m.group("inner")
    return None


def replace_section_inner(html, section_type, new_inner):
    from studio import draft

    new_inner = draft._strip_markdown_fences(new_inner)
    for m in _SECTION_ROOT_RE.finditer(html):
        if m.group("type") == section_type:
            return (
                html[: m.start()]
                + f"{m.group(1)}{new_inner}{m.group('close')}"
                + html[m.end() :]
            )
    return html


def validate_section_root(opening_tag_html, section_type, *, expected_scope_prefix):
    if f'data-section="{section_type}"' not in opening_tag_html:
        return False, "missing_data_section"
    if expected_scope_prefix and expected_scope_prefix not in opening_tag_html:
        return False, "missing_scope_class"
    return True, ""
