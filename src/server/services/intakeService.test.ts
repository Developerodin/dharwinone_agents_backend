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
  normalizeCountryInProfileForTests,
  regexPrefillForTests,
  resolveQuestionnaireForProfile,
  suggestedServicesForField,
} from "./intakeService";
import { getConfigBySegmentSubcategory } from "../data/categoryCatalog";
import type { QuestionnaireConfig } from "../schemas/intakeSchemas";

const LOCAL_SERVICE_QUESTIONNAIRE = {
  required: ["business_name", "city", "services", "cta_preference"],
  recommended: ["service_area", "tone_preference", "phone", "whatsapp_number", "email"],
  fields: {
    business_name: {
      label: "Business name",
      tier: "required",
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
    email: {
      label: "Email address",
      tier: "optional",
      followUp: "What email address should customers use to reach you?",
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
        subcategory: "restaurant",
        category: "hospitality_travel",
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(false);
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/name of your restaurant/i);
  });

  it("asks for hospital name when profile is clinic_medical with hospital hint", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "clinic_medical",
        entity_label: "hospital",
      },
      {
        required: ["business_name", "city", "facility_type", "services", "cta_preference"],
        fields: {
          business_name: { label: "Business name", tier: "required" },
          city: { label: "Primary city", tier: "required" },
          facility_type: { label: "Facility type", tier: "required", type: "enum", options: ["dental_clinic"] },
          services: { label: "Main services", tier: "required" },
          cta_preference: {
            label: "Preferred CTA",
            tier: "required",
            type: "enum",
            options: ["whatsapp", "phone", "form"],
          },
        },
      },
    );
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/name of your hospital/i);
    expect(result.followUps[0]?.question).not.toMatch(/business/i);
  });

  it("asks for shop name for retail profiles", () => {
    const result = gapCheckForTests(
      { category: "retail", subcategory: "gift_shop" },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/name of your shop/i);
  });

  it("asks for electrical service name for electrician profiles", () => {
    const result = gapCheckForTests(
      { category: "local_service", subcategory: "electrician" },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/electrical service/i);
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
        email: "hello@sharma.example",
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

  it("asks for email after whatsapp number is provided", () => {
    const result = gapCheckForTests(
      {
        business_name: "Iron Leaf Fitness",
        city: "Jaipur",
        services: ["gym", "personal training"],
        cta_preference: "whatsapp",
        whatsapp_number: "8755887760",
      },
      LOCAL_SERVICE_QUESTIONNAIRE,
    );
    expect(result.complete).toBe(false);
    const email = result.followUps.find((q) => q.field === "email");
    expect(email).toBeDefined();
    expect(email?.question).toMatch(/email address/i);
  });
});

describe("gap-check portfolio creator name", () => {
  const PORTFOLIO_QUESTIONNAIRE = {
    required: ["business_name", "city", "services", "cta_preference"],
    fields: {
      business_name: {
        label: "Your name",
        tier: "required",
        followUp: 'What name should appear on your portfolio? For example, "Alex" or "Sam Rivera".',
      },
      city: { label: "Primary city", tier: "required" },
      services: { label: "Main services", tier: "required", type: "tags" },
      cta_preference: {
        label: "Preferred CTA",
        tier: "required",
        type: "enum",
        options: ["whatsapp", "phone", "form"],
      },
    },
  };

  it("asks for creator name with portfolio-specific follow-up", () => {
    const result = gapCheckForTests({ city: "Jaipur", services: ["3D modeling"] }, PORTFOLIO_QUESTIONNAIRE);
    expect(result.complete).toBe(false);
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/portfolio/i);
  });

  it("asks optional linkedin_id after core profile is filled", () => {
    const questionnaire = {
      ...PORTFOLIO_QUESTIONNAIRE,
      fields: {
        ...PORTFOLIO_QUESTIONNAIRE.fields,
        linkedin_id: { label: "LinkedIn profile", tier: "optional" },
        x_account: { label: "X account", tier: "optional" },
      },
    };
    const result = gapCheckForTests(
      {
        business_name: "Alex",
        city: "Jaipur",
        services: ["3D modeling"],
        cta_preference: "whatsapp",
        whatsapp_number: "9876543210",
        email: "alex@studio.com",
      },
      questionnaire,
    );
    expect(result.followUps.some((q) => q.field === "linkedin_id")).toBe(true);
    expect(result.followUps.find((q) => q.field === "linkedin_id")?.question).toMatch(/linkedin/i);
  });
});

