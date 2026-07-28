/**
 * Rewrites category.config.json matcher blocks to BESPOKE-only eligible_template_ids.
 * Run from backend/: node scripts/apply_bespoke_matcher.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const categoriesDir = path.join(__dirname, "../assets/categories");

const DEFAULT_BESPOKE = "gn_axon_v1";

const BESPOKE_BY_SEGMENT_SUBCATEGORY = {
  "health_education|fitness_gym": ["he_fitness_v1", "he_fitness_v2"],
  "health_education|clinic_medical": ["he_vibrant_wellness_v1"],
  "health_education|education_coaching": ["he_vibrant_wellness_v1", "gn_axon_v1"],
  "professional|portfolio_freelancer": ["pf_portfolio_jack_v1"],
  "professional|personal_blog": ["pf_blog_scroll_v1"],
  "professional|saas_startup": ["gn_axon_v1", "ps_securify_v1"],
  "professional|agency_studio": ["gn_axon_v1", "pf_portfolio_jack_v1"],
  "creative_media|content_creator": ["pf_portfolio_jack_v1"],
  "creative_media|design_studio": ["pf_portfolio_jack_v1"],
  "creative_media|photographer": ["pf_portfolio_jack_v1"],
  "beauty_wellness|nutrition_coach": ["he_vibrant_wellness_v1"],
  "beauty_wellness|salon_spa": ["he_vibrant_wellness_v1"],
  "beauty_wellness|wellness_studio": ["he_vibrant_wellness_v1"],
  "hospitality_travel|cafe": ["he_vibrant_wellness_v1"],
  "hospitality_travel|restaurant": ["he_vibrant_wellness_v1"],
  "hospitality_travel|travel_tourism": ["he_vibrant_wellness_v1", "gn_axon_v1"],
  "events_weddings|catering_service": ["he_vibrant_wellness_v1"],
  "events_weddings|event_venue": ["he_vibrant_wellness_v1"],
  "events_weddings|wedding_planner": ["he_vibrant_wellness_v1", "pf_portfolio_jack_v1"],
  "legal_finance|accountant": ["ps_securify_v1", "gn_axon_v1"],
  "legal_finance|financial_advisor": ["ps_securify_v1", "gn_axon_v1"],
  "legal_finance|lawyer": ["ps_securify_v1", "gn_axon_v1"],
  "local_service|car_wash": ["gn_axon_v1"],
  "local_service|cleaning_handyman": ["gn_axon_v1"],
  "local_service|electrician": ["gn_axon_v1"],
  "local_service|insurance_agent": ["ps_securify_v1", "gn_axon_v1"],
  "local_service|landscaping": ["gn_axon_v1"],
  "local_service|plumbing": ["gn_axon_v1"],
  "nonprofit_community|community_group": ["he_vibrant_wellness_v1"],
  "nonprofit_community|nonprofit": ["he_vibrant_wellness_v1"],
  "nonprofit_community|religious_org": ["he_vibrant_wellness_v1"],
  "real_estate|agent": ["gn_axon_v1"],
  "real_estate|broker": ["gn_axon_v1"],
  "real_estate|luxury": ["gn_axon_v1", "pf_portfolio_jack_v1"],
  "real_estate|rental_consultant": ["gn_axon_v1"],
  "retail|boutique": ["pf_portfolio_jack_v1"],
  "retail|clothing": ["pf_portfolio_jack_v1"],
  "retail|gift_shop": ["pf_portfolio_jack_v1"],
  "retail|handmade": ["pf_portfolio_jack_v1"],
  "retail|print_shop": ["pf_portfolio_jack_v1"],
  "automotive|auto_detailing": ["gn_axon_v1"],
  "automotive|auto_repair": ["gn_axon_v1"],
  "automotive|car_dealer": ["gn_axon_v1", "pf_portfolio_jack_v1"],
};

function bespokeFor(category, subcategory) {
  const key = `${category}|${subcategory}`;
  return BESPOKE_BY_SEGMENT_SUBCATEGORY[key] ?? [DEFAULT_BESPOKE];
}

const configs = fs
  .readdirSync(categoriesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(categoriesDir, d.name, "category.config.json"))
  .filter((p) => fs.existsSync(p));

let updated = 0;
for (const configPath of configs) {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const ids = bespokeFor(config.category, config.subcategory);
  config.matcher = {
    eligible_template_ids: [...ids],
    default_rank_order: [...ids],
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`${config.id}: ${ids.join(", ")}`);
  updated++;
}

console.log(`\nUpdated ${updated} category configs to BESPOKE-only matchers.`);
