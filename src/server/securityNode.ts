import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";

const ISSUER = "dharwin-auth";
const AUDIENCE = "dharwin-api";
const ITERATIONS = 600_000;
const TOKEN_TTL_S = 24 * 3600;

function secret(): Uint8Array {
  const value = process.env.AUTH_JWT_SECRET?.trim();
  if (!value) throw new Error("AUTH_JWT_SECRET is not set");
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string, salt?: string): [string, string] {
  const s = salt ?? randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, s, ITERATIONS, 32, "sha256");
  return [digest.toString("base64"), s];
}

export function verifyPassword(password: string, passwordHash: string, salt: string): boolean {
  const [candidate] = hashPassword(password, salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(passwordHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function issueJwt(userId: string, now?: number): Promise<string> {
  const issued = now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(issued)
    .setExpirationTime(issued + TOKEN_TTL_S)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret());
}

export function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
