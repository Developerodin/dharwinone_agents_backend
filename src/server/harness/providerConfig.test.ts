// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  envProviderOverrides,
  hasCloudCredentials,
  implementerMode,
  mergeProjectProviders,
} from "./providerConfig";

const ENV_KEYS = [
  "STUDIO_IMPLEMENTER",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "STUDIO_HARNESS_PLANNER_PROVIDER",
  "STUDIO_HARNESS_PLANNER_MODEL",
  "STUDIO_ONBOARDING_MODEL",
  "STUDIO_ONBOARDING_PROVIDER",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("providerConfig", () => {
  it("auto mode picks cloud when API key present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(implementerMode()).toBe("cloud");
  });

  it("auto mode picks aider without cloud credentials", () => {
    expect(implementerMode()).toBe("aider");
    expect(hasCloudCredentials()).toBe(false);
  });

  it("merges env overrides over project providers", () => {
    process.env.STUDIO_HARNESS_PLANNER_PROVIDER = "openai";
    process.env.STUDIO_HARNESS_PLANNER_MODEL = "gpt-4o-mini";
    const merged = mergeProjectProviders({ planner: { kind: "ollama", model: "local" } });
    expect(merged.planner?.kind).toBe("openai");
    expect(merged.planner?.model).toBe("gpt-4o-mini");
  });

  it("falls back to onboarding model for planner", () => {
    process.env.STUDIO_ONBOARDING_MODEL = "gpt-4o-mini";
    process.env.STUDIO_ONBOARDING_PROVIDER = "openai";
    const overrides = envProviderOverrides();
    expect(overrides.planner?.model).toBe("gpt-4o-mini");
  });
});
