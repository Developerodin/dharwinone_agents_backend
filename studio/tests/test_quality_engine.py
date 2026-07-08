"""Quality engine tests."""

from studio.quality.engine import run_quality


def test_quality_fails_on_placeholders():
    html = "<!DOCTYPE html><html><body>{{BRAND}}</body></html>"
    result = run_quality(html)
    assert result["verdict"] == "fail"


def test_quality_passes_clean_html():
    html = "<!DOCTYPE html><html><body><h1>Hi</h1><p>hello@test.com</p></body></html>"
    profile = {"contact": {"email": "hello@test.com"}}
    result = run_quality(html, profile)
    assert result["verdict"] in {"pass", "warn"}
