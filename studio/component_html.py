"""Extract/replace inner HTML for data-section marked component roots."""

import re

_SECTION_OPEN_RE = re.compile(
    r'<(?P<tag>\w+)(?P<attrs>[^>]*\bdata-section="(?P<type>[^"]+)"[^>]*)>',
    re.I | re.S,
)


def _tag_re(tag):
    return re.compile(rf"<(?P<slash>/?){re.escape(tag)}\b[^>]*>", re.I)


def _sections(html):
    """Yield (type, open_start, inner_start, inner_end, end) per section root.

    Depth-aware: a non-greedy regex closes on the first nested </div>, which
    truncated every div-rooted component (stats, features, about...).
    """
    for m in _SECTION_OPEN_RE.finditer(html):
        depth = 1
        for t in _tag_re(m.group("tag")).finditer(html, m.end()):
            depth += -1 if t.group("slash") else 1
            if depth == 0:
                yield m.group("type"), m.start(), m.end(), t.start(), t.end()
                break


def list_section_types(html):
    return [s[0] for s in _sections(html)]


def extract_section_inner(html, section_type):
    for type_, _, inner_start, inner_end, _ in _sections(html):
        if type_ == section_type:
            return html[inner_start:inner_end]
    return None


def replace_section_inner(html, section_type, new_inner):
    from studio import draft

    new_inner = draft._strip_markdown_fences(new_inner)
    for type_, _, inner_start, inner_end, _ in _sections(html):
        if type_ == section_type:
            return html[:inner_start] + new_inner + html[inner_end:]
    return html


def validate_section_root(opening_tag_html, section_type, *, expected_scope_prefix):
    if f'data-section="{section_type}"' not in opening_tag_html:
        return False, "missing_data_section"
    if expected_scope_prefix and expected_scope_prefix not in opening_tag_html:
        return False, "missing_scope_class"
    return True, ""
