"""Split whole-page templates into scoped, composable components.

Usage:
    python -m studio.componentizer          # (re)write studio/components/
    python -m studio.componentizer --check  # exit 1 if committed files drifted

Relies on the template authoring convention: top-level body blocks open and
close at column 0. The --check test in CI catches templates that break it.
"""

import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(_HERE, "templates")
COMPONENTS_DIR = os.path.join(_HERE, "components")

# Themable via STYLE_PACKS; live only in base.css :root, never inside components.
CORE_VARS = ("--accent", "--bg", "--ink", "--muted", "--line", "--soft")

BASE_CSS = (
    ":root{--accent:#0d6e60;--bg:#f7f8fa;--ink:#182433;"
    "--muted:#5b6675;--line:#d7dde5;--soft:#ecf0f4;}\n"
    "body{margin:0;background:var(--bg);color:var(--ink);"
    "font-family:'Inter',system-ui,sans-serif;line-height:1.6;}\n"
    "img{max-width:100%;}\n"
)

_BLOCK_OPEN_RE = re.compile(r"^<(nav|header|section|footer|div|main)\b")
_CLASS_ATTR_RE = re.compile(r'class="([^"]+)"')
_CLASS_TOKEN_RE = re.compile(r"\.(-?[A-Za-z_][A-Za-z0-9_-]*)")
_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
_FONT_LINK_RE = re.compile(r'<link[^>]+href="(https://fonts\.googleapis\.com/css2[^"]+)"')
_LABEL_RE = re.compile(r'name="design-label"\s+content="([^"]+)"')
_HEADING_RE = re.compile(r"<h[1-3][^>]*>(.*?)</h[1-3]>", re.S)
_TAG_STRIP_RE = re.compile(r"<[^>]+>")

_TYPE_KEYWORDS = (
    ("pricing", ("pricing", "plans", "editions", "price", "tier", "tiers")),
    ("testimonials", ("testimonial", "review", "press", "quote", "stories", "words")),
    ("faq", ("faq",)),
    ("contact", ("contact", "visit", "location", "directory")),
    ("cta", ("cta", "engage", "transform", "kick")),
    ("stats", ("stats", "numbers", "metrics", "proofline", "outcome", "results", "proof")),
    (
        "gallery",
        ("gallery", "work", "menu", "seq", "shows", "portfolio", "grid", "clients", "cases", "projects", "photo"),
    ),
    (
        "about",
        (
            "about",
            "story",
            "approach",
            "ritual",
            "how",
            "process",
            "team",
            "rules",
            "method",
            "practice",
            "philo",
            "why",
            "curriculum",
            "assure",
            "stage",
            "track",
            "school",
            "doctor",
            "coach",
            "faculty",
            "calendar",
            "life",
            "sched",
            "prog",
        ),
    ),
    ("features", ("feature", "services", "offer", "list", "band", "marquee")),
)


def split_blocks(html):
    """Yield (tag, block_html) for each top-level block between <body> and </body>."""
    lines = html.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.startswith("<body"))
        end = next(i for i, l in enumerate(lines) if l.startswith("</body"))
    except StopIteration as exc:
        raise ValueError("template missing <body> markers at column 0") from exc
    blocks = []
    i = start + 1
    while i < end:
        m = _BLOCK_OPEN_RE.match(lines[i])
        if not m:
            i += 1
            continue
        tag, close = m.group(1), f"</{m.group(1)}>"
        if close in lines[i]:  # single-line block
            blocks.append((tag, lines[i]))
            i += 1
            continue
        j = i + 1
        while j < end and not lines[j].startswith(close):
            j += 1
        blocks.append((tag, "\n".join(lines[i : j + 1])))
        i = j + 1
    return blocks


def parse_rules(css):
    """Split CSS into top-level rule strings (brace-depth scan handles @media)."""
    rules, depth, buf = [], 0, []
    for ch in css:
        buf.append(ch)
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                rule = "".join(buf).strip()
                if rule:
                    rules.append(rule)
                buf = []
    return rules


def _selector_of(rule):
    return rule.split("{", 1)[0].strip()


def _classes_of(html):
    out = set()
    for attr in _CLASS_ATTR_RE.findall(html):
        out.update(attr.split())
    return out


