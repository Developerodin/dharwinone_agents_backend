"""Componentizer extraction tests."""

import json
import os

from studio import componentizer


def _saas():
    path = os.path.join(componentizer.TEMPLATES_DIR, "saas.html")
    with open(path, encoding="utf-8") as f:
        return f.read()


def test_split_blocks_finds_page_sections():
    blocks = componentizer.split_blocks(_saas())
    tags = [tag for tag, _ in blocks]
    assert tags[0] == "nav"
    assert "header" in tags
    assert tags[-1] == "footer"
    assert len(blocks) >= 6


def test_scope_rule_prefixes_class_selectors():
    scoped = componentizer._scope_rule(".hero h1{color:red;}", "c-x-1")
    assert scoped.startswith(".c-x-1 .hero h1{")


def test_scope_rule_maps_body_to_scope_root():
    scoped = componentizer._scope_rule("body{margin:0;}", "c-x-1")
    assert scoped.startswith(".c-x-1{")


def test_scope_rule_handles_media_queries():
    scoped = componentizer._scope_rule(
        "@media (max-width: 991px){.hero{padding:1rem;}}", "c-x-1"
    )
    assert "@media (max-width: 991px){" in scoped
    assert ".c-x-1 .hero{" in scoped


def test_classify_by_tag_and_keywords():
    assert componentizer.classify("nav", "<nav>") == "nav"
    assert componentizer.classify("header", "<header>") == "hero"
    assert componentizer.classify("footer", "<footer>") == "footer"
    assert (
        componentizer.classify("section", '<section id="pricing" class="x">')
        == "pricing"
    )
    assert componentizer.classify("section", '<section class="mystery-band">') in (
        "features",
        "about",
    )


def test_build_outputs_manifest_complete():
    outputs = componentizer.build_outputs()
    manifest = json.loads(outputs["manifest.json"])
    assert len(manifest) >= 150  # 33 templates x ~6+ blocks
    assert "base.css" in outputs
    types = {entry["type"] for entry in manifest}
    assert {"nav", "hero", "footer", "features"} <= types
    for entry in manifest:
        content = outputs[entry["path"]]
        scope = "c-" + entry["id"].rsplit("-", 1)[0]
        # scope class present in both the markup and the scoped CSS
        assert f'class="{scope}' in content or f"{scope} " in content
        assert f".{scope}" in content
        assert content.startswith("<style>")
        assert "/*" not in content  # comments stripped


def test_core_vars_never_scoped_into_components():
    outputs = componentizer.build_outputs()
    manifest = json.loads(outputs["manifest.json"])
    for entry in manifest:
        css = outputs[entry["path"]].split("</style>", 1)[0]
        for var in componentizer.CORE_VARS:
            assert f"{var}:" not in css, (entry["id"], var)


def test_tags_include_design_label_words():
    outputs = componentizer.build_outputs()
    manifest = json.loads(outputs["manifest.json"])
    # saas-2.html carries <meta name="design-label" content="Terminal Docs">
    saas2 = [e for e in manifest if e["id"].rsplit("-", 2)[0] == "saas-2"]
    assert saas2
    for entry in saas2:
        assert {"terminal", "docs"} <= set(entry["tags"])


def test_placeholders_survive_extraction():
    outputs = componentizer.build_outputs()
    joined = "".join(v for k, v in outputs.items() if k.endswith(".html"))
    assert "{{BRAND}}" in joined
    assert "{{TAGLINE}}" in joined


def test_committed_components_in_sync():
    """Editing a template requires re-running: python -m studio.componentizer"""
    assert componentizer.check_outputs(componentizer.build_outputs()) == []
