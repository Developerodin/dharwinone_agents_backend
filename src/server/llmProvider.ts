import fs from "node:fs";
import { backendPath } from "./paths";
import { get, type Provider, type ProviderConfig, type StageProviderConfig } from "./providers";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const HARNESS_CFG = backendPath("harness/config.yaml");

let disabledUntil = 0;
let cached: { provider: Provider; model: string } | null = null;
let loadOverride: (() => [Provider | null, string | null]) | null = null;

export function llmEnabled(): boolean {
  const raw = (process.env.STUDIO_ONBOARDING_LLM ?? "true").trim().toLowerCase();
  return TRUTHY.has(raw);
}

export function setLoadProviderForTests(fn: (() => [Provider | null, string | null]) | null): void {
  loadOverride = fn;
}

export function resetLlmProviderForTests(): void {
  disabledUntil = 0;
  cached = null;
  loadOverride = null;
}

function onboardingProviderOverride(): StageProviderConfig | null {
  const model = (process.env.STUDIO_ONBOARDING_MODEL || "").trim();
  const kind = (process.env.STUDIO_ONBOARDING_PROVIDER || "").trim().toLowerCase();
  const baseUrl = (process.env.STUDIO_ONBOARDING_BASE_URL || "").trim();
  if (!model && !kind && !baseUrl) return null;
  const resolvedKind = kind || (model.toLowerCase().startsWith("gpt-") ? "openai" : "ollama");
  if (!model) throw new Error("STUDIO_ONBOARDING_MODEL must be set when onboarding override is used");
  const stageCfg: StageProviderConfig = { kind: resolvedKind, model };
  if (baseUrl) stageCfg.baseUrl = baseUrl;
  return stageCfg;
}

// ponytail: regex-parse harness/config.yaml instead of adding a yaml dep
function parseHarnessCfg(): ProviderConfig {
  const raw = fs.readFileSync(HARNESS_CFG, "utf8");
  const ollamaMatch = raw.match(/^ollama_url:\s*(\S+)/m);
  const plannerMatch = raw.match(/^\s+planner:\s*(\S+)/m);
  return {
    ollamaUrl: ollamaMatch?.[1] ?? "http://localhost:11434",
    providers: plannerMatch
      ? { planner: { kind: "ollama", model: plannerMatch[1] } }
      : undefined,
  };
}

export function loadOnboardingProvider(): [Provider | null, string | null] {
  if (loadOverride) return loadOverride();
  if (!llmEnabled()) return [null, null];
  const now = Date.now() / 1000;
  if (now < disabledUntil) return [null, null];
  if (cached) return [cached.provider, cached.model];
  try {
    const override = onboardingProviderOverride();
    const cfg = parseHarnessCfg();
    let model: string;
    if (override) {
      cfg.providers = { ...cfg.providers, planner: override };
      model = override.model!;
    } else {
      model = cfg.providers?.planner?.model ?? "";
      if (!model) throw new Error("planner model not configured");
    }
    const provider = get(cfg, "planner");
    cached = { provider, model };
    return [provider, model];
  } catch {
    disabledUntil = now + 30;
    return [null, null];
  }
}

export function loadEditProvider(): [Provider | null, string | null] {
  return loadOnboardingProvider();
}

export function disableLlmBriefly(seconds = 30): void {
  disabledUntil = Date.now() / 1000 + seconds;
  cached = null;
}
