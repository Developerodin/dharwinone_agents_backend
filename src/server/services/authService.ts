import { prisma } from "../db";
import * as usersRepo from "../repos/usersRepo";
import * as emailService from "./emailService";
import { hashPassword, issueJwt, verifyPassword } from "../securityNode";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const GENERIC_LOGIN_ERROR = "invalid email or password";

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | Record<string, unknown>,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

function validateRegistration(name: string, email: string, password: string): void {
  if (!(name ?? "").trim()) throw new AuthError(422, "name is required");
  if (!EMAIL_RE.test((email ?? "").trim())) throw new AuthError(422, "invalid email address");
  if (
    (password ?? "").length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new AuthError(
      422,
      "password must be at least 8 characters with a letter and a number",
    );
  }
}

export async function register(
  name: string,
  email: string,
  password: string,
  baseUrl?: string | null,
): Promise<Record<string, unknown>> {
  validateRegistration(name, email, password);
  if (await usersRepo.findByEmail(email)) {
    throw new AuthError(409, "an account with this email already exists");
  }
  const adopt = await usersRepo.isEmpty();
  const [passwordHash, salt] = hashPassword(password);
  let user: Record<string, unknown>;
  try {
    user = await usersRepo.create(name, email, passwordHash, salt);
  } catch (exc) {
    if (exc instanceof usersRepo.EmailTaken) {
      throw new AuthError(409, "an account with this email already exists");
    }
    throw exc;
  }
  if (adopt) await adoptLegacyData(user.userId as string);
  const raw = await usersRepo.issueToken(user.userId as string, "verify", usersRepo.VERIFY_TTL_S);
  emailService.sendVerification(user.email as string, raw, baseUrl);
  return user;
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const userId = await usersRepo.consumeToken(rawToken, "verify");
  if (!userId) throw new AuthError(400, "invalid or expired verification token");
  await usersRepo.setVerified(userId);
}

export async function login(email: string, password: string): Promise<Record<string, unknown>> {
  const user = await usersRepo.findByEmailWithSecrets(email);
  if (
    !user ||
    !user.passwordHash ||
    !user.passwordSalt ||
    !verifyPassword(password, user.passwordHash, user.passwordSalt)
  ) {
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }
  if (!user.emailVerified) {
    throw new AuthError(403, {
      code: "unverified",
      message: "verify your email before signing in",
    });
  }
  await adoptLegacyData(user.userId);
  return {
    token: await issueJwt(user.userId),
    user: { id: user.userId, email: user.email, name: user.name },
  };
}

export async function resendVerification(email: string, baseUrl?: string | null): Promise<void> {
  const user = await usersRepo.findByEmailWithSecrets(email);
  if (!user || user.emailVerified) return;
  const raw = await usersRepo.issueToken(user.userId, "verify", usersRepo.VERIFY_TTL_S);
  emailService.sendVerification(user.email, raw, baseUrl);
}

export async function forgotPassword(email: string, baseUrl?: string | null): Promise<void> {
  const user = await usersRepo.findByEmailWithSecrets(email);
  if (!user) return;
  const raw = await usersRepo.issueToken(user.userId, "reset", usersRepo.RESET_TTL_S);
  emailService.sendPasswordReset(user.email, raw, baseUrl);
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  if (
    (newPassword ?? "").length < 8 ||
    !/[A-Za-z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    throw new AuthError(
      422,
      "password must be at least 8 characters with a letter and a number",
    );
  }
  const userId = await usersRepo.consumeToken(rawToken, "reset");
  if (!userId) throw new AuthError(400, "invalid or expired reset token");
  const [passwordHash, salt] = hashPassword(newPassword);
  await usersRepo.setPassword(userId, passwordHash, salt);
}

async function adoptLegacyData(userId: string): Promise<void> {
  const existing = await prisma().meta.findUnique({ where: { key: "legacy_adoption" } });
  if (existing) return;
  try {
    await prisma().meta.create({
      data: { key: "legacy_adoption", value: { userId, at: Date.now() / 1000 } },
    });
  } catch {
    return;
  }
  try {
    await rewriteLegacyOwnership(userId);
  } catch (exc) {
    console.error("[auth] legacy adoption rewrite failed (re-runnable):", exc);
  }
}

async function rewriteLegacyOwnership(userId: string): Promise<void> {
  await prisma().builderProject.updateMany({
    where: { ownerUserId: "local-user" },
    data: { ownerUserId: userId },
  });
}

export async function rewriteLegacyOwnershipForTests(userId: string): Promise<void> {
  await rewriteLegacyOwnership(userId);
}
