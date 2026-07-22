import { describe, expect, it } from "vitest";
import { effectiveRole, requireAction } from "@/server/policy";

describe("builder policy", () => {
  it("treats legacy local-user projects as owned by authenticated users", () => {
    const project = { ownerUserId: "local-user", visibility: "private", collaborators: [] };
    expect(effectiveRole(project, "usr-admin")).toBe("owner");
    expect(() => requireAction(project, "usr-admin", "delete")).not.toThrow();
  });

  it("denies delete for non-owner collaborators with viewer role", () => {
    const project = {
      ownerUserId: "usr-owner",
      visibility: "private",
      collaborators: [{ userId: "usr-viewer", role: "viewer" }],
    };
    expect(effectiveRole(project, "usr-viewer")).toBe("viewer");
    expect(() => requireAction(project, "usr-viewer", "delete")).toThrow();
  });
});
