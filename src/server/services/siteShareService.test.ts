import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildShareUrl,
  mintShareToken,
  parseShareToken,
} from "@/server/services/siteShareService";

describe("siteShareService", () => {
  const prev = process.env.AUTH_JWT_SECRET;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-share-secret";
  });

  afterEach(() => {
    process.env.AUTH_JWT_SECRET = prev;
  });

  it("mints and verifies a share token", () => {
    const token = mintShareToken("site-abc");
    expect(parseShareToken(token)).toBe("site-abc");
  });

  it("rejects tampered tokens", () => {
    const token = mintShareToken("site-abc");
    expect(parseShareToken(token.replace("site-abc", "site-evil"))).toBeNull();
    expect(parseShareToken(`${token}x`)).toBeNull();
    expect(parseShareToken("noperiod")).toBeNull();
  });

  it("builds a public share URL on the app host", () => {
    const url = buildShareUrl("site-1", "http://localhost:3000/");
    expect(url.startsWith("http://localhost:3000/sites/preview/share/")).toBe(
      true,
    );
    const token = decodeURIComponent(url.split("/").pop()!);
    expect(parseShareToken(token)).toBe("site-1");
  });
});
