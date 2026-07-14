"""Onboarding service tests."""

import pytest
from studio import config, db
from studio.repositories import conversations_repo, profiles_repo, projects_repo
from studio.services import onboarding_service


@pytest.fixture(autouse=True)
def memory_db(monkeypatch):
    monkeypatch.setenv("STUDIO_BUILDER_V2", "true")
    monkeypatch.setenv("STUDIO_MONGO_URI", "memory://")
    monkeypatch.setenv("STUDIO_ONBOARDING_LLM", "false")
    config.reset_for_tests()
    db.reset_for_tests()
    yield
    config.reset_for_tests()
    db.reset_for_tests()


def _project():
    return projects_repo.create("Acme Corp", initial_prompt="Build my site")


def _advance_to_country(project_id: str):
    onboarding_service.handle_message(project_id, "Coffee shop website")
    onboarding_service.handle_message(project_id, "Dharwin One")
    onboarding_service.handle_message(project_id, "Coffee, desserts")
    onboarding_service.handle_message(project_id, "A cozy cafe for local visitors")
    # targetAudience is prefilled from the cafe genre — not asked


def _complete_profile(project_id: str):
    _advance_to_country(project_id)
    onboarding_service.handle_message(project_id, "India")
    onboarding_service.handle_message(project_id, "Jaipur")
    onboarding_service.handle_message(project_id, "hello@acme.com")
    onboarding_service.handle_message(project_id, "+91 9876543210")


def test_first_message_starts_onboarding_not_generation():
    project = _project()
    result = onboarding_service.handle_message(project["projectId"], "Create a website")
    assert result["assistantMessage"]
    assert (
        "website" in result["assistantMessage"].lower()
        or "brand" in result["assistantMessage"].lower()
    )
    assert result["readyToGenerate"] is False
    assert result["completeness"]["percent"] < 100


