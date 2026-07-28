import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { describe, expect, it } from "vitest";

const renderDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(renderDir, "../..");

describe("site preview CSS pipeline", () => {
  it("emits tailwind utilities and theme tokens used by site preview sections", async () => {
    const css = readFileSync(path.join(appDir, "globals.css"), "utf8");
    const result = await postcss([tailwind()]).process(css, {
      from: path.join(appDir, "globals.css"),
    });

    expect(result.css).toContain(".grid");
    expect(result.css).toContain(".px-6");
    expect(result.css).toContain(".sticky");
    expect(result.css).toContain(".bg-background");
    expect(result.css).toContain('[data-family="warm"]');
  });
});
