"""Edit safety tests."""

from studio import draft


def test_sanitize_removes_script_and_handlers():
    dirty = (
        '<!DOCTYPE html><html><body><button onclick="alert(1)">x</button>'
        "<script>alert(1)</script></body></html>"
    )
    clean = draft.sanitize_html(dirty)
    assert "<script>" not in clean
    assert "onclick" not in clean
