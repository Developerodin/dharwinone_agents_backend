"""Business profile fact extraction for generation services."""


def business_facts(profile):
    business = profile.get("business") or {}
    facts = []
    if business.get("type"):
        facts.append(f"- Business type: {business['type']}")
    if business.get("description"):
        facts.append(f"- Description: {business['description']}")
    if business.get("services"):
        facts.append(f"- Services: {', '.join(business['services'][:6])}")
    if business.get("targetAudience"):
        facts.append(f"- Target audience: {business['targetAudience']}")
    return "\n".join(facts)
