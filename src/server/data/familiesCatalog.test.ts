// @vitest-environment node
import { describe, expect, it } from "vitest";
import familiesCatalog from "./familiesCatalog.json";
import { FAMILIES } from "../../app/sites/_render/families";

describe("familiesCatalog", () => {
  it("defines 18 shared UI families", () => {
    expect(familiesCatalog.families).toHaveLength(18);
  });

  it("stays in sync with render tokens", () => {
    for (const row of familiesCatalog.families) {
      const tokens = FAMILIES[row.id as keyof typeof FAMILIES];
      expect(tokens?.name).toBe(row.name);
      expect(tokens?.definition).toBe(row.definition);
      expect(tokens?.surfaceStyle).toBe(row.surfaceStyle);
    }
  });
});
