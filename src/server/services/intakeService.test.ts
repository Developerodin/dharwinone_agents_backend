// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BusinessProfileSchema,
  GapCheckResponseSchema,
  parseBusinessProfilePartial,
  PrefillRequestSchema,
  PrefillResponseSchema,
} from "../schemas/intakeSchemas";
import {
  gapCheckForTests,
  isAmbiguousBusinessNameForTests,
  regexPrefillForTests,
} from "./intakeService";

const LOCAL_SERVICE_QUESTIONNAIRE = {
  required: ["business_name", "city", "services", "cta_preference"],
  recommended: ["service_area", "tone_preference", "phone", "whatsapp_number"],
  fields: {
    business_name: {
      label: "Business name",
      tier: "required",
      followUp: "What's the name of your business? This appears on your site header and contact sections.",
    },
    city: { label: "Primary city", tier: "required" },
    services: { label: "Main services", tier: "required", type: "tags" },
    cta_preference: {
      label: "Preferred CTA",
      tier: "required",
      type: "enum",
      options: ["whatsapp", "phone", "form"],
      followUp:
        "How should customers reach you on your site? Reply with WhatsApp, phone call, or contact form.",
    },
    service_area: {
      label: "Service areas",
      tier: "recommended",
      followUp: "Only Kolkata, or nearby areas too?",
    },
    whatsapp_number: { label: "WhatsApp number", tier: "recommended" },
    phone: {
      label: "Phone number",
      tier: "recommended",
      followUp: "What phone number should customers call? Include country code if helpful.",
    },
  },
};

describe("intake zod schemas", () => {
  it("validates prefill request", () => {
    const parsed = PrefillRequestSchema.parse({
      description: "Sharma Electricals — 24/7 electrician in Kolkata",
      category: "local_service",
      subcategory: "electrician",
    });
    expect(parsed.category).toBe("local_service");
  });

  it("rejects overlong business profile fields", () => {
    expect(() =>
      BusinessProfileSchema.parse({
        business_name: "x".repeat(100),
      }),
    ).toThrow();
  });

  it("accepts valid prefill response shape", () => {
    const profile = PrefillResponseSchema.parse({
      business_name: "Sharma Electricals",
      city: "Kolkata",
      services: ["wiring", "AC repair"],
      cta_preference: "whatsapp",
      category: "local_service",
    });
    expect(profile.city).toBe("Kolkata");
  });

  it("strips wizard metadata from partial business profile", () => {
    const profile = parseBusinessProfilePartial({
      business_name: "Sharma Electricals",
      category_id: "local_service",
      subcategory_id: "electrician",
      description: "Electrician in Kolkata",
      logo_provided: true,
      logo_filename: "logo.png",
      city: "Kolkata",
    });
    expect(profile.business_name).toBe("Sharma Electricals");
    expect(profile).not.toHaveProperty("category_id");
    expect(profile).not.toHaveProperty("logo_provided");
  });

  it("drops an invalid enum answer instead of throwing (gap-check must survive it)", () => {
    // Regression: a free-text reply ("what do you mean cta") landing in the
    // strict cta_preference enum used to throw a ZodError → raw 422 in the chat.
    const profile = parseBusinessProfilePartial({
      business_name: "Sharma Electricals",
      city: "Jaipur",
      cta_preference: "what do you mean cta",
    });
    expect(profile.business_name).toBe("Sharma Electricals");
    expect(profile.city).toBe("Jaipur");
    expect(profile).not.toHaveProperty("cta_preference");
  });
});

describe("gap-check enum follow-ups", () => {
  it("lists the valid options in the question so the user knows what to answer", () => {
    const result = gapCheckForTests(
      { business_name: "Sharma Electricals", city: "Jaipur", services: ["wiring", "AC repair"] },
      {
        required: ["business_name", "city", "services", "cta_preference"],
        fields: {
          cta_preference: {
            label: "Preferred CTA",
            tier: "required",
            type: "enum",
            options: ["whatsapp", "phone", "form"],
          },
        },
      },
    );
    const cta = result.followUps.find((q) => q.field === "cta_preference");
    expect(cta).toBeDefined();
    expect(cta?.question).toMatch(/WhatsApp|whatsapp/i);
    expect(cta?.question).toMatch(/phone/i);
    expect(cta?.question).toMatch(/form/i);
  });
});

describe("gap-check business name", () => {
  it("asks for business_name when prefill copied the whole description", () => {
    const description = "Restaurant website with menu, reservations, and location map";
    expect(isAmbiguousBusinessNameForTests(description)).toBe(true);

    const result = gapCheckForTests(
      {
        business_name: "Restaurant website with menu",
        services: ["menu", "reservations", "location map"],
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(false);
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/name of your business/i);
  });

  it("does not set business_name from a generic restaurant description", () => {
    const profile = regexPrefillForTests(
      "Restaurant website with menu, reservations, and location map",
      "local_service",
    );
    expect(profile.business_name).toBeUndefined();
    expect(profile.category).toBe("hospitality_travel");
    expect(profile.subcategory).toBe("restaurant");
  });
});

describe("gap-check logic", () => {
  it("returns complete when required fields are present", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Electricals",
        city: "Kolkata",
        services: ["wiring", "AC repair"],
        cta_preference: "whatsapp",
        whatsapp_number: "+919876543210",
        service_area: ["Kolkata", "Howrah"],
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(true);
    expect(result.followUps).toHaveLength(0);
    GapCheckResponseSchema.parse(result);
  });

  it("asks for missing required fields up to three", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Electricals",
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(false);
    expect(result.followUps.length).toBeGreaterThan(0);
    expect(result.followUps.length).toBeLessThanOrEqual(3);
    expect(result.followUps.map((q) => q.field)).toContain("city");
  });

  it("flags ambiguous service_area when only city is listed", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Electricals",
        city: "Kolkata",
        services: ["wiring", "AC repair"],
        cta_preference: "whatsapp",
        service_area: ["Kolkata"],
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.followUps.some((q) => q.field === "service_area")).toBe(true);
  });

  it("asks for whatsapp number when CTA is whatsapp", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Electricals",
        city: "Kolkata",
        services: ["wiring"],
        cta_preference: "whatsapp",
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.followUps.some((q) => q.field === "whatsapp_number")).toBe(true);
  });

  it("asks for phone number when CTA is phone", () => {
    const result = gapCheckForTests(
      {
        business_name: "Glune",
        city: "Jaipur",
        services: ["dining", "reservations"],
        cta_preference: "phone",
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(false);
    const phone = result.followUps.find((q) => q.field === "phone");
    expect(phone).toBeDefined();
    expect(phone?.question).toMatch(/phone number/i);
  });
});

describe("regex prefill heuristic", () => {
  it("extracts city and electrician services from description", () => {
    const profile = regexPrefillForTests(
      "Sharma Electricals — 24/7 electrician in Kolkata, wiring and AC repair",
      "local_service",
      "electrician",
    );
    expect(profile.city).toBe("Kolkata");
    expect(profile.subcategory).toBe("electrician");
    expect(Array.isArray(profile.services)).toBe(true);
  });
});
