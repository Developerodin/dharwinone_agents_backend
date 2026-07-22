import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";

export type TokenTransactionDoc = Record<string, unknown> & {
  transactionId: string;
  userId: string;
  status?: string | null;
};

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True for a Prisma unique-constraint violation (P2002) — a lost idempotency-key race. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function findByIdempotencyKey(key: string): Promise<TokenTransactionDoc | null> {
  const row = await prisma().tokenTransaction.findFirst({ where: { idempotencyKey: key } });
  return toDoc(row) as TokenTransactionDoc | null;
}

export async function createPending(input: {
  userId: string;
  actionType: string;
  tokens: number;
  idempotencyKey: string;
  siteId?: string | null;
}): Promise<TokenTransactionDoc> {
  const now = Date.now() / 1000;
  const row = await prisma().tokenTransaction.create({
    data: {
      transactionId: `tx-${randomId()}`,
      userId: input.userId,
      actionType: input.actionType,
      tokens: input.tokens,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
      siteId: input.siteId ?? null,
      createdAt: now,
    },
  });
  return toDoc(row) as TokenTransactionDoc;
}

export async function createCommittedCredit(input: {
  userId: string;
  actionType: string;
  tokens: number;
  idempotencyKey: string;
  packId?: string;
}): Promise<TokenTransactionDoc> {
  const now = Date.now() / 1000;
  const row = await prisma().tokenTransaction.create({
    data: {
      transactionId: `tx-${randomId()}`,
      userId: input.userId,
      actionType: input.packId ? `${input.actionType}:${input.packId}` : input.actionType,
      tokens: input.tokens,
      status: "committed",
      idempotencyKey: input.idempotencyKey,
      siteId: null,
      createdAt: now,
    },
  });
  return toDoc(row) as TokenTransactionDoc;
}

export async function setStatus(transactionId: string, status: "committed" | "refunded"): Promise<void> {
  await prisma().tokenTransaction.updateMany({ where: { transactionId }, data: { status } });
}

export async function listForUser(userId: string, limit = 50): Promise<TokenTransactionDoc[]> {
  const rows = await prisma().tokenTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => toDoc(row) as TokenTransactionDoc);
}

export async function atomicDebit(userId: string, cost: number): Promise<boolean> {
  const updated = await prisma().$executeRaw(
    Prisma.sql`UPDATE users SET "tokenBalance" = "tokenBalance" - ${cost}
      WHERE "userId" = ${userId} AND COALESCE("tokenBalance", 0) >= ${cost}`,
  );
  return Number(updated) > 0;
}

export async function atomicCredit(userId: string, amount: number): Promise<void> {
  await prisma().$executeRaw(
    Prisma.sql`UPDATE users SET "tokenBalance" = COALESCE("tokenBalance", 0) + ${amount}
      WHERE "userId" = ${userId}`,
  );
}

export async function getBalance(userId: string): Promise<number> {
  const row = await prisma().user.findUnique({ where: { userId }, select: { tokenBalance: true } });
  return row?.tokenBalance ?? 0;
}
