import os

from studio import draft


def test_pick_template_by_genre():
    assert draft.pick_template("build a landing page for a coffee shop") == "cafe"
    assert draft.pick_template("create a website for sports shoes") == "shop"
    assert draft.pick_template("portfolio for a photographer") == "portfolio"
    assert draft.pick_template("landing page for my ai saas tool") == "saas"
    assert draft.pick_template("website for a crossfit gym") == "fitness"
    assert draft.pick_template("site for a law firm") == "agency"
    assert (
        draft.pick_template("website for construction company delta") == "construction"
    )
    assert draft.pick_template("site for a dental clinic") == "medical"
    assert draft.pick_template("coaching academy website") == "education"
    assert draft.pick_template("tour packages for himachal") == "travel"
    assert draft.pick_template("make me something nice") == "generic"


def test_brand_from_called_pattern():
    p = (
        "Create A website for construction company called delta "
        "which operates in delhi and noida"
    )
    assert draft.brand_from_prompt(p) == "Delta"
    assert (
        draft.brand_from_prompt("site for a bakery named Sugar Loaf in pune")
        == "Sugar Loaf"
    )


def test_tagline_never_echoes_command():
    p = (
        "Create A website for construction company called delta "
        "which operates in delhi and noida"
    )
    tag = draft.tagline_from_prompt(p, "construction")
    assert not tag.lower().startswith("create")
    assert "website" not in tag.lower()
    assert "delta" not in tag.lower()  # brand clause stripped
    # too little left over -> genre default, not an empty echo
    assert (
        draft.tagline_from_prompt("coffee shop", "cafe")
        == draft.DEFAULT_TAGLINES["cafe"]
    )


def test_make_draft_fills_tokens():
    name, html = draft.make_draft("build a landing page for a coffee shop")
    assert name == "cafe"
    assert "{{" not in html
    assert "Coffee Shop" in html


def test_every_template_has_tokens():
    for f in os.listdir(draft.TEMPLATES_DIR):
        with open(os.path.join(draft.TEMPLATES_DIR, f), encoding="utf-8") as fh:
            body = fh.read()
        assert "{{BRAND}}" in body and "{{TAGLINE}}" in body, f


def test_write_draft(tmp_path):
    _, html = draft.make_draft("gym website")
    path = draft.write_draft(str(tmp_path), html)
    assert os.path.exists(path)


def test_make_variants_designs_then_styles(tmp_path):
    name, variants = draft.make_variants("coffee shop site")
    assert name == "cafe"
    assert variants[0]["id"] == "cafe"  # base design leads
    pack_ids = [p["id"] for p in draft.STYLE_PACKS if p.get("accent")]
    n_designs = len(variants) - len(pack_ids)
    assert n_designs == len(draft.template_files("cafe"))
    assert [v["id"] for v in variants[n_designs:]] == pack_ids
    # every design variant is pack-free; every pack variant is styled
    assert all("style-pack" not in v["html"] for v in variants[:n_designs])
    assert all("style-pack" in v["html"] for v in variants[n_designs:])
    draft.write_variants(str(tmp_path), variants)
    assert os.path.exists(os.path.join(str(tmp_path), "draft-3.html"))


def test_template_files_base_design_first():
    files = draft.template_files("cafe")
    assert files[0] == "cafe.html"
    assert all(f.startswith("cafe") and f.endswith(".html") for f in files)


class _FakeLLM:
    def __init__(self, out):
        self.out = out

    def generate(self, model, prompt, json_mode=False, num_ctx=16384, **kwargs):
        return self.out


class _CaptureLLM:
    def __init__(self, out):
        self.out = out
        self.last_prompt = None

    def generate(self, model, prompt, json_mode=False, num_ctx=16384, **kwargs):
        self.last_prompt = prompt
        return self.out


def test_customize_extracts_and_sanitizes_html():
    tpl = "<!DOCTYPE html><html><body><h1>Acme</h1></body></html>"
    out = (
        "Here you go:\n```html\n<!DOCTYPE html><html><body><h1>Delta"
        "</h1><script>alert(1)</script></body></html>\n```"
    )
    html = draft.customize(_FakeLLM(out), "m", tpl, "site for delta")
    assert "Delta" in html
    assert "<script>" not in html


def test_customize_rejects_non_html_output():
    assert (
        draft.customize(_FakeLLM('{"approach": "a plan"}'), "m", "<html></html>", "x")
        is None
    )
    assert draft.customize(_FakeLLM(None), "m", "<html></html>", "x") is None


def test_customize_never_touches_template_files():
    def snapshot():
        return {
            f: os.path.getmtime(os.path.join(draft.TEMPLATES_DIR, f))
            for f in os.listdir(draft.TEMPLATES_DIR)
        }

    before = snapshot()
    draft.customize(_FakeLLM("<html><body>ok</body></html>"), "m", "<html></html>", "x")
    assert snapshot() == before


