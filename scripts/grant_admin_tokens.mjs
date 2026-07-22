#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

function databaseUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.STUDIO_DATABASE_URL ||
    "postgresql://studio:studio@localhost:5432/dharwin_studio";
  return raw.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
}

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();
try {
  const result = await client.query(
    `UPDATE users
     SET role = 'admin', "tokenBalance" = 999999999
     WHERE email = 'admin@dharwin.local'
     RETURNING "userId", email, role, "tokenBalance"`,
  );
  if (result.rowCount === 0) {
    console.error("admin@dharwin.local not found — run npm run seed:admin first");
    process.exit(1);
  }
  console.log("admin tokens updated:", result.rows[0]);
} finally {
  await client.end();
}
