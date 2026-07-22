// @vitest-environment node
import { describe, expect, it } from "vitest";
import { guardSync, lintAccept, pathViolations, PROTECTED } from "./guard";

describe("harness.guard", () => {
  it("lintAccept rejects watch-mode commands", () => {
    expect(lintAccept("npm test")).toBe(true);
    expect(lintAccept("npm run dev")).toBe(false);
  });

  it("pathViolations catches protected paths", () => {
    const bad = pathViolations(["backend/harness/foo.py", "src/a.ts"], ["src/"]);
    expect(bad).toContain("backend/harness/foo.py");
    expect(PROTECTED.length).toBeGreaterThan(0);
  });

  it("resolves chat accept_template into argv", () => {
    const task: Record<string, unknown> = {
      id: "t1",
      source: "chat",
      category: "feature",
      title: "t",
      prompt: "p",
      allow_paths: ["src/"],
      accept_template: "default",
      accept_args: [],
    };
    const cfg = { accept_templates: { default: ["python", "-c", "import sys; sys.exit(0)"] }, limits: { min_disk_gb: 1 } };
    const v = guardSync(task, cfg, 100);
    expect(v).toEqual([]);
    expect(Array.isArray(task.accept)).toBe(true);
  });
});
