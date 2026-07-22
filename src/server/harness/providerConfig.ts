/** Env-driven harness LLM provider selection (cloud-first). */
import type { StageProviderConfig } from "../providers";

const STAGE_ENV_KEYS = [
  ["planner", "STUDIO_HARNESS_PLANNER"],
  ["implementer_llm", "STUDIO_HARNESS_IMPLEMENTER"],
  ["reviewer", "STUDIO_HARNESS_REVIEWER"],
] as const;

function readStage(prefix: string): StageProviderConfig | null {
  const kind = (process.env[`${prefix}_PROVIDER`] ?? "").trim();
  const model = (process.env[`${prefix}_MODEL`] ?? "").trim();
  const baseUrl = (process.env[`${prefix}_BASE_URL`] ?? "").trim();
  if (!kind && !model && !baseUrl) return null;
  const cfg: StageProviderConfig = {};
  if (kind) cfg.kind = kind.toLowerCase();
  if (model) cfg.model = model;
  if (baseUrl) cfg.baseUrl = baseUrl;
  if (!cfg.kind && cfg.model?.toLowerCase().startsWith("gpt-")) cfg.kind = "openai";
  if (!cfg.kind && cfg.model?.toLowerCase().startsWith("claude")) cfg.kind = "anthropic";
  if (!cfg.kind) cfg.kind = "openai";
  return cfg;
}

export function envProviderOverrides(): Record<string, StageProviderConfig> {
  const out: Record<string, StageProviderConfig> = {};
  for (const [stage, prefix] of STAGE_ENV_KEYS) {
    const cfg = readStage(prefix);
    if (cfg) out[stage] = cfg;
  }
  if (!out.planner) {
    const model = (process.env.STUDIO_ONBOARDING_MODEL ?? "").trim();
    if (model) {
      out.planner = {
        kind: (process.env.STUDIO_ONBOARDING_PROVIDER ?? "openai").trim().toLowerCase(),
        model,
        baseUrl: (process.env.STUDIO_ONBOARDING_BASE_URL ?? "").trim() || undefined,
      };
    }
  }
  return out;
}

export function mergeProjectProviders(
  projectProviders: Record<string, StageProviderConfig | undefined> | null | undefined,
): Record<string, StageProviderConfig> {
  const out: Record<string, StageProviderConfig> = {};
  for (const [k, v] of Object.entries(projectProviders ?? {})) {
    if (v) out[k] = v;
  }
  Object.assign(out, envProviderOverrides());
  return out;
}

export function hasCloudCredentials(): boolean {
  return Boolean(
    (process.env.OPENAI_API_KEY ?? "").trim() || (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  );
}

export type ImplementerMode = "cloud" | "aider";

export function implementerMode(): ImplementerMode {
  const raw = (process.env.STUDIO_IMPLEMENTER ?? "auto").trim().toLowerCase();
  if (raw === "cloud") return "cloud";
  if (raw === "aider") return "aider";
  return hasCloudCredentials() ? "cloud" : "aider";
}

export function stageModel(
  mergedProviders: Record<string, StageProviderConfig>,
  stage: string,
  fallback: string,
): string {
  return mergedProviders[stage]?.model ?? fallback;
}
