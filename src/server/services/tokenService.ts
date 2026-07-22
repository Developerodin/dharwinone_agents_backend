/** Phase 1 token ledger — reserve → commit/refund with idempotency. */
import * as tokenRepo from "../repos/tokenTransactionsRepo";
import * as usersRepo from "../repos/usersRepo";

export const UNLIMITED_TOKEN_BALANCE = 999_999_999;

export class InsufficientTokensError extends Error {
  constructor(public readonly balance: number, public readonly cost: number) {
    super(`insufficient tokens: have ${balance}, need ${cost}`);
    this.name = "InsufficientTokensError";
  }
}

export const TOKEN_COSTS: Record<string, number> = {
  full_generation: 50,
  intake_prefill: 0,
  gap_check: 0,
  regenerate_section: 8,
  ai_rewrite: 5,
  ai_style_suggestion: 5,
};

export function actionCost(actionType: string): number {
  return TOKEN_COSTS[actionType] ?? 0;
}

async function hasUnlimitedTokens(userId: string): Promise<boolean> {
  const role = await usersRepo.getRole(userId);
  return role === "admin";
}

export async function getBalance(userId: string): Promise<number> {
  if (await hasUnlimitedTokens(userId)) return UNLIMITED_TOKEN_BALANCE;
  return tokenRepo.getBalance(userId);
}

export async function reserveTokens(input: {
  userId: string;
  actionType: string;
  idempotencyKey: string;
  siteId?: string;
  costOverride?: number;
}): Promise<{ transactionId: string; status: "pending" | "committed" | "refunded"; cost: number }> {
  const cost = input.costOverride ?? actionCost(input.actionType);
  if (cost <= 0) {
    return { transactionId: "", status: "committed", cost: 0 };
  }

  if (await hasUnlimitedTokens(input.userId)) {
    return { transactionId: "", status: "committed", cost: 0 };
  }

  const existing = await tokenRepo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    return {
      transactionId: existing.transactionId,
      status: (existing.status as "pending" | "committed" | "refunded") ?? "pending",
      cost,
    };
  }

  const balance = await tokenRepo.getBalance(input.userId);
  if (balance < cost) throw new InsufficientTokensError(balance, cost);

  const ok = await tokenRepo.atomicDebit(input.userId, cost);
  if (!ok) {
    const latest = await tokenRepo.getBalance(input.userId);
    throw new InsufficientTokensError(latest, cost);
  }

  try {
    const tx = await tokenRepo.createPending({
      userId: input.userId,
      actionType: input.actionType,
      tokens: cost,
      idempotencyKey: input.idempotencyKey,
      siteId: input.siteId,
    });
    return { transactionId: tx.transactionId, status: "pending", cost };
  } catch (err) {
    // Lost the insert race after debiting: restore our debit and defer to the winner's row.
    if (tokenRepo.isUniqueViolation(err)) {
      await tokenRepo.atomicCredit(input.userId, cost);
      const existing = await tokenRepo.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return {
          transactionId: existing.transactionId,
          status: (existing.status as "pending" | "committed" | "refunded") ?? "pending",
          cost,
        };
      }
    }
    throw err;
  }
}

export async function commitTokens(transactionId: string): Promise<void> {
  if (!transactionId) return;
  await tokenRepo.setStatus(transactionId, "committed");
}

export async function refundTokens(transactionId: string, userId: string): Promise<void> {
  if (!transactionId) return;
  const rows = await tokenRepo.listForUser(userId, 200);
  const tx = rows.find((r) => r.transactionId === transactionId);
  if (!tx || tx.status !== "pending") return;
  const amount = Number(tx.tokens ?? 0);
  if (amount > 0) await tokenRepo.atomicCredit(userId, amount);
  await tokenRepo.setStatus(transactionId, "refunded");
}

export async function withTokenHold<T>(input: {
  userId: string;
  actionType: string;
  idempotencyKey: string;
  siteId?: string;
  fn: () => Promise<T>;
  /**
   * Return true to refund the hold instead of committing, while STILL returning the
   * result to the caller (non-error degraded outcome, e.g. validation-fallback content).
   */
  shouldRefund?: (result: T) => boolean;
}): Promise<T> {
  const hold = await reserveTokens(input);
  try {
    const result = await input.fn();
    if (input.shouldRefund?.(result)) {
      await refundTokens(hold.transactionId, input.userId);
    } else {
      await commitTokens(hold.transactionId);
    }
    return result;
  } catch (err) {
    await refundTokens(hold.transactionId, input.userId);
    throw err;
  }
}

export async function listTransactions(userId: string): Promise<Record<string, unknown>[]> {
  return tokenRepo.listForUser(userId);
}
