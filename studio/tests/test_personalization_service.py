"""Personalization engine tests."""

import re

import pytest
from studio import config, db
from studio.repositories import profiles_repo, projects_repo, templates_repo
from studio.services import personalization_service


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    monkeypatch.setenv("STUDIO_S3_MOCK", "true")
    monkeypatch.setenv("STUDIO_ONBOARDING_LLM", "false")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def _seed_ready_project():
    project = projects_repo.create(
        "Dharwin One",
        initial_prompt="Build a website for HR software",
    )
    profiles_repo.save(
        {
            "projectId": project["projectId"],
            "brand": {"brandName": "Dharwin One"},
            "business": {
                "type": "SaaS",
                "services": ["HRMS", "ATS"],
                "description": "HR software for growing teams",
                "targetAudience": "HR teams",
            },
            "contact": {"email": "hello@dharwin.com", "phone": "+1 555 0100"},
            "completeness": {"percent": 100, "missingFields": []},
        }
    )
    return project


def test_personalize_html_has_no_unresolved_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Acme"},
        "business": {
            "type": "Retail",
            "services": ["Shoes", "Bags"],
            "description": "Premium footwear",
        },
        "contact": {"email": "shop@acme.com", "phone": "555-1234"},
        "location": {"city": "Austin"},
    }
    from studio import draft

    raw = open(
        f"{draft.TEMPLATES_DIR}/generic.html",
        encoding="utf-8",
    ).read()
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert "{{" not in html
    assert "Acme" in html
    assert "shop@acme.com" in html


def test_generate_persists_templates_with_s3_keys():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    assert len(result) >= 3
    stored = templates_repo.list_for_project(project["projectId"])
    assert len(stored) == len(result)
    assert all(t["s3HtmlKey"].startswith(f"projects/{project['projectId']}/templates/") for t in stored)
    assert all("{{" not in t["htmlContent"] for t in stored)
    assert re.search(r"Dharwin One", stored[0]["htmlContent"])


def test_generate_picks_genre_from_profile_and_prompt():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    assert result[0]["style"] in {"saas", "generic"}


def test_generate_rewrites_template_copy_via_llm(monkeypatch):
    from studio.services import component_rewrite_service, onboarding_service

    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            if "Section type:" in prompt:
                return "<h1>HR software that hires for you.</h1>"
            return "<p>ok</p>"

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    monkeypatch.setattr(
        component_rewrite_service,
        "_load_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"])
    composed = [t for t in result if t["templateId"].startswith("composed-")]
    assert composed
    assert "HR software that hires for you." in composed[0]["htmlContent"]


def test_generate_uses_style_preference_for_pack_selection():
    project = _seed_ready_project()
    profile = profiles_repo.get(project["projectId"])
    profile.setdefault("design", {})["stylePreference"] = "Ocean calm style with teal accents"
    profiles_repo.save(profile)
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    pack_ids = [t["templateId"] for t in result if "-" in t["templateId"]]
    assert any(pid.endswith("ocean-calm") for pid in pack_ids)


def test_personalize_html_replaces_tel_and_email_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Hurcules"},
        "business": {"type": "Fitness app"},
        "contact": {"email": "team@hurcules.app", "phone": "+1 555 0100"},
        "location": {"city": "Austin"},
    }
    raw = (
        "<!DOCTYPE html><html><body>"
        '<a href="tel:+910000000000">Call 000 000 0000</a>'
        '<a href="mailto:hello@yourdomain.com">hello@yourdomain.com</a>'
        "</body></html>"
    )
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert "team@hurcules.app" in html
    assert "mailto:team@hurcules.app" in html
    assert "tel:+15550100" in html
    assert "000 000 0000" not in html


def test_personalize_html_injects_contact_section_when_missing():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Hurcules"},
        "business": {"type": "Fitness app"},
        "contact": {"email": "team@hurcules.app", "phone": "+1 555 0100"},
        "location": {"city": "Austin"},
    }
    raw = "<!DOCTYPE html><html><body><h1>Hero</h1></body></html>"
    html = personalization_service.personalize_html(raw, profile, [], "generic")
    assert 'id="contact"' in html
    assert "team@hurcules.app" in html
    assert "+1 555 0100" in html


def test_personalize_html_replaces_existing_template_contact_literals():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Jotei"},
        "business": {"type": "Portfolio"},
        "contact": {"email": "jotei@gmail.com", "phone": "+1 568646846"},
        "location": {"city": "New York"},
    }
    raw = (
        "<!DOCTYPE html><html><body>"
        '<a href="#">studio@jotei.pt</a>'
        '<a href="#">+1 555 022 7180</a>'
        "</body></html>"
    )
    html = personalization_service.personalize_html(raw, profile, [], "portfolio")
    assert "studio@jotei.pt" not in html
    assert "+1 555 022 7180" not in html
    assert "jotei@gmail.com" in html
    assert "+1 568646846" in html


def test_personalize_html_uses_brand_based_contact_placeholders():
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Jotei Studio"},
        "business": {"type": "Portfolio"},
        "contact": {},
        "location": {"city": "New York"},
    }
    raw = "<!DOCTYPE html><html><body><h1>Hero</h1></body></html>"
    html = personalization_service.personalize_html(raw, profile, [], "portfolio")
    assert "hello@jotei-studio.site" in html
    assert "Add your phone number" in html


