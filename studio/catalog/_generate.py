"""Generate the template catalog from the taxonomy spec (2026-07-21).
  backend/studio/catalog/categories/<id>/category.config.json  (x23)
  backend/studio/catalog/templates.manifest.json
  backend/studio/catalog/section-standard.json
  frontend-separate/dharwinone_agents_frontend/src/templates/packages/<template_id>/
      section_schema.json + default_content.json + default_theme.json + registry.json  (x39)
      content/palette lifted from the source templates/*.html where one exists (see _html_extract)
  .../packages/index.ts  (static import map for the Next.js app)

Re-runnable; asserts enforce the taxonomy refinement rules.
"""
import json
import re
from pathlib import Path

import _html_extract

OUT = Path(__file__).resolve().parent
FRONT_OUT = OUT.parents[2] / "frontend-separate" / "dharwinone_agents_frontend" / "src" / "templates" / "packages"

SEGMENTS = {
    "real_estate": "Real Estate",
    "local_service": "Blue-Collar / Local Services",
    "retail": "Retail & Small Shops",
    "hospitality_travel": "Hospitality & Travel",
    "health_education": "Health & Education",
    "professional": "Professional Services",
}

FAMILY_LABELS = {
    "trust_local": "Trust Local",
    "bold_convert": "Bold Convert",
    "clean_pro": "Clean Pro",
    "premium_dark": "Premium Dark",
    "warm_craft": "Warm Craft",
    "fresh_retail": "Fresh Retail",
    "generic": "Generic",
}

# id, segment, subcat, family, intents, status(convert|new|example|fallback), source, wave
TEMPLATES = [
    ("re_broker_v1", "real_estate", "broker", "clean_pro", ["broker_profile"], "new", "layout ref: agency.html", 1),
    ("re_agent_v1", "real_estate", "agent", "trust_local", ["neighbourhood_specialist"], "new", "layout ref: portfolio.html", 1),
    ("re_agent_lead_v1", "real_estate", "agent", "bold_convert", ["lead_gen_landing"], "new", None, 1),
    ("re_rental_v1", "real_estate", "rental_consultant", "clean_pro", ["rental", "listing_showcase"], "new", None, 1),
    ("re_luxury_v1", "real_estate", "luxury", "premium_dark", ["luxury", "listing_showcase"], "new", "imagery ref: travel.html", 1),
    ("ls_plumbing_v1", "local_service", "plumbing", "trust_local", [], "convert", "construction.html", 1),
    ("ls_electrician_v1", "local_service", "electrician", "trust_local", [], "convert", "construction-2.html", 1),
    ("electrician_v3", "local_service", "electrician", "trust_local", [], "example", "docs/superpowers/examples (legacy id)", 1),
    ("ls_landscaping_v1", "local_service", "landscaping", "trust_local", [], "convert", "construction-3.html", 1),
    ("ls_car_wash_v1", "local_service", "car_wash", "bold_convert", [], "convert", "fitness.html", 1),
    ("ls_cleaning_v1", "local_service", "cleaning_handyman", "trust_local", [], "convert", "medical.html", 1),
    ("ls_insurance_v1", "local_service", "insurance_agent", "clean_pro", [], "convert", "agency-2.html", 1),
    ("rt_gift_shop_v1", "retail", "gift_shop", "warm_craft", [], "convert", "cafe.html", 1),
    ("rt_print_shop_v1", "retail", "print_shop", "fresh_retail", [], "convert", "saas.html", 1),
    ("rt_clothing_v1", "retail", "clothing", "fresh_retail", [], "convert", "shop.html", 1),
    ("rt_boutique_v1", "retail", "boutique", "premium_dark", [], "convert", "shop-2.html (restyled dark)", 1),
    ("rt_handmade_v1", "retail", "handmade", "warm_craft", [], "convert", "portfolio-2.html", 1),
    ("ht_cafe_v1", "hospitality_travel", "cafe_restaurant", "warm_craft", [], "convert", "cafe-2.html", 2),
    ("ht_travel_v1", "hospitality_travel", "travel_tourism", "premium_dark", [], "convert", "travel-2.html", 2),
    ("he_medical_v1", "health_education", "clinic_medical", "clean_pro", [], "convert", "medical-2.html", 2),
    ("he_fitness_v1", "health_education", "fitness_gym", "bold_convert", [], "convert", "fitness-2.html", 2),
    ("he_education_v1", "health_education", "education_coaching", "clean_pro", [], "convert", "education.html", 2),
    ("pf_agency_v1", "professional", "agency_studio", "clean_pro", [], "convert", "agency-3.html", 2),
    ("pf_saas_v1", "professional", "saas_startup", "fresh_retail", [], "convert", "saas-2.html", 2),
    ("pf_portfolio_v1", "professional", "portfolio_freelancer", "warm_craft", [], "convert", "portfolio.html", 2),
    ("gn_generic_v1", None, None, "generic", [], "fallback", "generic.html", 1),
    # ---- depth variants: every remaining old HTML promoted to its own package (all 33 used) ----
    ("pf_agency_v2", "professional", "agency_studio", "clean_pro", [], "convert", "agency.html", 2),
    ("ht_cafe_v2", "hospitality_travel", "cafe_restaurant", "warm_craft", [], "convert", "cafe-3.html", 2),
    ("he_education_v2", "health_education", "education_coaching", "clean_pro", [], "convert", "education-2.html", 2),
    ("he_education_v3", "health_education", "education_coaching", "clean_pro", [], "convert", "education-3.html", 2),
    ("he_fitness_v2", "health_education", "fitness_gym", "bold_convert", [], "convert", "fitness-3.html", 2),
    ("gn_generic_v2", None, None, "generic", [], "fallback", "generic-2.html", 1),
    ("gn_generic_v3", None, None, "generic", [], "fallback", "generic-3.html", 1),
    ("he_medical_v2", "health_education", "clinic_medical", "clean_pro", [], "convert", "medical-3.html", 2),
    ("pf_portfolio_v2", "professional", "portfolio_freelancer", "warm_craft", [], "convert", "portfolio-3.html", 2),
    ("pf_saas_v2", "professional", "saas_startup", "fresh_retail", [], "convert", "saas-3.html", 2),
    ("rt_clothing_v2", "retail", "clothing", "fresh_retail", [], "convert", "shop-3.html", 1),
    ("ht_travel_v2", "hospitality_travel", "travel_tourism", "premium_dark", [], "convert", "travel.html", 2),
    ("ht_travel_v3", "hospitality_travel", "travel_tourism", "premium_dark", [], "convert", "travel-3.html", 2),
]

