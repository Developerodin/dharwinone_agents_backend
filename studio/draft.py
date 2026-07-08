"""Instant one-page draft from genre templates — shown while the planner runs."""

import html as html_lib
import os
import re

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

TEMPLATE_TAGS = {
    "cafe": [
        "coffee",
        "cafe",
        "restaurant",
        "bakery",
        "bar",
        "food",
        "pizza",
        "tea",
        "diner",
        "bistro",
        "kitchen",
    ],
    "shop": [
        "shop",
        "store",
        "shoes",
        "shoe",
        "ecommerce",
        "e-commerce",
        "product",
        "fashion",
        "clothing",
        "sneaker",
        "sell",
        "boutique",
        "jewelry",
        "watch",
    ],
    "portfolio": [
        "portfolio",
        "photographer",
        "photography",
        "designer",
        "artist",
        "personal",
        "resume",
        "cv",
        "freelance",
    ],
    "saas": [
        "saas",
        "app",
        "software",
        "startup",
        "tech",
        "ai",
        "platform",
        "tool",
        "api",
        "dashboard",
        "cloud",
    ],
    "fitness": [
        "gym",
        "fitness",
        "yoga",
        "sport",
        "sports",
        "workout",
        "training",
        "crossfit",
        "athletic",
        "run",
        "club",
    ],
    "agency": [
        "agency",
        "consulting",
        "consultancy",
        "marketing",
        "law",
        "legal",
        "finance",
        "studio",
        "services",
        "firm",
    ],
    "construction": [
        "construction",
        "builder",
        "builders",
        "building",
        "contractor",
        "renovation",
        "interior",
        "interiors",
        "architecture",
        "architect",
        "civil",
        "infrastructure",
        "real estate",
        "property",
        "developer",
    ],
    "medical": [
        "clinic",
        "doctor",
        "dental",
        "dentist",
        "hospital",
        "health",
        "healthcare",
        "medical",
        "pharmacy",
        "physio",
        "therapy",
        "diagnostic",
    ],
    "education": [
        "school",
        "college",
        "academy",
        "course",
        "courses",
        "coaching",
        "tuition",
        "education",
        "learning",
        "institute",
        "university",
        "tutoring",
    ],
    "travel": [
        "travel",
        "tour",
        "tours",
        "tourism",
        "hotel",
        "resort",
        "trip",
        "vacation",
        "holiday",
        "adventure",
        "safari",
    ],
}

DEFAULT_TAGLINES = {
    "cafe": "Small-batch roasts, fresh mornings, and a room worth staying in.",
    "shop": "New drops, fair prices, free returns.",
    "portfolio": "Selected work and commissions.",
    "saas": "Less busywork. More momentum.",
    "fitness": "Programs that meet you where you are.",
    "agency": "Senior work, measured outcomes.",
    "construction": "On time, on spec, on budget.",
    "medical": "Care that starts with listening.",
    "education": "Learn from people who teach for a living.",
    "travel": "Trips planned by people who have been there.",
    "generic": "What we do, and why it works.",
}

_STOPWORDS = frozenset(
    "build create make design want need a an the for me my our new simple "
    "one page single website site web landing homepage home online modern "
    "beautiful nice cool please and with of to that can you company business "
    "called named which who operates operating based located in at".split()
)


def pick_template(prompt):
    words = re.findall(r"[a-z]+", prompt.lower())
    text = " ".join(words)
    best, best_score = "generic", 0
    for name, tags in TEMPLATE_TAGS.items():
        score = sum(1 for t in tags if t in text)
        if score > best_score:
            best, best_score = name, score
    return best


_CLAUSE_BREAK = frozenset(
    "which that who in for and with operates operating based located".split()
)


def brand_from_prompt(prompt):
    # "called Delta" / "named Delta Corp" names the brand explicitly
    m = re.search(r"\b(?:called|named)\s+(.{1,40})", prompt, re.IGNORECASE)
    if m:
        words = []
        for w in re.findall(r"[A-Za-z0-9&]+", m.group(1)):
            if w.lower() in _CLAUSE_BREAK or len(words) == 2:
                break
            words.append(w)
        if words:
            return " ".join(w.capitalize() for w in words)
    words = [w for w in re.findall(r"[A-Za-z]+", prompt) if w.lower() not in _STOPWORDS]
    if not words:
        return "Your Brand"
    return " ".join(w.capitalize() for w in words[:3])


