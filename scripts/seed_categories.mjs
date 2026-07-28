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

const SEGMENT_DISPLAY_NAMES = Object.fromEntries(
  JSON.parse(
    fs.readFileSync(path.join(root, "src/server/data/categoryTaxonomy.json"), "utf-8"),
  ).categories.map((row) => [row.id, row.name]),
);
const SEGMENT_ORDER = Object.keys(SEGMENT_DISPLAY_NAMES);

// Shared across all segments (source: categoriesRepo.ts SHARED_QUESTIONNAIRE).
const SHARED_QUESTIONNAIRE = {
  required: ["business_name", "city", "services", "cta_preference"],
  recommended: ["service_area", "tone_preference", "phone", "whatsapp_number", "email"],
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
    email: {
      label: "Email address",
      tier: "optional",
      followUp: "What email address should customers use to reach you?",
    },
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

/** Read live (status=active) category.config.json files and fold into segment rows. */
function buildSeed() {
  const catalogRoot = path.join(root, "assets", "categories");
  if (!fs.existsSync(catalogRoot)) throw new Error(`missing catalog dir: ${catalogRoot}`);

  const bySegment = new Map();
  for (const dir of fs.readdirSync(catalogRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const cfgPath = path.join(catalogRoot, dir.name, "category.config.json");
    if (!fs.existsSync(cfgPath)) continue;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    // Only status=active configs are seeded for web-agent.
    if ((cfg.status ?? "active") !== "active") continue;
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
      definition: c.definition ?? "",
      default_family: c.default_family ?? "minimalist",
      eligible_families: c.eligible_families ?? [],
      keywords: c.keywords,
    }));
    const imagePackRefs = Array.from(new Set(configs.flatMap((c) => c.image_pack_refs ?? [])));
    const questionnaire =
      configs.find((c) => c.questionnaire && typeof c.questionnaire === "object")?.questionnaire ??
      SHARED_QUESTIONNAIRE;
    rows.push({
      categoryId: segmentId,
      name: SEGMENT_DISPLAY_NAMES[segmentId] ?? segmentId,
      subcategoriesJson: subcategories,
      questionnaireConfigJson: questionnaire,
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
  // Drop stale segments so DB matches live disk set.
  const liveIds = rows.map((r) => r.categoryId);
  const del = await client.query(
    `DELETE FROM categories WHERE NOT ("categoryId" = ANY($1::text[]))`,
    [liveIds],
  );
  return { created, updated, deleted: del.rowCount ?? 0 };
}

function check(rows) {
  if (!rows.length) {
    throw new Error("expected at least one live segment from status=active configs");
  }
  if (rows.length < 12) {
    throw new Error(`expected at least 12 live segments, got ${rows.length}`);
  }
  const required = [
    "real_estate",
    "local_service",
    "retail",
    "hospitality_travel",
    "health_education",
    "professional",
    "events_weddings",
    "legal_finance",
    "creative_media",
    "beauty_wellness",
    "nonprofit_community",
    "automotive",
  ];
  for (const id of required) {
    if (!rows.some((r) => r.categoryId === id)) {
      throw new Error(`seed must include segment ${id}`);
    }
  }
  for (const r of rows) {
    if (!r.subcategoriesJson.length) throw new Error(`segment ${r.categoryId} has no subcategories`);
  }
  const local = rows.find((r) => r.categoryId === "local_service");
  if (!local?.subcategoriesJson.some((s) => s.id === "electrician")) {
    throw new Error("seed must include local_service/electrician");
  }
  const professional = rows.find((r) => r.categoryId === "professional");
  if (!professional?.subcategoriesJson.some((s) => s.id === "portfolio_freelancer")) {
    throw new Error("seed must include professional/portfolio_freelancer");
  }
  for (const r of rows) {
    console.log(`  ${r.categoryId} (${r.name}): ${r.subcategoriesJson.length} subcategories`);
  }
  console.log(`seed:categories --check OK (${rows.length} live segment(s))`);
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
    const { created, updated, deleted } = await seed(client, rows);
    console.log(
      `seed:categories OK — ${rows.length} live segment(s) (created=${created} updated=${updated} deleted=${deleted})`,
    );
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
