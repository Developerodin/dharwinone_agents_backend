#!/usr/bin/env node
/**
 * Sync category.config.json files from categoryTaxonomy.json.
 * Preserves existing matcher/questionnaire when present.
 *
 *   node scripts/sync_taxonomy.mjs
 *   node scripts/sync_taxonomy.mjs --check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taxonomyPath = path.join(root, "src/server/data/categoryTaxonomy.json");
const familiesPath = path.join(root, "src/server/data/familiesCatalog.json");
const catalogRoot = path.join(root, "assets/categories");
const templatesPath = path.join(root, "src/server/data/templatesCatalog.json");

const LEGACY_FAMILY_REMAP = {
  trust_local: "warm",
  bold_convert: "bold",
  clean_pro: "professional",
  premium_dark: "premium",
  warm_craft: "warm",
  fresh_retail: "playful",
  generic: "minimalist",
};

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
    tone_preference: { label: "Visual style preference", tier: "recommended" },
    phone: { label: "Phone number", tier: "recommended" },
    whatsapp_number: { label: "WhatsApp number", tier: "recommended" },
    email: {
      label: "Email address",
      tier: "optional",
      followUp: "What email address should customers use to reach you?",
    },
  },
};

function segmentDisplay(category) {
  return category.name;
}

function configId(categoryId, subcategoryId) {
  return `${categoryId}_${subcategoryId}`;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function defaultMatcher(sub) {
  return {
    eligible_template_ids: ["gn_generic_v1"],
    default_rank_order: ["gn_generic_v1"],
  };
}

function buildConfig(category, sub) {
  const id = configId(category.id, sub.id);
  const configPath = path.join(catalogRoot, id, "category.config.json");
  const existing = fs.existsSync(configPath) ? loadJson(configPath) : null;

  return {
    id,
    name: `${segmentDisplay(category)} — ${sub.name}`,
    definition: sub.definition,
    category: category.id,
    subcategory: sub.id,
    wave: sub.wave ?? existing?.wave ?? 3,
    status: existing?.status ?? "active",
    default_family: sub.default_family,
    eligible_families: sub.eligible_families,
    keywords: sub.keywords,
    matcher: existing?.matcher ?? defaultMatcher(sub),
    image_pack_refs: existing?.image_pack_refs ?? [`pack_${sub.id}_v1`],
    questionnaire: existing?.questionnaire ?? SHARED_QUESTIONNAIRE,
    moderation: existing?.moderation ?? {
      blocked: false,
      notes: "Standard business — allowed",
    },
  };
}

function syncCategoryConfigs(taxonomy) {
  const written = [];
  for (const category of taxonomy.categories) {
    for (const sub of category.subcategories) {
      const id = configId(category.id, sub.id);
      const dir = path.join(catalogRoot, id);
      fs.mkdirSync(dir, { recursive: true });
      const config = buildConfig(category, sub);
      const configPath = path.join(dir, "category.config.json");
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
      written.push(id);
    }
  }
  return written;
}

function remapTemplatesCatalog() {
  const catalog = loadJson(templatesPath);
  let changed = 0;
  for (const template of catalog.templates) {
    const next = LEGACY_FAMILY_REMAP[template.family] ?? template.family;
    if (next !== template.family) {
      template.family = next;
      changed += 1;
    }
  }
  fs.writeFileSync(templatesPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf-8");
  return changed;
}

function validateFamilies(taxonomy, familiesCatalog) {
  const valid = new Set(familiesCatalog.families.map((f) => f.id));
  const errors = [];
  for (const category of taxonomy.categories) {
    for (const sub of category.subcategories) {
      if (!valid.has(sub.default_family)) {
        errors.push(`${sub.id}: invalid default_family ${sub.default_family}`);
      }
      for (const family of sub.eligible_families ?? []) {
        if (!valid.has(family)) {
          errors.push(`${sub.id}: invalid eligible_family ${family}`);
        }
      }
    }
  }
  return errors;
}

const checkOnly = process.argv.includes("--check");
const taxonomy = loadJson(taxonomyPath);
const familiesCatalog = loadJson(familiesPath);
const familyErrors = validateFamilies(taxonomy, familiesCatalog);
if (familyErrors.length) {
  console.error("Family validation failed:\n" + familyErrors.join("\n"));
  process.exit(1);
}

const configs = syncCategoryConfigs(taxonomy);
const templateChanges = remapTemplatesCatalog();

console.log(`Synced ${configs.length} category configs`);
console.log(`Remapped ${templateChanges} template family fields`);

if (checkOnly) {
  console.log("Check mode — files written for validation");
}