describe("gap-check clinic medical service picker", () => {
  const CLINIC_MEDICAL_QUESTIONNAIRE = {
    required: ["business_name", "city", "facility_type", "services", "cta_preference"],
    fields: {
      business_name: { label: "Business name", tier: "required" },
      city: { label: "Primary city", tier: "required" },
      facility_type: {
        label: "Facility type",
        tier: "required",
        type: "enum",
        options: ["general_multi_department", "dental_clinic", "diagnostic_lab"],
        option_labels: {
          general_multi_department: "General multi-department hospital",
          dental_clinic: "Dental clinic",
          diagnostic_lab: "Diagnostic center",
        },
        followUp: "What type of facility do you run?",
      },
      services: {
        label: "Main services",
        tier: "required",
        type: "service_picker",
      },
      cta_preference: {
        label: "Preferred CTA",
        tier: "required",
        type: "enum",
        options: ["whatsapp", "phone", "form"],
      },
    },
    service_catalog: {
      general_multi_department: {
        suggested_services: [
          "Emergency & Trauma",
          "ICU & Critical Care",
          "General Surgery",
          "Diagnostics & Imaging",
          "Neurology",
          "Oncology",
        ],
        featured_services: [
          "Emergency & Trauma",
          "ICU & Critical Care",
          "General Surgery",
          "Diagnostics & Imaging",
        ],
      },
      dental_clinic: {
        suggested_services: ["General Dentistry", "Root Canal", "Dental Implants"],
      },
    },
  };

  it("asks facility_type before services when both are missing", () => {
    const result = gapCheckForTests(
      { business_name: "Sharma Clinic", city: "Jaipur" },
      CLINIC_MEDICAL_QUESTIONNAIRE,
    );
    expect(result.followUps[0]?.field).toBe("facility_type");
    expect(result.followUps[0]?.inputType).toBe("enum");
    expect(result.followUps[0]?.options).toContain("dental_clinic");
    expect(result.followUps.some((q) => q.field === "services")).toBe(false);
  });

  it("offers type-specific clinic services after facility_type is set", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Clinic",
        city: "Jaipur",
        facility_type: "dental_clinic",
      },
      CLINIC_MEDICAL_QUESTIONNAIRE,
    );
    const services = result.followUps.find((q) => q.field === "services");
    expect(services).toBeDefined();
    expect(services?.inputType).toBe("service_picker");
    expect(services?.suggestedServices).toContain("Root Canal");
    expect(services?.suggestedServices).not.toContain("Emergency & Trauma");
    expect(services?.question).toMatch(/Root Canal/);
    expect(services?.question).toMatch(/yes/i);
  });

  it("uses curated featured services for multi-department hospitals", () => {
    const result = gapCheckForTests(
      {
        business_name: "City Hospital",
        city: "Jaipur",
        facility_type: "general_multi_department",
      },
      CLINIC_MEDICAL_QUESTIONNAIRE,
    );
    const services = result.followUps.find((q) => q.field === "services");
    expect(services?.suggestedServices).toEqual([
      "Emergency & Trauma",
      "ICU & Critical Care",
      "General Surgery",
      "Diagnostics & Imaging",
    ]);
    expect(services?.suggestedServices).not.toContain("Neurology");
  });

  it("does not ask for services when a concrete list is already present", () => {
    const result = gapCheckForTests(
      {
        business_name: "Sharma Clinic",
        city: "Jaipur",
        facility_type: "dental_clinic",
        services: ["General Dentistry", "Root Canal"],
        cta_preference: "phone",
        phone: "+919876543210",
      },
      CLINIC_MEDICAL_QUESTIONNAIRE,
    );
    expect(result.followUps.some((q) => q.field === "services")).toBe(false);
  });

  it("merges clinic_medical service_picker from file catalog over segment defaults", () => {
    const segmentQuestionnaire = {
      required: ["business_name", "city", "services", "cta_preference"],
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
      },
    };
    const merged = resolveQuestionnaireForProfile(segmentQuestionnaire, {
      category: "health_education",
      subcategory: "clinic_medical",
    });
    expect(merged.fields?.services?.type).toBe("service_picker");
    expect(merged.required).toContain("facility_type");
    expect(merged.service_catalog?.dental_clinic?.suggested_services).toContain("Root Canal");

    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "clinic_medical",
        business_name: "Sharma Clinic",
        city: "Jaipur",
        facility_type: "general_multi_department",
      },
      merged,
    );
    const services = result.followUps.find((q) => q.field === "services");
    expect(services?.inputType).toBe("service_picker");
    expect(services?.suggestedServices).toContain("Emergency & Trauma");
  });

  it("resolves featured services via suggestedServicesForField helper", () => {
    const list = suggestedServicesForField(
      CLINIC_MEDICAL_QUESTIONNAIRE,
      "services",
      { facility_type: "general_multi_department" },
    );
    expect(list).toEqual([
      "Emergency & Trauma",
      "ICU & Critical Care",
      "General Surgery",
      "Diagnostics & Imaging",
    ]);
  });
});

