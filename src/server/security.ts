import { jwtVerify } from "jose";

const ISSUER = "dharwin-auth";
const AUDIENCE = "dharwin-api";

export class TokenError extends Error {}

function secret(): Uint8Array {
  const value = process.env.AUTH_JWT_SECRET?.trim();
  if (!value) throw new Error("AUTH_JWT_SECRET is not set");
  return new TextEncoder().encode(value);
}

/** JWT verify for proxy (Node.js runtime in Next.js 16). */
export async function verifyJwt(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 30,
    });
    const sub = payload.sub;
    if (typeof sub !== "string" || !sub) throw new TokenError("invalid token subject");
    return sub;
  } catch {
    throw new TokenError("invalid or expired token");
  }
}
