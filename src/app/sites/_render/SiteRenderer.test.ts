import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "./SiteRenderer";

describe("SiteRenderer", () => {
  it("renders sections in sectionOrder and emits LocalBusiness JSON-LD", () => {
    const html = renderToStaticMarkup(
      React.createElement(SiteRenderer, {
        family: "warm",
        contentJson: {
          hero: { headline: "Hero title", cta_text: "Call" },
          services: { section_title: "Services", items: [{ title: "Wiring", desc: "Safe installs" }] },
          cta_footer: { headline: "Footer CTA", cta_text: "Go" },
          seo: { title: "Acme Co" },
        },
        themeJson: {
          sectionOrder: ["hero", "services", "cta_footer"],
        },
        businessProfileJson: {
          business_name: "Acme Co",
          whatsapp_number: "+919876543210",
        },
        sectionSchemaSections: ["hero", "services", "why_us", "testimonials", "cta_footer"],
        resolvedImages: {},
      }),
    );

    const heroIdx = html.indexOf('data-section="hero"');
    const servicesIdx = html.indexOf('data-section="services"');
    const footerIdx = html.indexOf('data-section="cta_footer"');
    expect(heroIdx).toBeGreaterThan(-1);
    expect(servicesIdx).toBeGreaterThan(heroIdx);
    expect(footerIdx).toBeGreaterThan(servicesIdx);
    expect(html).toContain('"@type":"LocalBusiness"');
    expect(html).toContain("Acme Co");
  });
});
