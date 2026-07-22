/** Business profile fact extraction for generation services (port of profile_facts.py). */

export function businessFacts(profile: Record<string, unknown>): string {
  const business = (profile.business as Record<string, unknown> | undefined) ?? {};
  const facts: string[] = [];
  if (business.type) facts.push(`- Business type: ${business.type}`);
  if (business.description) facts.push(`- Description: ${business.description}`);
  if (Array.isArray(business.services) && business.services.length) {
    facts.push(`- Services: ${business.services.slice(0, 6).join(", ")}`);
  }
  if (business.targetAudience) facts.push(`- Target audience: ${business.targetAudience}`);
  return facts.join("\n");
}
