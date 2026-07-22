// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { actionCost, reserveTokens, TOKEN_COSTS, UNLIMITED_TOKEN_BALANCE, withTokenHold } from "./services/tokenService";
import * as tokenRepo from "./repos/tokenTransactionsRepo";
import * as usersRepo from "./repos/usersRepo";

vi.mock("./repos/tokenTransactionsRepo", () => ({
  findByIdempotencyKey: vi.fn(),
  getBalance: vi.fn(),
  atomicDebit: vi.fn(),
  atomicCredit: vi.fn(),
  createPending: vi.fn(),
  setStatus: vi.fn(),
  listForUser: vi.fn(),
  isUniqueViolation: vi.fn(() => false),
}));

vi.mock("./repos/usersRepo", () => ({
  getRole: vi.fn(),
}));

describe("tokenService costs", () => {
  it("defines Phase 1 action prices", () => {
    expect(TOKEN_COSTS.full_generation).toBe(50);
    expect(TOKEN_COSTS.intake_prefill).toBe(0);
    expect(TOKEN_COSTS.gap_check).toBe(0);
    expect(TOKEN_COSTS.regenerate_section).toBe(8);
    expect(actionCost("ai_rewrite")).toBe(5);
  });

  it("returns zero for unknown actions", () => {
    expect(actionCost("manual_edit")).toBe(0);
  });
});

describe("admin unlimited tokens", () => {
  beforeEach(() => {
    vi.mocked(usersRepo.getRole).mockResolvedValue("admin");
    vi.mocked(tokenRepo.getBalance).mockResolvedValue(0);
    vi.mocked(tokenRepo.findByIdempotencyKey).mockResolvedValue(null);
  });

  it("skips debit for admin users", async () => {
    const hold = await reserveTokens({
      userId: "usr-admin",
      actionType: "full_generation",
      idempotencyKey: "admin-gen-1",
    });
    expect(hold.status).toBe("committed");
    expect(hold.cost).toBe(0);
    expect(tokenRepo.atomicDebit).not.toHaveBeenCalled();
  });

  it("reports a large balance for admin users", async () => {
    const { getBalance } = await import("./services/tokenService");
    await expect(getBalance("usr-admin")).resolves.toBe(UNLIMITED_TOKEN_BALANCE);
  });
});

describe("withTokenHold fallback refund (BUG 1 / spec §11)", () => {
  let balance: number;
  let statuses: Record<string, string>;

  beforeEach(() => {
    balance = 100;
    statuses = {};
    vi.mocked(usersRepo.getRole).mockResolvedValue("viewer");
    vi.mocked(tokenRepo.findByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(tokenRepo.getBalance).mockImplementation(async () => balance);
    vi.mocked(tokenRepo.atomicDebit).mockImplementation(async (_u, c) => {
      if (balance >= c) {
        balance -= c;
        return true;
      }
      return false;
    });
    vi.mocked(tokenRepo.atomicCredit).mockImplementation(async (_u, a) => {
      balance += a;
    });
    vi.mocked(tokenRepo.createPending).mockImplementation(async () => {
      statuses["tx-1"] = "pending";
      return { transactionId: "tx-1", userId: "u1", tokens: 50, status: "pending" } as never;
    });
    vi.mocked(tokenRepo.setStatus).mockImplementation(async (id, s) => {
      statuses[id] = s;
    });
    vi.mocked(tokenRepo.listForUser).mockImplementation(
      async () =>
        [{ transactionId: "tx-1", userId: "u1", tokens: 50, status: statuses["tx-1"] }] as never,
    );
  });

  it("refunds the hold on usedFallback while still returning the fallback content", async () => {
    const content = { hero: "fallback" };
    const result = await withTokenHold({
      userId: "u1",
      actionType: "full_generation",
      idempotencyKey: "key-abcdef12",
      fn: async () => ({ content, usedFallback: true }),
      shouldRefund: (r) => r.usedFallback === true,
    });

    // caller still gets the fallback site
    expect(result.usedFallback).toBe(true);
    expect(result.content).toEqual(content);
    // ledger row ends up refunded, not committed
    expect(statuses["tx-1"]).toBe("refunded");
    // balance fully restored (50 debited, 50 credited back)
    expect(balance).toBe(100);
    expect(tokenRepo.setStatus).toHaveBeenCalledWith("tx-1", "refunded");
  });

  it("commits the hold on a real generation (no fallback)", async () => {
    const result = await withTokenHold({
      userId: "u1",
      actionType: "full_generation",
      idempotencyKey: "key-committed1",
      fn: async () => ({ content: { hero: "real" }, usedFallback: false }),
      shouldRefund: (r) => r.usedFallback === true,
    });

    expect(result.usedFallback).toBe(false);
    expect(statuses["tx-1"]).toBe("committed");
    expect(balance).toBe(50); // 50 spent, not refunded
  });
});