def tagline_from_prompt(prompt, template):
    """Subject-grounded tagline; never echo the raw command prompt."""
    text = re.sub(
        r"\b(?:called|named)\s+[A-Za-z0-9&]+\s*", "", prompt, flags=re.IGNORECASE
    )
    text = re.sub(
        r"\b(?:which|that)\s+operates\b", "operating", text, flags=re.IGNORECASE
    )
    words = text.split()
    lead = (
        "build",
        "create",
        "make",
        "design",
        "i",
        "want",
        "need",
        "a",
        "an",
        "the",
        "me",
        "my",
        "please",
        "website",
        "site",
        "web",
        "page",
        "landing",
        "homepage",
        "for",
        "one",
        "new",
        "simple",
        "modern",
    )
    while words and words[0].lower().strip(",.") in lead:
        words.pop(0)
    rest = " ".join(words).strip(" .,")
    if len(rest.split()) < 3:
        return DEFAULT_TAGLINES.get(template, DEFAULT_TAGLINES["generic"])
    # place names read wrong lowercased: "in delhi and noida" -> title-case tail
    rest = re.sub(
        r"(?<=\bin )([a-z].*)$",
        lambda m: m.group(1).title().replace(" And ", " and "),
        rest,
    )
    return rest[0].upper() + rest[1:]


# Style packs restyle any template by overriding every known theme
# variable at once. ponytail: superset of var names beats per-template
# theming contracts; imperfect corners are fine for a draft.
STYLE_PACKS = [
    {"id": "original", "label": "Original", "css": ""},
    {
        "id": "sleek-dark",
        "label": "Sleek Dark",
        "accent": "#4f7cff",
        "ink": "#e8eaf2",
        "muted": "#9aa1b5",
        "bg": "#0e1016",
        "surface": "#161a24",
        "font": "'Inter',sans-serif",
    },
    {
        "id": "minimal-light",
        "label": "Minimal Light",
        "accent": "#111111",
        "ink": "#1a1a1a",
        "muted": "#6f6f6f",
        "bg": "#ffffff",
        "surface": "#f5f4f1",
        "font": "'Inter',sans-serif",
    },
    {
        "id": "bold-pop",
        "label": "Bold Pop",
        "accent": "#ff3d67",
        "ink": "#14121f",
        "muted": "#5c5872",
        "bg": "#fff7e8",
        "surface": "#ffffff",
        "font": "'Space Grotesk',sans-serif",
    },
    {
        "id": "frosted",
        "label": "Frosted Glass",
        "accent": "#5a8fe6",
        "ink": "#1c2434",
        "muted": "#68738a",
        "bg": "#eef2f8",
        "surface": "#ffffff",
        "font": "'Inter',sans-serif",
    },
    {
        "id": "luxe-serif",
        "label": "Luxe Serif",
        "accent": "#1f3d2b",
        "ink": "#20241f",
        "muted": "#6b7265",
        "bg": "#f7f4ec",
        "surface": "#ffffff",
        "font": "'Playfair Display',Georgia,serif",
    },
    {
        "id": "high-contrast",
        "label": "High Contrast",
        "accent": "#ffd400",
        "ink": "#000000",
        "muted": "#444444",
        "bg": "#ffffff",
        "surface": "#f2f2f2",
        "font": "'Archivo',sans-serif",
    },
    {
        "id": "ocean-calm",
        "label": "Ocean Calm",
        "accent": "#0e7c86",
        "ink": "#12303a",
        "muted": "#5e7c85",
        "bg": "#f2fbfa",
        "surface": "#ffffff",
        "font": "'Sora',sans-serif",
    },
]

_PACK_CSS = """
<style id="style-pack">
:root {{
  --accent:{accent}; --pop:{accent}; --volt:{accent}; --gold:{accent};
  --brand:{accent};
  --ink:{ink}; --dim:{muted};
  --bg:{bg}; --cream:{bg}; --paper:{bg}; --soft:{surface}; --line:{surface};
}}
body {{ background:{bg} !important; color:{ink} !important; }}
h1,h2,h3 {{ font-family:{font} !important; }}
.bg-white,.card-soft,.menu-card,.product,.feature,.service,.plan {{
  background:{surface} !important; color:{ink} !important;
}}
.text-muted,.text-secondary,.text-white-50 {{ color:{muted} !important; }}
.btn-primary,.btn-accent,.btn-pop,.btn-volt,.btn-brand,.btn-ink {{
  background:{accent} !important; border-color:{accent} !important;
  color:{bg} !important;
}}
footer {{ background:{surface} !important; color:{muted} !important; }}
</style>
"""


_LABEL_RE = re.compile(r'name="design-label"\s+content="([^"]+)"')


