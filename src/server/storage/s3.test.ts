// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPresignedPut } from "./s3";
import { resetForTests } from "../config";

const KEY = "projects/p1/assets/a1/photo.png";

describe("createPresignedPut", () => {
  beforeEach(() => resetForTests());
  afterEach(() => {
    delete process.env.STUDIO_S3_MOCK;
    delete process.env.STUDIO_S3_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    resetForTests();
  });

  it("returns a mock URL when S3 mock is on", async () => {
    process.env.STUDIO_S3_MOCK = "1";
    resetForTests();
    const signed = await createPresignedPut(KEY, "image/png");
    expect(signed.url).toMatch(/^mock\+s3:\/\//);
    expect(signed.method).toBe("PUT");
    expect(signed.headers["Content-Type"]).toBe("image/png");
  });

  it("returns a real SigV4-signed PUT URL when creds are configured", async () => {
    // Mock off (creds present) — offline signing, no network call.
    delete process.env.STUDIO_S3_MOCK;
    process.env.STUDIO_S3_BUCKET = "vsc-files-storage";
    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "secretexample";
    process.env.AWS_REGION = "ap-south-1";
    resetForTests();
    const signed = await createPresignedPut(KEY, "image/png");
    expect(signed.url).toContain("vsc-files-storage");
    expect(signed.url).toContain("photo.png");
    expect(signed.url).toMatch(/X-Amz-Signature=/);
    expect(signed.url).toMatch(/X-Amz-Credential=/);
    expect(signed.method).toBe("PUT");
  });
});
