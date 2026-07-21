"""Idempotent enricher for backend/studio/templates/*.html — adds pricing, FAQ, contact info."""
import argparse
import json
import re
from pathlib import Path

from studio.catalog._generate import (
    OUT,
    BRAND_NAMES,
    COPY,
    TEMPLATES_HTML_DIR,
    _auto_contact_overrides,
    _auto_faq_items,
    _pricing_title,
)

MARKER = "<!-- dharwin-enrich"
CATALOG_PATH = OUT / "html_templates.json"


def _load_catalog():
    if CATALOG_PATH.is_file():
        return {e["slug"]: e for e in json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["templates"]}
    from studio.catalog._generate import build_html_templates, SUBCATS

    subcat_names = {(s, sc): n for s, sc, n, *_ in SUBCATS}
    return {e["slug"]: e for e in build_html_templates(subcat_names)["templates"]}


def _has_id(html: str, section_id: str) -> bool:
    return bool(re.search(rf'\bid=["\']{re.escape(section_id)}["\']', html))


def _has_contact_info(html: str) -> bool:
    return bool(re.search(r"\+91[\d\s]{5,}", html)) and bool(re.search(r"[\w.-]+@[\w.-]+\.\w+", html))


def _section_body(html: str, section_id: str) -> str | None:
    m = re.search(
        rf'<section[^>]*\bid=["\']{re.escape(section_id)}["\'][^>]*>(.*?)</section>',
        html,
        re.S | re.I,
    )
    return m.group(1) if m else None


def _section_has_contact_signals(body: str) -> bool:
    return bool(
        re.search(r">\s*(Phone|Email|Hours|Address|Visit|Find us)\s*<", body)
        or "contact-slab" in body
        or 'class="lines"' in body
        or "hours-card" in body
        or "mailto:" in body
        or "tel:" in body
        or "hello@yourdomain.com" in body
        or "Add your number here" in body
        or "Add your phone" in body
    )


def _has_native_contact_area(html: str) -> bool:
    """Designed contact/visit/CTA block — do not inject a separate contact-info section."""
    contact_body = _section_body(html, "contact")
    if contact_body and len(contact_body.strip()) > 60:
        return True
    start_body = _section_body(html, "start")
    if start_body and (
        "contact-slab" in start_body
        or 'class="lines"' in start_body
        or _section_has_contact_signals(start_body)
    ):
        return True
    visit_body = _section_body(html, "visit")
    if visit_body and len(visit_body.strip()) > 60:
        return True
    plan_body = _section_body(html, "plan")
    if plan_body and "Plan my trip" in plan_body:
        return True
    contact_body = _section_body(html, "contact")
    if contact_body and len(contact_body.strip()) > 60 and _section_has_contact_signals(contact_body):
        return True
    if re.search(r"Talk to a human", html, re.I) and re.search(r"mailto:|tel:", html, re.I):
        return True
    for pattern in (
        r'<section[^>]*\bclass=["\'][^"\']*\bcontact(?:-band)?\b[^"\']*["\'][^>]*>(.*?)</section>',
        r'<section[^>]*\bclass=["\'][^"\']*\bcta-band\b[^"\']*["\'][^>]*>(.*?)</section>',
    ):
        m = re.search(pattern, html, re.S | re.I)
        if m and len(m.group(1).strip()) > 60 and _section_has_contact_signals(m.group(1)):
            return True
    return False


PHONE_PLACEHOLDERS = (
    "Add your number here",
    "Add your phone",
    "Your phone here",
)
EMAIL_PLACEHOLDERS = (
    "hello@yourdomain.com",
    "hello@example.com",
)


def _safe_slug(slug: str, brand: str) -> str:
    base = re.sub(r"[^a-z0-9]", "", (slug or brand).lower())[:24]
    return base or "hello"


def _contact_values(seg, sub, slug: str, brand: str) -> dict[str, str]:
    contact = _auto_contact_overrides(seg, sub)
    email_slug = _safe_slug(slug, brand)
    return {
        "phone": "+91 00000 00000",
        "email": f"hello@{email_slug}.example",
        "address": contact.get("address", "Your address here"),
        "hours": contact.get("hours", "Mon–Sat, 9:00–19:00"),
    }


def _patch_contact_placeholders(html: str, phone: str, email: str) -> str:
    for placeholder in PHONE_PLACEHOLDERS:
        html = html.replace(placeholder, phone)
    for placeholder in EMAIL_PLACEHOLDERS:
        html = html.replace(placeholder, email)
    return html


def _html_base(html: str) -> str:
    return _strip_enrich(html) if MARKER in html else html


def _has_css(html: str, rule: str) -> bool:
    return rule in html


_SECTION_CSS: dict[str, str] = {
    "case_ledger": """
  .pricing-band{padding:6rem 0;background:var(--soft);border-block:1px solid var(--line);}
  .plan-card{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1.8rem 1.7rem;height:100%;}
  .plan-card h3{font-family:'Newsreader',serif;font-weight:600;font-size:1.35rem;}
  .plan-card .price{font-weight:700;color:var(--accent-deep);margin-bottom:.75rem;}
  .plan-card p{color:var(--muted);font-size:.95rem;margin:0;}
  .faq{padding:6rem 0;border-top:1px solid var(--line);}
  .faq details{border-top:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1.1rem 0;font-family:'Newsreader',serif;font-weight:600;font-size:1.15rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{color:var(--muted);font-size:.95rem;padding-bottom:1rem;margin:0;}""",
    "blueprint": """
  .faq{padding:4.5rem 0;background:var(--soft);border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);}
  .faq details{border-bottom:1px dashed var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:800;font-size:1.15rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.96rem;margin:0;padding-bottom:1rem;color:color-mix(in srgb, var(--ink) 82%, var(--bg));}""",
    "prospectus": """
  .faq{padding:4.5rem 0;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:600;font-size:1.2rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.97rem;padding-bottom:1rem;margin:0;color:color-mix(in srgb, var(--ink) 80%, var(--bg));}""",
    "vivid_block": """
  .faq{background:var(--soft);padding:5.5rem 0;border-top:2px solid var(--ink);}
  .faq details{border-bottom:2px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:800;font-size:1.1rem;text-transform:uppercase;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.96rem;padding-bottom:1rem;margin:0;color:var(--ink-70);}""",
    "lookbook": """
  .faq{padding:5.5rem 0;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1.1rem 0;font-family:"Libre Caslon Display",serif;font-size:1.2rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{color:var(--ink-65);font-size:.95rem;padding-bottom:1rem;margin:0;}""",
    "mono_sheet": """
  .faq{padding:5.5rem 0;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq details{border-top:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:700;font-size:1.05rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.93rem;color:var(--ink-70);padding-bottom:1rem;margin:0;}""",
    "fitness_plan": """
  .faq{padding:5rem 0;border-top:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-size:1.2rem;font-weight:700;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{color:var(--muted);font-size:.95rem;padding-bottom:1rem;margin:0;}""",
    "fitness": """
  .faq{padding:6rem 0;background:var(--soft);border-block:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.05em;font-weight:600;font-size:1.02rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;color:var(--ink);}
  .faq summary::after{content:"+";color:var(--accent);font-size:1.4rem;font-family:'Inter',sans-serif;}
  .faq details[open] summary::after{content:"–";}
  .faq details p{color:var(--dim);margin:.65rem 0 0;font-size:.95rem;padding-bottom:1rem;}""",
    "agency_alt": """
  .faq{padding:5.5rem 0;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:600;font-size:1.1rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.95rem;padding-bottom:1rem;margin:0;color:var(--muted,var(--dim,var(--ink-65)));}""",
    "default": """
  .faq{padding:5rem 0;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq details{border-bottom:1px solid var(--line);}
  .faq summary{cursor:pointer;padding:1rem 0;font-weight:600;font-size:1.05rem;list-style:none;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq details p{font-size:.95rem;padding-bottom:1rem;margin:0;}""",
}