# segment, subcat, display name, default_family, wave, keywords
SUBCATS = [
    ("real_estate", "broker", "Brokerage / Broker", "clean_pro", 1,
     ["brokerage", "firm", "RERA", "agency", "team of agents"]),
    ("real_estate", "agent", "Independent Agent", "trust_local", 1,
     ["independent agent", "individual", "advisor", "buyer help"]),
    ("real_estate", "rental_consultant", "Rental / Property Consultant", "clean_pro", 1,
     ["rent", "lease", "tenant", "PG", "property management"]),
    ("real_estate", "luxury", "Luxury Specialist", "premium_dark", 1,
     ["luxury", "premium", "penthouse", "villa", "high-end", "exclusive"]),
    ("local_service", "plumbing", "Plumbing", "trust_local", 1,
     ["plumber", "pipe", "leak", "tap", "drainage", "bathroom fitting"]),
    ("local_service", "electrician", "Electrician", "trust_local", 1,
     ["electrician", "wiring", "AC repair", "fan", "inverter", "short circuit"]),
    ("local_service", "landscaping", "Landscaping", "trust_local", 1,
     ["garden", "lawn", "landscaping", "plants", "outdoor", "maintenance"]),
    ("local_service", "car_wash", "Car Wash / Detailing", "bold_convert", 1,
     ["car wash", "detailing", "polish", "ceramic coating", "bike wash"]),
    ("local_service", "cleaning_handyman", "Cleaning / Handyman", "trust_local", 1,
     ["cleaning", "deep clean", "handyman", "pest", "sofa", "odd jobs"]),
    ("local_service", "insurance_agent", "Insurance Agent", "clean_pro", 1,
     ["insurance", "policy", "LIC", "health cover", "claim", "premium payment"]),
    ("retail", "gift_shop", "Gift Shop", "warm_craft", 1,
     ["gifts", "hampers", "souvenirs", "personalised", "occasions"]),
    ("retail", "print_shop", "Visiting-Card / Printing", "fresh_retail", 1,
     ["printing", "visiting cards", "flex", "banners", "xerox", "stationery"]),
    ("retail", "clothing", "Clothing Store", "fresh_retail", 1,
     ["clothing", "garments", "fashion", "menswear", "saree", "kids wear"]),
    ("retail", "boutique", "Boutique", "premium_dark", 1,
     ["boutique", "designer", "couture", "tailoring", "bridal", "bespoke"]),
    ("retail", "handmade", "Handmade Sellers", "warm_craft", 1,
     ["handmade", "handcrafted", "artisan", "pottery", "crochet", "homemade"]),
    ("hospitality_travel", "cafe_restaurant", "Café / Restaurant", "warm_craft", 2,
     ["cafe", "restaurant", "menu", "bakery", "sweets", "dining"]),
    ("hospitality_travel", "travel_tourism", "Travel & Tours", "premium_dark", 2,
     ["travel", "tours", "package", "trip", "holiday", "itinerary"]),
    ("health_education", "clinic_medical", "Clinic / Medical", "clean_pro", 2,
     ["clinic", "doctor", "dental", "physio", "lab", "appointment"]),
    ("health_education", "fitness_gym", "Gym / Fitness", "bold_convert", 2,
     ["gym", "fitness", "yoga", "trainer", "workout", "membership"]),
    ("health_education", "education_coaching", "Coaching / Academy", "clean_pro", 2,
     ["coaching", "tuition", "academy", "courses", "school", "admission"]),
    ("professional", "agency_studio", "Agency / Studio", "clean_pro", 2,
     ["marketing agency", "branding", "studio", "campaigns", "clients"]),
    ("professional", "saas_startup", "SaaS / Startup", "fresh_retail", 2,
     ["software", "app", "product", "startup", "SaaS", "demo"]),
    ("professional", "portfolio_freelancer", "Portfolio / Freelancer", "warm_craft", 2,
     ["portfolio", "freelancer", "photographer", "artist", "works", "hire"]),
]

SECTION_STANDARD = {
    "version": 1,
    "vocabulary": ["hero", "services", "about", "gallery", "testimonials",
                   "pricing", "faq", "contact", "cta_footer", "why_us"],
    "required": ["hero", "services", "why_us", "testimonials", "cta_footer"],
    "optional": ["about", "gallery", "pricing", "faq", "contact"],
    "default_order": ["hero", "services", "about", "why_us", "gallery",
                      "testimonials", "pricing", "faq", "contact", "cta_footer"],
    "element_key_grammar": "<section>.<field> | <section>.items[n].<field> | <section>.section_title",
    "mix_merge_rule": (
        "Every template implements ALL required sections and only vocabulary sections, with "
        "identical section names, identical element-key grammar, identical schema field names "
        "(per section type), and CSS-var-only styling. Therefore a section component is "
        "interchangeable between templates ONLY when both templates share the same family "
        "(style_tags[0]) — same design language + same contract = lossless swap. "
        "Cross-family swaps are forbidden (visual mismatch even though the schema fits)."
    ),
}

# ---- uniform section_schema (identical for every template = mix/merge guarantee) ----
S = lambda n: {"type": "string", "maxLength": n}
SECTION_SCHEMA = {
    "sections": SECTION_STANDARD["default_order"],
    "image_slots": {
        "hero.background": {"role": "background", "aspect": "16:9", "minPx": {"w": 1920, "h": 1080},
                            "displayPx": {"w": 1920, "h": 1080}, "safeZone": "center",
                            "label": "Hero background", "required": False},
        "about.image": {"role": "side_image", "aspect": "4:5", "minPx": {"w": 800, "h": 1000},
                        "displayPx": {"w": 600, "h": 750}, "safeZone": "center",
                        "label": "About photo", "required": False},
        "services.items[].image": {"role": "card_thumb", "aspect": "4:3", "minPx": {"w": 800, "h": 600},
                                   "displayPx": {"w": 400, "h": 300}, "maxCount": 8,
                                   "label": "Service photo", "required": False},
        "gallery.items[].image": {"role": "gallery_tile", "aspect": "1:1", "minPx": {"w": 800, "h": 800},
                                  "displayPx": {"w": 400, "h": 400}, "maxCount": 12,
                                  "label": "Gallery photo", "required": False},
        "testimonials.items[].avatar": {"role": "avatar", "aspect": "1:1", "minPx": {"w": 200, "h": 200},
                                        "displayPx": {"w": 80, "h": 80}, "safeZone": "face-center",
                                        "label": "Customer photo", "required": False},
        "why_us.background": {"role": "background", "aspect": "16:9", "minPx": {"w": 1920, "h": 1080},
                              "displayPx": {"w": 1920, "h": 600}, "safeZone": "center",
                              "label": "Why-us background", "required": False},
        "contact.background": {"role": "background", "aspect": "16:9", "minPx": {"w": 1920, "h": 1080},
                               "displayPx": {"w": 1920, "h": 800}, "safeZone": "center",
                               "label": "Contact background", "required": False},
    },
    "schema": {
        "hero": {"headline": S(60), "subtext": S(140), "cta_text": S(25)},
        "services": {"section_title": S(40),
                     "items": {"maxItems": 8, "item": {"title": S(40), "desc": S(120)}}},
        "about": {"section_title": S(40), "body": S(600)},
        "why_us": {"section_title": S(40),
                   "points": {"maxItems": 5, "item": S(80)}},
        "gallery": {"section_title": S(40),
                    "items": {"maxItems": 12, "item": {"caption": S(60)}}},
        "testimonials": {"section_title": S(40),
                         "items": {"maxItems": 6, "item": {"name": S(30), "quote": S(160)}}},
        "pricing": {"section_title": S(40),
                    "items": {"maxItems": 4, "item": {"name": S(30), "price": S(20),
                                                      "features": {"maxItems": 6, "item": S(60)}}}},
        "faq": {"section_title": S(40),
                "items": {"maxItems": 8, "item": {"q": S(90), "a": S(300)}}},
        "contact": {"section_title": S(40), "address": S(160), "phone": S(20),
                    "email": S(60), "hours": S(80)},
        "cta_footer": {"headline": S(70), "cta_text": S(25)},
    },
}