describe("regex prefill heuristic", () => {
  it("routes electrician niche but does not invent city/services/name (user will be asked)", () => {
    const profile = regexPrefillForTests(
      "Sharma Electricals — 24/7 electrician in Kolkata, wiring and AC repair",
      "local_service",
      "electrician",
    );
    expect(profile.subcategory).toBe("electrician");
    expect(profile.business_name).toBeUndefined();
    expect(profile.city).toBeUndefined();
    expect(profile.services).toBeUndefined();
    expect(profile.cta_preference).toBeUndefined();
  });

  it("routes medical hospital description to clinic_medical via taxonomy inference", () => {
    const profile = regexPrefillForTests(
      "I want to create a website for my medical hospital",
      "local_service",
    );
    expect(profile.category).toBe("health_education");
    expect(profile.subcategory).toBe("clinic_medical");
    expect(profile.entity_label).toBe("hospital");
  });

  it("routes personal blog description to personal_blog via taxonomy inference", () => {
    const profile = regexPrefillForTests(
      "Personal blog with clean typography and dark mode toggle",
      "local_service",
    );
    expect(profile.category).toBe("professional");
    expect(profile.subcategory).toBe("personal_blog");
    expect(profile.business_name).toBeUndefined();
  });
});

describe("gap-check personal blog intake", () => {
  const blogQuestionnaire = getConfigBySegmentSubcategory("professional", "personal_blog")
    ?.questionnaire as QuestionnaireConfig;

  it("asks for blog name and writing topics, not business service prompts", () => {
    const result = gapCheckForTests(
      { category: "professional", subcategory: "personal_blog" },
      blogQuestionnaire,
    );
    expect(result.complete).toBe(false);
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/blog/i);
    expect(result.followUps[0]?.question).not.toMatch(/name of your business/i);

    const topics = result.followUps.find((q) => q.field === "services");
    expect(topics).toBeDefined();
    expect(topics?.question).toMatch(/write about|topics|themes/i);
    expect(topics?.question).not.toMatch(/services should we highlight on your site/i);
  });

  it("offers writing tone and theme mode enums for blog profiles", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "personal_blog",
        business_name: "The Desk",
        services: ["essays", "productivity"],
        tagline: "Notes on thoughtful work",
      },
      blogQuestionnaire,
    );
    const tone = result.followUps.find((q) => q.field === "tone_preference");
    expect(tone?.inputType).toBe("enum");
    expect(tone?.options).toContain("technical");
    expect(tone?.question).toMatch(/writing tone|tone/i);

    const theme = result.followUps.find((q) => q.field === "theme_mode_preference");
    expect(theme?.inputType).toBe("enum");
    expect(theme?.options).toContain("toggle");
    expect(theme?.question).toMatch(/dark|light|toggle/i);
  });

  it("does not require city or service area for blog intake", () => {
    expect(blogQuestionnaire.required).not.toContain("city");
    expect(blogQuestionnaire.required).not.toContain("service_area");
    expect(blogQuestionnaire.required).not.toContain("country");
    expect(blogQuestionnaire.recommended).toContain("city");
    expect(blogQuestionnaire.recommended).not.toContain("country");
  });

  it("never asks for country on personal blog profiles", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "personal_blog",
        business_name: "The Desk",
        services: ["essays", "productivity"],
        tagline: "Notes on thoughtful work",
        tone_preference: "thoughtful",
        theme_mode_preference: "dark",
        cta_preference: "newsletter",
        email: "hello@desk.example",
      },
      blogQuestionnaire,
    );
    expect(result.followUps.some((q) => q.field === "country")).toBe(false);
  });
});

