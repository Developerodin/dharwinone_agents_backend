// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { creditPurchase, verifyRazorpaySignature } from "./services/paymentService";
import * as tokenRepo from "./repos/tokenTransactionsRepo";

vi.mock("./repos/tokenTransactionsRepo", () => ({
  findByIdempotencyKey: vi.fn(),
  atomicCredit: vi.fn(),
  createCommittedCredit: vi.fn(),
}));

describe("verifyRazorpaySignature", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "test-secret";
  });

  it("validates HMAC signature", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyRazorpaySignature(body, sig)).toBe(true);
    expect(verifyRazorpaySignature(body, "bad")).toBe(false);
  });
});

describe("creditPurchase idempotency", () => {
  beforeEach(() => {
    vi.mocked(tokenRepo.findByIdempotencyKey).mockReset();
    vi.mocked(tokenRepo.atomicCredit).mockReset();
    vi.mocked(tokenRepo.createCommittedCredit).mockReset();
  });

  it("credits once and dedupes duplicate payment ids", async () => {
    vi.mocked(tokenRepo.findByIdempotencyKey).mockResolvedValueOnce(null).mockResolvedValueOnce({
      transactionId: "tx-existing",
      userId: "u1",
      tokens: 100,
      status: "committed",
    } as never);
    vi.mocked(tokenRepo.createCommittedCredit).mockResolvedValue({
      transactionId: "tx-new",
      userId: "u1",
      tokens: 100,
      status: "committed",
    } as never);

    const first = await creditPurchase({ userId: "u1", packId: "starter", paymentId: "pay_123" });
    const second = await creditPurchase({ userId: "u1", packId: "starter", paymentId: "pay_123" });

    expect(first.credited).toBe(true);
    expect(first.tokens).toBe(100);
    expect(second.credited).toBe(false);
    expect(tokenRepo.atomicCredit).toHaveBeenCalledTimes(1);
    expect(tokenRepo.createCommittedCredit).toHaveBeenCalledTimes(1);
  });
});