def _ensure_section_css(html: str, profile: str) -> str:
    block = _SECTION_CSS.get(profile) or _SECTION_CSS["default"]
    if profile == "case_ledger":
        if _has_css(html, ".pricing-band{") and _has_css(html, ".faq{"):
            return html
    elif _has_css(html, ".faq{"):
        return html
    return html.replace("</style>", block + "\n</style>", 1)


def _label_class(html: str, profile: str) -> str:
    if profile == "blueprint":
        return "tag-label mb-2"
    if profile == "prospectus":
        return "sc mb-2"
    if profile == "vivid_block":
        return "tab mb-2"
    if profile == "lookbook":
        return "folio mb-2"
    if profile == "mono_sheet":
        return "spec mb-2"
    if _has_css(html, ".eyebrow"):
        return "eyebrow mb-2"
    if _has_css(html, ".kicker"):
        return "kicker mb-2"
    return "mb-2"


def _bordered_card(name: str, desc: str, *, serif: bool = False) -> str:
    h3 = f'<h3 class="serif" style="font-size:1.35rem;">{name}</h3>' if serif else f'<h3 style="font-size:1.35rem;">{name}</h3>'
    return (
        f'      <div class="col-md-4"><div style="border:1px solid var(--line);padding:1.4rem;height:100%;background:var(--soft);">\n'
        f"        {h3}<p class=\"mb-2\"><b>Quote on request</b></p>"
        f'<p class="mb-0" style="font-size:.95rem;">{desc}</p></div></div>'
    )


def _has_native_faq(html: str) -> bool:
    """Designed FAQ / Q&A block — do not inject a separate FAQ section."""
    base = _html_base(html)
    if _has_id(base, "faq"):
        return True
    if re.search(r'<section[^>]*\bclass=["\'][^"\']*\bfaq\b[^"\']*["\'][^>]*>', base, re.I):
        return True
    safety_body = _section_body(base, "safety")
    if safety_body and "<details" in safety_body:
        return True
    visit_body = _section_body(base, "visit")
    if visit_body and re.search(r"<details\b", visit_body):
        return True
    syllabus = re.search(
        r'<section[^>]*\bclass=["\'][^"\']*\bsyllabus\b[^"\']*["\'][^>]*>(.*?)</section>',
        base,
        re.S | re.I,
    )
    if syllabus and re.search(r"<details\b", syllabus.group(1)):
        return True
    return False


def _has_native_pricing(html: str) -> bool:
    """Menu, fee list, or package grid — do not inject a generic pricing section."""
    base = _html_base(html)
    if _has_id(base, "pricing"):
        return True
    if "pricing-row" in base:
        return True
    if re.search(r'\bclass=["\'][^"\']*\bmodel\b', base):
        return True
    if re.search(r'\bclass=["\'][^"\']*price\b', base) and re.search(
        r'\bclass=["\'][^"\']*(?:pour|menu-item|bake-card)\b', base
    ):
        return True
    if re.search(r'\bclass=["\']fee["\']', base):
        return True
    if re.search(r'\bclass=["\'][^"\']*\bp-card\b', base):
        return True
    return False


def _skip_all(html: str) -> bool:
    contact_ok = _has_contact_info(html) or (
        _has_native_contact_area(html) and MARKER + ":contact-info" not in html
    )
    pricing_ok = _has_id(html, "pricing") or _has_native_pricing(html)
    faq_ok = _has_id(html, "faq") or _has_native_faq(html)
    return pricing_ok and faq_ok and contact_ok


def _detect_profile(html: str, slug: str) -> str:
    if "saas" in slug or "pricing-row" in html:
        return "saas"
    if "shop" in slug:
        if 'class="pill"' in html or "Space Grotesk" in html:
            return "shop"
        if _has_css(html, ".masthead") and _has_css(html, ".credit{"):
            return "lookbook"
        return "shop"
    if "agency" in slug and _has_css(html, ".contact-band{background:var(--ink)"):
        return "case_ledger"
    if "construction" in slug and _has_css(html, ".svc{background:var(--soft)"):
        return "warm_craft"
    if "construction" in slug and _has_css(html, ".tag-label") and _has_css(html, ".datum"):
        return "blueprint"
    if "travel" in slug:
        return "travel"
    if "fitness" in slug:
        if _has_css(html, ".visit-step"):
            return "fitness_plan"
        return "fitness"
    if _has_css(html, ".school{") and _has_css(html, ".schools{"):
        return "prospectus"
    if _has_css(html, ".block-nav") and _has_css(html, ".offer .cell"):
        return "vivid_block"
    if _has_css(html, ".masthead") and _has_css(html, ".credit{"):
        return "lookbook"
    if _has_css(html, ".sheet-nav") and _has_css(html, ".cap-table"):
        return "mono_sheet"
    if _has_css(html, ".engage{") and (_has_css(html, ".model") or 'class="model"' in html):
        return "agency_engage"
    if "education" in slug:
        return "prospectus" if _has_css(html, ".school{") else "education"
    if "medical" in slug or ("navbar-clinic" in html and ".faq details" in html):
        return "medical"
    if "portfolio" in slug or ('id="contact"' in html and 'class="contact"' in html):
        return "portfolio"
    if "cafe" in slug or "nav-noir" in html or "btn-honey" in html:
        return "cafe_warm"
    if "construction" in slug or (_has_css(html, ".safety details") and _has_css(html, ".safety summary")):
        return "construction"
    if "generic" in slug and _has_css(html, ".faq{"):
        return "generic_kicker"
    if "topnav" in html or "contact-band" in html:
        return "agency_alt"
    if 'class="kicker"' in html:
        return "bootstrap_kicker"
    if 'class="eyebrow"' in html:
        return "eyebrow"
    return "bootstrap_kicker"


