/** Extract/replace inner HTML for data-section marked component roots. */

const SECTION_OPEN_RE =
  /<(\w+)([^>]*\bdata-section="([^"]+)"[^>]*)>/gi;

function tagRe(tag: string): RegExp {
  return new RegExp(`<(/?)${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^>]*>`, "gi");
}

type SectionSpan = [string, number, number, number, number];

function sections(html: string): SectionSpan[] {
  const out: SectionSpan[] = [];
  for (const m of html.matchAll(SECTION_OPEN_RE)) {
    const tag = m[1]!;
    const type = m[3]!;
    const re = tagRe(tag);
    re.lastIndex = m.index! + m[0].length;
    let depth = 1;
    for (const t of html.matchAll(re)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        out.push([type, m.index!, m.index! + m[0].length, t.index!, t.index! + t[0].length]);
        break;
      }
    }
  }
  return out;
}

export function extractSectionInner(html: string, sectionType: string): string | null {
  for (const [type, , innerStart, innerEnd] of sections(html)) {
    if (type === sectionType) return html.slice(innerStart, innerEnd);
  }
  return null;
}

export function replaceSectionInner(html: string, sectionType: string, newInner: string): string {
  const clean = newInner.replace(/^```(?:html|htm|xml|json)?\s*|\s*```$/gim, "");
  for (const [type, , innerStart, innerEnd] of sections(html)) {
    if (type === sectionType) return html.slice(0, innerStart) + clean + html.slice(innerEnd);
  }
  return html;
}
