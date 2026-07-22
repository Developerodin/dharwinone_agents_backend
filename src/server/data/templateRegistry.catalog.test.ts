import { describe, it, expect } from "vitest";
import catalog from "./templatesCatalog.json";
import { listActiveTemplates, getTemplate } from "./templateRegistry";
import { FAMILIES } from "@/app/sites/_render/families";
import { familyFromTemplateId } from "@/app/sites/_render/utils";

const catalogIds = (catalog.templates as { id: string }[]).map((t) => t.id);
const validFamilies = new Set(Object.keys(FAMILIES));

describe("catalog wired into template registry", () => {
  it("every catalog template is active in the registry", () => {
    const active = new Set(listActiveTemplates().map((t) => t.id));
    for (const id of catalogIds) expect(active.has(id)).toBe(true);
  });

  it("every catalog template resolves to a real render family", () => {
    for (const id of catalogIds) {
      expect(validFamilies.has(familyFromTemplateId(id))).toBe(true);
    }
  });

  it("style_tags[0] of each catalog entry is its declared family", () => {
    for (const t of catalog.templates as { id: string; family: string }[]) {
      expect(getTemplate(t.id)?.style_tags[0]).toBe(t.family);
    }
  });
});
