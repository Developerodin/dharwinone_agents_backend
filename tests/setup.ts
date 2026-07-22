process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "test-secret-for-vitest-only";
process.env.STUDIO_S3_MOCK = "true";

import { beforeEach } from "vitest";
import { resetForTests as resetRateLimit } from "@/server/rateLimit";
import { resetOutboxForTests } from "@/server/services/emailService";

beforeEach(() => {
  resetRateLimit();
  resetOutboxForTests();
});
