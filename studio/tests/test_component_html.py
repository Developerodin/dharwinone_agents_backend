"""Section marker extract/replace utilities."""

from studio import component_html

_SAMPLE = """<!DOCTYPE html><html><body>
<nav data-section="nav" class="c-x nav">NAV</nav>
<header data-section="hero" class="c-x hero"><h1>OLD</h1></header>
<footer data-section="footer" class="c-x footer">FOOT</footer>
</body></html>"""


def test_extract_section_inner_returns_inner_html():
    inner = component_html.extract_section_inner(_SAMPLE, "hero")
    assert inner.strip() == "<h1>OLD</h1>"


def test_replace_section_inner_preserves_outer_tag_and_attrs():
    updated = component_html.replace_section_inner(
        _SAMPLE, "hero", "<h1>NEW</h1>"
    )
    assert "<h1>NEW</h1>" in updated
    assert 'data-section="hero"' in updated
    assert 'class="c-x hero"' in updated
    assert "<h1>OLD</h1>" not in updated


def test_replace_section_validates_markers_and_scope_class():
    ok, reason = component_html.validate_section_root(
        '<header data-section="hero" class="c-saas-1-1 hero">',
        "hero",
        expected_scope_prefix="c-saas-1-1",
    )
    assert ok
    bad, reason = component_html.validate_section_root(
        '<header data-section="hero" class="broken">',
        "hero",
        expected_scope_prefix="c-saas-1-1",
    )
    assert not bad
    assert reason


def test_list_section_types_finds_all_markers():
    types = component_html.list_section_types(_SAMPLE)
    assert types == ["nav", "hero", "footer"]
