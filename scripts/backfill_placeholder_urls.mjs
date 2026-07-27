#!/usr/bin/env node
/**
 * One-off backfill: old drafts stored image URLs as the root-relative dead
 * path "/studio/placeholders/..." (before imageResolverService emitted real S3
 * URLs). Rewrite those to the bucket's public URL in content + theme JSON.
 *
 *   node scripts/backfill_placeholder_urls.mjs         # dry run (counts only)
 *   node scripts/backfill_placeholder_urls.mjs --write # apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const bucket = (process.env.STUDIO_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || "").trim();
const region = (process.env.AWS_REGION || "").trim();
const base = (process.env.STUDIO_ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const publicBase =
  base || (region ? `https://${bucket}.s3.${region}.amazonaws.com` : `https://${bucket}.s3.amazonaws.com`);

const DEAD = "/studio/placeholders/";
const GOOD = `${publicBase}/studio/placeholders/`;
const write = process.argv.includes("--write");

// Mirror config.ts databaseUrl(): strip SQLAlchemy's +psycopg driver suffix.
const dbUrl = (
  process.env.DATABASE_URL ||
  process.env.STUDIO_DATABASE_URL ||
  "postgresql://studio:studio@localhost:5432/dharwin_studio"
).replace(/^postgresql\+psycopg:\/\//, "postgresql://");
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const like = `%${DEAD}%`;
const { rows } = await client.query(
  `select "siteId" from sites where "contentJson"::text like $1 or coalesce("themeJson"::text,'') like $1`,
  [like],
);
console.log(`rewrite base: ${GOOD}`);
console.log(`sites needing backfill: ${rows.length}`);
rows.forEach((r) => console.log("  " + r.siteId));

if (write && rows.length) {
  const res = await client.query(
    `update sites
       set "contentJson" = replace("contentJson"::text, $1, $2)::jsonb,
           "themeJson"   = case when "themeJson" is null then null
                                else replace("themeJson"::text, $1, $2)::jsonb end
     where "contentJson"::text like $3 or coalesce("themeJson"::text,'') like $3`,
    [DEAD, GOOD, like],
  );
  console.log(`updated ${res.rowCount} rows.`);
} else if (!write) {
  console.log("dry run — pass --write to apply.");
}
await client.end();
