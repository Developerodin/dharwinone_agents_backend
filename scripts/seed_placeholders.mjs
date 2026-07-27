#!/usr/bin/env node
/**
 * Idempotent placeholder seed. Uploads the fallback images that
 * imageResolverService.ts points at (studio/placeholders/...) into the S3
 * bucket, sourcing each from a known-good Unsplash URL already used elsewhere
 * in the codebase. Skips objects that already exist.
 *
 *   node scripts/seed_placeholders.mjs          # upload missing objects
 *   node scripts/seed_placeholders.mjs --check  # list keys + sources, no network
 *
 * Needs real-S3 env (AWS_* + STUDIO_S3_BUCKET/AWS_S3_BUCKET_NAME). Prints the
 * resolved public base URL so it can be reused for backfilling old drafts.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

// key -> source image. Reuses URLs already present in the repo so we never
// point at an Unsplash id that might 404. Generic professional shot for
// local_service until trade-specific packs are curated.
const GENERIC = "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=75";
const SEED = {
  "studio/placeholders/template/default/hero.webp":
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=75",
  "studio/placeholders/template/default/about.webp":
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=75",
  "studio/placeholders/template/default/logo.webp": GENERIC,
  "studio/placeholders/pack/local_service/hero.webp": GENERIC,
  "studio/placeholders/pack/local_service/about.webp": GENERIC,
  "studio/placeholders/pack/local_service/services.webp": GENERIC,
};

const bucket = (process.env.STUDIO_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || "").trim();
const region = (process.env.AWS_REGION || "").trim();
const base = (process.env.STUDIO_ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const publicBase = base || (region ? `https://${bucket}.s3.${region}.amazonaws.com` : `https://${bucket}.s3.amazonaws.com`);

if (process.argv.includes("--check")) {
  console.log("public base:", publicBase);
  for (const [key, src] of Object.entries(SEED)) console.log(`${key}\n  <- ${src}`);
  process.exit(0);
}

if (!bucket) {
  console.error("No S3 bucket configured (STUDIO_S3_BUCKET / AWS_S3_BUCKET_NAME). Aborting.");
  process.exit(1);
}

const s3 = new S3Client(region ? { region } : {});

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
    throw err;
  }
}

async function fetchBytes(url) {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`GET ${url} -> ${resp.status}`);
  const contentType = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  return { body: new Uint8Array(await resp.arrayBuffer()), contentType };
}

console.log("bucket:", bucket, "| public base:", publicBase, "\n");
let uploaded = 0;
for (const [key, src] of Object.entries(SEED)) {
  if (await exists(key)) {
    console.log("skip (exists):", key);
    continue;
  }
  const { body, contentType } = await fetchBytes(src);
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
  uploaded += 1;
  console.log(`put: ${key} (${body.length} bytes, ${contentType})`);
}
console.log(`\nDone. ${uploaded} uploaded, ${Object.keys(SEED).length - uploaded} already present.`);
console.log("verify:", `${publicBase}/studio/placeholders/template/default/hero.webp`);