def template_files(name):
    """Every template file for a genre: base design first, then numbered."""
    rx = re.compile(rf"^{re.escape(name)}(-\d+)?\.html$")
    files = [f for f in os.listdir(TEMPLATES_DIR) if rx.match(f)]
    return sorted(files, key=lambda f: (f != f"{name}.html", f))


def _design_label(raw, stem, base):
    m = _LABEL_RE.search(raw)
    if m:
        return m.group(1)
    return "Classic" if stem == base else stem.replace("-", " ").title()


def _fill(html, prompt, template):
    # prompt is user input headed into served HTML — escape it (XSS)
    brand = html_lib.escape(brand_from_prompt(prompt), quote=True)
    tagline = html_lib.escape(tagline_from_prompt(prompt, template), quote=True)
    html = html.replace("{{BRAND}}", brand)
    return html.replace("{{TAGLINE}}", tagline)


def _apply_pack(html, pack):
    if not pack.get("accent"):
        return html
    block = _PACK_CSS.format(**pack)
    return html.replace("</head>", block + "</head>")


def make_variants(prompt):
    """Return (template_name, [{id, label, html}, ...]).

    Variants are every distinct design for the genre (read-only copies of
    the template files), followed by the style packs applied to the first
    design. Template files themselves are never modified.
    """
    name = pick_template(prompt)
    designs = []
    for fname in template_files(name):
        stem = fname[: -len(".html")]
        with open(os.path.join(TEMPLATES_DIR, fname), encoding="utf-8") as f:
            raw = f.read()
        designs.append(
            {
                "id": stem,
                "label": _design_label(raw, stem, name),
                "html": _fill(raw, prompt, name),
            }
        )
    packs = [
        {"id": p["id"], "label": p["label"], "html": _apply_pack(designs[0]["html"], p)}
        for p in STYLE_PACKS
        if p.get("accent")
    ]
    return name, designs + packs


def make_draft(prompt):
    """Return (template_name, filled_html) — the unstyled first variant."""
    name, variants = make_variants(prompt)
    return name, variants[0]["html"]


def write_variants(run_dir, variants):
    for i, v in enumerate(variants):
        with open(os.path.join(run_dir, f"draft-{i}.html"), "w", encoding="utf-8") as f:
            f.write(v["html"])