describe("gap-check portfolio freelancer intake", () => {
  const portfolioQuestionnaire = getConfigBySegmentSubcategory(
    "professional",
    "portfolio_freelancer",
  )?.questionnaire as QuestionnaireConfig;

  it("asks for creator name and specialties, not generic business prompts", () => {
    const result = gapCheckForTests(
      { category: "professional", subcategory: "portfolio_freelancer" },
      portfolioQuestionnaire,
    );
    expect(result.followUps[0]?.field).toBe("business_name");
    expect(result.followUps[0]?.question).toMatch(/portfolio/i);
    expect(result.followUps[0]?.question).not.toMatch(/name of your business/i);

    const services = result.followUps.find((q) => q.field === "services");
    expect(services).toBeDefined();
    expect(services?.inputType).toBe("service_picker");
    expect(services?.suggestedServices).toContain("Brand Identity");
    expect(services?.question).not.toMatch(/electrician|cafe/i);
  });

  it("requires tagline before optional social fields", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "portfolio_freelancer",
        business_name: "Alex",
        services: ["3D Modeling"],
        cta_preference: "form",
        email: "alex@studio.com",
      },
      portfolioQuestionnaire,
    );
    expect(result.followUps.some((q) => q.field === "tagline")).toBe(true);
    expect(portfolioQuestionnaire.required).not.toContain("city");
  });
});

describe("gap-check saas startup intake", () => {
  const saasQuestionnaire = getConfigBySegmentSubcategory("professional", "saas_startup")
    ?.questionnaire as QuestionnaireConfig;

  it("asks product type before feature picker and uses cybersecurity catalog for securify-style products", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "saas_startup",
        business_name: "Securify",
        tagline: "Security monitoring for modern teams",
      },
      saasQuestionnaire,
    );
    expect(result.followUps[0]?.field).toBe("product_type");
    expect(result.followUps.some((q) => q.field === "services")).toBe(false);

    const afterType = gapCheckForTests(
      {
        category: "professional",
        subcategory: "saas_startup",
        business_name: "Securify",
        tagline: "Security monitoring for modern teams",
        product_type: "cybersecurity",
      },
      saasQuestionnaire,
    );
    const features = afterType.followUps.find((q) => q.field === "services");
    expect(features?.inputType).toBe("service_picker");
    expect(features?.suggestedServices).toContain("Threat Detection");
    expect(features?.question).not.toMatch(/Main services/i);
  });

  it("offers demo/trial/form CTA options instead of whatsapp-first local business CTAs", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "saas_startup",
        business_name: "Axon",
        tagline: "Workflow automation for teams",
        product_type: "general_saas",
        services: ["Workflow Automation", "Integrations & API"],
        tone_preference: "professional",
      },
      saasQuestionnaire,
    );
    const cta = result.followUps.find((q) => q.field === "cta_preference");
    expect(cta?.options).toEqual(expect.arrayContaining(["demo", "trial", "form"]));
    expect(cta?.question).toMatch(/demo|trial|sales/i);
    expect(saasQuestionnaire.required).not.toContain("city");
    expect(saasQuestionnaire.required).toContain("country");
  });

  it("asks for country when other required SaaS fields are present", () => {
    const result = gapCheckForTests(
      {
        category: "professional",
        subcategory: "saas_startup",
        business_name: "Axon",
        tagline: "Workflow automation for teams",
        product_type: "general_saas",
        services: ["Workflow Automation", "Integrations & API"],
        cta_preference: "demo",
        tone_preference: "professional",
        email: "hello@axon.example",
      },
      saasQuestionnaire,
    );
    const country = result.followUps.find((q) => q.field === "country");
    expect(country).toBeDefined();
    expect(country?.question).toMatch(/country.*primarily serve|operate from/i);
  });
});