def _services(seg, sub):
    return COPY.get((seg, sub), COPY[(None, None)])[2]


def _pricing_html(profile: str, seg, sub, services, html: str) -> str:
    title = _pricing_title(seg, sub)
    tiers = services[:3]
    if profile == "warm_craft":
        cards = []
        for name, desc in tiers:
            letter = (name[:1] or "?").upper()
            cards.append(
                f'      <div class="col-md-4">\n'
                f'        <div class="svc">\n'
                f'          <div class="ic">{letter}</div>\n'
                f"          <h3>{name}</h3>\n"
                f"          <p>{desc}</p>\n"
                f'          <span class="from">Quote on request</span>\n'
                f"        </div>\n"
                f"      </div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="services" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">Service packages</p>\n'
            f'    <h2 class="mb-4" style="font-size:clamp(1.9rem,4.2vw,2.8rem);">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "case_ledger":
        cards = []
        for name, desc in tiers:
            cards.append(
                f'      <div class="col-md-4"><div class="plan-card">\n'
                f'        <h3>{name}</h3>\n'
                f'        <p class="price num">Quote on request</p>\n'
                f'        <p>{desc}</p></div></div>'
            )
        return (
            f'{MARKER}:pricing -->\n'
            f'<section class="pricing-band" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">Pricing</p>\n'
            f'    <h2 class="sec-title mb-4">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "blueprint":
        cards = []
        for i, (name, desc) in enumerate(tiers, start=1):
            cards.append(
                f'      <div class="col-md-4"><div class="cap">\n'
                f'        <span class="code">PKG-{i:02d}</span>\n'
                f"        <h3>{name}</h3>\n"
                f"        <p>{desc}</p>\n"
                f"        <ul><li>Quote on request</li><li>Clear estimate before work starts</li></ul>\n"
                f"      </div></div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="caps" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <div class="caps-head">\n'
            f'      <div><p class="tag-label mb-2">Service packages</p><h2 class="mb-0">{title}</h2></div>\n'
            f'      <span class="mono" style="font-size:.8rem;letter-spacing:.12em;">SHEET 4 OF 6</span>\n'
            f"    </div>\n    <div class=\"row g-4\">\n"
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "fitness_plan":
        cards = []
        for i, (name, desc) in enumerate(tiers):
            hot = " hot" if i == 1 else ""
            cards.append(
                f'      <div class="col-md-4"><div class="plan{hot}">\n'
                f"        <h3>{name}</h3>\n"
                f'        <div class="rate">Quote <small>on request</small></div>\n'
                f"        <ul><li>{desc}</li><li>Clear estimate before work starts</li></ul>\n"
                f"      </div></div>"
            )
        label = _label_class(html, profile)
        return (
            f"{MARKER}:pricing -->\n"
            f'<section id="pricing" style="padding:5rem 0;">\n'
            f'  <div class="container">\n'
            f'    <p class="{label}">Pricing</p>\n'
            f'    <h2 style="font-size:clamp(2rem,4vw,2.8rem);margin-bottom:2rem;">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "prospectus":
        cards = []
        for name, desc in tiers:
            cards.append(
                f'      <div class="col-md-4"><div class="school">\n'
                f'        <p class="sc">Package</p>\n'
                f"        <h3>{name}</h3>\n"
                f"        <p>{desc}</p>\n"
                f'        <p style="font-weight:700;margin-top:1rem;margin-bottom:0;">Quote on request</p>\n'
                f"      </div></div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="schools" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="sc mb-2">Pricing</p>\n'
            f'    <h2 class="mb-4">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "vivid_block":
        cards = []
        for name, desc in tiers:
            cards.append(
                f'      <div class="col-md-4"><div class="cell">\n'
                f'        <p class="tab">Package</p>\n'
                f"        <h3>{name}</h3>\n"
                f"        <p>{desc}</p>\n"
                f'        <p class="foot">Quote on request</p>\n'
                f"      </div></div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="offer" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="tab mb-2">Pricing</p>\n'
            f'    <h2 class="mb-4">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "lookbook":
        cards = []
        for i, (name, desc) in enumerate(tiers, start=1):
            cards.append(
                f'      <div class="col-md-4"><div class="credit" style="flex-direction:column;align-items:flex-start;border:1px solid var(--line);padding:1.5rem;height:100%;">\n'
                f'        <span class="no">{i:02d}</span>\n'
                f'        <div class="what"><b>{name}</b><span>{desc}</span></div>\n'
                f'        <span class="price" style="margin-left:0;margin-top:1rem;">Quote on request</span>\n'
                f"      </div></div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="collection" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="folio mb-2">Pricing</p>\n'
            f'    <h2 class="mb-4">{title}</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "mono_sheet":
        rows = []
        for i, (name, desc) in enumerate(tiers, start=1):
            rows.append(
                f'    <div class="cap-row">\n'
                f'      <span class="no">{i:02d}</span>\n'
                f"      <div><h3>{name}</h3><p>{desc}</p></div>\n"
                f'      <div class="scope"><b>Includes</b>Clear estimate before work starts</div>\n'
                f'      <div class="turn"><b>Quote</b>On request</div>\n'
                f"    </div>"
            )
        return (
            f"{MARKER}:pricing -->\n"
            f'<section class="capab" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="spec mb-2">Pricing</p>\n'
            f'    <h2 class="mb-2">{title}</h2>\n'
            f'    <div class="cap-table">\n'
            + "\n".join(rows)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "saas":
        rows = []
        for i, (name, desc) in enumerate(tiers):
            hot = ' hot' if i == 1 else ""
            rows.append(
                f'  <div class="pricing-row{hot}">\n'
                f'    <div><h3 class="mb-1" style="font-weight:800;">{name}</h3>'
                f'<div class="price">Quote <small>on request</small></div></div>\n'
                f'    <ul><li>{desc}</li><li>Clear estimate before work starts</li></ul>\n'
                f'    <div class="text-lg-end"><a class="btn-quiet" href="#contact">Get a quote</a></div>\n'
                f"  </div>"
            )
        return (
            f'{MARKER}:pricing -->\n'
            f'<section id="pricing" class="container" style="padding:6rem 0;">\n'
            f'  <p class="eyebrow">Pricing</p>\n'
            f'  <h2 class="sec-title mb-2">{title}</h2>\n'
            f'  <p style="color:var(--muted);margin-bottom:2.5rem;">Three common packages — final pricing after a brief consultation.</p>\n'
            + "\n".join(rows)
            + "\n</section>"
        )
    if profile == "shop":
        cards = []
        for name, desc in tiers:
            cards.append(
                f'      <div class="col-md-4"><div class="p-card card-lift" style="height:100%;">\n'
                f'        <div class="body"><span class="badge-tag">Package</span>\n'
                f'        <div class="name mt-2">{name}</div>\n'
                f'        <span class="price">Quote on request</span>\n'
                f'        <span class="meta">{desc}</span></div></div></div>'
            )
        return (
            f'{MARKER}:pricing -->\n'
            f'<section class="drop" id="pricing" style="padding-top:4rem;">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-3">{title}</p>\n'
            f'    <h2 class="mb-4">Pick a package</h2>\n'
            f'    <div class="row g-4">\n'
            + "\n".join(cards)
            + "\n    </div>\n  </div>\n</section>"
        )
    if profile == "cafe_warm":
        if _has_css(html, ".ritual-card"):
            cards = []
            nums = ("I", "II", "III")
            for i, (name, desc) in enumerate(tiers):
                cards.append(
                    f'      <div class="col-md-4"><div class="ritual-card h-100"><div class="num">{nums[i]}</div>'
                    f"<h3>{name}</h3><p>{desc}</p><p style=\"color:var(--accent);font-weight:700;margin-top:.75rem;\">Quote on request</p></div></div>"
                )
            label_cls = "kicker mb-2"
            if 'class="eyebrow"' in html and 'class="kicker"' not in html:
                label_cls = "eyebrow mb-2"
            return (
                f'{MARKER}:pricing -->\n'
                f'<section class="ritual" id="pricing">\n'
                f'  <div class="container">\n'
                f'    <p class="{label_cls}">{title}</p>\n'
                f'    <h2 class="mb-4">Packages worth staying for</h2>\n'
                f'    <div class="row g-3">\n'
                + "\n".join(cards)
                + "\n    </div>\n  </div>\n</section>"
            )
        if _has_css(html, ".why-card"):
            cards = []
            styles = ("", " alt", " plain")
            for i, (name, desc) in enumerate(tiers):
                cards.append(
                    f'      <div class="col-md-4"><div class="why-card{styles[i]}"><h3>{name}</h3>'
                    f'<p>{desc}</p><p class="big mt-3" style="font-size:1.2rem;">Quote</p></div></div>'
                )
            return (
                f'{MARKER}:pricing -->\n'
                f'<section class="why" id="pricing">\n'
                f'  <div class="container">\n'
                f'    <p class="tag mb-3">{title}</p>\n'
                f'    <h2 class="mb-4">Pick a package</h2>\n'
                f'    <div class="row g-4">\n'
                + "\n".join(cards)
                + "\n    </div>\n  </div>\n</section>"
            )
    if profile in ("construction", "bootstrap_kicker") and (
        ".model" in html or 'class="model"' in html
    ):
        rows = []
        for name, desc in tiers:
            rows.append(
                f'    <div class="model"><span class="fit">Package</span><h4>{name}</h4>'
                f"<p>{desc}</p><p class=\"terms\">Quote on request · Clear estimate before work starts</p></div>"
            )
        return (
            f'{MARKER}:pricing -->\n'
            f'<section class="engage" id="pricing">\n'
            f'  <div class="container">\n'
            f'    <p class="kicker mb-2">{title}</p>\n'
            f'    <h2 class="serif mb-4">Choose a package</h2>\n'
            + "\n".join(rows)
            + "\n  </div>\n</section>"
        )
    cards = []
    for name, desc in tiers:
        if _has_css(html, ".proj{"):
            cards.append(
                f'      <div class="col-md-4"><div class="proj lift" style="height:100%;">\n'
                f'        <div class="meta"><h5>{name}</h5><p class="mb-2"><b>Quote on request</b></p>'
                f'<p class="mb-0" style="font-size:.95rem;">{desc}</p></div></div></div>'
            )
        elif profile in ("travel", "portfolio", "medical", "education", "fitness", "eyebrow", "agency_alt"):
            cards.append(_bordered_card(name, desc))
        else:
            cards.append(_bordered_card(name, desc, serif=profile not in ("construction", "bootstrap_kicker")))
    if profile == "cafe_warm":
        section_cls, label_cls, kicker = "rules", "kicker mb-2", title
    elif profile == "travel":
        section_cls, label_cls, kicker = "dest", "eyebrow mb-2", "Pricing"
    elif profile == "portfolio":
        section_cls, label_cls, kicker = "py-5", "eyebrow mb-2", "Pricing"
    elif profile == "generic_kicker":
        section_cls, label_cls, kicker = ("rows" if _has_css(html, ".rows{") else ""), "kicker mb-2", "Service packages"
    elif profile == "construction":
        if _has_css(html, ".rows{"):
            section_cls, label_cls, kicker = "rows", "kicker mb-2", "Service packages"
        else:
            section_cls, label_cls, kicker = "", _label_class(html, profile), "Service packages"
    elif profile == "bootstrap_kicker":
        if _has_css(html, ".rows{"):
            section_cls, label_cls, kicker = "rows", "kicker mb-2", "Service packages"
        else:
            section_cls, label_cls, kicker = "", _label_class(html, profile), "Service packages"
    elif profile == "agency_alt":
        section_cls, label_cls, kicker = "", _label_class(html, profile), "Pricing"
    else:
        section_cls, label_cls, kicker = ("rows" if _has_css(html, ".rows{") else ""), _label_class(html, profile), "Pricing"
    cls_attr = f' class="{section_cls}"' if section_cls else ""
    section_style = ' style="padding:5rem 0;"' if not section_cls else ""
    return (
        f'{MARKER}:pricing -->\n'
        f'<section{cls_attr} id="pricing"{section_style}>\n'
        f'  <div class="container">\n'
        f'    <p class="{label_cls}">{kicker}</p>\n'
        f'    <h2 style="font-size:clamp(2rem,4vw,2.8rem);margin-bottom:2rem;">{title}</h2>\n'
        f'    <div class="row g-4">\n'
        + "\n".join(cards)
        + "\n    </div>\n  </div>\n</section>"
    )


def _faq_detail_blocks(profile: str, items, html: str) -> str:
    details = []
    for i, (q, a) in enumerate(items):
        open_attr = " open" if i == 0 else ""
        if profile == "saas":
            details.append(f"    <details{open_attr}>\n      <summary>{q}</summary>\n      <p>{a}</p>\n    </details>")
        elif profile == "shop":
            details.append(
                f'    <details{open_attr} style="border-bottom:1px solid var(--line);">\n'
                f'      <summary style="cursor:pointer;padding:1rem 0;font-weight:700;">{q}</summary>\n'
                f'      <p style="padding-bottom:1rem;margin:0;color:var(--ink-45);">{a}</p>\n    </details>'
            )
        elif profile == "medical":
            details.append(
                f"    <details{open_attr}>\n      <summary>{q}</summary>\n"
                f'      <p class="ans">{a}</p>\n    </details>'
            )
        else:
            details.append(f"    <details{open_attr}>\n      <summary>{q}</summary>\n      <p>{a}</p>\n    </details>")
    return "\n".join(details)


def _faq_html(profile: str, seg, sub, html: str) -> str:
    items = _auto_faq_items(seg, sub)
    body = _faq_detail_blocks(profile, items, html)

    if profile in ("warm_craft", "case_ledger"):
        label = _label_class(html, profile)
        if profile == "case_ledger":
            title_html = '<h2 class="sec-title mb-4">Answers before you call</h2>'
        else:
            title_html = '<h2 class="mb-4" style="font-size:clamp(1.9rem,4.2vw,2.8rem);">Answers before you call</h2>'
        return (
            f"{MARKER}:faq -->\n"
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="{label}">Common questions</p>\n'
            f"    {title_html}\n"
            f"{body}\n  </div>\n</section>"
        )
    if profile == "blueprint":
        return (
            f"{MARKER}:faq -->\n"
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="tag-label mb-2">Common questions</p>\n'
            f'    <h2 class="mb-4">Answers before you call</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile == "prospectus":
        return (
            f"{MARKER}:faq -->\n"
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="sc mb-2">Common questions</p>\n'
            f'    <h2 class="mb-4">Answers before you call</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile == "vivid_block":
        return (
            f"{MARKER}:faq -->\n"
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="tab mb-2">Common questions</p>\n'
            f'    <h2 class="mb-4">Answers before you call</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile in ("lookbook", "mono_sheet", "fitness_plan", "agency_alt"):
        label = _label_class(html, profile)
        return (
            f"{MARKER}:faq -->\n"
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="{label}">Common questions</p>\n'
            f'    <h2 style="font-size:clamp(2rem,4vw,2.8rem);margin-bottom:2rem;">Answers before you call</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile == "saas":
        return (
            f'{MARKER}:faq -->\n'
            f'<section id="faq" style="background:var(--soft);border-top:1px solid var(--line);padding:5.5rem 0;">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow">FAQ</p>\n'
            f'    <h2 class="sec-title mb-4">Common questions</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile == "shop":
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="story" id="faq" style="padding:5rem 0;">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-3">FAQ</p>\n'
            f'    <h2 class="mb-4">Questions we hear often</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if profile == "cafe_warm":
        if _has_css(html, "details{"):
            label = "Questions we hear at the counter" if 'class="eyebrow"' in html else "Questions we hear"
            label_cls = "eyebrow mb-3" if 'class="eyebrow"' in html else "kicker mb-4"
            section_cls = "visit" if 'class="eyebrow"' in html and "hours-card" in html else "rules"
            return (
                f'{MARKER}:faq -->\n'
                f'<section class="{section_cls}" id="faq">\n'
                f'  <div class="container">\n'
                f'    <div class="row g-5">\n'
                f'      <div class="col-lg-5">\n'
                f'        <p class="{label_cls}">{label}</p>\n'
                f'        <h2 style="font-size:clamp(2rem,4vw,3rem);">Before you visit</h2>\n'
                f"      </div>\n      <div class=\"col-lg-7\">\n{body}\n      </div>\n"
                f"    </div>\n  </div>\n</section>"
            )
        rows = []
        for q, a in items:
            rows.append(
                '        <div class="rule-row" style="flex-direction:column;align-items:flex-start;gap:.35rem;">'
                f'<span class="k">{q}</span>'
                f'<span class="v" style="text-align:left;font-size:1.05rem;font-family:inherit;">{a}</span></div>'
            )
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="rules" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="kicker mb-4">Questions we hear</p>\n'
            f'    <h2 style="font-size:clamp(2rem,4vw,3rem);margin-bottom:2rem;">Before you visit</h2>\n'
            + "\n".join(rows)
            + "\n  </div>\n</section>"
        )
    if profile in ("travel", "fitness", "education", "eyebrow"):
        label = "Before you pack" if profile == "travel" else "Common questions"
        if profile == "fitness":
            title = "Answers before you call"
            open_tag = '<section class="faq" id="faq" style="background:var(--soft);border-block:1px solid var(--line);padding:6rem 0;">'
        elif profile == "education":
            title = "Answers before you call"
            open_tag = '<section class="calendar" id="faq">'
        else:
            title = (
                "Questions for your first call."
                if profile == "travel"
                else "Answer the questions you hear every week"
            )
            open_tag = '<section class="faq" id="faq">'
        title_cls = "sec-title" if profile == "fitness" else (' style="font-size:clamp(1.9rem,3.5vw,2.6rem);font-weight:800"' if profile == "travel" else "")
        title_tag = f'<h2 class="sec-title">{title}</h2>' if profile == "fitness" else (
            f'<h2{title_cls}>{title}</h2>' if profile == "travel" else f'<h2 class="mb-4">{title}</h2>'
        )
        return (
            f"{MARKER}:faq -->\n"
            f"{open_tag}\n"
            f'  <div class="container">\n'
            f'    <div class="row g-5">\n'
            f'      <div class="col-lg-4">\n'
            f'        <p class="eyebrow mb-2">{label}</p>\n'
            f"        {title_tag}\n"
            f"      </div>\n      <div class=\"col-lg-8\">\n{body}\n      </div>\n"
            f"    </div>\n  </div>\n</section>"
        )
    if profile == "medical":
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="faq py-5" id="faq">\n'
            f'  <div class="container">\n'
            f'    <div class="row g-5">\n'
            f'      <div class="col-lg-4">\n'
            f'        <p class="eyebrow mb-2">Patient questions</p>\n'
            f'        <h2 class="section-title">Before your visit</h2>\n'
            f"      </div>\n      <div class=\"col-lg-8\">\n{body}\n      </div>\n"
            f"    </div>\n  </div>\n</section>"
        )
    if profile == "generic_kicker":
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <div class="row g-5">\n'
            f'      <div class="col-lg-4">\n'
            f'        <p class="kicker mb-2">Common questions</p>\n'
            f'        <h2 class="display-face" style="font-size:clamp(2rem,4vw,2.8rem);">Answer the questions you hear every week</h2>\n'
            f'        <p class="mt-3">Every answered question here is one less hesitant phone call.</p>\n'
            f"      </div>\n      <div class=\"col-lg-8\">\n{body}\n      </div>\n"
            f"    </div>\n  </div>\n</section>"
        )
    if profile in ("construction", "bootstrap_kicker", "agency_engage") and (
        _has_css(html, ".safety details") or profile == "agency_engage"
    ):
        section_cls = "engage" if profile == "agency_engage" else "safety"
        label = "kicker mb-2" if profile != "agency_engage" else _label_class(html, profile)
        heading = "<h3>Answers before you call</h3>" if profile != "agency_engage" else '<h2 class="serif mb-0">Answers before you call</h2>'
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="{section_cls}" id="faq">\n'
            f'  <div class="container">\n'
            f'    <div class="row g-5">\n'
            f'      <div class="col-lg-5">\n'
            f'        <p class="{label}">Common questions</p>\n'
            f'        {heading}\n'
            f"      </div>\n      <div class=\"col-lg-7\">\n{body}\n      </div>\n"
            f"    </div>\n  </div>\n</section>"
        )
    if profile == "portfolio":
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="faq py-5" id="faq">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">FAQ</p>\n'
            f'    <h2 class="sec-title mb-4">Questions about working together</h2>\n'
            f"{body}\n  </div>\n</section>"
        )
    if _has_css(html, ".faq{"):
        label_cls = "kicker mb-2" if profile == "bootstrap_kicker" else "eyebrow mb-2"
        return (
            f'{MARKER}:faq -->\n'
            f'<section class="faq" id="faq">\n'
            f'  <div class="container">\n'
            f'    <div class="row g-5">\n'
            f'      <div class="col-lg-4">\n'
            f'        <p class="{label_cls}">Common questions</p>\n'
            f'        <h2 style="font-size:clamp(2rem,4vw,2.8rem);">Answers before you call</h2>\n'
            f"      </div>\n      <div class=\"col-lg-8\">\n{body}\n      </div>\n"
            f"    </div>\n  </div>\n</section>"
        )
    label = _label_class(html, profile)
    return (
        f'{MARKER}:faq -->\n'
        f'<section class="faq" id="faq">\n'
        f'  <div class="container">\n'
        f'    <p class="{label}">Common questions</p>\n'
        f'    <h2 style="font-size:clamp(2rem,4vw,2.8rem);margin-bottom:2rem;">Answers before you call</h2>\n'
        f"{body}\n  </div>\n</section>"
    )


def _contact_info_html(profile: str, seg, sub, brand, slug: str, html: str) -> str:
    contact = _auto_contact_overrides(seg, sub)
    values = _contact_values(seg, sub, slug, brand)
    email = values["email"]
    phone = values["phone"]
    title = contact.get("section_title", "Contact Us")
    address = contact.get("address", "Your address here")
    hours = contact.get("hours", "Mon–Sat, 9:00–19:00")
    tel = phone.replace(" ", "")
    if profile == "shop":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section class="story" id="contact" style="padding:5rem 0;">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-3">{title}</p>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><div class="spec"><span>Address</span><b>{address}</b></div></div>\n'
            f'      <div class="col-md-6"><div class="spec"><span>Hours</span><b>{hours}</b></div></div>\n'
            f'      <div class="col-md-6"><div class="spec"><span>Phone</span><b><a href="tel:{tel}">{phone}</a></b></div></div>\n'
            f'      <div class="col-md-6"><div class="spec"><span>Email</span><b><a href="mailto:{email}">{email}</a></b></div></div>\n'
            f"    </div>\n  </div>\n</section>"
        )
    if profile == "lookbook":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section class="particulars" id="contact">\n'
            f'  <div class="container">\n'
            f'    <p class="folio mb-3">{title}</p>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><div class="part"><div class="no">I</div><h3>Visit</h3><p>{address}<br>{hours}</p></div></div>\n'
            f'      <div class="col-md-6"><div class="part"><div class="no">II</div><h3>Reach us</h3><p><a href="tel:{tel}">{phone}</a><br><a href="mailto:{email}">{email}</a></p></div></div>\n'
            f"    </div>\n  </div>\n</section>"
        )
    if profile == "saas":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section id="contact" style="padding:5rem 0;border-top:1px solid var(--line);">\n'
            f'  <div class="container" style="max-width:820px;">\n'
            f'    <p class="eyebrow">Contact</p>\n'
            f'    <h2 class="sec-title mb-4">{title}</h2>\n'
            f'    <p style="color:var(--muted);">{address}</p>\n'
            f'    <p style="color:var(--muted);">{hours}</p>\n'
            f'    <p><a href="tel:{tel}">{phone}</a> · '
            f'<a href="mailto:{email}">{email}</a></p>\n'
            f"  </div>\n</section>"
        )
    if profile == "travel":
        if _has_css(html, ".guide{"):
            return (
                f'{MARKER}:contact-info -->\n'
                f'<section class="guide" id="contact">\n'
                f'  <div class="container">\n'
                f'    <div class="row align-items-center g-5">\n'
                f'      <div class="col-lg-5">\n'
                f'        <p class="eyebrow mb-3">Visit us</p>\n'
                f'        <h2>Drop by the studio before you pack.</h2>\n'
                f'        <p class="lede mt-3">{address}. Walk-ins welcome during planning season.</p>\n'
                f'      </div>\n'
                f'      <div class="col-lg-7">\n'
                f'        <div class="cred"><span>Phone</span><b><a href="tel:{tel}">{phone}</a></b></div>\n'
                f'        <div class="cred"><span>Email</span><b><a href="mailto:{email}">{email}</a></b></div>\n'
                f'        <div class="cred"><span>Hours</span><b>{hours}</b></div>\n'
                f'        <div class="cred"><span>Studio</span><b>{address}</b></div>\n'
                f'      </div>\n'
                f'    </div>\n'
                f'  </div>\n</section>'
            )
        if _has_css(html, ".stamp"):
            return (
                f'{MARKER}:contact-info -->\n'
                f'<section class="notes" id="contact">\n'
                f'  <div class="container">\n'
                f'    <p class="stamp mb-3">{title}</p>\n'
                f'    <h2 class="mb-4">Find the outfitter desk</h2>\n'
                f'    <div class="kit">\n'
                f'      <div class="row-item"><span>Address</span><b>{address}</b></div>\n'
                f'      <div class="row-item"><span>Hours</span><b>{hours}</b></div>\n'
                f'      <div class="row-item"><span>Phone</span><b><a href="tel:{tel}">{phone}</a></b></div>\n'
                f'      <div class="row-item"><span>Email</span><b><a href="mailto:{email}">{email}</a></b></div>\n'
                f'    </div>\n  </div>\n</section>'
            )
        if _has_css(html, ".whisper"):
            return (
                f'{MARKER}:contact-info -->\n'
                f'<section class="reserve" id="contact">\n'
                f'  <div class="container">\n'
                f'    <p class="whisper mb-3">{title}</p>\n'
                f'    <h2 class="mb-4">Visit the concierge desk</h2>\n'
                f'    <div class="line"><span>Address</span><span>{address}</span></div>\n'
                f'    <div class="line"><span>Hours</span><span>{hours}</span></div>\n'
                f'    <div class="line"><span>Phone</span><span><a href="tel:{tel}">{phone}</a></span></div>\n'
                f'    <div class="line"><span>Email</span><span><a href="mailto:{email}">{email}</a></span></div>\n'
                f'  </div>\n</section>'
            )
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section id="contact" style="padding:6rem 0;background:var(--soft);border-block:1px solid var(--line);">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-3">{title}</p>\n'
            f'    <h2 class="mb-4">Visit or call</h2>\n'
            f'    <p>{address}</p><p>{hours}</p>\n'
            f'    <p><a href="tel:{tel}">{phone}</a> · <a href="mailto:{email}">{email}</a></p>\n'
            f'  </div>\n</section>'
        )
    if profile == "fitness":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section id="contact" style="background:var(--bg);border-block:1px solid var(--line);padding:6rem 0;">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">{title}</p>\n'
            f'    <h2 class="sec-title mb-4">Find the floor</h2>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6">\n'
            f'        <p class="cred">Visit</p>\n'
            f'        <p class="dim mb-1">{address}</p>\n'
            f'        <p class="dim mb-0">{hours}</p>\n'
            f'      </div>\n'
            f'      <div class="col-md-6">\n'
            f'        <p class="cred">Reach us</p>\n'
            f'        <p class="dim mb-1"><a href="tel:{tel}">{phone}</a></p>\n'
            f'        <p class="dim mb-0"><a href="mailto:{email}">{email}</a></p>\n'
            f'      </div>\n'
            f'    </div>\n'
            f'  </div>\n</section>'
        )
    if profile == "warm_craft":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section id="contact" style="padding:5rem 0;background:var(--soft);border-top:1px solid var(--line);">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-3">{title}</p>\n'
            f'    <h2 class="mb-4">Visit or call</h2>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><p><strong>Address</strong><br>{address}</p><p><strong>Hours</strong><br>{hours}</p></div>\n'
            f'      <div class="col-md-6"><p><strong>Phone</strong><br><a href="tel:{tel}">{phone}</a></p><p><strong>Email</strong><br><a href="mailto:{email}">{email}</a></p></div>\n'
            f'    </div>\n  </div>\n</section>'
        )
    if profile == "fitness_plan":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section id="contact" style="padding:6rem 0;border-top:1px solid var(--line);">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">{title}</p>\n'
            f'    <h2 class="sec-title mb-4" style="max-width:18ch;">Visit the studio</h2>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><div class="price-note h-100"><p class="cred mb-2">Address</p><p class="muted mb-1">{address}</p><p class="muted mb-0">{hours}</p></div></div>\n'
            f'      <div class="col-md-6"><div class="price-note h-100"><p class="cred mb-2">Reach us</p><p class="muted mb-1"><a href="tel:{tel}">{phone}</a></p><p class="muted mb-0"><a href="mailto:{email}">{email}</a></p></div></div>\n'
            f'    </div>\n  </div>\n</section>'
        )
    if profile == "prospectus":
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section class="calendar" id="contact">\n'
            f'  <div class="container">\n'
            f'    <p class="sc d-block mb-2">{title}</p>\n'
            f'    <h2 class="mb-4">Visit or call</h2>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><div class="school h-100"><p class="sc">Campus</p><h3>Address</h3><p class="mb-0">{address}</p><p class="mb-0 mt-2">{hours}</p></div></div>\n'
            f'      <div class="col-md-6"><div class="school h-100"><p class="sc">Direct line</p><h3>Reach us</h3><p class="mb-0"><a href="tel:{tel}">{phone}</a></p><p class="mb-0 mt-2"><a href="mailto:{email}">{email}</a></p></div></div>\n'
            f'    </div>\n  </div>\n</section>'
        )
    if profile == "medical":
        if _has_css(html, ".q-cell"):
            return (
                f'{MARKER}:contact-info -->\n'
                f'<section class="quality" id="contact">\n'
                f'  <div class="container">\n'
                f'    <p class="ovl mb-2">{title}</p>\n'
                f'    <h2 class="mb-4">Find the clinic</h2>\n'
                f'    <div class="row g-3">\n'
                f'      <div class="col-md-6"><div class="q-cell h-100"><b>Address</b><span>{address}</span></div></div>\n'
                f'      <div class="col-md-6"><div class="q-cell h-100"><b>Hours</b><span>{hours}</span></div></div>\n'
                f'      <div class="col-md-6"><div class="q-cell h-100"><b>Phone</b><span><a href="tel:{tel}">{phone}</a></span></div></div>\n'
                f'      <div class="col-md-6"><div class="q-cell h-100"><b>Email</b><span><a href="mailto:{email}">{email}</a></span></div></div>\n'
                f'    </div>\n  </div>\n</section>'
            )
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section class="faq py-5" id="contact" style="background:var(--soft);border-top:1px solid var(--line);">\n'
            f'  <div class="container">\n'
            f'    <p class="eyebrow mb-2">{title}</p>\n'
            f'    <h2 class="section-title mb-4">Visit or call</h2>\n'
            f'    <div class="row g-4">\n'
            f'      <div class="col-md-6"><p><strong>Address</strong><br>{address}</p><p><strong>Hours</strong><br>{hours}</p></div>\n'
            f'      <div class="col-md-6"><p><strong>Phone</strong><br><a href="tel:{tel}">{phone}</a></p><p><strong>Email</strong><br><a href="mailto:{email}">{email}</a></p></div>\n'
            f'    </div>\n  </div>\n</section>'
        )
    if profile in ("bootstrap_kicker", "portfolio", "eyebrow", "agency_alt"):
        label = _label_class(html, profile)
        section_cls = "engage" if ".engage" in html and profile == "bootstrap_kicker" else ""
        cls_attr = f' class="{section_cls}"' if section_cls else ""
        style = "" if section_cls else ' style="padding:5rem 0;background:var(--soft);border-top:1px solid var(--line);"'
        return (
            f'{MARKER}:contact-info -->\n'
            f'<section{cls_attr} id="contact"{style}>\n'
            f'  <div class="container">\n'
            f'    <p class="{label}">{title}</p>\n'
            f'    <div class="row g-4 mt-1">\n'
            f'      <div class="col-md-6"><h6>Visit</h6><ul><li>{address}</li><li>{hours}</li></ul></div>\n'
            f'      <div class="col-md-6"><h6>Reach us</h6><ul>'
            f'<li><a href="tel:{tel}">{phone}</a></li>'
            f'<li><a href="mailto:{email}">{email}</a></li></ul></div>\n'
            f"    </div>\n  </div>\n</section>"
        )
    label = _label_class(html, profile)
    section_cls = "rows" if _has_css(html, ".rows{") else ""
    cls_attr = f' class="{section_cls}"' if section_cls else ""
    style = ' style="padding:5rem 0;background:var(--soft);border-top:1px solid var(--line);"' if not section_cls else ""
    return (
        f'{MARKER}:contact-info -->\n'
        f'<section{cls_attr} id="contact"{style}>\n'
        f'  <div class="container">\n'
        f'    <p class="{label}">{title}</p>\n'
        f'    <div class="row g-4 mt-1">\n'
        f'      <div class="col-md-6"><p><strong>Address</strong><br>{address}</p>'
        f'<p><strong>Hours</strong><br>{hours}</p></div>\n'
        f'      <div class="col-md-6"><p><strong>Phone</strong><br>'
        f'<a href="tel:{tel}">{phone}</a></p>'
        f'<p><strong>Email</strong><br><a href="mailto:{email}">{email}</a></p></div>\n'
        f"    </div>\n  </div>\n</section>"
    )