def test_initial_prompt_mines_type_and_services():
    project = _project()
    result = onboarding_service.handle_message(
        project["projectId"],
        "Restaurant website with menu, reservations, and location map",
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["business"]["type"].lower().startswith("restaurant")
    assert profile["business"]["services"] == ["menu", "reservations", "location map"]
    msg = result["assistantMessage"].lower()
    assert "call" in msg or "name" in msg


def test_initial_prompt_mining_ignores_generic_prompts():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Create a website")
    profile = profiles_repo.get(project["projectId"])
    assert profile["business"]["type"] is None


def test_initial_prompt_llm_extraction(monkeypatch):
    project = _project()

    class FakeJSONProvider:
        def generate(self, model, prompt, **kwargs):
            return (
                '{"businessType": "biryani restaurant", '
                '"services": ["dine-in", "delivery"], "brandName": "Paradise"}'
            )

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeJSONProvider(), "fake-model"),
    )
    onboarding_service.handle_message(
        project["projectId"], "a site for my biryani place in Hyderabad called Paradise"
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["business"]["type"] == "biryani restaurant"
    assert profile["business"]["services"] == ["dine-in", "delivery"]
    assert profile["brand"]["brandName"] == "Paradise"


def test_initial_prompt_llm_garbage_falls_back_to_regex(monkeypatch):
    project = _project()

    class GarbageProvider:
        def generate(self, model, prompt, **kwargs):
            return "sure! here are the fields you asked for"

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (GarbageProvider(), "fake-model"),
    )
    onboarding_service.handle_message(
        project["projectId"],
        "Restaurant website with menu, reservations, and location map",
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["business"]["services"] == ["menu", "reservations", "location map"]


def test_services_question_can_be_llm_driven(monkeypatch):
    project = _project()
    monkeypatch.setattr(
        onboarding_service,
        "_llm_phrase",
        lambda kind, fallback_text, user_message=None, profile=None: (
            "What dishes or cuisines should the menu feature?"
            if kind == "ask_services"
            else None
        ),
    )
    onboarding_service.handle_message(project["projectId"], "Restaurant website")
    result = onboarding_service.handle_message(project["projectId"], "Spice Villa")
    msg = result["assistantMessage"].lower()
    assert "menu" in msg or "dish" in msg


def test_services_question_stays_generic_for_unknown_type():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Consulting firm website")
    result = onboarding_service.handle_message(project["projectId"], "Acme Advisors")
    assert "services or products" in result["assistantMessage"].lower()


def test_high_confidence_brand_extraction():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Create a website")
    onboarding_service.handle_message(project["projectId"], "Coffee shop website")
    result = onboarding_service.handle_message(
        project["projectId"], "My company is called Dharwin One"
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["brand"]["brandName"] == "Dharwin One"
    assert result["completeness"]["percent"] > 0


def test_sequential_chat_increases_completeness():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Build a site")
    r1 = onboarding_service.handle_message(project["projectId"], "We are Dharwin One")
    onboarding_service.handle_message(
        project["projectId"], "We sell HRMS and ATS software"
    )
    r3 = onboarding_service.handle_message(
        project["projectId"], "Target audience is HR teams at mid-size companies"
    )
    r4 = onboarding_service.handle_message(
        project["projectId"], "Contact us at hello@dharwin.com"
    )
    assert r4["completeness"]["percent"] >= r3["completeness"]["percent"]
    assert r4["completeness"]["percent"] >= r1["completeness"]["percent"]
    assert "email" not in r4["completeness"]["missingFields"]


def test_conversation_turns_persisted():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Hello")
    onboarding_service.handle_message(project["projectId"], "Dharwin One")
    turns = conversations_repo.list_turns(project["projectId"])
    assert len(turns) >= 4
    assert turns[0]["role"] == "user"


def test_confidence_routing_low_clarifies():
    project = _project()
    onboarding_service.handle_message(project["projectId"], "Build site")
    onboarding_service.handle_message(project["projectId"], "maybe tech")
    result = onboarding_service.handle_message(project["projectId"], "stuff")
    assert result["assistantMessage"]
    assert result["readyToGenerate"] is False


def test_country_question_rejects_city_pairs():
    project = _project()
    _advance_to_country(project["projectId"])
    result = onboarding_service.handle_message(project["projectId"], "in jaipur mumbai")
    profile = profiles_repo.get(project["projectId"])
    assert profile["location"]["country"] is None
    assert "country" in result["assistantMessage"].lower()


def test_location_entities_parse_from_mixed_phrase():
    project = _project()
    _advance_to_country(project["projectId"])
    country_result = onboarding_service.handle_message(
        project["projectId"], "based in jaipur, india"
    )
    profile = profiles_repo.get(project["projectId"])
    assert profile["location"]["country"] == "India"
    # both parsed from one phrase — city question is skipped
    assert profile["location"]["city"] == "Jaipur"
    assert country_result["readyToGenerate"] is True


def test_location_extraction_uses_llm_for_space_separated_city_country(monkeypatch):
    project = _project()
    _advance_to_country(project["projectId"])

    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            return '{"country": "India", "city": "Jaipur"}'

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    country_result = onboarding_service.handle_message(project["projectId"], "Jaipur India")
    profile = profiles_repo.get(project["projectId"])
    assert profile["location"]["country"] == "India"
    # LLM parsed both entities from one phrase — city question is skipped
    assert profile["location"]["city"] == "Jaipur"
    assert country_result["readyToGenerate"] is True


def test_country_extraction_works_without_country_dictionary():
    project = _project()
    _advance_to_country(project["projectId"])
    onboarding_service.handle_message(project["projectId"], "country is wakanda")
    profile = profiles_repo.get(project["projectId"])
    assert profile["location"]["country"] == "Wakanda"


def test_ready_state_reply_is_natural_and_understands_go_ahead():
    project = _project()
    _complete_profile(project["projectId"])
    result = onboarding_service.handle_message(project["projectId"], "please do")
    assert result["readyToGenerate"] is True
    assert "kicking off" in result["assistantMessage"].lower()


def test_completing_profile_does_not_start_generation():
    """Regression: a complete profile made the frontend fire generation on every
    later turn, rebuilding an already-generated site. Only an explicit request
    starts generation."""
    project = _project()
    _complete_profile(project["projectId"])
    passive = onboarding_service.handle_message(project["projectId"], "+15551234567")
    assert passive["readyToGenerate"] is True
    assert passive["startGeneration"] is False

    asked = onboarding_service.handle_message(project["projectId"], "go ahead")
    assert asked["startGeneration"] is True


def test_ready_state_understands_start_intent():
    project = _project()
    _complete_profile(project["projectId"])
    result = onboarding_service.handle_message(project["projectId"], "start")
    assert result["readyToGenerate"] is True
    assert "generat" in result["assistantMessage"].lower() or "kicking off" in result["assistantMessage"].lower()


def test_llm_rephrase_prompt_is_grounded_in_profile_business(monkeypatch):
    """Regression: rephraser saw only the last user message and hallucinated
    a different business type (photography portfolio -> 'wedding planning')."""
    project = _project()
    monkeypatch.setenv("STUDIO_ONBOARDING_LLM", "true")
    prompts = []

    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            prompts.append(prompt)
            return "Where will your business be based?"

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeProvider(), "fake-model"),
    )
    pid = project["projectId"]
    onboarding_service.handle_message(pid, "photography portfolio")
    onboarding_service.handle_message(pid, "dharwin")
    onboarding_service.handle_message(pid, "photography of course")
    onboarding_service.handle_message(pid, "minimalist and premium")
    prompts.clear()
    onboarding_service.handle_message(pid, "people who are about to be married")
    assert prompts, "LLM rephraser should have been called"
    assert any("photography" in p.lower() for p in prompts), (
        "rephrase prompt must include the known business type so the LLM "
        "cannot invent a different one from the last user message"
    )
    assert all("do not" in p.lower() or "never" in p.lower() for p in prompts)