def _rule_applies(rule, classes, block_html):
    sel = _selector_of(rule)
    if sel.startswith("@"):
        if sel.startswith("@keyframes"):
            return False  # keyframes handled separately by animation reference
        inner = rule.split("{", 1)[1].rsplit("}", 1)[0]
        return any(_rule_applies(r, classes, block_html) for r in parse_rules(inner))
    tokens = set(_CLASS_TOKEN_RE.findall(sel))
    if tokens:
        return bool(tokens & classes)
    if "body" in sel or "html" in sel:
        return True
    # element-only selector: keep when the element appears in the block
    elems = set(re.findall(r"[a-zA-Z][a-zA-Z0-9]*", sel))
    return any(f"<{e}" in block_html for e in elems)


def _scope_rule(rule, scope):
    """Prefix every selector with .{scope}; body/html/:root become the scope root."""
    sel, body = rule.split("{", 1)
    sel = sel.strip()
    if sel.startswith("@keyframes"):
        return f"@keyframes {scope}-{sel.split()[1]}{{{body}"
    if sel.startswith("@"):
        inner = body.rsplit("}", 1)[0]
        scoped = "".join(_scope_rule(r, scope) for r in parse_rules(inner))
        return f"{sel}{{{scoped}}}"
    parts = []
    for part in sel.split(","):
        part = part.strip()
        if part in ("body", "html", ":root"):
            parts.append(f".{scope}")
        else:
            part = re.sub(r"^(?:body|html)\s+", "", part)
            parts.append(f".{scope} {part}")
    return f"{', '.join(parts)}{{{body}"


def _scoped_root_vars(root_rule, scope):
    """Template :root vars minus the core set, re-homed onto the component root."""
    body = root_rule.split("{", 1)[1].rsplit("}", 1)[0]
    decls = [d.strip() for d in body.split(";") if d.strip()]
    kept = [d for d in decls if d.split(":", 1)[0].strip() not in CORE_VARS]
    if not kept:
        return ""
    return f".{scope}{{{';'.join(kept)};}}"


def classify(tag, block):
    if tag in ("nav", "footer"):
        return tag
    if tag == "header":
        return "hero"
    probe = " ".join(
        v.lower() for v in re.findall(r'(?:id|class)="([^"]+)"', block[:400])
    )
    for type_, keys in _TYPE_KEYWORDS:
        if any(k in probe for k in keys):
            return type_
    return "features"


def describe(block, genre, type_):
    m = _HEADING_RE.search(block)
    heading = ""
    if m:
        heading = re.sub(r"\s+", " ", _TAG_STRIP_RE.sub("", m.group(1))).strip()[:80]
    return f"{genre} {type_}" + (f": {heading}" if heading else "")


def minify(css):
    css = _COMMENT_RE.sub("", css)
    return re.sub(r"\s+", " ", css).strip()


def _add_scope_class(block, scope, *, section_type):
    def repl(m):
        tag, attrs = m.group(1), m.group(2)
        section_attr = f' data-section="{section_type}"'
        if 'class="' in attrs:
            new_attrs = attrs.replace('class="', 'class="' + scope + " ", 1)
            return "<" + tag + section_attr + new_attrs + ">"
        return f'<{tag}{section_attr} class="{scope}"{attrs}>'

    return re.sub(r"^<(\w+)([^>]*)>", repl, block, count=1)


