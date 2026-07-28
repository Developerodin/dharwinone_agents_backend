// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { Provider } from "../providers";
import { resetLlmProviderForTests, setLoadProviderForTests } from "../llmProvider";
import { generateSiteContent } from "./contentAgentService";

/** Inject a fake LLM provider whose generate() always returns `raw`. */
function useProviderReturning(raw: string): void {
  const provider: Provider = {
    generate: async () => raw,
    healthy: async () => true,
  };
  setLoadProviderForTests(() => [provider, "test-model"]);
}

const SECTION_SCHEMA = {
  schema: {
    hero: {
      headline: { type: "string", maxLength: 10 },
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

function validSection(overrides: Record<string, unknown> = {}) {
  return {
    hero: { headline: "Hi there", subtext: "Nice", cta_text: "Call now" },
    services: { items: [{ title: "Wiring", desc: "Safe wiring." }] },
    seo: { title: "Sharma Electricals", description: "Local electrician." },
    ...overrides,
  };
}

describe("generateSiteContent", () => {
  afterEach(() => resetLlmProviderForTests());

  it("clamps an over-length string field to maxLength", async () => {
    useProviderReturning(
      JSON.stringify(validSection({ hero: { headline: "HELLOWORLDEXTRA", subtext: "S", cta_text: "C" } })),
    );
    const { content, usedFallback } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    expect((content.hero as { headline: string }).headline).toBe("HELLOWORLD");
    expect(usedFallback).toBe(false);
  });

  it("clamps an over-count array to maxItems", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ title: `S${i}`, desc: "d" }));
    useProviderReturning(JSON.stringify(validSection({ services: { items } })));
    const { content } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    expect((content.services as { items: unknown[] }).items).toHaveLength(2);
  });

  it("strips HTML/markdown from string content fields", async () => {
    useProviderReturning(
      JSON.stringify(
        validSection({
          hero: { headline: "Hi", subtext: "<b>Bold</b> **and** <i>clean</i>", cta_text: "Go" },
        }),
      ),
    );
    const { content } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    expect((content.hero as { subtext: string }).subtext).toBe("Bold and clean");
  });

  it("preserves valid sections and fills missing ones from defaults (usedFallback=true)", async () => {
    // Model returns only a valid hero — services and seo are missing.
    useProviderReturning(
      JSON.stringify({ hero: { headline: "Hi", subtext: "Nice", cta_text: "Go" } }),
    );
    const { content, usedFallback } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    expect(usedFallback).toBe(true);
    expect((content.hero as { headline: string }).headline).toBe("Hi"); // kept
    expect(content.services).toBeDefined(); // filled from default
    expect((content.seo as { title: string }).title).toBe("Sharma Electricals"); // default uses name
  });

  it("returns usedFallback=false when all sections are valid", async () => {
    useProviderReturning(JSON.stringify(validSection()));
    const { content, usedFallback } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    expect(usedFallback).toBe(false);
    expect((content.hero as { headline: string }).headline).toBe("Hi there");
    expect((content.seo as { title: string }).title).toBe("Sharma Electricals");
  });

  it("canonicalizes model field aliases to the render schema", async () => {
    useProviderReturning(
      JSON.stringify(
        validSection({
          faq: { section_title: "FAQ", items: [{ question: "Open?", answer: "Daily" }] },
          pricing: { section_title: "Menu", items: [{ title: "Coffee", desc: "Fresh brew", price: "50" }] },
          cta_footer: { text: "Visit us today", cta_text: "Book" },
          testimonials: { section_title: "Reviews", items: [{ name: "A", quote: "Great", image: "a.jpg" }] },
        }),
      ),
    );
    const { content } = await generateSiteContent({
      businessProfile: BUSINESS_PROFILE,
      sectionSchema: SECTION_SCHEMA,
    });
    const faq = content.faq as { items: Record<string, unknown>[] };
    expect(faq.items[0].q).toBe("Open?");
    expect(faq.items[0].a).toBe("Daily");
    expect(faq.items[0].question).toBeUndefined();

    const pricing = content.pricing as { items: Record<string, unknown>[] };
    expect(pricing.items[0].name).toBe("Coffee");
    expect(pricing.items[0].price).toBe("50");
    expect(pricing.items[0].features).toContain("Fresh brew");
    expect(pricing.items[0].title).toBeUndefined();

    expect((content.cta_footer as { headline: string }).headline).toBe("Visit us today");
    expect((content.cta_footer as Record<string, unknown>).text).toBeUndefined();

    const testimonials = content.testimonials as { items: Record<string, unknown>[] };
    expect(testimonials.items[0].avatar).toBe("a.jpg");
  });

  it("injects contact phone and address from businessProfile", async () => {
    useProviderReturning(
      JSON.stringify(validSection({ contact: { section_title: "Get In Touch" } })),
    );
    const { content } = await generateSiteContent({
      businessProfile: { ...BUSINESS_PROFILE, whatsapp_number: "8755887760", city: "Jaipur" },
      sectionSchema: SECTION_SCHEMA,
    });
    const contact = content.contact as { phone: string; address: string };
    expect(contact.phone).toBe("+91 87558 87760");
    expect(contact.address).toBe("Jaipur");
  });

  it("stamps portfolio hero headline from business_name when still on Jack default", async () => {
    useProviderReturning(
      JSON.stringify(
        validSection({
          hero: { headline: "Hi, i'm jack", subtext: "3D creator", cta_text: "Contact Me" },
        }),
      ),
    );
    const { content } = await generateSiteContent({
      businessProfile: { business_name: "Maya Chen", language: "en" },
      sectionSchema: {
        template_id: "pf_portfolio_jack_v1",
        schema: SECTION_SCHEMA.schema,
      },
    });
    expect((content.hero as { headline: string }).headline).toBe("Hi, I'm Maya");
  });
});