def test_ready_state_prefers_llm_generated_phrase(monkeypatch):
    project = _project()
    _complete_profile(project["projectId"])
    monkeypatch.setattr(
        onboarding_service,
        "_llm_phrase",
        lambda *a, **k: "Absolutely — generating your personalized templates now.",
    )
    result = onboarding_service.handle_message(project["projectId"], "go ahead")
    assert result["readyToGenerate"] is True
    assert result["assistantMessage"] == "Absolutely — generating your personalized templates now."


def test_style_directive_becomes_style_preference_not_description():
    project = _project()
    pid = project["projectId"]
    onboarding_service.handle_message(pid, "Coffee shop website")
    onboarding_service.handle_message(pid, "Dharwin One")
    onboarding_service.handle_message(pid, "Coffee, desserts")
    result = onboarding_service.handle_message(pid, "make is minimilist and sleek")

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    assert profile["design"]["stylePreference"] == "make is minimilist and sleek"
    assert "homepage" in result["assistantMessage"].lower()


def test_clarify_request_is_explained_not_stored():
    project = _project()
    pid = project["projectId"]
    onboarding_service.handle_message(pid, "Fitness app website")
    onboarding_service.handle_message(pid, "Flora")
    onboarding_service.handle_message(pid, "Workout plans, nutrition tracking")
    result = onboarding_service.handle_message(
        pid, "i don't understand what are you asking can you elaborate"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    # explains with an example and re-asks the same question
    assert "for example" in result["assistantMessage"].lower() or "e.g." in result["assistantMessage"].lower()
    assert "easy photo editing" not in result["assistantMessage"].lower()
    assert "workout" in result["assistantMessage"].lower() or "nutrition" in result["assistantMessage"].lower()
    assert result["readyToGenerate"] is False


def test_description_question_example_uses_profile_context():
    project = _project()
    pid = project["projectId"]
    onboarding_service.handle_message(pid, "Landing page for a fitness app")
    onboarding_service.handle_message(pid, "Hurcules")
    result = onboarding_service.handle_message(pid, "cardio and strength training")

    msg = result["assistantMessage"].lower()
    assert "for example" in msg
    assert "easy photo editing" not in msg
    assert "hurcules" in msg
    assert "cardio" in msg or "strength" in msg


def _fake_router(monkeypatch, payload):
    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            return payload

    monkeypatch.setattr(
        onboarding_service,
        "_load_onboarding_provider",
        lambda: (FakeProvider(), "fake-model"),
    )


def _advance_to_description(pid):
    onboarding_service.handle_message(pid, "Fitness app website")
    onboarding_service.handle_message(pid, "Flora")
    onboarding_service.handle_message(pid, "Workout plans, nutrition tracking")


def test_user_requests_more_examples_stays_on_description_field():
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    result = onboarding_service.handle_message(
        pid, "do you have any more examples?"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    msg = result["assistantMessage"].lower()
    assert "here are a few options" in msg
    assert "pick one" in msg
    assert "flora" in msg
    assert "country" not in msg
    assert "perfect." not in msg


def test_user_requests_classy_examples_gets_new_options_not_country_question():
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    result = onboarding_service.handle_message(
        pid, "do you have any more examples make something classy and professional"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    msg = result["assistantMessage"].lower()
    assert "here are a few options" in msg
    assert "pick one" in msg
    assert "flora" in msg
    assert "workout" in msg or "nutrition" in msg
    assert "country" not in msg
    assert "perfect." not in msg


def test_user_requests_classy_examples_when_llm_routes_answer(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    _fake_router(
        monkeypatch,
        '{"intent": "answer", "value": "something classy and professional"}',
    )
    result = onboarding_service.handle_message(
        pid, "do you have any more examples make something classy and professional"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    assert "here are a few options" in result["assistantMessage"].lower()
    assert "country" not in result["assistantMessage"].lower()


def _advance_to_fitro_description(pid):
    onboarding_service.handle_message(pid, "Fitness app website")
    onboarding_service.handle_message(pid, "fitro")
    onboarding_service.handle_message(pid, "Workout plans, nutrition tracking")


def test_aggressive_fiery_tagline_request_returns_examples():
    project = _project()
    pid = project["projectId"]
    _advance_to_fitro_description(pid)
    result = onboarding_service.handle_message(
        pid, "do you have aggressive fiery tag line for example"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    msg = result["assistantMessage"].lower()
    assert "here are a few options" in msg
    assert "pick one" in msg
    assert "fitro" in msg
    assert "workout" in msg or "nutrition" in msg
    assert "noted" not in msg
    assert "keep the design" not in msg
    assert "country" not in msg


def test_design_note_path_does_not_trigger_on_example_request(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_fitro_description(pid)
    _fake_router(monkeypatch, '{"intent": "style", "value": null}')
    result = onboarding_service.handle_message(
        pid, "do you have aggressive fiery tag line for example"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    assert not profile["design"].get("stylePreference")
    msg = result["assistantMessage"].lower()
    assert "here are a few options" in msg
    assert "pick one" in msg
    assert "noted" not in msg
    assert "keep the design" not in msg


@pytest.mark.parametrize(
    "message",
    [
        "do you have aggressive fiery tag line for example",
        "tagline example please",
        "tag line for example",
        "do you have a bold example",
        "give me an edgy tagline example",
        "show me playful intro examples",
        "something fiery and bold",
    ],
)
def test_examples_request_regex_coverage(message):
    assert onboarding_service._requests_more_examples(message)


def test_direct_answer_still_advances():
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    result = onboarding_service.handle_message(
        pid, "We help busy people stay fit at home with guided workouts."
    )

    profile = profiles_repo.get(pid)
    assert profile["business"]["description"]
    assert "country" in result["assistantMessage"].lower()
    assert "intro line" not in result["assistantMessage"].lower()


def test_llm_router_classifies_clarify_regex_would_miss(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    _fake_router(monkeypatch, '{"intent": "clarify", "value": null}')
    result = onboarding_service.handle_message(pid, "huh?? not following you at all bro")

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    assert result["readyToGenerate"] is False


def test_llm_router_routes_style_instruction_at_any_question(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    onboarding_service.handle_message(pid, "We help busy people stay fit at home")
    _fake_router(monkeypatch, '{"intent": "style", "value": null}')
    # asked about location, user talks about design instead
    result = onboarding_service.handle_message(pid, "i want neon colors with dark background vibes")

    profile = profiles_repo.get(pid)
    assert not profile["location"].get("country")
    assert "neon colors" in profile["design"]["stylePreference"]
    assert result["readyToGenerate"] is False


def test_llm_router_answer_prefers_cleaned_value(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    _fake_router(
        monkeypatch,
        '{"intent": "answer", "value": "Simple home workouts and nutrition plans for busy people."}',
    )
    onboarding_service.handle_message(
        pid, "well i guess you could say umm we do like home workouts and nutrition stuff"
    )

    profile = profiles_repo.get(pid)
    assert (
        profile["business"]["description"]
        == "Simple home workouts and nutrition plans for busy people"
    )


def test_llm_router_garbage_falls_back_to_regex(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    _fake_router(monkeypatch, "sorry I cannot help with that")
    result = onboarding_service.handle_message(
        pid, "i don't understand what are you asking can you elaborate"
    )

    profile = profiles_repo.get(pid)
    assert not profile["business"].get("description")
    assert result["readyToGenerate"] is False


def test_obvious_audience_prefilled_and_not_asked_for_known_genre():
    project = _project()
    pid = project["projectId"]
    onboarding_service.handle_message(
        pid, "Restaurant website with menu, reservations, and location map"
    )
    onboarding_service.handle_message(pid, "Delta")
    result = onboarding_service.handle_message(pid, "dine and dineout")

    profile = profiles_repo.get(pid)
    assert profile["business"]["targetAudience"]
    assert "customers" not in result["assistantMessage"].lower()
    assert "country" in result["assistantMessage"].lower()


def test_user_can_skip_a_field_and_is_not_trapped():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India")
    result = onboarding_service.handle_message(pid, "i will add it later")

    profile = profiles_repo.get(pid)
    assert "location.city" in profile.get("skipped", [])
    assert result["readyToGenerate"] is True


def test_country_answer_with_city_pair_fills_both():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    result = onboarding_service.handle_message(pid, "Jaipur, India")

    profile = profiles_repo.get(pid)
    assert profile["location"]["country"] == "India"
    assert profile["location"]["city"] == "Jaipur"
    assert result["readyToGenerate"] is True


def test_onboarding_no_longer_asks_contact_email_or_phone():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India")
    result = onboarding_service.handle_message(pid, "Jaipur")
    msg = result["assistantMessage"].lower()
    assert "email" not in msg
    assert "phone" not in msg
    assert result["readyToGenerate"] is True


def test_accept_description_example_saves_value_and_advances():
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    result = onboarding_service.handle_message(pid, "i like this one in example use it")

    profile = profiles_repo.get(pid)
    desc = profile["business"]["description"]
    assert "Flora" in desc
    assert "workout" in desc.lower() or "nutrition" in desc.lower()
    assert "intro line" not in result["assistantMessage"].lower()
    assert "country" in result["assistantMessage"].lower()


def test_accept_description_example_variants():
    for message in (
        "use it",
        "like the example",
        "that one works for me",
        "use the example",
    ):
        project = _project()
        pid = project["projectId"]
        _advance_to_description(pid)
        result = onboarding_service.handle_message(pid, message)
        profile = profiles_repo.get(pid)
        assert profile["business"]["description"]
        assert "intro line" not in result["assistantMessage"].lower()


def test_accept_description_example_when_llm_routes_other(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_description(pid)
    _fake_router(monkeypatch, '{"intent": "other", "value": null}')
    result = onboarding_service.handle_message(pid, "i like this one in example use it")

    profile = profiles_repo.get(pid)
    assert profile["business"]["description"]
    assert "sure! meanwhile" not in result["assistantMessage"].lower()
    assert "intro line" not in result["assistantMessage"].lower()
    assert "country" in result["assistantMessage"].lower()


def test_multi_country_and_phrase_saves_both():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    result = onboarding_service.handle_message(pid, "in india and usa")

    profile = profiles_repo.get(pid)
    country = profile["location"]["country"]
    assert "india" in country.lower()
    assert "usa" in country.lower()
    assert profile["location"].get("city") is None
    assert "country" not in result["assistantMessage"].lower() or result["readyToGenerate"]


def test_multi_country_comma_separated_saves_both():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India, USA")

    profile = profiles_repo.get(pid)
    country = profile["location"]["country"]
    assert "india" in country.lower()
    assert "usa" in country.lower()
    assert profile["location"].get("city") is None


def test_both_reuses_prior_multi_country_answer(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    calls = {"n": 0}
    original_extract = onboarding_service._extract

    def flaky_extract(message, field_path, profile=None):
        if field_path == "location.country" and calls["n"] == 0:
            calls["n"] += 1
            return None, "low"
        return original_extract(message, field_path, profile)

    monkeypatch.setattr(onboarding_service, "_extract", flaky_extract)
    _fake_router(monkeypatch, '{"intent": "clarify", "value": null}')
    onboarding_service.handle_message(pid, "in india and usa")
    assert profiles_repo.get(pid)["location"]["country"] is None

    result = onboarding_service.handle_message(pid, "both")
    profile = profiles_repo.get(pid)
    country = profile["location"]["country"]
    assert "india" in country.lower()
    assert "usa" in country.lower()
    assert "no problem" not in result["assistantMessage"].lower()


def test_multi_country_not_misrouted_as_clarify(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    _fake_router(monkeypatch, '{"intent": "clarify", "value": null}')
    result = onboarding_service.handle_message(pid, "in india and usa")

    profile = profiles_repo.get(pid)
    country = profile["location"]["country"]
    assert "india" in country.lower()
    assert "usa" in country.lower()
    assert "no problem" not in result["assistantMessage"].lower()


def test_accept_country_example_saves_value_and_advances():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    result = onboarding_service.handle_message(pid, "go with the example")

    profile = profiles_repo.get(pid)
    assert profile["location"]["country"] == "India"
    assert "country" not in result["assistantMessage"].lower() or "city" in result["assistantMessage"].lower()


def test_accept_country_example_when_llm_routes_other(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    _fake_router(monkeypatch, '{"intent": "other", "value": null}')
    result = onboarding_service.handle_message(pid, "go with the example")

    profile = profiles_repo.get(pid)
    assert profile["location"]["country"] == "India"
    assert "sure! meanwhile" not in result["assistantMessage"].lower()


def test_onboarding_multi_country_skips_city_question():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    result = onboarding_service.handle_message(pid, "in india and usa")

    profile = profiles_repo.get(pid)
    country = profile["location"]["country"]
    assert "india" in country.lower()
    assert "usa" in country.lower()
    assert profile["location"].get("city") is None
    assert result["readyToGenerate"] is True
    assert "city" not in result["assistantMessage"].lower()


def test_onboarding_multi_city_single_country():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India")
    result = onboarding_service.handle_message(pid, "Delhi and Mumbai")

    profile = profiles_repo.get(pid)
    city = profile["location"]["city"]
    assert "delhi" in city.lower()
    assert "mumbai" in city.lower()
    assert profile["location"]["country"] == "India"
    assert result["readyToGenerate"] is True


def test_onboarding_multi_city_comma_separated():
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India")
    onboarding_service.handle_message(pid, "Delhi, Mumbai")

    profile = profiles_repo.get(pid)
    city = profile["location"]["city"]
    assert "delhi" in city.lower()
    assert "mumbai" in city.lower()


def test_onboarding_both_cities_reuses_prior_answer(monkeypatch):
    project = _project()
    pid = project["projectId"]
    _advance_to_country(pid)
    onboarding_service.handle_message(pid, "India")
    calls = {"n": 0}
    original_extract = onboarding_service._extract

    def flaky_extract(message, field_path, profile=None):
        if field_path == "location.city" and calls["n"] == 0:
            calls["n"] += 1
            return None, "low"
        return original_extract(message, field_path, profile)

    monkeypatch.setattr(onboarding_service, "_extract", flaky_extract)
    _fake_router(monkeypatch, '{"intent": "clarify", "value": null}')
    onboarding_service.handle_message(pid, "Delhi and Mumbai")
    assert profiles_repo.get(pid)["location"].get("city") is None

    result = onboarding_service.handle_message(pid, "both")
    profile = profiles_repo.get(pid)
    city = profile["location"]["city"]
    assert "delhi" in city.lower()
    assert "mumbai" in city.lower()
    assert result["readyToGenerate"] is True
