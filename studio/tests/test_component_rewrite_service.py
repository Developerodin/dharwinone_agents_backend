"""Parallel section copy rewrite during generation."""

import threading
import time

import pytest

from studio.services import component_rewrite_service

_HTML = """<!DOCTYPE html><html><body>
<nav data-section="nav" class="c-x nav"><a>Home</a></nav>
<header data-section="hero" class="c-x hero"><h1>OLD HERO</h1></header>
<section data-section="features" class="c-x features"><p>OLD FEAT</p></section>
<section data-section="about" class="c-x about"><p>OLD ABOUT</p></section>
<section data-section="stats" class="c-x stats"><p>OLD STATS</p></section>
<section data-section="cta" class="c-x cta"><a>OLD CTA</a></section>
<footer data-section="footer" class="c-x footer"><p>OLD FOOT</p></footer>
</body></html>"""

_PROFILE = {
    "business": {
        "type": "Cafe",
        "description": "Neighborhood espresso bar",
        "services": ["Espresso", "Pastries"],
        "targetAudience": "Commuters",
    }
}


class SeqProvider:
    def __init__(self):
        self.max_inflight = 0
        self.inflight = 0
        self.lock = threading.Lock()
        self.calls = []

    def generate(self, model, prompt, **kwargs):
        with self.lock:
            self.inflight += 1
            self.max_inflight = max(self.max_inflight, self.inflight)
        time.sleep(0.05)
        with self.lock:
            self.inflight -= 1
        if "Section type: hero" in prompt:
            return "<h1>NEW HERO</h1>"
        if "Section type: features" in prompt:
            return "<p>NEW FEAT</p>"
        if "Section type: about" in prompt:
            return "<p>NEW ABOUT</p>"
        if "Section type: cta" in prompt:
            return "<a>NEW CTA</a>"
        self.calls.append(prompt)
        return "<p>NEW</p>"


def test_rewrite_keeps_original_image_urls(monkeypatch):
    # Models hallucinate Unsplash ids that 404; a copy rewrite must reuse the real ones.
    real = "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=60"
    html = (
        '<html><body><section data-section="hero" class="c-1">'
        f'<img src="{real}" alt="Espresso"><h1>Old</h1>'
        "</section></body></html>"
    )

    class HallucinatingProvider(SeqProvider):
        def generate(self, model, prompt, **kwargs):
            return (
                '<img src="https://images.unsplash.com/photo-1591504081469-0c94f3956024?w=700&q=60"'
                ' alt="Espresso"><h1>New</h1>'
            )

    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (HallucinatingProvider(), "fake"),
    )
    out = component_rewrite_service.rewrite_components_parallel(html, _PROFILE)
    assert real in out
    assert "1591504081469" not in out
    assert "<h1>New</h1>" in out


def test_parallel_rewrite_strips_markdown_fences(monkeypatch):
    class FenceProvider(SeqProvider):
        def generate(self, model, prompt, **kwargs):
            if "Section type: hero" in prompt:
                return "```html\n<h1>NEW HERO</h1>\n```"
            if "Section type: features" in prompt:
                return "<p>NEW FEAT</p>\n```"
            return super().generate(model, prompt, **kwargs)

    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (FenceProvider(), "fake"),
    )
    out = component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert "NEW HERO" in out
    assert "NEW FEAT" in out
    assert "```" not in out


def test_parallel_rewrite_updates_every_text_section(monkeypatch):
    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (SeqProvider(), "fake"),
    )
    out = component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert "NEW HERO" in out
    assert "NEW FEAT" in out
    assert "OLD FOOT" not in out  # nav/footer carry the wrong-genre copy: rewrite them
    assert "OLD STATS" in out  # stats stays: rewriting it invents numbers
    assert 'data-section="hero"' in out
    assert 'data-section="footer"' in out


def test_parallel_rewrite_caps_concurrency(monkeypatch):
    provider = SeqProvider()
    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (provider, "fake"),
    )
    component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert provider.max_inflight <= component_rewrite_service._MAX_WORKERS


def test_one_section_failure_keeps_others(monkeypatch):
    class FlakyProvider(SeqProvider):
        def generate(self, model, prompt, **kwargs):
            if "Section type: features" in prompt:
                raise RuntimeError("timeout")
            return super().generate(model, prompt, **kwargs)

    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (FlakyProvider(), "fake"),
    )
    out = component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert "NEW HERO" in out
    assert "OLD FEAT" in out  # original preserved


def test_no_provider_returns_input_unchanged(monkeypatch):
    monkeypatch.setattr(component_rewrite_service, "_load_provider", lambda: (None, None))
    out = component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert out == _HTML


def test_429_falls_back_to_sequential(monkeypatch):
    calls = {"n": 0}

    class RateLimitedProvider:
        def generate(self, model, prompt, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("429 rate limit")
            if "Section type: hero" in prompt:
                return "<h1>SEQ HERO</h1>"
            return "<p>ok</p>"

    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (RateLimitedProvider(), "fake"),
    )
    out = component_rewrite_service.rewrite_components_parallel(_HTML, _PROFILE)
    assert "SEQ HERO" in out
    assert calls["n"] >= 2
