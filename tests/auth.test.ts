import { describe, expect, it } from "vitest";
import * as authService from "@/server/services/authService";
import * as rateLimit from "@/server/rateLimit";
import { hashPassword, verifyPassword, issueJwt, verifyJwt } from "@/server/securityNode";
import { verifyJwt as verifyJwtEdge } from "@/server/security";

describe("authService validation", () => {
  it("rejects weak passwords on register", async () => {
    await expect(authService.register("Jane", "jane@example.com", "short1")).rejects.toMatchObject({
      status: 422,
    });
  });

  it("rejects invalid email on register", async () => {
    await expect(authService.register("Jane", "not-an-email", "hunter2abc")).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("security", () => {
  it("hashes and verifies passwords", () => {
    const [hash, salt] = hashPassword("hunter2abc");
    expect(verifyPassword("hunter2abc", hash, salt)).toBe(true);
    expect(verifyPassword("wrongpass1", hash, salt)).toBe(false);
  });

  it("issues and verifies jwt", async () => {
    const token = await issueJwt("usr-test123");
    await expect(verifyJwtEdge(token)).resolves.toBe("usr-test123");
  });
});

describe("rateLimit", () => {
  it("blocks after limit exceeded", () => {
    const key = "login:email:test@example.com";
    expect(rateLimit.allow(key, 2, 900)).toBe(true);
    expect(rateLimit.allow(key, 2, 900)).toBe(true);
    expect(rateLimit.allow(key, 2, 900)).toBe(false);
    expect(rateLimit.retryAfter(key, 900)).toBeGreaterThan(0);
  });
});

describe("auth route shapes", () => {
  it("login blocked response uses unverified code shape", () => {
    const err = new authService.AuthError(403, {
      code: "unverified",
      message: "verify your email before signing in",
    });
    expect(err.detail).toEqual({
      code: "unverified",
      message: "verify your email before signing in",
    });
  });
});