# ---- family design defaults (palette + font pair; layout variants live in families.ts) ----
# Palettes are COMMITTED (impeccable brand register): tinted neutrals (never pure #fff/#000),
# one strong color carrying the surface, per-family personality.
FAMILY_THEMES = {
    "trust_local":  {"primary": "#23425F", "accent": "#D9821B", "neutral": "#2A2620",
                     "bg": "#EFECE3", "surface": "#E7E2D6", "fontPair": "archivo",
                     "palettePreset": "paper_navy_amber"},
    "bold_convert": {"primary": "#17151A", "accent": "#D64018", "neutral": "#17151A",
                     "bg": "#FBFAF8", "surface": "#F1EEE9", "fontPair": "anton_archivo",
                     "palettePreset": "ink_vermilion"},
    "clean_pro":    {"primary": "#1F5C8A", "accent": "#DB7A2A", "neutral": "#1C2B33",
                     "bg": "#F8FAFB", "surface": "#ECF1F4", "fontPair": "schibsted",
                     "palettePreset": "steel_ember"},
    "premium_dark": {"primary": "#C6A15B", "accent": "#8C6D3F", "neutral": "#EDE6D6",
                     "bg": "#12100D", "surface": "#1C1915", "fontPair": "marcellus_mulish",
                     "palettePreset": "onyx_gold"},
    "warm_craft":   {"primary": "#6B4226", "accent": "#C1652A", "neutral": "#3A2A1D",
                     "bg": "#F5EBDD", "surface": "#EEDFC9", "fontPair": "youngserif_karla",
                     "palettePreset": "espresso_rust"},
    "fresh_retail": {"primary": "#10715C", "accent": "#E8564B", "neutral": "#1B2A24",
                     "bg": "#FAFBF7", "surface": "#E9F2EA", "fontPair": "bricolage_karla",
                     "palettePreset": "fern_coral"},
    "generic":      {"primary": "#2F7A40", "accent": "#1B3A5C", "neutral": "#20261F",
                     "bg": "#F7F8F6", "surface": "#ECEFEA", "fontPair": "archivo",
                     "palettePreset": "dharwin_default"},
}

# ---- verified default imagery (curl-checked 2026-07-21; templates must never be image-less) ----
def _img(pid, w=1600):
    return f"https://images.unsplash.com/photo-{pid}?auto=format&fit=crop&w={w}&q=80"

IMAGES = {  # (segment, subcat): {hero, about}
    ("real_estate", "broker"): ("1560518883-ce09059eeffa", "1600585154340-be6161a56a0c"),
    ("real_estate", "agent"): ("1570129477492-45c003edd2be", "1600585154340-be6161a56a0c"),
    ("real_estate", "rental_consultant"): ("1522708323590-d24dbb6b0267", "1600585154340-be6161a56a0c"),
    ("real_estate", "luxury"): ("1600596542815-ffad4c1539a9", "1600585154340-be6161a56a0c"),
    ("local_service", "plumbing"): ("1541888946425-d81bb19240f5", "1504307651254-35680f356dfd"),
    ("local_service", "electrician"): ("1621905251189-08b45d6a269e", "1504307651254-35680f356dfd"),
    ("local_service", "landscaping"): ("1416879595882-3373a0480b5b", "1504307651254-35680f356dfd"),
    ("local_service", "car_wash"): ("1601362840469-51e4d8d58785", "1504307651254-35680f356dfd"),
    ("local_service", "cleaning_handyman"): ("1581578731548-c64695cc6952", "1504307651254-35680f356dfd"),
    ("local_service", "insurance_agent"): ("1554224155-6726b3ff858f", "1497366216548-37526070297c"),
    ("retail", "gift_shop"): ("1549465220-1a8b9238cd48", "1513475382585-d06e58bcb0e0"),
    ("retail", "print_shop"): ("1562408590-e32931084e23", "1513475382585-d06e58bcb0e0"),
    ("retail", "clothing"): ("1441986300917-64674bd600d8", "1441984904996-e0b6ba687e04"),
    ("retail", "boutique"): ("1441984904996-e0b6ba687e04", "1441986300917-64674bd600d8"),
    ("retail", "handmade"): ("1452860606245-08befc0ff44b", "1513475382585-d06e58bcb0e0"),
    ("hospitality_travel", "cafe_restaurant"): ("1554118811-1e0d58224f24", "1509440159596-0249088772ff"),
    ("hospitality_travel", "travel_tourism"): ("1488646953014-85cb44e25828", "1506744038136-46273834b3fb"),
    ("health_education", "clinic_medical"): ("1579684385127-1ef15d508118", "1538108149393-fbbd81895907"),
    ("health_education", "fitness_gym"): ("1534438327276-14e5300c3a48", "1538108149393-fbbd81895907"),
    ("health_education", "education_coaching"): ("1509062522246-3755977927d7", "1523240795612-9a054b0db644"),
    ("professional", "agency_studio"): ("1497366216548-37526070297c", "1497366811353-6870744d04b2"),
    ("professional", "saas_startup"): ("1551434678-e076c223a692", "1486312338219-ce68d2c6f44d"),
    ("professional", "portfolio_freelancer"): ("1452587925148-ce544e77e70d", "1486312338219-ce68d2c6f44d"),
    (None, None): ("1486312338219-ce68d2c6f44d", "1497366216548-37526070297c"),
}

# sample brand names (fictional) so previews read as real businesses, not templates
BRAND_NAMES = {
    ("real_estate", "broker"): "Meridian Realty",
    ("real_estate", "agent"): "Verma Realty",
    ("real_estate", "rental_consultant"): "NestKey Consultants",
    ("real_estate", "luxury"): "Crown Estates",
    ("local_service", "plumbing"): "BlueDrop Plumbing",
    ("local_service", "electrician"): "Sharma Electricals",
    ("local_service", "landscaping"): "GreenFrame Gardens",
    ("local_service", "car_wash"): "TorqueShine Detailing",
    ("local_service", "cleaning_handyman"): "FreshNest Services",
    ("local_service", "insurance_agent"): "SafeArc Insurance",
    ("retail", "gift_shop"): "Willow & Wick",
    ("retail", "print_shop"): "PressWorks Studio",
    ("retail", "clothing"): "Urban Thread",
    ("retail", "boutique"): "Maison Iris",
    ("retail", "handmade"): "Clay & Loom",
    ("hospitality_travel", "cafe_restaurant"): "Amber Oven Cafe",
    ("hospitality_travel", "travel_tourism"): "Horizon Trails",
    ("health_education", "clinic_medical"): "CarePoint Clinic",
    ("health_education", "fitness_gym"): "IronLeaf Fitness",
    ("health_education", "education_coaching"): "Summit Academy",
    ("professional", "agency_studio"): "North Signal Studio",
    ("professional", "saas_startup"): "Loopdesk",
    ("professional", "portfolio_freelancer"): "Studio Kavir",
    (None, None): "Your Business",
}