def _insertion_point(html: str) -> int:
    """Pricing/FAQ belong before visit/CTA/contact bands — not after them or above the footer."""
    for pattern in (
        r'<section[^>]*\bid=["\']contact["\']',
        r'<section[^>]*\bid=["\']visit["\']',
        r'<section[^>]*\bid=["\']plan["\']',
        r'<section[^>]*\bclass=["\'][^"\']*\bcta(?:\s|-band|\b)[^"\']*["\']',
        r'<section[^>]*\bid=["\']start["\']',
    ):
        m = re.search(pattern, html, re.I)
        if m:
            return m.start()
    footer = re.search(r"<footer\b", html, re.I)
    if footer:
        return footer.start()
    return len(html)


def _update_nav(html: str) -> str:
    if "<nav" not in html.lower():
        return html
    links = [
        ('href="#pricing"', "Pricing", _has_id(html, "pricing")),
        ('href="#faq"', "FAQ", _has_id(html, "faq")),
        ('href="#contact"', "Contact", True),
    ]
    for href, label, needed in links:
        if not needed or href in html:
            continue
        link = f'<a class="navlink" {href}>{label}</a>'
        if 'class="navlink"' in html or 'class="nav-link"' in html:
            m = re.search(r'(<div class="d-none d-md-flex[^"]*"[^>]*>)(.*?)(</div>)', html, re.S)
            if m:
                html = html[: m.end(2)] + f"\n      {link}" + html[m.end(2) :]
                continue
        m = re.search(r'(<nav\b[^>]*>.*?)(</nav>)', html, re.S | re.I)
        if m:
            html = html[: m.end(1)] + f"\n    {link}\n  " + html[m.start(2) :]
    return html


