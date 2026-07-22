import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { tokenHash } from "../securityNode";
import { toDoc } from "./doc";

export const VERIFY_TTL_S = 24 * 3600;
export const RESET_TTL_S = 3600;

export class AuthDbUnavailable extends Error {}
export class EmailTaken extends Error {}

export type UserDoc = Record<string, unknown> & {
  userId: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
  passwordHash?: string | null;
  passwordSalt?: string | null;
};

function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function publicUser(user: UserDoc | null): UserDoc | null {
  if (!user) return user;
  const clean = { ...user };
  delete clean.passwordHash;
  delete clean.passwordSalt;
  return clean;
}

export async function create(
  name: string,
  email: string,
  passwordHash: string,
  salt: string,
): Promise<UserDoc> {
  const userId = `usr-${randomHex(8)}`;
  try {
    const row = await prisma().user.create({
      data: {
        userId,
        email: normalizeEmail(email),
        name: name.trim(),
        passwordHash,
        passwordSalt: salt,
        emailVerified: false,
        createdAt: Date.now() / 1000,
      },
    });
    return publicUser(toDoc(row) as UserDoc)!;
  } catch (exc) {
    if (exc instanceof Prisma.PrismaClientKnownRequestError && exc.code === "P2002") {
      throw new EmailTaken(normalizeEmail(email));
    }
    throw exc;
  }
}

export async function findByEmail(email: string): Promise<UserDoc | null> {
  const row = await prisma().user.findUnique({ where: { email: normalizeEmail(email) } });
  return publicUser(toDoc(row) as UserDoc | null);
}

export async function findById(userId: string): Promise<UserDoc | null> {
  const row = await prisma().user.findUnique({ where: { userId } });
  return publicUser(toDoc(row) as UserDoc | null);
}

export async function getRole(userId: string): Promise<string | null> {
  const row = await prisma().user.findUnique({ where: { userId }, select: { role: true } });
  return row?.role ?? null;
}

export async function findByEmailWithSecrets(email: string): Promise<UserDoc | null> {
  const row = await prisma().user.findUnique({ where: { email: normalizeEmail(email) } });
  return toDoc(row) as UserDoc | null;
}

export async function isEmpty(): Promise<boolean> {
  const row = await prisma().user.findFirst({ select: { id: true } });
  return !row;
}

export async function setVerified(userId: string): Promise<void> {
  await prisma().user.updateMany({ where: { userId }, data: { emailVerified: true } });
}

export async function setPassword(
  userId: string,
  passwordHash: string,
  salt: string,
): Promise<void> {
  await prisma().user.updateMany({
    where: { userId },
    data: { passwordHash, passwordSalt: salt },
  });
}

export async function issueToken(userId: string, purpose: string, ttlS: number): Promise<string> {
  const raw = randomUrlSafe(32);
  await prisma().authToken.create({
    data: {
      tokenHash: tokenHash(raw),
      userId,
      purpose,
      expiresAt: Date.now() / 1000 + ttlS,
    },
  });
  return raw;
}

export async function consumeToken(raw: string, purpose: string): Promise<string | null> {
  const hashed = tokenHash(raw ?? "");
  const row = await prisma().authToken.findFirst({ where: { tokenHash: hashed, purpose } });
  if (!row) return null;
  const expiresAt = row.expiresAt ?? 0;
  const userId = row.userId ?? "";
  await prisma().authToken.deleteMany({ where: { tokenHash: hashed } });
  return expiresAt >= Date.now() / 1000 ? userId : null;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomUrlSafe(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}
