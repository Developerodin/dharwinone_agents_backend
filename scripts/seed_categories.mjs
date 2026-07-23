#!/usr/bin/env node
/**
 * Idempotent category seed. Reads assets/categories/*\/category.config.json,
 * aggregates them into the 6 taxonomy segments, and upserts one row per
 * segment into the `categories` table. Mirrors buildSeed() in
 * src/server/repos/categoriesRepo.ts + listSegmentSummaries() in
 * src/server/data/categoryCatalog.ts — keep in sync if those change.
 *
 *   node scripts/seed_categories.mjs          # seed the DB (needs DATABASE_URL)
 *   node scripts/seed_categories.mjs --check  # build from files, assert, no DB
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const SEGMENT_DISPLAY_NAMES = {
  real_estate: "Real Estate",
  local_service: "Local service",
  retail: "Retail & small shops",
  hospitality_travel: "Hospitality & travel",
  health_education: "Health & education",
  professional: "Professional services",
};
const SEGMENT_ORDER = Object.keys(SEGMENT_DISPLAY_NAMES);

// Shared across all segments (source: categoriesRepo.ts SHARED_QUESTIONNAIRE).
const SHARED_QUESTIONNAIRE = {
  required: ["business_name", "city", "services", "cta_preference"],
  recommended: ["service_area", "tone_preference", "phone", "whatsapp_number"],
  fields: {
    business_name: { label: "Business name", tier: "required" },
    city: { label: "Primary city", tier: "required" },
    services: { label: "Main services", tier: "required", type: "tags" },
    cta_preference: {
      label: "Preferred CTA",
      tier: "required",
      type: "enum",
      options: ["whatsapp", "phone", "form"],
    },
    service_area: { label: "Service areas", tier: "recommended", type: "tags" },
    tone_preference: { label: "Brand tone", tier: "recommended" },
    phone: { label: "Phone number", tier: "recommended" },
    whatsapp_number: { label: "WhatsApp number", tier: "recommended" },
  },
};

function databaseUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.STUDIO_DATABASE_URL ||
    "postgresql://studio:studio@localhost:5432/dharwin_studio";
  return raw.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
}

function subcategoryDisplayName(config) {
  const parts = config.name.split(/\s*[—–-]\s*/);
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return config.subcategory.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Read every category.config.json and fold into one row per segment. */
function buildSeed() {
  const catalogRoot = path.join(root, "assets", "categories");
  if (!fs.existsSync(catalogRoot)) throw new Error(`missing catalog dir: ${catalogRoot}`);

  const bySegment = new Map();
  for (const dir of fs.readdirSync(catalogRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const cfgPath = path.join(catalogRoot, dir.name, "category.config.json");
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    cfg.keywords = Array.isArray(cfg.keywords) ? cfg.keywords : [];
    const list = bySegment.get(cfg.category) ?? [];
    list.push(cfg);
    bySegment.set(cfg.category, list);
  }

  const rows = [];
  for (const segmentId of SEGMENT_ORDER) {
    const configs = bySegment.get(segmentId);
    if (!configs?.length) continue;
    configs.sort((a, b) => a.id.localeCompare(b.id));
    const subcategories = configs.map((c) => ({
      id: c.subcategory,
      name: subcategoryDisplayName(c),
      keywords: c.keywords,
    }));
    const imagePackRefs = Array.from(new Set(configs.flatMap((c) => c.image_pack_refs ?? [])));
    rows.push({
      categoryId: segmentId,
      name: SEGMENT_DISPLAY_NAMES[segmentId] ?? segmentId,
      subcategoriesJson: subcategories,
      questionnaireConfigJson: SHARED_QUESTIONNAIRE,
      imagePackRefs: imagePackRefs.length ? imagePackRefs : [`pack/${segmentId}/default`],
    });
  }
  return rows;
}

async function seed(client, rows) {
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const res = await client.query(
      `INSERT INTO categories
         ("categoryId", name, "subcategoriesJson", "questionnaireConfigJson", "imagePackRefs")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("categoryId") DO UPDATE SET
         name = EXCLUDED.name,
         "subcategoriesJson" = EXCLUDED."subcategoriesJson",
         "questionnaireConfigJson" = EXCLUDED."questionnaireConfigJson",
         "imagePackRefs" = EXCLUDED."imagePackRefs"
       RETURNING (xmax = 0) AS inserted`,
      [
        r.categoryId,
        r.name,
        JSON.stringify(r.subcategoriesJson),
        JSON.stringify(r.questionnaireConfigJson),
        JSON.stringify(r.imagePackRefs),
      ],
    );
    if (res.rows[0].inserted) created += 1;
    else updated += 1;
  }
  return { created, updated };
}

function check(rows) {
  // ponytail: standalone self-check — the seed is worthless if the file
  // aggregation silently drops a segment or a segment ends up empty.
  if (rows.length !== SEGMENT_ORDER.length) {
    throw new Error(`expected ${SEGMENT_ORDER.length} segments, built ${rows.length}`);
  }
  for (const r of rows) {
    if (!r.subcategoriesJson.length) throw new Error(`segment ${r.categoryId} has no subcategories`);
  }
  for (const r of rows) {
    console.log(`  ${r.categoryId} (${r.name}): ${r.subcategoriesJson.length} subcategories`);
  }
  console.log(`seed:categories --check OK (${rows.length} segments)`);
}

async function main() {
  const rows = buildSeed();
  if (process.argv.includes("--check")) {
    check(rows);
    return;
  }
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { created, updated } = await seed(client, rows);
    console.log(`seed:categories OK — ${rows.length} segments (created=${created} updated=${updated})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const detail = err.message || err.code || String(err);
  const hint = err.code === "ECONNREFUSED" ? " — is Postgres running? (docker compose up -d)" : "";
  console.error(`seed:categories failed: ${detail}${hint}`);
  process.exit(1);
});
