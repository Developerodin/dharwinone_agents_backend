// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { reconcileRazorpayPayments } from "./services/paymentReconciliation";
import * as tokenRepo from "./repos/tokenTransactionsRepo";

vi.mock("./repos/tokenTransactionsRepo", () => ({
  findByIdempotencyKey: vi.fn(),
  atomicCredit: vi.fn(),
  createCommittedCredit: vi.fn(),
  isUniqueViolation: vi.fn(() => false),
}));

describe("reconcileRazorpayPayments idempotency (BUG 3 / spec §10.2)", () => {
  beforeEach(() => {
    vi.mocked(tokenRepo.findByIdempotencyKey).mockReset();
    vi.mocked(tokenRepo.atomicCredit).mockReset();
    vi.mocked(tokenRepo.createCommittedCredit).mockReset();
  });

  it("credits a missed payment once and does not double-credit on re-run", async () => {
    // Run 1 sees no ledger row; run 2 sees the committed row it created.
    vi.mocked(tokenRepo.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        transactionId: "tx-recon",
        userId: "u1",
        tokens: 100,
        status: "committed",
      } as never);
    vi.mocked(tokenRepo.createCommittedCredit).mockResolvedValue({
      transactionId: "tx-recon",
      userId: "u1",
      tokens: 100,
      status: "committed",
    } as never);

    const payments = [
      { paymentId: "pay_missed", userId: "u1", packId: "starter", status: "captured" },
    ];

    const first = await reconcileRazorpayPayments({ payments });
    const second = await reconcileRazorpayPayments({ payments });

    expect(first.reconciled).toBe(1);
    expect(first.results[0].credited).toBe(true);

    // Re-run is a no-op — no second credit.
    expect(second.reconciled).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.results[0].credited).toBe(false);

    expect(tokenRepo.atomicCredit).toHaveBeenCalledTimes(1);
    expect(tokenRepo.createCommittedCredit).toHaveBeenCalledTimes(1);
  });

  it("skips non-captured payments without touching the ledger", async () => {
    const result = await reconcileRazorpayPayments({
      payments: [{ paymentId: "pay_auth", userId: "u1", packId: "starter", status: "authorized" }],
    });
    expect(result.reconciled).toBe(0);
    expect(result.skipped).toBe(1);
    expect(tokenRepo.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(tokenRepo.atomicCredit).not.toHaveBeenCalled();
  });
});
