// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { Provider } from "../providers";
import { resetLlmProviderForTests, setLoadProviderForTests } from "../llmProvider";
import { generateSiteContentStreaming } from "./contentAgentService";
import {
  sectionEmitOrder,
  streamContentSections,
  tryExtractSection,
} from "./contentAgentStream";

const SECTION_SCHEMA = {
  sections: ["hero", "services", "seo"],
  schema: {
    hero: {
      headline: { type: "string", maxLength: 40 },
      subtext: { type: "string", maxLength: 140 },
      cta_text: { type: "string", maxLength: 25 },
    },
    services: {
      items: {
        maxItems: 2,
        item: {
          title: { type: "string", maxLength: 40 },
          desc: { type: "string", maxLength: 120 },
        },
      },
    },
  },
};

const BUSINESS_PROFILE = { business_name: "Sharma Electricals", language: "en" };

afterEach(() => resetLlmProviderForTests());

describe("tryExtractSection", () => {
  it("extracts hero from a partial buffer before services completes", () => {
    const buffer =
      '{"hero":{"headline":"Power on","subtext":"24/7","cta_text":"Call"},"services":{"items":[{"title":"Wir';
    const hero = tryExtractSection(buffer, "hero");
    expect(hero).toEqual({
      headline: "Power on",
      subtext: "24/7",
      cta_text: "Call",
    });
    expect(tryExtractSection(buffer, "services")).toBeNull();
  });
});

describe("sectionEmitOrder", () => {
  it("puts hero first and seo last", () => {
    expect(sectionEmitOrder(SECTION_SCHEMA)).toEqual(["hero", "services", "seo"]);
    expect(
      sectionEmitOrder({
        sections: ["services", "hero", "why_us", "seo"],
      }),
    ).toEqual(["hero", "services", "why_us", "seo"]);
  });
});

describe("streamContentSections", () => {
  it("emits hero before services when stream completes hero first", async () => {
    const heroJson = '{"headline":"Hi","subtext":"Nice","cta_text":"Go"}';
    const servicesJson = '{"items":[{"title":"Wiring","desc":"Safe"}]}';
    const chunks = [
      `{"hero":${heroJson}`,
      `,"services":${servicesJson}}`,
    ];

    const provider: Provider = {
      generate: async () => {
        throw new Error("sync generate should not be used");
      },
      healthy: async () => true,
      async *generateStream() {
        for (const chunk of chunks) yield chunk;
      },
    };

    const keys: string[] = [];
    for await (const evt of streamContentSections({
      provider,
      model: "test",
      prompt: "x",
      sectionSchema: SECTION_SCHEMA,
      assemble: (partial) => ({
        content: {
          hero: (partial.hero as Record<string, unknown>) ?? { headline: "fallback" },
          services: (partial.services as Record<string, unknown>) ?? { items: [] },
          seo: { title: "Sharma Electricals", description: "Local electrician." },
        },
        usedFallback: false,
      }),
    })) {
      if (evt.type === "section") keys.push(evt.key);
    }

    expect(keys.indexOf("hero")).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf("services")).toBeGreaterThan(keys.indexOf("hero"));
  });
});

describe("generateSiteContentStreaming", () => {
  it("uses assemble fallback when provider is null (usedFallback true)", async () => {
    setLoadProviderForTests(() => [null, null]);

    const events: Array<{ type: string; usedFallback?: boolean }> = [];
    for await (const evt of generateSiteContentStreaming({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    })) {
      if (evt.type === "done") {
        events.push({ type: "done", usedFallback: evt.usedFallback });
      } else {
        events.push({ type: evt.type });
      }
    }

    const done = events.find((e) => e.type === "done");
    expect(done?.usedFallback).toBe(true);
    expect(events.some((e) => e.type === "section")).toBe(true);
  });

  it("uses assemble fallback when stream yields empty/invalid JSON", async () => {
    const provider: Provider = {
      generate: async () => "",
      healthy: async () => true,
      async *generateStream() {
        yield "{not-json";
        yield " still broken";
      },
    };
    setLoadProviderForTests(() => [provider, "test-model"]);

    let usedFallback = false;
    for await (const evt of generateSiteContentStreaming({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    })) {
      if (evt.type === "done") usedFallback = evt.usedFallback;
    }
    expect(usedFallback).toBe(true);
  });
});
