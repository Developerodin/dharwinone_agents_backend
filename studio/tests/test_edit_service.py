"""Edit safety tests."""

from studio import draft
from studio.services import edit_service


def test_sanitize_removes_script_and_handlers():
    dirty = (
        '<!DOCTYPE html><html><body><button onclick="alert(1)">x</button>'
        "<script>alert(1)</script></body></html>"
    )
    clean = draft.sanitize_html(dirty)
    assert "<script>" not in clean
    assert "onclick" not in clean


def test_identify_sections_maps_hero_prompt():
    assert edit_service._identify_sections("change hero headline to Welcome") == "hero"


def test_identify_sections_returns_none_when_ambiguous():
    assert edit_service._identify_sections("make the site better") is None


def test_identify_sections_maps_features_keywords():
    assert edit_service._identify_sections("update the features section copy") == "features"
