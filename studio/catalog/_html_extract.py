"""Best-effort extraction of real content from a templates/<slug>.html into the
package content/theme overlay. stdlib only.

We only lift the fields that old HTML carries *reliably* across all 33 genre-varied
files: the hero headline (first <h1>), the hero subtext (<p> after it), the service
cards (<h3> + following <p>), and the real colour palette (:root CSS vars). Everything
else stays as the generator's boilerplate — mis-mapping a wandering <h2> to the wrong
section would be worse than a sane default. Callers merge the returned overlay onto
default_content()/default_theme().

# ponytail: extracts high-signal fields only; section_title/about/testimonials/faq stay
# boilerplate because their markup is inconsistent across the 33 files. Widen per-section
# extraction only if a specific template needs it.
"""
from html.parser import HTMLParser
from pathlib import Path
import re

TEMPLATES_HTML_DIR = Path(__file__).resolve().parent.parent / "templates"


class _Blocks(HTMLParser):
    """Collect (tag, text) for h1/h2/h3/p in document order; inline children fold in."""
    _WANT = {"h1", "h2", "h3", "p"}

    def __init__(self):
        super().__init__()
        self.blocks = []
        self._cur = None
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag in self._WANT:
            self._flush()
            self._cur = tag

    def handle_endtag(self, tag):
        if tag == self._cur:
            self._flush()

    def handle_data(self, data):
        if self._cur:
            self._buf.append(data)

    def _flush(self):
        if self._cur:
            txt = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if txt:
                self.blocks.append((self._cur, txt))
        self._cur, self._buf = None, []


def _clip(text, n):
    text = text.strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return (cut or text[:n]).rstrip(" ,.–—-")


def _luma(hexcol):
    h = hexcol.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.299 * r + 0.587 * g + 0.114 * b


def _palette(css):
    """Map :root CSS vars to brand colours. Returns {} unless ≥3 distinct hexes found."""
    varmap = {n.lower(): v for n, v in
              re.findall(r"--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})", css)}
    hexes = list(dict.fromkeys(varmap.values()))  # de-dup, keep order
    if len(hexes) < 3:
        return {}
    accent = next((varmap[k] for k in ("accent", "brand", "primary", "cta") if k in varmap), None)
    ordered = sorted(hexes, key=_luma)
    dark, light = ordered[0], ordered[-1]
    surface = ordered[-2] if len(ordered) >= 2 else light
    return {
        "primary": accent or dark,
        "accent": accent or ordered[len(ordered) // 2],
        "neutral": dark,
        "bg": light,
        "surface": surface,
    }


def extract(slug):
    """Return {'content': {...partial...}, 'brand': {...partial...}} for slug, or {}."""
    path = TEMPLATES_HTML_DIR / f"{slug}.html"
    if not path.exists():
        return {}
    html = path.read_text(encoding="utf-8", errors="ignore")

    p = _Blocks()
    p.feed(html)
    blocks = p.blocks

    content = {}
    # hero: first h1 → headline; first p after it → subtext
    h1_idx = next((i for i, (t, _) in enumerate(blocks) if t == "h1"), None)
    if h1_idx is not None:
        hero = {"headline": _clip(blocks[h1_idx][1], 60)}
        sub = next((tx for t, tx in blocks[h1_idx + 1:] if t == "p" and len(tx) > 15), None)
        if sub:
            hero["subtext"] = _clip(sub, 140)
        content["hero"] = hero

    # services: first cluster of h3+following-p pairs
    items = []
    for i, (t, tx) in enumerate(blocks):
        if t == "h3" and len(tx) <= 60:
            desc = next((d for tt, d in blocks[i + 1:i + 3] if tt == "p"), "")
            items.append({"title": _clip(tx, 40),
                          "desc": _clip(desc, 120) if desc else "Professional service, done right."})
        if len(items) >= 6:
            break
    if len(items) >= 2:
        content["services"] = {"items": items[:6]}

    brand = _palette(html)
    out = {}
    if content:
        out["content"] = content
    if brand:
        out["brand"] = brand
    return out


def _selfcheck():
    # agency.html: known real values — headline copy + wine accent + real service cards
    r = extract("agency")
    assert r, "agency.html produced no extraction"
    assert "Counsel" in r["content"]["hero"]["headline"], r["content"]["hero"]["headline"]
    assert r["brand"]["accent"].lower() == "#7c2d3e", r["brand"]
    assert len(r["content"]["services"]["items"]) >= 2, r["content"]["services"]
    # clip stays within schema bounds
    assert len(r["content"]["hero"]["headline"]) <= 60
    # a file with no :root palette still returns content, no brand override crash
    generic = extract("generic")
    assert isinstance(generic, dict)
    print("OK _html_extract:", r["content"]["hero"]["headline"], "|", r["brand"]["accent"],
          "|", len(r["content"]["services"]["items"]), "services")


if __name__ == "__main__":
    _selfcheck()