def _extract_template(fname, raw, outputs, manifest):
    stem = fname[: -len(".html")]
    genre = re.sub(r"-\d+$", "", stem)
    head = raw.split("<body", 1)[0]
    fonts = _FONT_LINK_RE.findall(head)
    label = _LABEL_RE.search(head)
    label_words = (
        set(re.findall(r"[a-z]+", label.group(1).lower())) if label else set()
    )
    style = raw.split("<style>", 1)[1].split("</style>", 1)[0]
    rules = parse_rules(_COMMENT_RE.sub("", style))
    root_rules = [r for r in rules if _selector_of(r) == ":root"]
    keyframes = [r for r in rules if _selector_of(r).startswith("@keyframes")]
    other = [
        r
        for r in rules
        if _selector_of(r) != ":root" and not _selector_of(r).startswith("@keyframes")
    ]
    for n, (tag, block) in enumerate(split_blocks(raw), 1):
        type_ = classify(tag, block)
        scope = f"c-{stem}-{n}"
        classes = _classes_of(block)
        kept = [r for r in other if _rule_applies(r, classes, block)]
        css = "\n".join(_scope_rule(r, scope) for r in kept)
        for kf in keyframes:
            name = _selector_of(kf).split()[1]
            if re.search(rf"animation[^;}}]*\b{re.escape(name)}\b", css):
                css += "\n" + _scope_rule(kf, scope)
                css = re.sub(
                    rf"(animation(?:-name)?\s*:[^;}}]*?)\b{re.escape(name)}\b",
                    rf"\g<1>{scope}-{name}",
                    css,
                )
        for rr in root_rules:
            prefix = _scoped_root_vars(rr, scope)
            if prefix:
                css = prefix + "\n" + css
        comp_id = f"{stem}-{n}-{type_}"
        outputs[f"{comp_id}.html"] = (
            f"<style>{minify(css)}</style>\n"
            f"{_add_scope_class(block, scope, section_type=type_)}\n"
        )
        manifest.append(
            {
                "id": comp_id,
                "type": type_,
                "genre": genre,
                "tags": sorted({genre, type_} | label_words),
                "description": describe(block, genre, type_),
                "path": f"{comp_id}.html",
                "fonts": fonts,
            }
        )


def _self_check(outputs, manifest):
    assert manifest, "no components extracted"
    by_stem = {}
    for entry in manifest:
        content = outputs[entry["path"]]
        scope = "c-" + entry["id"].rsplit("-", 1)[0]
        assert f".{scope}" in content, f"{entry['id']}: scope missing from css"
        assert scope in content.split("</style>", 1)[1], (
            f"{entry['id']}: scope class missing from markup"
        )
        stem = entry["id"].rsplit("-", 2)[0]
        by_stem.setdefault(stem, set()).add(entry["type"])
    for stem, types in sorted(by_stem.items()):
        missing = {"nav", "hero", "footer"} - types
        assert not missing, f"{stem}: missing required components {missing}"


def build_outputs():
    """Extract every template. Returns {filename: content}, self-checked."""
    outputs = {"base.css": BASE_CSS}
    manifest = []
    for fname in sorted(os.listdir(TEMPLATES_DIR)):
        if not fname.endswith(".html"):
            continue
        with open(os.path.join(TEMPLATES_DIR, fname), encoding="utf-8") as f:
            raw = f.read()
        _extract_template(fname, raw, outputs, manifest)
    _self_check(outputs, manifest)
    outputs["manifest.json"] = json.dumps(manifest, indent=1) + "\n"
    return outputs


def write_outputs(outputs):
    os.makedirs(COMPONENTS_DIR, exist_ok=True)
    for name, content in sorted(outputs.items()):
        path = os.path.join(COMPONENTS_DIR, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
    if os.path.isdir(COMPONENTS_DIR):
        for name in os.listdir(COMPONENTS_DIR):
            if name.startswith("__"):
                continue
            if name not in outputs:
                os.remove(os.path.join(COMPONENTS_DIR, name))


def check_outputs(outputs):
    """Drift report vs committed files. Empty list = in sync."""
    problems = []
    for name, content in sorted(outputs.items()):
        path = os.path.join(COMPONENTS_DIR, name)
        if not os.path.exists(path):
            problems.append(f"missing: {name}")
            continue
        with open(path, encoding="utf-8") as f:
            if f.read() != content:
                problems.append(f"stale: {name}")
    if os.path.isdir(COMPONENTS_DIR):
        on_disk = {f for f in os.listdir(COMPONENTS_DIR) if not f.startswith("__")}
        problems.extend(f"orphan: {f}" for f in sorted(on_disk - set(outputs)))
    return problems


if __name__ == "__main__":
    outs = build_outputs()
    if "--check" in sys.argv:
        drift = check_outputs(outs)
        for line in drift:
            print(line)
        sys.exit(1 if drift else 0)
    write_outputs(outs)
    print(f"wrote {len(outs)} files to {COMPONENTS_DIR}")
