"""Composition service tests."""

import re
import time

import pytest

from studio.services import composition_service, personalization_service


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setenv("STUDIO_ONBOARDING_LLM", "false")
    composition_service.reset_for_tests()
    yield
    composition_service.reset_for_tests()


PROFILE = {
    "brand": {"brandName": "Acme"},
    "business": {
        "type": "SaaS",
        "services": ["CRM", "Analytics"],
        "targetAudience": "startups",
    },
    "contact": {"email": "hi@acme.io", "phone": "+1 555 0100"},
}


def _one(project_id="proj-1", genre="saas"):
    variants = composition_service.compose_project_variants(project_id, "", genre, 1)
    assert len(variants) == 1
    return variants[0]


def test_compose_builds_full_document():
    v = _one()
    html = v["html"]
    assert html.startswith("<!DOCTYPE html>")
    assert "bootstrap" in html
    assert "fonts.googleapis.com" in html
    assert ":root{--accent:" in html  # base.css core vars present
    assert v["via"] == "deterministic"
    joined = ",".join(v["componentIds"])
    for required in ("nav", "hero", "footer"):
        assert f"-{required}" in joined


def test_compose_is_reproducible_and_seeded_per_project():
    a = _one("proj-1")["componentIds"]
    assert _one("proj-1")["componentIds"] == a
    others = [_one(f"proj-{i}")["componentIds"] for i in range(2, 8)]
    assert any(o != a for o in others)


def test_same_genre_components_used_when_available():
    ids = _one("proj-1", genre="cafe")["componentIds"]
    assert all(i.startswith("cafe-") for i in ids)
    assert any(i.endswith("-hero") for i in ids)


def test_fitness_compose_never_picks_other_genres():
    ids = _one("proj-fitro", genre="fitness")["componentIds"]
    assert ids
    assert all(i.startswith("fitness-") for i in ids)
    assert not any(i.startswith(("cafe-", "saas-", "agency-")) for i in ids)


def test_composed_page_personalizes_clean():
    html = _one()["html"]
    out = personalization_service.personalize_html(html, PROFILE, [], "saas")
    assert "{{" not in out
    assert "Acme" in out


def test_every_section_comes_from_one_page_family():
    # Mixing source pages mixes fonts and button shapes: the page stops reading as one site.
    for genre in ("fitness", "cafe", "saas", "agency"):
        ids = _one(f"proj-{genre}", genre=genre)["componentIds"]
        families = {composition_service._family({"id": i}) for i in ids}
        assert len(families) == 1, (genre, ids)


def test_page_carries_its_own_palette_not_the_shared_base_one():
    # base.css ships saas' palette; without the per-page :root every genre came
    # out in the same green and the templates' own themes never shipped.
    palettes = set()
    for genre in ("fitness", "cafe", "medical", "shop"):
        for seed in range(3):
            v = composition_service.compose_project_variants(f"p{seed}", "", genre, 1)
            root = re.search(r"<style>(:root\{[^}]*\})</style>", v[0]["html"])
            assert root, (genre, seed)
            palettes.add(root.group(1))
    assert len(palettes) > 1
    assert not any("#0d6e60" in p and "#f7f8fa" in p for p in palettes)  # base.css default


def test_sections_keep_source_page_order():
    ids = _one("proj-1", genre="fitness")["componentIds"]
    orders = [composition_service._order({"id": i}) for i in ids]
    assert orders == sorted(orders)
    assert ids[0].endswith("-nav")
    assert ids[-1].endswith("-footer")


def test_zero_count_returns_empty():
    assert composition_service.compose_project_variants("p", "", "saas", 0) == []


def test_two_variants_differ():
    variants = composition_service.compose_project_variants("proj-1", "", "saas", 2)
    assert len(variants) == 2
    assert variants[0]["componentIds"] != variants[1]["componentIds"]


def test_perf_and_size_budgets():
    _one()  # warm manifest/file cache
    t0 = time.perf_counter()
    v = _one()
    assert time.perf_counter() - t0 < 0.25  # spec budget 50ms; CI margin
    assert len(v["html"].encode("utf-8")) <= 150 * 1024


class _FakeProvider:
    def __init__(self, reply):
        self.reply = reply
        self.prompts = []

    def generate(self, model, prompt, **kwargs):
        self.prompts.append(prompt)
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def _with_provider(monkeypatch, reply):
    provider = _FakeProvider(reply)
    monkeypatch.setattr(
        composition_service.onboarding_service,
        "_load_onboarding_provider",
        lambda: (provider, "fake-model"),
    )
    return provider


def _valid_selection():
    """A real page family id from the manifest."""
    import json as _json

    family = sorted(composition_service._families("saas"))[0]
    return _json.dumps({"design": family})


def test_llm_valid_selection_is_used(monkeypatch):
    provider = _with_provider(monkeypatch, _valid_selection())
    v = composition_service.compose_project_variants("p1", "SaaS startup", "saas", 1)[0]
    assert v["via"] == "llm"
    assert len(provider.prompts) == 1
    chosen = sorted(composition_service._families("saas"))[0]
    assert {composition_service._family({"id": i}) for i in v["componentIds"]} == {chosen}


def test_llm_hallucinated_id_falls_back(monkeypatch):
    _with_provider(monkeypatch, '{"design": "no-such-design"}')
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_bad_json_falls_back(monkeypatch):
    _with_provider(monkeypatch, "sure! here are the components you asked for")
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_exception_falls_back(monkeypatch):
    _with_provider(monkeypatch, RuntimeError("provider down"))
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_missing_design_key_falls_back(monkeypatch):
    _with_provider(monkeypatch, '{"nav": "saas-1-nav"}')
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_called_only_for_first_variant(monkeypatch):
    provider = _with_provider(monkeypatch, _valid_selection())
    variants = composition_service.compose_project_variants("p1", "facts", "saas", 2)
    assert len(variants) == 2
    assert len(provider.prompts) == 1  # budget cap: one selection call
    assert variants[1]["via"] == "deterministic"


def test_assembled_html_contains_required_section_markers():
    variants = composition_service.compose_project_variants("p1", "SaaS startup", "saas", 1)
    assert variants
    html = variants[0]["html"]
    for required in ("nav", "hero", "footer"):
        assert f'data-section="{required}"' in html
