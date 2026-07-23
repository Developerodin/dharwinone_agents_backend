#!/usr/bin/env node
/**
 * Idempotent admin and test user seed for local/dev databases.
 * Uses the same PBKDF2 parameters as src/server/securityNode.ts.
 *
 * Admin: admin@dharwin.local — role admin, 999_999_999 tokens.
 *        Requires SEED_ADMIN_PASSWORD in the environment.
 *
 * Test:  test@dharwin.local — role user, 500 tokens (matches new-user default).
 *        Password from TEST_USER_PASSWORD or SEED_TEST_PASSWORD; falls back to TestUser1234.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const ITERATIONS = 600_000;
const ADMIN_EMAIL = "admin@dharwin.local";
const LEGACY_ADMIN_EMAIL = "admin@religence.local";
const ADMIN_NAME = "Admin";
const ADMIN_ROLE = "admin";
const ADMIN_TOKEN_BALANCE = 999_999_999;

const TEST_EMAIL = "test@dharwin.local";
const TEST_NAME = "Test User";
const TEST_ROLE = "user";
const TEST_TOKEN_BALANCE = 500;
const DEFAULT_TEST_PASSWORD = "TestUser1234";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

function databaseUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.STUDIO_DATABASE_URL ||
    "postgresql://studio:studio@localhost:5432/dharwin_studio";
  return raw.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
}

function hashPassword(password, salt) {
  const s = salt ?? randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, s, ITERATIONS, 32, "sha256");
  return [digest.toString("base64"), s];
}

function verifyPassword(password, passwordHash, salt) {
  const [candidate] = hashPassword(password, salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(passwordHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function validatePassword(password, label) {
  if (
    password.length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(`${label} must be at least 8 characters with a letter and a number.`);
  }
}

function readAdminPassword() {
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error("Set SEED_ADMIN_PASSWORD in the environment before running this seed.");
  }
  validatePassword(password, "Admin password");
  return password;
}

function readTestPassword() {
  const password =
    process.env.TEST_USER_PASSWORD?.trim() ||
    process.env.SEED_TEST_PASSWORD?.trim() ||
    DEFAULT_TEST_PASSWORD;
  validatePassword(password, "Test user password");
  return password;
}

async function deleteLegacyAdmin(client) {
  const email = LEGACY_ADMIN_EMAIL.trim().toLowerCase();
  const existing = await client.query(
    `SELECT id, "userId", email FROM users WHERE email = $1`,
    [email],
  );
  if (existing.rowCount === 0) {
    return { action: "not_found", email };
  }

  const row = existing.rows[0];
  const authTokens = await client.query(
    `DELETE FROM auth_tokens WHERE "userId" = $1`,
    [row.userId],
  );
  await client.query(`DELETE FROM users WHERE email = $1`, [email]);
  return {
    action: "deleted",
    email,
    userId: row.userId,
    authTokensRemoved: authTokens.rowCount ?? 0,
  };
}

async function upsertUser(client, { email, name, role, tokenBalance, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const [passwordHash, passwordSalt] = hashPassword(password);
  const now = Date.now() / 1000;

  const existing = await client.query(
    `SELECT id, "userId", email, "emailVerified", role, disabled
     FROM users
     WHERE email = $1`,
    [normalizedEmail],
  );

  if (existing.rowCount === 0) {
    const userId = `usr-${randomHex(8)}`;
    await client.query(
      `INSERT INTO users (
         "userId", email, name, "passwordHash", "passwordSalt",
         "emailVerified", "createdAt", role, disabled, "tokenBalance"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        normalizedEmail,
        name,
        passwordHash,
        passwordSalt,
        true,
        now,
        role,
        false,
        tokenBalance,
      ],
    );
    return { action: "created", userId, email: normalizedEmail };
  }

  const row = existing.rows[0];
  await client.query(
    `UPDATE users
     SET name = $2,
         "passwordHash" = $3,
         "passwordSalt" = $4,
         "emailVerified" = $5,
         role = $6,
         disabled = $7,
         "tokenBalance" = $8
     WHERE email = $1`,
    [normalizedEmail, name, passwordHash, passwordSalt, true, role, false, tokenBalance],
  );
  return { action: "updated", userId: row.userId, email: normalizedEmail };
}

async function verifyUser(client, { email, password, role, label }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query(
    `SELECT "userId", email, name, "passwordHash", "passwordSalt",
            "emailVerified", role, disabled, "tokenBalance"
     FROM users
     WHERE email = $1`,
    [normalizedEmail],
  );
  if (result.rowCount === 0) {
    throw new Error(`${label} user not found after seed.`);
  }

  const row = result.rows[0];
  if (!row.emailVerified) throw new Error(`${label} user is not email-verified.`);
  if (row.disabled) throw new Error(`${label} user is disabled.`);
  if (row.role !== role) throw new Error(`${label} user role is not ${role}.`);
  if (!verifyPassword(password, row.passwordHash, row.passwordSalt)) {
    throw new Error(`Stored ${label.toLowerCase()} password hash does not verify.`);
  }

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    role: row.role,
    disabled: row.disabled,
    tokenBalance: row.tokenBalance,
  };
}

async function adoptLegacyProjects(client, userId) {
  const existing = await client.query(`SELECT key FROM meta WHERE key = $1`, [
    "legacy_adoption",
  ]);
  if (existing.rowCount > 0) return { action: "already_adopted" };

  const updated = await client.query(
    `UPDATE builder_projects SET "ownerUserId" = $1 WHERE "ownerUserId" = 'local-user'`,
    [userId],
  );
  await client.query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)`,
    ["legacy_adoption", JSON.stringify({ userId, at: Date.now() / 1000 })],
  );
  return { action: "adopted", projectsUpdated: updated.rowCount ?? 0 };
}

async function main() {
  const adminPassword = readAdminPassword();
  const testPassword = readTestPassword();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    const deletion = await deleteLegacyAdmin(client);
    const adminSeedResult = await upsertUser(client, {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: ADMIN_ROLE,
      tokenBalance: ADMIN_TOKEN_BALANCE,
      password: adminPassword,
    });
    const adminVerified = await verifyUser(client, {
      email: ADMIN_EMAIL,
      password: adminPassword,
      role: ADMIN_ROLE,
      label: "Admin",
    });
    const testSeedResult = await upsertUser(client, {
      email: TEST_EMAIL,
      name: TEST_NAME,
      role: TEST_ROLE,
      tokenBalance: TEST_TOKEN_BALANCE,
      password: testPassword,
    });
    const testVerified = await verifyUser(client, {
      email: TEST_EMAIL,
      password: testPassword,
      role: TEST_ROLE,
      label: "Test",
    });
    const adoption = await adoptLegacyProjects(client, adminVerified.userId);
    console.log(
      `seed:admin legacy=${deletion.action}${deletion.userId ? ` userId=${deletion.userId}` : ""} authTokens=${deletion.authTokensRemoved ?? 0}`,
    );
    console.log(
      `seed:admin OK (${adminSeedResult.action}) userId=${adminVerified.userId} email=${adminVerified.email} verified=${adminVerified.emailVerified} role=${adminVerified.role}`,
    );
    console.log(
      `seed:test OK (${testSeedResult.action}) userId=${testVerified.userId} email=${testVerified.email} verified=${testVerified.emailVerified} role=${testVerified.role} tokens=${testVerified.tokenBalance}`,
    );
    console.log(
      `seed:admin legacy adoption=${adoption.action}${adoption.projectsUpdated != null ? ` projects=${adoption.projectsUpdated}` : ""}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`seed:admin failed: ${err.message}`);
  process.exit(1);
});