describe("gap-check fitness gym intake", () => {
  const fitnessQuestionnaire = getConfigBySegmentSubcategory("health_education", "fitness_gym")
    ?.questionnaire as QuestionnaireConfig;

  it("asks studio type before class picker with gym-specific services", () => {
    const result = gapCheckForTests(
      { category: "health_education", subcategory: "fitness_gym", business_name: "Iron Leaf", city: "Jaipur" },
      fitnessQuestionnaire,
    );
    expect(result.followUps[0]?.field).toBe("studio_type");
    expect(result.followUps.some((q) => q.field === "services")).toBe(false);

    const afterType = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "fitness_gym",
        business_name: "Iron Leaf",
        city: "Jaipur",
        studio_type: "gym",
      },
      fitnessQuestionnaire,
    );
    const classes = afterType.followUps.find((q) => q.field === "services");
    expect(classes?.inputType).toBe("service_picker");
    expect(classes?.suggestedServices).toContain("HIIT Workouts");
    expect(classes?.question).not.toMatch(/Emergency & Trauma|hospital/i);
  });

  it("uses membership CTA language instead of generic local-service prompts", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "fitness_gym",
        business_name: "Iron Leaf",
        city: "Jaipur",
        studio_type: "gym",
        services: ["HIIT Workouts", "Personal Training"],
      },
      fitnessQuestionnaire,
    );
    const cta = result.followUps.find((q) => q.field === "cta_preference");
    expect(cta?.question).toMatch(/membership|join|book/i);
    expect(result.followUps[0]?.question).not.toMatch(/hospital|facility/i);
  });

  it("asks for country when gym profile is otherwise complete", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "fitness_gym",
        business_name: "Iron Leaf",
        city: "Jaipur",
        studio_type: "gym",
        services: ["HIIT Workouts", "Personal Training"],
        cta_preference: "whatsapp",
        whatsapp_number: "9876543210",
      },
      fitnessQuestionnaire,
    );
    const country = result.followUps.find((q) => q.field === "country");
    expect(country).toBeDefined();
    expect(country?.question).toMatch(/country.*gym|studio/i);
    expect(fitnessQuestionnaire.required).toContain("country");
  });
});

describe("gap-check country intake", () => {
  const medicalQuestionnaire = getConfigBySegmentSubcategory("health_education", "clinic_medical")
    ?.questionnaire as QuestionnaireConfig;

  it("asks for country on clinic_medical when missing", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "clinic_medical",
        business_name: "City Hospital",
        city: "Jaipur",
        facility_type: "general_multi_department",
        services: ["Emergency & Trauma"],
        cta_preference: "phone",
        phone: "+919876543210",
      },
      medicalQuestionnaire,
    );
    const country = result.followUps.find((q) => q.field === "country");
    expect(country).toBeDefined();
    expect(country?.question).toMatch(/country.*clinic|hospital/i);
    expect(medicalQuestionnaire.required).toContain("country");
  });

  it("accepts country in business profile schema", () => {
    const profile = PrefillResponseSchema.parse({
      business_name: "City Hospital",
      city: "Jaipur",
      country: "India",
      country_code: "IN",
      category: "health_education",
    });
    expect(profile.country).toBe("India");
    expect(profile.country_code).toBe("IN");
  });

  it("normalizes USA acronym to canonical country and country_code", () => {
    const profile = normalizeCountryInProfileForTests({ country: "USA" });
    expect(profile.country).toBe("United States");
    expect(profile.country_code).toBe("US");
  });

  it("normalizes UAE acronym to canonical country and country_code", () => {
    const profile = normalizeCountryInProfileForTests({ country: "UAE" });
    expect(profile.country).toBe("United Arab Emirates");
    expect(profile.country_code).toBe("AE");
  });

  it("re-asks when country cannot be resolved", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "clinic_medical",
        business_name: "City Hospital",
        city: "Jaipur",
        country: "Atlantis",
        facility_type: "general_multi_department",
        services: ["Emergency & Trauma"],
        cta_preference: "phone",
        phone: "+919876543210",
      },
      medicalQuestionnaire,
    );
    const country = result.followUps.find((q) => q.field === "country");
    expect(country).toBeDefined();
    expect(country?.question).toMatch(/couldn't match that country/i);
    expect(result.complete).toBe(false);
  });

  it("accepts resolved country on otherwise complete medical profile", () => {
    const result = gapCheckForTests(
      {
        category: "health_education",
        subcategory: "clinic_medical",
        business_name: "City Hospital",
        city: "Jaipur",
        country: "UAE",
        facility_type: "general_multi_department",
        services: ["Emergency & Trauma"],
        cta_preference: "phone",
        phone: "+971501234567",
      },
      medicalQuestionnaire,
    );
    expect(result.followUps.some((q) => q.field === "country")).toBe(false);
  });
});
