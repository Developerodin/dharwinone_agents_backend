#!/usr/bin/env node
/**
 * Idempotent admin user seed for local/dev databases.
 * Uses the same PBKDF2 parameters as src/server/securityNode.ts.
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

function readAdminPassword() {
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error("Set SEED_ADMIN_PASSWORD in the environment before running this seed.");
  }
  if (
    password.length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error("Admin password must be at least 8 characters with a letter and a number.");
  }
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

async function upsertAdmin(client, password) {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const [passwordHash, passwordSalt] = hashPassword(password);
  const now = Date.now() / 1000;

  const existing = await client.query(
    `SELECT id, "userId", email, "emailVerified", role, disabled
     FROM users
     WHERE email = $1`,
    [email],
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
        email,
        ADMIN_NAME,
        passwordHash,
        passwordSalt,
        true,
        now,
        ADMIN_ROLE,
        false,
        999_999_999,
      ],
    );
    return { action: "created", userId, email };
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
    [email, ADMIN_NAME, passwordHash, passwordSalt, true, ADMIN_ROLE, false, 999_999_999],
  );
  return { action: "updated", userId: row.userId, email };
}

async function verifyAdmin(client, password) {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const result = await client.query(
    `SELECT "userId", email, name, "passwordHash", "passwordSalt",
            "emailVerified", role, disabled
     FROM users
     WHERE email = $1`,
    [email],
  );
  if (result.rowCount === 0) {
    throw new Error("Admin user not found after seed.");
  }

  const row = result.rows[0];
  if (!row.emailVerified) throw new Error("Admin user is not email-verified.");
  if (row.disabled) throw new Error("Admin user is disabled.");
  if (row.role !== ADMIN_ROLE) throw new Error("Admin user role is not admin.");
  if (!verifyPassword(password, row.passwordHash, row.passwordSalt)) {
    throw new Error("Stored admin password hash does not verify.");
  }

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    role: row.role,
    disabled: row.disabled,
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
  const password = readAdminPassword();
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    const deletion = await deleteLegacyAdmin(client);
    const seedResult = await upsertAdmin(client, password);
    const verified = await verifyAdmin(client, password);
    const adoption = await adoptLegacyProjects(client, verified.userId);
    console.log(
      `seed:admin legacy=${deletion.action}${deletion.userId ? ` userId=${deletion.userId}` : ""} authTokens=${deletion.authTokensRemoved ?? 0}`,
    );
    console.log(
      `seed:admin OK (${seedResult.action}) userId=${verified.userId} email=${verified.email} verified=${verified.emailVerified} role=${verified.role}`,
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