# ---- per-sub-cat fallback copy: headline, subtext, 3 services ----
COPY = {
    ("real_estate", "broker"): ("Find the Right Property, Faster",
        "A trusted brokerage guiding buyers and sellers end to end.",
        [("Property Sales", "Residential and commercial sales, handled end to end."),
         ("Rentals & Leasing", "Verified tenants and smooth agreements."),
         ("Investment Advisory", "Data-backed guidance on where to buy next.")]),
    ("real_estate", "agent"): ("Your Neighbourhood Property Expert",
        "Personal guidance for buying and selling in your area.",
        [("Home Buying Help", "From shortlist to keys, one point of contact."),
         ("Property Valuation", "Honest, market-based price opinions."),
         ("Site Visits", "Scheduled visits that respect your time.")]),
    ("real_estate", "rental_consultant"): ("Rentals Managed End to End",
        "Tenants found, agreements done, rent on time.",
        [("Tenant Search", "Verified tenants for your property, fast."),
         ("Rent Agreements", "Paperwork drafted and registered for you."),
         ("Property Management", "Maintenance and rent collection handled.")]),
    ("real_estate", "luxury"): ("Exceptional Homes, Discreet Service",
        "Curated luxury properties with private, personal attention.",
        [("Luxury Sales", "A hand-picked portfolio of premier homes."),
         ("Private Viewings", "Appointments arranged around your schedule."),
         ("Portfolio Advisory", "Long-term guidance for property portfolios.")]),
    ("local_service", "plumbing"): ("Fast, Reliable Plumbing",
        "Leaks fixed, bathrooms fitted, emergencies handled — same day.",
        [("Leak Detection & Repair", "Find and fix leaks before they spread."),
         ("Bathroom Fitting", "Complete fittings, neat finish, on schedule."),
         ("Emergency Callout", "Rapid response when it can't wait.")]),
    ("local_service", "electrician"): ("Trusted Electrical Work, Done Safely",
        "Wiring, repairs and installations by certified electricians.",
        [("House Wiring", "Safe, standards-compliant wiring and rewiring."),
         ("AC Installation & Repair", "Install, service and gas top-up."),
         ("Emergency Callout", "24/7 response for electrical faults.")]),
    ("local_service", "landscaping"): ("Beautiful Gardens, Year-Round",
        "Design, planting and care for outdoor spaces of every size.",
        [("Garden Design", "Layouts that fit your space and light."),
         ("Lawn Care", "Mowing, feeding and seasonal treatment."),
         ("Maintenance Plans", "Scheduled visits that keep it thriving.")]),
    ("local_service", "car_wash"): ("Showroom Shine, Every Time",
        "Professional wash and detailing that protects your paint.",
        [("Foam Wash", "Deep clean without a single swirl mark."),
         ("Ceramic Coating", "Months of gloss and protection."),
         ("Interior Detailing", "Seats, carpets and vents like new.")]),
    ("local_service", "cleaning_handyman"): ("A Cleaner Home, Without the Hassle",
        "Deep cleaning and small fixes by a team you can trust.",
        [("Deep Cleaning", "Kitchens and bathrooms, top to bottom."),
         ("Sofa & Carpet Care", "Shampooing that lifts years of use."),
         ("Handyman Jobs", "Mounting, fitting, fixing — done right.")]),
    ("local_service", "insurance_agent"): ("Cover That Fits Your Life",
        "Plain-language advice on health, life and vehicle insurance.",
        [("Health Insurance", "Plans compared across leading insurers."),
         ("Life Insurance", "Protection matched to your family's needs."),
         ("Claim Support", "Help with paperwork when it matters most.")]),
    ("retail", "gift_shop"): ("Gifts They'll Remember",
        "Curated gifts and hampers for every occasion.",
        [("Curated Hampers", "Ready-made and custom hampers."),
         ("Personalised Gifts", "Names, photos and messages added."),
         ("Same-Day Delivery", "Last-minute? We've got you.")]),
    ("retail", "print_shop"): ("Print That Means Business",
        "Cards, banners and stationery with crisp, fast turnaround.",
        [("Visiting Cards", "Premium stocks, same-week delivery."),
         ("Flex & Banners", "Any size, weather-ready inks."),
         ("Brand Stationery", "Letterheads, envelopes and more.")]),
    ("retail", "clothing"): ("Style for Every Day",
        "Fresh arrivals for men, women and kids — all under one roof.",
        [("Menswear", "Casuals to formals, all sizes."),
         ("Womenswear", "Daily wear to festive picks."),
         ("Kids Wear", "Comfortable, durable, adorable.")]),
    ("retail", "boutique"): ("Designed for You",
        "Custom tailoring and designer wear, made to measure.",
        [("Custom Tailoring", "Fits perfected over a fitting or two."),
         ("Bridal Couture", "Your day, your design."),
         ("Designer Wear", "Limited pieces you won't see twice.")]),
    ("retail", "handmade"): ("Made by Hand, Made with Love",
        "Original handcrafted pieces, each one slightly different.",
        [("Handcrafted Decor", "Pieces that make a house a home."),
         ("Custom Orders", "Tell us your idea; we'll craft it."),
         ("Gift Sets", "Ready-to-give, beautifully packed.")]),
    ("hospitality_travel", "cafe_restaurant"): ("Good Food, Warm Welcome",
        "Fresh plates, honest prices and a room that feels like home.",
        [("Signature Dishes", "House favourites, made fresh daily."),
         ("Fresh Bakes", "Breads and desserts from our oven."),
         ("Catering & Events", "Your event, our kitchen.")]),
    ("hospitality_travel", "travel_tourism"): ("Journeys Worth Taking",
        "Handcrafted trips, honest pricing, help at every step.",
        [("Holiday Packages", "Flights, stays and sights bundled."),
         ("Custom Itineraries", "Built around your pace and taste."),
         ("Visa Assistance", "Documents guided end to end.")]),
    ("health_education", "clinic_medical"): ("Care You Can Trust",
        "Experienced doctors, modern diagnostics, honest advice.",
        [("General Consultation", "Walk-in and appointment slots daily."),
         ("Diagnostics", "Lab work with same-day reports."),
         ("Preventive Checkups", "Annual packages for the family.")]),
    ("health_education", "fitness_gym"): ("Stronger Every Day",
        "Modern equipment, real coaching, a community that shows up.",
        [("Personal Training", "Programs built for your goals."),
         ("Group Classes", "Yoga, HIIT, Zumba and more."),
         ("Nutrition Plans", "Eat right without going hungry.")]),
    ("health_education", "education_coaching"): ("Learn. Practice. Succeed.",
        "Structured coaching with small batches and real attention.",
        [("Exam Coaching", "Syllabus covered, concepts cleared."),
         ("Doubt Sessions", "No question too small."),
         ("Mock Tests", "Exam-pattern practice with analysis.")]),
    ("professional", "agency_studio"): ("Ideas That Move Brands",
        "Strategy, campaigns and content that earn attention.",
        [("Brand Strategy", "Positioning that sets you apart."),
         ("Campaigns", "Launches planned and executed."),
         ("Content & Design", "Words and visuals in one voice.")]),
    ("professional", "saas_startup"): ("Software That Works for You",
        "One product, real outcomes, onboarding in days not months.",
        [("Product Demo", "See it working on your data."),
         ("Onboarding", "Guided setup with your team."),
         ("Support Plans", "Real humans, fast answers.")]),
    ("professional", "portfolio_freelancer"): ("Work That Speaks",
        "Selected projects and collaborations, available for hire.",
        [("Commissions", "Custom work to your brief."),
         ("Collaborations", "Studios and brands welcome."),
         ("Prints & Licensing", "Own a piece of the work.")]),
    (None, None): ("Welcome to Our Business",
        "Quality service, honest pricing and a team that cares.",
        [("Our Services", "Everything we do, done well."),
         ("Consultation", "Talk to us before you decide."),
         ("Support", "We're here after the job too.")]),
}

