import { describe, it, expect } from "vitest";
import catalog from "./templatesCatalog.json";
import {
  BESPOKE_TEMPLATE_IDS,
  enabledBespokeTemplateIds,
} from "./bespokeTemplateMapping";
import {
  listActiveTemplates,
  getTemplate,
  TEMPLATE_REGISTRY,
} from "./templateRegistry";
import { FAMILIES } from "@/app/sites/_render/families";
import { familyFromTemplateId } from "@/app/sites/_render/utils";

const catalogIds = (catalog.templates as { id: string }[]).map((t) => t.id);
const validFamilies = new Set(Object.keys(FAMILIES));

describe("catalog wired into template registry", () => {
  it("lists only bespoke launch templates as active for matching", () => {
    const active = new Set(listActiveTemplates().map((t) => t.id));
    expect(active.size).toBe(enabledBespokeTemplateIds().length);
    for (const id of enabledBespokeTemplateIds()) {
      expect(active.has(id)).toBe(true);
    }
    expect(active.has("he_dental_v1")).toBe(false);
    expect(active.has("electrician_v3")).toBe(false);
    expect(active.has("ls_electrician_v1")).toBe(false);
    expect(active.has("pf_saas_v1")).toBe(false);
  });

  it("every enabled bespoke catalog template is registered and active", () => {
    for (const id of enabledBespokeTemplateIds()) {
      const entry = getTemplate(id);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe("active");
    }
  });

  it("generic catalog templates are not returned by getTemplate", () => {
    expect(getTemplate("ls_electrician_v1")).toBeUndefined();
    expect(getTemplate("ht_cafe_v1")).toBeUndefined();
  });

  it("temporarily disabled bespoke templates stay registered for existing sites", () => {
    expect(getTemplate("he_dental_v1")).toBeDefined();
    expect(listActiveTemplates().some((t) => t.id === "he_dental_v1")).toBe(false);
  });

  it("every enabled bespoke catalog template resolves to a real render family", () => {
    for (const id of enabledBespokeTemplateIds()) {
      expect(validFamilies.has(familyFromTemplateId(id))).toBe(true);
    }
  });

  it("style_tags[0] of each bespoke catalog entry is its declared family", () => {
    const bespokeEntries = (catalog.templates as { id: string; family: string }[]).filter((t) =>
      BESPOKE_TEMPLATE_IDS.includes(t.id as (typeof BESPOKE_TEMPLATE_IDS)[number]),
    );
    for (const t of bespokeEntries) {
      expect(getTemplate(t.id)?.style_tags[0]).toBe(t.family);
    }
  });

  it("registry no longer includes orphan plumber_v1 launch row", () => {
    expect(TEMPLATE_REGISTRY.some((t) => t.id === "plumber_v1")).toBe(false);
  });

  it("full catalog remains registered for reference but inactive generic ids exist in registry", () => {
    for (const id of catalogIds) {
      expect(TEMPLATE_REGISTRY.some((t) => t.id === id)).toBe(true);
    }
  });
});
