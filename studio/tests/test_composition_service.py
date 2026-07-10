"""Composition service tests."""

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
    cafe_ids = [i for i in ids if i.startswith("cafe")]
    # deterministic path picks same-genre whenever the slot has cafe candidates
    assert len(cafe_ids) >= len(ids) // 2
    assert any(i.endswith("-hero") for i in cafe_ids)


def test_composed_page_personalizes_clean():
    html = _one()["html"]
    out = personalization_service.personalize_html(html, PROFILE, [], "saas")
    assert "{{" not in out
    assert "Acme" in out


def test_tag_overlap_ranks_cross_genre_candidates(monkeypatch):
    fake_pool = [
        {"id": "aaa-1-pricing", "type": "pricing", "genre": "aaa", "tags": ["aaa", "pricing"]},
        {"id": "zzz-1-pricing", "type": "pricing", "genre": "zzz", "tags": ["zzz", "pricing", "coffee"]},
    ]
    monkeypatch.setattr(composition_service, "_index", lambda: {"pricing": fake_pool})
    ranked = composition_service._candidates("pricing", "none", frozenset({"coffee"}))
    assert ranked[0]["id"] == "zzz-1-pricing"  # tag overlap beats id order


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
    """Build a genuinely valid slot->id mapping from the real manifest."""
    import json as _json

    selection = {}
    for slot in composition_service.RECIPE:
        pool = composition_service._candidates(slot, "saas")
        if pool:
            selection[slot] = pool[0]["id"]
    return _json.dumps(selection)


def test_llm_valid_selection_is_used(monkeypatch):
    provider = _with_provider(monkeypatch, _valid_selection())
    v = composition_service.compose_project_variants("p1", "SaaS startup", "saas", 1)[0]
    assert v["via"] == "llm"
    assert len(provider.prompts) == 1
    # top-K only: prompt must not contain the whole manifest
    assert provider.prompts[0].count('"id"') <= len(composition_service.RECIPE) * 5


def test_llm_hallucinated_id_falls_back(monkeypatch):
    _with_provider(
        monkeypatch,
        '{"nav": "no-such-id", "hero": "also-fake", "footer": "nope"}',
    )
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


def test_llm_valid_id_in_wrong_slot_falls_back(monkeypatch):
    import json as _json

    selection = _json.loads(_valid_selection())
    selection["hero"], selection["footer"] = selection["footer"], selection["hero"]
    _with_provider(monkeypatch, _json.dumps(selection))
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_missing_required_slot_falls_back(monkeypatch):
    import json as _json

    selection = _json.loads(_valid_selection())
    del selection["footer"]
    _with_provider(monkeypatch, _json.dumps(selection))
    v = composition_service.compose_project_variants("p1", "facts", "saas", 1)[0]
    assert v["via"] == "deterministic"


def test_llm_called_only_for_first_variant(monkeypatch):
    provider = _with_provider(monkeypatch, _valid_selection())
    variants = composition_service.compose_project_variants("p1", "facts", "saas", 2)
    assert len(variants) == 2
    assert len(provider.prompts) == 1  # budget cap: one selection call
    assert variants[1]["via"] == "deterministic"