# Explicit FAQ overrides; everything else gets segment-specific auto copy from COPY keys.
FAQ_COPY = {
    ("local_service", "plumbing"): [
        ("Do you handle emergencies?", "Yes — same-day callouts for urgent leaks and burst pipes."),
        ("Are estimates free?", "Site visits for quotes are free within our service area."),
        ("Which areas do you cover?", "We cover the city and surrounding neighbourhoods."),
    ],
    ("local_service", "electrician"): [
        ("Are your electricians licensed?", "Yes — all work meets local safety standards."),
        ("Do you offer emergency callouts?", "24/7 response for power faults and safety issues."),
        ("Can you provide a written quote?", "Every job gets a clear estimate before work starts."),
    ],
    ("health_education", "clinic_medical"): [
        ("How do I book an appointment?", "Call us or walk in during clinic hours."),
        ("Do you accept insurance?", "We work with major insurers — bring your card on visit."),
        ("What are your hours?", "Mon–Sat, 9:00–20:00. Emergency line after hours."),
    ],
    ("hospitality_travel", "cafe_restaurant"): [
        ("Do you take reservations?", "Yes — call ahead or message us for groups."),
        ("Do you cater events?", "We cater office lunches and private gatherings."),
        ("What are your hours?", "Open daily — see contact section for today's hours."),
    ],
    ("real_estate", "broker"): [
        ("How do I list my property with you?", "Call or visit — we schedule a valuation within 48 hours."),
        ("Do you handle RERA registration and paperwork?", "Yes — agreements, compliance filings and escrow are managed by our desk."),
        ("Which areas and property types do you cover?", "Residential and commercial across the city and surrounding corridors."),
    ],
}

CONTACT_COPY = {
    ("local_service", "plumbing"): {
        "section_title": "Book a Plumber",
        "address": "Shop 12, Industrial Area, Your City",
        "hours": "Mon–Sat, 8:00–20:00 · Emergency line 24/7",
    },
    ("local_service", "electrician"): {
        "section_title": "Request an Electrician",
        "address": "Unit 4, Trade Park, Your City",
        "hours": "Mon–Sat, 9:00–19:00 · Emergency 24/7",
    },
    ("health_education", "clinic_medical"): {
        "section_title": "Visit or Call the Clinic",
        "address": "Ground Floor, Medical Plaza, Your City",
        "hours": "Mon–Sat, 9:00–20:00 · Sun by appointment",
    },
    ("hospitality_travel", "cafe_restaurant"): {
        "section_title": "Visit Us",
        "address": "Main Road, Your City",
        "hours": "Daily, 8:00–22:00",
    },
}

TEMPLATES_HTML_DIR = OUT.parent / "templates"
# all former backlog HTML is now promoted to depth-variant templates (see TEMPLATES); none left
BACKLOG_HTML = set()
HTML_FEEDSTOCK_TAXONOMY = {
    "agency": ("professional", "agency_studio", "clean_pro", 2),
    "cafe-3": ("hospitality_travel", "cafe_restaurant", "warm_craft", 2),
    "education-2": ("health_education", "education_coaching", "clean_pro", 2),
    "education-3": ("health_education", "education_coaching", "clean_pro", 2),
    "fitness-3": ("health_education", "fitness_gym", "bold_convert", 2),
    "generic-2": (None, None, "generic", 1),
    "generic-3": (None, None, "generic", 1),
    "medical-3": ("health_education", "clinic_medical", "clean_pro", 2),
    "portfolio-3": ("professional", "portfolio_freelancer", "warm_craft", 2),
    "saas-3": ("professional", "saas_startup", "fresh_retail", 2),
    "shop-3": ("retail", "clothing", "fresh_retail", 1),
    "travel": ("hospitality_travel", "travel_tourism", "premium_dark", 2),
    "travel-3": ("hospitality_travel", "travel_tourism", "premium_dark", 2),
}

# Reference pack styling — full section stack, example overrides on key blocks
ELECTRICIAN_V3_THEME = {
    "sectionOverrides": {
        "hero": {"bgColor": "#0F172A", "textColor": "#FFFFFF", "height": "tall", "align": "center", "padding": "spacious"},
        "services": {"padding": "spacious"},
        "why_us": {"padding": "normal"},
        "testimonials": {"padding": "normal"},
        "contact": {"padding": "spacious"},
        "cta_footer": {"padding": "compact"},
    },
    "elementOverrides": {
        "hero.cta_button": {"radius": "full", "size": "lg"},
        "cta_footer.cta_button": {"radius": "full", "size": "lg"},
    },
}


