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


def test_section_edit_calls_refine_section_not_refine(monkeypatch):
    calls = {"refine": 0, "refine_section": 0}

    def fake_refine(*a, **k):
        calls["refine"] += 1
        return "<!DOCTYPE html><html><body><h1>FULL</h1></body></html>"

    def fake_refine_section(*a, **k):
        calls["refine_section"] += 1
        return "<h1>SECTION</h1>"

    monkeypatch.setattr(edit_service.draft, "refine", fake_refine)
    monkeypatch.setattr(edit_service.draft, "refine_section", fake_refine_section)
    monkeypatch.setattr(edit_service, "_load_edit_provider", lambda: (object(), "m"))

    html = """<!DOCTYPE html><html><body>
    <header data-section="hero" class="c-x hero"><h1>Old</h1></header>
    </body></html>"""
    out = edit_service._apply_llm_edit("p1", html, "change hero headline to New")
    assert calls["refine_section"] == 1
    assert calls["refine"] == 0
    assert "SECTION" in out


def test_edit_without_markers_falls_back_to_full_page(monkeypatch):
    calls = {"refine": 0, "refine_section": 0}

    def fake_refine(*a, **k):
        calls["refine"] += 1
        return "<!DOCTYPE html><html><body><h1>FULL</h1></body></html>"

    def fake_refine_section(*a, **k):
        calls["refine_section"] += 1
        return "<h1>SECTION</h1>"

    monkeypatch.setattr(edit_service.draft, "refine", fake_refine)
    monkeypatch.setattr(edit_service.draft, "refine_section", fake_refine_section)
    monkeypatch.setattr(edit_service, "_load_edit_provider", lambda: (object(), "m"))

    html = "<!DOCTYPE html><html><body><h1>Old</h1></body></html>"
    edit_service._apply_llm_edit("p1", html, "change hero headline to New")
    assert calls["refine"] == 1
    assert calls["refine_section"] == 0