def test_personalize_html_does_not_inject_mock_s3_logo_url(monkeypatch):
    monkeypatch.delenv("STUDIO_ASSET_PUBLIC_BASE_URL", raising=False)
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Acme"},
        "business": {"type": "Restaurant"},
        "contact": {"email": "hello@acme.com"},
    }
    raw = (
        '<!DOCTYPE html><html><body>'
        '<img src="https://images.example.com/hero.jpg" alt="Family dining at the restaurant">'
        "</body></html>"
    )
    assets = [
        {
            "assetType": "logo",
            "status": "ready",
            "s3Key": "projects/p1/assets/a1/logo.png",
        }
    ]
    html = personalization_service.personalize_html(raw, profile, assets, "generic")
    assert "mock+s3://" not in html
    assert 'src="https://images.example.com/hero.jpg"' in html


def test_personalize_html_uses_public_asset_base_url_for_logo(monkeypatch):
    monkeypatch.setenv("STUDIO_ASSET_PUBLIC_BASE_URL", "https://cdn.dharwinone.com")
    profile = {
        "projectId": "x",
        "brand": {"brandName": "Acme"},
        "business": {"type": "Restaurant"},
        "contact": {"email": "hello@acme.com"},
    }
    raw = (
        '<!DOCTYPE html><html><body>'
        '<img src="https://images.example.com/hero.jpg" alt="Family dining at the restaurant">'
        "</body></html>"
    )
    assets = [
        {
            "assetType": "logo",
            "status": "ready",
            "s3Key": "projects/p1/assets/a1/logo.png",
        }
    ]
    html = personalization_service.personalize_html(raw, profile, assets, "generic")
    assert 'src="https://cdn.dharwinone.com/projects/p1/assets/a1/logo.png"' in html


def test_generate_rewrite_copy_at_most_once(monkeypatch):
    """C2: duplicate whole-template + composed call sites must not both fire."""
    from studio.services import onboarding_service, personalization_service

    calls = []

    def tracking_rewrite(html, profile):
        calls.append(len(html))
        return html

    monkeypatch.setattr(personalization_service, "_rewrite_copy", tracking_rewrite)
    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (object(), "fake-model"),
    )
    project = _seed_ready_project()
    personalization_service.generate_for_project(project["projectId"], force=True)
    assert len(calls) <= 1, f"_rewrite_copy called {len(calls)} times; expected at most 1"


@pytest.mark.parametrize("env,expected", [("1", 1), ("2", 2), ("3", 3), ("5", 3), ("x", 2)])
def test_composed_count_respects_env(monkeypatch, env, expected):
    monkeypatch.setenv("STUDIO_COMPOSED_VARIANTS", env)
    assert personalization_service._composed_count() == expected


def test_generate_gallery_cardinality_and_ordering(monkeypatch):
    monkeypatch.delenv("STUDIO_COMPOSED_VARIANTS", raising=False)
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    assert 4 <= len(result) <= 5
    composed = [t for t in result if t["templateId"].startswith("composed-")]
    assert len(composed) == 2
    assert result[0]["templateId"].startswith("composed-")
    assert result[0].get("galleryIndex", -1) == 0
    assert result[0].get("sourceKind") == "composed"


def test_generate_no_full_page_rewrite_when_component_rewrite_active(monkeypatch):
    from studio.services import component_rewrite_service, onboarding_service

    rewrite_calls = []
    monkeypatch.setattr(
        personalization_service,
        "_rewrite_copy",
        lambda html, profile: rewrite_calls.append(1) or html,
    )
    monkeypatch.setattr(
        component_rewrite_service,
        "rewrite_components_parallel",
        lambda html, profile: html.replace("OLD", "NEW"),
    )
    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (object(), "fake"),
    )
    project = _seed_ready_project()
    personalization_service.generate_for_project(project["projectId"], force=True)
    assert len(rewrite_calls) == 0


def test_composition_failure_emits_single_whole_fallback(monkeypatch):
    from studio.services import composition_service

    monkeypatch.setattr(composition_service, "compose_project_variants", lambda *a, **k: [])
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    fallback = [t for t in result if t.get("sourceKind") == "fallback"]
    assert len(fallback) >= 1
    assert result[-1].get("galleryIndex", 99) >= 0


def test_generate_template_payload_under_2mb():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    total = sum(len(t["htmlContent"].encode("utf-8")) for t in result)
    assert total < 2 * 1024 * 1024


def test_style_pack_on_composed_base_renders_coherently():
    project = _seed_ready_project()
    result = personalization_service.generate_for_project(project["projectId"], force=True)
    composed_primary = result[0]
    packs = [t for t in result if t.get("sourceKind") == "pack"]
    assert packs
    for pack in packs:
        html = pack["htmlContent"]
        assert "<!DOCTYPE html>" in html
        assert 'data-section="hero"' in html
        assert "bootstrap" in html.lower()
        assert html != composed_primary["htmlContent"]