def _auto_faq_items(seg, sub):
    """Segment-specific FAQ when not explicitly overridden in FAQ_COPY."""
    if (seg, sub) in FAQ_COPY:
        return FAQ_COPY[(seg, sub)]
    if seg == "real_estate":
        if sub == "agent":
            return [
                ("How do I schedule a property viewing?", "Message or call — we confirm slots the same day when possible."),
                ("Do you help with home loans and documentation?", "We connect you with partner banks and guide paperwork end to end."),
                ("Which neighbourhoods do you specialise in?", "We focus on local pockets we know block by block."),
            ]
        if sub == "rental_consultant":
            return [
                ("How quickly can you find a tenant?", "Most listings get shortlisted tenants within two weeks."),
                ("Do you draft and register rent agreements?", "Yes — paperwork is prepared and registered for both parties."),
                ("Can you manage rent collection and maintenance?", "Full property management includes rent reminders and vendor coordination."),
            ]
        if sub == "luxury":
            return [
                ("Are viewings private and confidential?", "Yes — appointments are arranged discreetly around your schedule."),
                ("Do you work with NRI and overseas buyers?", "We handle virtual tours, legal review and closing remotely."),
                ("Which luxury segments do you cover?", "Premium apartments, villas and penthouses in select corridors."),
            ]
        return [
            ("How do I list my property with you?", "Call or visit — we schedule a valuation within 48 hours."),
            ("Do you handle RERA registration and paperwork?", "Yes — agreements, compliance filings and escrow are managed by our desk."),
            ("Which areas and property types do you cover?", "Residential and commercial across the city and surrounding corridors."),
        ]
    if seg == "local_service":
        return [
            ("Do you handle emergencies?", "Yes — same-day callouts when urgency demands it."),
            ("Are estimates free?", "Quotes are free within our service area."),
            ("Which areas do you cover?", "We cover the city and nearby neighbourhoods."),
        ]
    if seg == "retail":
        return [
            ("Do you offer home delivery?", "Yes — local delivery and pickup slots are available."),
            ("Can I return or exchange items?", "Unused items in original packaging can be exchanged within 7 days."),
            ("Do you take custom orders?", "Tell us what you need — we confirm availability and timing."),
        ]
    if seg == "hospitality_travel":
        if sub == "travel_tourism":
            return [
                ("Can you customise a trip itinerary?", "Yes — we build packages around your dates, budget and interests."),
                ("Do you handle visas and travel insurance?", "Visa guidance and insurance options are included in planning."),
                ("What is included in your package price?", "Flights, stays and listed activities — extras are quoted upfront."),
            ]
        return [
            ("Do you take reservations?", "Yes — call ahead or message us for groups."),
            ("Do you cater events?", "We cater office lunches and private gatherings."),
            ("What are your hours?", "Open daily — see contact section for today's hours."),
        ]
    if seg == "health_education":
        if sub == "fitness_gym":
            return [
                ("Do you offer trial sessions?", "Yes — one complimentary session before you choose a plan."),
                ("Can I freeze my membership?", "Memberships can be paused once per term with prior notice."),
                ("Do you provide diet guidance?", "Nutrition plans are included with personal training packages."),
            ]
        if sub == "education_coaching":
            return [
                ("How do I enrol in a batch?", "Call or visit — we place you by level after a short assessment."),
                ("Are study materials included?", "Yes — notes, practice sets and mock tests are part of the programme."),
                ("Do you offer one-on-one tutoring?", "Individual slots are available outside regular batch hours."),
            ]
        return [
            ("How do I book an appointment?", "Call us or walk in during clinic hours."),
            ("Do you accept insurance?", "We work with major insurers — bring your card on visit."),
            ("What are your hours?", "Mon–Sat, 9:00–20:00. Emergency line after hours."),
        ]
    if seg == "professional":
        if sub == "saas_startup":
            return [
                ("Is there a free trial?", "Yes — start free and upgrade when your team is ready."),
                ("How long does onboarding take?", "Most teams connect their first repo in under an hour."),
                ("Do you offer annual billing?", "Annual plans include two months free — ask on signup."),
            ]
        if sub == "portfolio_freelancer":
            return [
                ("Are you available for new commissions?", "Yes — share your brief and timeline for availability."),
                ("Do you license work for commercial use?", "Usage terms are agreed in writing before delivery."),
                ("What is your typical turnaround?", "Most commissions are delivered within 2–4 weeks."),
            ]
        return [
            ("How does the first consultation work?", "A 45-minute call to understand scope — no obligation."),
            ("Do you work on fixed-fee engagements?", "Every project starts with a written scope and fee."),
            ("Which industries do you serve?", "We work with founders, family businesses and regional brands."),
        ]
    return [
        ("How do I get started?", "Call or message us with a few details — we reply the same day."),
        ("Which areas do you serve?", "We serve the whole city and nearby areas."),
        ("Do you stand behind your work?", "Yes — if something isn't right, we make it right."),
    ]


def _auto_contact_overrides(seg, sub):
    """Segment-specific contact fields when not in CONTACT_COPY."""
    if (seg, sub) in CONTACT_COPY:
        return dict(CONTACT_COPY[(seg, sub)])
    titles = {
        "real_estate": "Schedule a Consultation",
        "local_service": "Book a Service Call",
        "retail": "Visit the Store",
        "hospitality_travel": "Visit Us",
        "health_education": "Visit or Call",
        "professional": "Get in Touch",
    }
    addresses = {
        "real_estate": "Office 204, Business District, Your City",
        "local_service": "Shop 12, Industrial Area, Your City",
        "retail": "High Street, Your City",
        "hospitality_travel": "Main Road, Your City",
        "health_education": "Ground Floor, Medical Plaza, Your City",
        "professional": "Level 4, City Centre, Your City",
    }
    hours = {
        "real_estate": "Mon–Sat, 10:00–19:00 · Sun by appointment",
        "local_service": "Mon–Sat, 8:00–20:00 · Emergency line 24/7",
        "retail": "Daily, 10:00–21:00",
        "hospitality_travel": "Daily, 8:00–22:00",
        "health_education": "Mon–Sat, 9:00–20:00 · Sun by appointment",
        "professional": "Mon–Fri, 9:00–18:00 · By appointment",
    }
    return {
        "section_title": titles.get(seg, "Contact Us"),
        "address": addresses.get(seg, "Your address here"),
        "hours": hours.get(seg, "Mon–Sat, 9:00–19:00"),
    }


def _pricing_title(seg, sub):
    explicit = {
        ("real_estate", "broker"): "Brokerage Services & Fees",
        ("real_estate", "agent"): "Agent Services & Fees",
        ("real_estate", "rental_consultant"): "Rental & Management Plans",
        ("real_estate", "luxury"): "Luxury Advisory Packages",
        ("local_service", "plumbing"): "Plumbing Service Packages",
        ("local_service", "electrician"): "Electrical Service Packages",
        ("local_service", "car_wash"): "Wash & Detailing Packages",
        ("local_service", "insurance_agent"): "Insurance Plans",
        ("retail", "gift_shop"): "Gift Collections & Pricing",
        ("retail", "clothing"): "Collections & Pricing",
        ("retail", "boutique"): "Bespoke Services & Pricing",
        ("hospitality_travel", "cafe_restaurant"): "Menu Highlights & Catering",
        ("hospitality_travel", "travel_tourism"): "Trip Packages",
        ("health_education", "clinic_medical"): "Consultation & Care Plans",
        ("health_education", "fitness_gym"): "Membership Plans",
        ("health_education", "education_coaching"): "Programmes & Fees",
        ("professional", "agency_studio"): "Engagement Options",
        ("professional", "saas_startup"): "Plans & Pricing",
        ("professional", "portfolio_freelancer"): "Commission Packages",
    }
    if (seg, sub) in explicit:
        return explicit[(seg, sub)]
    by_segment = {
        "real_estate": "Property Services & Pricing",
        "local_service": "Service Packages",
        "retail": "Products & Pricing",
        "hospitality_travel": "Packages & Pricing",
        "health_education": "Services & Plans",
        "professional": "Engagement Options",
    }
    return by_segment.get(seg, "Service Packages")


