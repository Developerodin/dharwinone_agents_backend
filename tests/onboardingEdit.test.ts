import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLlmProviderForTests, setLoadProviderForTests } from "@/server/llmProvider";
import type { Provider } from "@/server/providers";
import * as profilesRepo from "@/server/repos/profilesRepo";
import { applyEdit, EditValidationError } from "@/server/services/editService";
import {
  clarifyMessageForTests,
  handleMessage,
  skipMessageForTests,
} from "@/server/services/onboardingService";
import { computeCompleteness } from "@/server/services/profileService";

const SAMPLE_HTML = `<!DOCTYPE html><html><head><style>.hero{color:red}</style></head><body data-section="hero"><section data-section="hero"><h1>Old headline</h1><p class="tagline">Old tagline</p></section></body></html>`;

vi.mock("@/server/repos/workingHtmlRepo", () => ({
  requireHtml: vi.fn(async () => SAMPLE_HTML),
  put: vi.fn(async () => ({})),
  get: vi.fn(async () => ({ selectedTemplateId: "tpl-1", html: SAMPLE_HTML })),
}));

vi.mock("@/server/repos/editsRepo", () => ({
  append: vi.fn(async () => ({})),
}));

vi.mock("@/server/repos/profilesRepo", () => ({
  get: vi.fn(async () => ({
    projectId: "proj-1",
    brand: {},
    business: {},
    location: {},
  })),
  save: vi.fn(async (p: Record<string, unknown>) => p),
}));

vi.mock("@/server/repos/versionsRepo", () => ({
  create: vi.fn(async () => ({ versionId: "ver-1" })),
}));

vi.mock("@/server/repos/templatesRepo", () => ({
  get: vi.fn(async () => ({ htmlContent: SAMPLE_HTML })),
  listForProject: vi.fn(async () => []),
}));

vi.mock("@/server/repos/projectsRepo", () => ({
  get: vi.fn(async () => ({ projectId: "proj-1", projectName: "Test" })),
}));

vi.mock("@/server/repos/conversationsRepo", () => ({
  appendTurn: vi.fn(async () => ({ role: "user", text: "", ts: 0 })),
  listTurns: vi.fn(async () => []),
}));

function fakeProvider(html: string): Provider {
  return {
    generate: vi.fn(async () => html),
    healthy: vi.fn(async () => true),
  };
}

describe("editService", () => {
  beforeEach(() => {
    process.env.STUDIO_ONBOARDING_LLM = "true";
    resetLlmProviderForTests();
  });

  afterEach(() => {
    resetLlmProviderForTests();
    delete process.env.STUDIO_ONBOARDING_LLM;
  });

  it("applies regex tagline edit without LLM", async () => {
    const result = await applyEdit("proj-1", "change tagline to Fresh coffee daily");
    expect(result.changeScope).toBe("content");
    expect(String(result.html)).toContain("Fresh coffee daily");
  });

  it("applies free-form edit via mock LLM", async () => {
    const updated =
      '<!DOCTYPE html><html><head><style>.hero{color:red}</style></head><body><h1>Rewritten headline</h1></body></html>';
    setLoadProviderForTests(() => [fakeProvider(updated), "mock-model"]);
    const result = await applyEdit("proj-1", "Rewrite the hero headline to sound more premium");
    expect(result.changeScope).toBe("content");
    expect(String(result.html)).toContain("Rewritten headline");
  });

  it("returns clarification for ambiguous prompts", async () => {
    process.env.STUDIO_ONBOARDING_LLM = "false";
    await expect(applyEdit("proj-1", "change this site")).rejects.toBeInstanceOf(EditValidationError);
  });
});

describe("onboardingService", () => {
  beforeEach(() => {
    process.env.STUDIO_ONBOARDING_LLM = "false";
    resetLlmProviderForTests();
  });

  it("detects skip and clarify regex fallbacks", () => {
    expect(skipMessageForTests("skip")).toBe(true);
    expect(clarifyMessageForTests("what do you mean by that?")).toBe(true);
  });

  it("handles ready profile and startGeneration flow", async () => {
    const profile = {
      projectId: "proj-1",
      brand: { brandName: "Flutoi" },
      business: {
        type: "coffee shop",
        services: ["espresso", "pastries"],
        description: "Handcrafted coffee in Jaipur",
        targetAudience: "Locals",
      },
      location: { country: "India", city: "Jaipur" },
    };
    computeCompleteness(profile);
    vi.mocked(profilesRepo.get).mockResolvedValue(profile as never);
    vi.mocked(profilesRepo.save).mockImplementation(async (p) => p as never);

    const greet = await handleMessage("proj-1", "hello there");
    expect(greet.readyToGenerate).toBe(true);
    expect(String(greet.assistantMessage)).toMatch(/generate|go ahead/i);

    const go = await handleMessage("proj-1", "go ahead and generate templates");
    expect(go.startGeneration).toBe(true);
    expect(String(go.assistantMessage)).toMatch(/kicking off|generate|template/i);
  });
});