def write_draft(run_dir, html):
    path = os.path.join(run_dir, "draft.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path


_CUSTOMIZE_PROMPT = """You are customizing a copy of a website HTML template for a client.

Client request:
{prompt}

Rules:
- Change only text content, business details, menu/service/product items,
  and image alt text so the page fits the client request.
- Keep the HTML structure, CSS, class names, and overall design exactly
  as they are.
- Never add <script> tags.
- Output the complete customized HTML document and nothing else.

Template:
{html}"""


def customize(provider, model, template_html, user_prompt):
    """LLM-personalized copy of a chosen template.

    Operates on the in-memory copy only; template files are never written.
    Returns customized HTML, or None if the model output is unusable.
    """
    out = provider.generate(
        model,
        _CUSTOMIZE_PROMPT.format(prompt=user_prompt, html=template_html),
        num_ctx=32768,
    )
    if not isinstance(out, str):
        return None
    html = _extract_html_document(out)
    if html is None:
        return None
    return sanitize_html(html)


_REFINE_PROMPT_LOCKED = """You are editing a static website HTML document.

User request:
{prompt}

Rules:
- You MAY add, remove, reorder, and rewrite sections to satisfy the request.
- Keep this a static site (HTML + CSS only). Never add JavaScript behavior.
- Never add <script> tags, inline event handlers, or javascript: URLs.
- Preserve valid HTML structure.
- Keep the existing visual style system exactly as-is:
  - Do NOT change fonts, typography scale, color palette, spacing scale,
    borders, shadows, or radius tokens.
  - Do NOT edit existing <style> blocks or stylesheet/font link tags.
  - Do NOT rename or remove existing CSS class names.
- If the request is content-only (name, copy, services, prices, contact info),
  only update content and leave design untouched.
- Output the complete HTML document and nothing else.

Current document:
{html}"""


_REFINE_PROMPT_STYLE = """You are editing a static website HTML document.

User request:
{prompt}

Rules:
- You MAY add, remove, reorder, and rewrite sections to satisfy the request.
- You MAY adjust visual styling (fonts, palette, spacing, component styles)
  because the user explicitly asked for style/theme/design changes.
- Keep this a static site (HTML + CSS only). Never add JavaScript behavior.
- Never add <script> tags, inline event handlers, or javascript: URLs.
- Preserve valid HTML structure and keep styling cohesive.
- Output the complete HTML document and nothing else.

Current document:
{html}"""


_VISUAL_STYLE_HINT_RE = re.compile(
    r"\b("
    r"font|typography|style|styling|theme|palette|color|colour|"
    r"redesign|restyle|look and feel|visual|appearance|"
    r"dark mode|light mode|modern|minimal|brutalist|"
    r"spacing|layout|layout style|button style|hero style|"
    r"make it look|change the design"
    r")\b",
    re.I,
)
_STYLE_RESET_HINT_RE = re.compile(
    r"\b("
    r"original font|old font|keep original font|use original font|"
    r"revert font|restore font|restore original style|reset style|"
    r"same style|as before|undo style|revert style"
    r")\b",
    re.I,
)

_HEAD_RE = re.compile(r"(?is)(<head\b[^>]*>)(.*?)(</head>)")
_STYLE_TAG_RE = re.compile(r"(?is)<style\b[^>]*>.*?</style>")
_STYLESHEET_LINK_RE = re.compile(
    r'(?is)<link\b(?=[^>]*\brel\s*=\s*["\']stylesheet["\'])[^>]*>'
)
_FONT_LINK_RE = re.compile(
    r'(?is)<link\b(?=[^>]*(?:fonts\.googleapis|fonts\.gstatic|preconnect))[^>]*>'
)


def _wants_visual_restyle(user_prompt):
    return bool(_VISUAL_STYLE_HINT_RE.search(user_prompt or ""))


def _wants_style_reset(user_prompt):
    return bool(_STYLE_RESET_HINT_RE.search(user_prompt or ""))


def _extract_style_assets(head_inner):
    parts = []
    for pattern in (_FONT_LINK_RE, _STYLESHEET_LINK_RE, _STYLE_TAG_RE):
        parts.extend(m.group(0) for m in pattern.finditer(head_inner))
    deduped = []
    seen = set()
    for item in parts:
        if item in seen:
            continue
        deduped.append(item)
        seen.add(item)
    return deduped


def _preserve_style_system(original_html, edited_html):
    original_head = _HEAD_RE.search(original_html)
    edited_head = _HEAD_RE.search(edited_html)
    if not original_head or not edited_head:
        return edited_html
    style_assets = _extract_style_assets(original_head.group(2))
    if not style_assets:
        return edited_html

    edited_inner = edited_head.group(2)
    edited_inner = _STYLE_TAG_RE.sub("", edited_inner)
    edited_inner = _STYLESHEET_LINK_RE.sub("", edited_inner)
    edited_inner = _FONT_LINK_RE.sub("", edited_inner)
    style_block = "\n".join(style_assets)
    merged_inner = f"{edited_inner.rstrip()}\n{style_block}\n"
    return (
        edited_html[: edited_head.start(2)]
        + merged_inner
        + edited_html[edited_head.end(2) :]
    )


def _extract_html_document(out):
    if not isinstance(out, str):
        return None
    low = out.lower()
    start = low.find("<!doctype")
    if start == -1:
        start = low.find("<html")
    end = low.rfind("</html>")
    if start == -1 or end == -1 or end < start:
        return None
    return out[start : end + len("</html>")]


def sanitize_html(html):
    """Remove executable payloads from model/user supplied HTML."""
    html = re.sub(r"(?is)<script\b[^>]*>.*?(</script\s*>|$)", "", html)
    html = re.sub(r"(?i)\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", html)
    return re.sub(r"(?i)javascript\s*:", "", html)


def refine(provider, model, working_html, user_prompt, *, style_reference_html=None):
    """Iteratively edit the live working copy for the builder session."""
    reset_requested = _wants_style_reset(user_prompt)
    style_requested = _wants_visual_restyle(user_prompt)
    if reset_requested:
        prompt_template = _REFINE_PROMPT_LOCKED
    else:
        prompt_template = _REFINE_PROMPT_STYLE if style_requested else _REFINE_PROMPT_LOCKED
    out = provider.generate(
        model,
        prompt_template.format(prompt=user_prompt, html=working_html),
        num_ctx=32768,
    )
    html = _extract_html_document(out)
    if html is None:
        return None
    sanitized = sanitize_html(html)
    if reset_requested:
        source = style_reference_html or working_html
        sanitized = _preserve_style_system(source, sanitized)
    elif not style_requested:
        sanitized = _preserve_style_system(working_html, sanitized)
    return sanitized


def write_custom(run_dir, html):
    path = os.path.join(run_dir, "draft-custom.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path


def read_choice(run_dir):
    import json

    path = os.path.join(run_dir, "draft-choice.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)