def _faq_block(seg, sub):
    items = _auto_faq_items(seg, sub)
    return {"section_title": "Common Questions", "items": [{"q": q, "a": a} for q, a in items]}


def _contact_block(seg, sub, brand):
    base = {
        "section_title": "Contact Us",
        "address": "Your address here",
        "phone": "+91 00000 00000",
        "email": "hello@example.com",
        "hours": "Mon–Sat, 9:00–19:00",
    }
    base.update(_auto_contact_overrides(seg, sub))
    slug = brand.lower().replace(" ", "").replace("&", "")[:18] or "hello"
    base["email"] = f"hello@{slug}.example"
    return base


def _pricing_block(seg, sub, services):
    return {
        "section_title": _pricing_title(seg, sub),
        "items": [
            {
                "name": title,
                "price": "Quote on request",
                "features": [desc, "Clear estimate before work starts"],
            }
            for title, desc in services[:3]
        ],
    }


def default_content(seg, sub, name):
    head, subtext, services = COPY.get((seg, sub), COPY[(None, None)])
    hero_id, about_id = IMAGES.get((seg, sub), IMAGES[(None, None)])
    brand = BRAND_NAMES.get((seg, sub), BRAND_NAMES[(None, None)])
    biz = brand
    return {
        "hero": {"headline": head, "subtext": subtext, "cta_text": "Get in Touch",
                 "image": _img(hero_id)},
        "services": {"section_title": "What We Do",
                     "items": [{"title": t, "desc": d} for t, d in services]},
        "about": {"section_title": f"About {brand}",
                  "body": f"{biz} is a local business built on quality work and word-of-mouth. "
                          "We keep it simple: show up on time, do it properly, charge fairly. "
                          "Most of our customers come back — and bring their friends.",
                  "image": _img(about_id, 900)},
        "why_us": {"section_title": "Why Choose Us",
                   "points": ["Experienced, verified team", "Transparent pricing — no surprises",
                              "On-time, every time"]},
        "gallery": {"section_title": "Our Work",
                    "items": [{"caption": "Recent work", "image": _img(hero_id, 800)},
                              {"caption": "On the job", "image": _img(about_id, 800)},
                              {"caption": "Happy customers", "image": _img(hero_id, 640)}]},
        "testimonials": {"section_title": "What Customers Say",
                         "items": [{"name": "R. Sharma", "quote": "Professional from start to finish. "
                                    "Exactly what was promised, when it was promised."},
                                   {"name": "A. Fernandes", "quote": "Fair price, quality work. "
                                    "Already recommended them twice."}]},
        "pricing": _pricing_block(seg, sub, services),
        "faq": _faq_block(seg, sub),
        "contact": _contact_block(seg, sub, brand),
        "cta_footer": {"headline": "Ready to get started?", "cta_text": "Contact Us"},
        "seo": {"title": f"{brand} — {name or 'Local Business'}",
                "description": subtext},
    }


def default_theme(fam, *, template_id=None):
    t = FAMILY_THEMES[fam]
    theme = {
        "brand": {"logo_url": None, "logo_dark_url": None, "favicon_url": None,
                  "palette_from_logo": [], "primary": t["primary"], "accent": t["accent"],
                  "neutral": t["neutral"], "bg": t["bg"], "surface": t["surface"]},
        "fontPair": t["fontPair"],
        "palettePreset": t["palettePreset"],
        "sectionOverrides": {},
        "elementOverrides": {},
        "sectionOrder": list(SECTION_STANDARD["default_order"]),
        "hiddenSections": [],
    }
    if template_id == "electrician_v3":
        theme["sectionOverrides"] = ELECTRICIAN_V3_THEME["sectionOverrides"]
        theme["elementOverrides"] = ELECTRICIAN_V3_THEME["elementOverrides"]
    return theme


def _extract_html_source(src):
    if not src:
        return None
    m = re.search(r"([\w-]+\.html)", src)
    return m.group(1).replace(".html", "") if m else None


def _primary_html_source(src):
    """Direct conversion source only — not layout/imagery refs."""
    if not src or "ref:" in src:
        return None
    m = re.match(r"^([\w-]+)\.html", src.strip())
    return m.group(1) if m else None


def _html_display_name(slug, seg, sub, subcat_names, linked_tid):
    if linked_tid:
        return BRAND_NAMES.get((seg, sub), BRAND_NAMES[(None, None)])
    label = subcat_names.get((seg, sub), slug.replace("-", " ").title())
    return f"{label} ({slug})"


def build_html_templates(subcat_names):
    """Registry for all HTML files in backend/studio/templates/."""
    html_to_tid = {}
    html_taxonomy = {}
    for tid, seg, sub, fam, _intents, _status, src, wave in TEMPLATES:
        slug = _primary_html_source(src)
        if slug:
            html_to_tid[slug] = tid
            html_taxonomy[slug] = (seg, sub, fam, wave)

    entries = []
    for path in sorted(TEMPLATES_HTML_DIR.glob("*.html")):
        slug = path.stem
        linked_tid = html_to_tid.get(slug)
        if slug in html_taxonomy:
            seg, sub, fam, wave = html_taxonomy[slug]
        elif slug in HTML_FEEDSTOCK_TAXONOMY:
            seg, sub, fam, wave = HTML_FEEDSTOCK_TAXONOMY[slug]
        else:
            seg, sub, fam, wave = None, None, "generic", 1

        if slug in BACKLOG_HTML:
            html_status = "feedstock"
        elif linked_tid:
            html_status = "variant" if re.search(r"-\d+$", slug) else "source"
        else:
            html_status = "feedstock"

        entry = {
            "slug": slug,
            "displayName": _html_display_name(slug, seg, sub, subcat_names, linked_tid),
            "segment": seg,
            "segmentLabel": SEGMENTS.get(seg) if seg else "Generic",
            "subcategory": sub,
            "subcategoryLabel": subcat_names.get(
                (seg, sub), sub.replace("_", " ").title() if sub else "Fallback"),
            "family": fam,
            "familyLabel": FAMILY_LABELS.get(fam, fam),
            "wave": wave,
            "status": html_status,
        }
        if linked_tid:
            entry["linked_template_id"] = linked_tid
        entries.append(entry)
    return {"version": 1, "templates": entries}


def registry_doc(tid, seg, sub, fam, intents, status, src, wave, subcat_names):
    brand = BRAND_NAMES.get((seg, sub), BRAND_NAMES[(None, None)])
    return {
        "id": tid,
        "displayName": brand,
        "segment": seg,
        "segmentLabel": SEGMENTS.get(seg) if seg else "Generic",
        "subcategory": sub,
        "subcategoryLabel": subcat_names.get((seg, sub), sub.replace("_", " ").title() if sub else "Fallback"),
        "family": fam,
        "familyLabel": FAMILY_LABELS.get(fam, fam),
        "style_tags": [fam],
        **({"intents": intents} if intents else {}),
        "version": 1,
        "status": status,
        **({"source": src} if src else {}),
        "wave": wave,
        "preview_desktop_url": None,
        "preview_mobile_url": None,
    }