def _strip_enrich(html: str) -> str:
    while MARKER in html:
        start = html.index(MARKER)
        sect = html.find("<section", start)
        if sect < 0:
            break
        end = html.find("</section>", sect)
        if end < 0:
            break
        html = html[:start] + html[end + len("</section>") :]
        html = re.sub(r"\n{3,}", "\n\n", html)
    return html


def enrich_file(path: Path, meta: dict, *, refresh: bool = False) -> bool:
    html = path.read_text(encoding="utf-8")
    original = html
    if refresh:
        html = _strip_enrich(html)
    if _skip_all(html):
        if refresh and html != original:
            path.write_text(html, encoding="utf-8")
            return True
        return False

    slug = meta["slug"]
    seg, sub = meta.get("segment"), meta.get("subcategory")
    brand = meta.get("displayName") or BRAND_NAMES.get((seg, sub), "Your Business")
    profile = _detect_profile(html, slug)
    services = _services(seg, sub)

    chunks = []
    if (
        not _has_id(html, "pricing")
        and not _has_native_pricing(html)
        and MARKER + ":pricing" not in html
    ):
        chunks.append(_pricing_html(profile, seg, sub, services, html))
    if not _has_id(html, "faq") and not _has_native_faq(html) and MARKER + ":faq" not in html:
        chunks.append(_faq_html(profile, seg, sub, html))

    patched = False
    if not _has_contact_info(html) and MARKER + ":contact-info" not in html:
        values = _contact_values(seg, sub, slug, brand)
        if _has_native_contact_area(html):
            html = _patch_contact_placeholders(html, values["phone"], values["email"])
            patched = True
        else:
            chunks.append(_contact_info_html(profile, seg, sub, brand, slug, html))

    if not chunks and not patched:
        if refresh and html != original:
            path.write_text(html, encoding="utf-8")
            return True
        return False

    if chunks:
        pos = _insertion_point(html)
        block = "\n\n".join(chunks) + "\n\n"
        html = html[:pos] + block + html[pos:]
    if _has_id(html, "faq") or _has_id(html, "pricing"):
        html = _ensure_section_css(html, profile)
    html = _update_nav(html)
    path.write_text(html, encoding="utf-8")
    return True


def main():
    parser = argparse.ArgumentParser(description="Enrich HTML templates with pricing, FAQ, contact.")
    parser.add_argument("--refresh", nargs="*", metavar="SLUG", help="Strip prior enrich blocks first (optional slug list)")
    args = parser.parse_args()
    catalog = _load_catalog()
    refresh_all = args.refresh is not None and len(args.refresh) == 0
    refresh_slugs = set(args.refresh or [])
    changed = 0
    for path in sorted(TEMPLATES_HTML_DIR.glob("*.html")):
        slug = path.stem
        if args.refresh is not None and not refresh_all and slug not in refresh_slugs:
            continue
        meta = catalog.get(slug, {"slug": slug, "segment": None, "subcategory": None})
        if enrich_file(path, meta, refresh=refresh_all or slug in refresh_slugs):
            changed += 1
            print(f"  enriched {path.name}")
    total = len(refresh_slugs) if refresh_slugs else len(catalog)
    print(f"OK: enriched {changed} / {total} html templates")


if __name__ == "__main__":
    main()