def test_write_custom(tmp_path):
    path = draft.write_custom(str(tmp_path), "<html><body>hi</body></html>")
    assert os.path.exists(path)
    assert path.endswith("draft-custom.html")


def test_refine_locks_styles_when_prompt_is_content_only():
    original = """<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/base.css">
<style>body{font-family:Inter;color:#222}h1{color:#333}</style>
</head><body><h1>Coffee Shop</h1></body></html>"""
    model_out = """<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/hacked.css">
<style>body{font-family:Papyrus;color:#ff00aa}h1{color:#00ffaa}</style>
</head><body><h1>La Cafe</h1></body></html>"""
    refined = draft.refine(_FakeLLM(model_out), "m", original, "change name to la cafe")
    assert "La Cafe" in refined
    assert "/base.css" in refined
    assert "/hacked.css" not in refined
    assert "font-family:Inter" in refined
    assert "font-family:Papyrus" not in refined


def test_refine_allows_style_changes_when_requested_explicitly():
    original = """<!DOCTYPE html><html><head>
<style>body{font-family:Inter;color:#222}</style>
</head><body><h1>Coffee Shop</h1></body></html>"""
    model_out = """<!DOCTYPE html><html><head>
<style>body{font-family:'Playfair Display';color:#0f6f4f}</style>
</head><body><h1>Coffee Shop</h1></body></html>"""
    refined = draft.refine(
        _FakeLLM(model_out),
        "m",
        original,
        "change font to playfair and update color theme to green",
    )
    assert "Playfair Display" in refined
    assert "color:#0f6f4f" in refined


def test_refine_uses_strict_prompt_for_content_edits():
    provider = _CaptureLLM("<!DOCTYPE html><html><body><h1>La Cafe</h1></body></html>")
    draft.refine(
        provider,
        "m",
        "<!DOCTYPE html><html><head></head><body><h1>Coffee Shop</h1></body></html>",
        "change name to la cafe",
    )
    assert "Keep the existing visual style system exactly as-is" in provider.last_prompt


def test_refine_restores_reference_font_when_user_requests_original_font():
    original_style = """<!DOCTYPE html><html><head>
<style>body{font-family:'Merriweather';color:#1e1e1e}</style>
</head><body><h1>La Cafe</h1></body></html>"""
    drifted_current = """<!DOCTYPE html><html><head>
<style>body{font-family:'Inter';color:#151515}</style>
</head><body><h1>La Cafe</h1></body></html>"""
    model_out = """<!DOCTYPE html><html><head>
<style>body{font-family:'Poppins';color:#0f6f4f}</style>
</head><body><h1>La Cafe</h1></body></html>"""
    refined = draft.refine(
        _FakeLLM(model_out),
        "m",
        drifted_current,
        "use the original font and keep the name la cafe",
        style_reference_html=original_style,
    )
    assert "Merriweather" in refined
    assert "Poppins" not in refined


def test_prompt_html_is_escaped():
    _, html = draft.make_draft("coffee <script>alert(1)</script> shop")
    assert "<script>" not in html


def test_read_choice_roundtrip(tmp_path):
    assert draft.read_choice(str(tmp_path)) is None
    import json

    with open(
        os.path.join(str(tmp_path), "draft-choice.json"), "w", encoding="utf-8"
    ) as f:
        json.dump({"id": "bold-pop", "label": "Bold Pop", "variant": 3}, f)
    assert draft.read_choice(str(tmp_path))["id"] == "bold-pop"


def test_refine_section_returns_inner_fragment_only():
    class FakeProvider:
        def generate(self, model, prompt, **kwargs):
            assert kwargs.get("num_ctx") == 8192
            return "<h1>Grounded headline</h1><p class='tagline'>New tagline</p>"

    out = draft.refine_section(
        FakeProvider(),
        "fake",
        section_html="<h1>Old</h1>",
        section_type="hero",
        user_prompt="Rewrite hero copy for a neighborhood cafe.",
        style_reference_html="<!DOCTYPE html><html><body></body></html>",
    )
    assert out == "<h1>Grounded headline</h1><p class='tagline'>New tagline</p>"
    assert "<html" not in (out or "").lower()


def test_refine_section_rejects_full_document_response():
    class BadProvider:
        def generate(self, model, prompt, **kwargs):
            return "<!DOCTYPE html><html><body><h1>x</h1></body></html>"

    out = draft.refine_section(
        BadProvider(),
        "fake",
        section_html="<h1>Old</h1>",
        section_type="hero",
        user_prompt="Rewrite",
    )
    assert out is None