def main():
    subcat_names = {(s, sc): n for s, sc, n, *_ in SUBCATS}

    # rule 7.2: keyword sets disjoint across siblings within a segment
    for seg in SEGMENTS:
        seen = {}
        for s, sub, _, _, _, kws in SUBCATS:
            if s != seg:
                continue
            for kw in kws:
                assert kw not in seen, f"keyword '{kw}' duplicated in {seg}: {seen.get(kw)} vs {sub}"
                seen[kw] = sub

    # rule 7.3: template ids resolve to known taxonomy nodes
    ids = [t[0] for t in TEMPLATES]
    assert len(ids) == len(set(ids)), f"duplicate template id: {[i for i in ids if ids.count(i) > 1]}"
    for tid, seg, sub, fam, *_ in TEMPLATES:
        assert fam in FAMILY_THEMES, tid
        if seg:
            assert seg in SEGMENTS, tid
            assert (seg, sub) in subcat_names, f"{tid}: unknown subcat {sub}"

    # every source .html is consumed by exactly one template (all 33 used, none twice)
    html_files = {p.stem for p in TEMPLATES_HTML_DIR.glob("*.html")}
    consumed = [_primary_html_source(t[6]) for t in TEMPLATES if _primary_html_source(t[6])]
    assert len(consumed) == len(set(consumed)), \
        f"an HTML file feeds two templates: {[c for c in consumed if consumed.count(c) > 1]}"
    missed = html_files - set(consumed)
    assert not missed, f"HTML with no package: {sorted(missed)}"

    # ---- backend catalog ----
    OUT.joinpath("categories").mkdir(parents=True, exist_ok=True)
    (OUT / "section-standard.json").write_text(
        json.dumps(SECTION_STANDARD, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest = {
        "version": 1,
        "source_of_truth": "docs/superpowers/specs/2026-07-21-category-taxonomy.md",
        "authoring_contract": "docs/superpowers/examples/ (electrician_v3) + section-standard.json",
        "templates": [
            {"id": tid, "segment": seg, "subcategory": sub, "family": fam,
             **({"intents": intents} if intents else {}),
             "status": status, **({"source": src} if src else {}), "wave": wave}
            for tid, seg, sub, fam, intents, status, src, wave in TEMPLATES
        ],
        "backlog_html": sorted(f"{s}.html" for s in BACKLOG_HTML),
    }
    (OUT / "templates.manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    html_registry = build_html_templates(subcat_names)
    (OUT / "html_templates.json").write_text(
        json.dumps(html_registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    count = 0
    for seg, sub, name, fam, wave, kws in SUBCATS:
        own = [t[0] for t in TEMPLATES if t[1] == seg and t[2] == sub]
        sibs = [t[0] for t in TEMPLATES
                if t[1] == seg and t[2] != sub and t[3] == fam and t[5] != "example"]
        rank = own + sibs + ["gn_generic_v1"]
        intents = sorted({i for t in TEMPLATES if t[1] == seg and t[2] == sub for i in t[4]})
        cfg = {
            "id": f"{seg}_{sub}",
            "name": f"{SEGMENTS[seg]} — {name}",
            "category": seg,
            "subcategory": sub,
            "wave": wave,
            "status": "active" if wave == 1 else "planned",
            "default_family": fam,
            "keywords": kws,
            **({"intents": intents} if intents else {}),
            "matcher": {"eligible_template_ids": rank, "default_rank_order": rank},
            "image_pack_refs": [f"pack_{sub}_v1"],
            "moderation": {"blocked": False, "notes": "Standard business — allowed"},
        }
        d = OUT / "categories" / f"{seg}_{sub}"
        d.mkdir(parents=True, exist_ok=True)
        (d / "category.config.json").write_text(
            json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        count += 1
    assert count == 23, count

    # ---- frontend template packages ----
    FRONT_OUT.mkdir(parents=True, exist_ok=True)
    index_lines = ["// GENERATED by backend/studio/catalog/_generate.py — do not edit by hand.",
                   "// One package per template: uniform section_schema + per-sub-cat content + per-family theme.",
                   ""]
    entries = []
    for tid, seg, sub, fam, intents, status, src, wave in TEMPLATES:
        d = FRONT_OUT / tid
        d.mkdir(parents=True, exist_ok=True)
        schema = {"template_id": tid, "template_version": 1, **SECTION_SCHEMA}
        name = subcat_names.get((seg, sub))
        registry = registry_doc(tid, seg, sub, fam, intents, status, src, wave, subcat_names)
        content = default_content(seg, sub, name)
        theme = default_theme(fam, template_id=tid)
        # overlay real content extracted from the source HTML (hero, services, palette)
        slug = _primary_html_source(src)
        ex = _html_extract.extract(slug) if slug else {}
        for sec, fields in ex.get("content", {}).items():
            content.setdefault(sec, {}).update(fields)
        if "hero" in ex.get("content", {}) and content["hero"].get("subtext"):
            content["seo"]["description"] = content["hero"]["subtext"]
        if ex.get("brand"):
            theme["brand"].update(ex["brand"])
        # every service card needs an image — the "cards" layout features items[0] large,
        # so a missing image renders an empty panel. Rotate the sub-cat's catalog images.
        svc_imgs = [_img(pid, 800) for pid in IMAGES.get((seg, sub), IMAGES[(None, None)])]
        for i, it in enumerate(content.get("services", {}).get("items", [])):
            it.setdefault("image", svc_imgs[i % len(svc_imgs)])
        files = {"section_schema.json": schema,
                 "default_content.json": content,
                 "default_theme.json": theme,
                 "registry.json": registry}
        for fn, data in files.items():
            (d / fn).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        var = tid
        index_lines += [
            f'import {var}_schema from "./{tid}/section_schema.json";',
            f'import {var}_content from "./{tid}/default_content.json";',
            f'import {var}_theme from "./{tid}/default_theme.json";',
            f'import {var}_registry from "./{tid}/registry.json";',
        ]
        entries.append(tid)

    index_lines += ["", "export const PACKAGES = {"]
    for tid in entries:
        index_lines.append(
            f'  {tid}: {{ schema: {tid}_schema, content: {tid}_content, '
            f'theme: {tid}_theme, registry: {tid}_registry }},')
    index_lines += ["} as const;", "",
                    "export type TemplateId = keyof typeof PACKAGES;", ""]
    (FRONT_OUT / "index.ts").write_text("\n".join(index_lines), encoding="utf-8")

    print(f"OK: {count} category configs, {len(TEMPLATES)} template packages, "
          f"{len(html_registry['templates'])} html templates -> "
          f"{OUT.name}/ + {FRONT_OUT}")


if __name__ == "__main__":
    main()
