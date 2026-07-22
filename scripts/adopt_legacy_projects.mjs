#!/usr/bin/env node
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const url = (
  process.env.DATABASE_URL ||
  "postgresql://studio:studio@localhost:5432/dharwin_studio"
).replace(/^postgresql\+psycopg:\/\//, "postgresql://");

const client = new pg.Client({ connectionString: url });
await client.connect();

const admin = await client.query(
  `SELECT "userId" FROM users WHERE email = $1 LIMIT 1`,
  ["admin@dharwin.local"],
);
if (admin.rowCount === 0) {
  throw new Error("admin@dharwin.local not found — run seed:admin first");
}
const userId = admin.rows[0].userId;

const updated = await client.query(
  `UPDATE builder_projects SET "ownerUserId" = $1 WHERE "ownerUserId" = 'local-user'`,
  [userId],
);
await client.query(
  `INSERT INTO meta (key, value) VALUES ($1, $2)
   ON CONFLICT (key) DO NOTHING`,
  ["legacy_adoption", JSON.stringify({ userId, at: Date.now() / 1000 })],
);

console.log(`adopt:legacy OK userId=${userId} projects=${updated.rowCount ?? 0}`);
await client.end();
