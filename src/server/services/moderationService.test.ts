// @vitest-environment node
import { describe, expect, it } from "vitest";
import { moderateBusinessProfile } from "./moderationService";

describe("moderationService", () => {
  it("allows normal local service profiles via stub", async () => {
    const result = await moderateBusinessProfile({
      business_name: "Sharma Electricals",
      category: "local_service",
      city: "Kolkata",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks prohibited categories via rules", async () => {
    const result = await moderateBusinessProfile({
      business_name: "Bad Biz",
      category: "gambling",
    });
    expect(result.allowed).toBe(false);
    expect(result.source).toBe("rules");
  });
});
