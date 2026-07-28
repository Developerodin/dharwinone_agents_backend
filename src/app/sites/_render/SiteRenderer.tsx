import { FAMILIES, type FamilyId } from "./families";
import { buildImageMap, makeResolveImage } from "./imageMap";
import { resolveTheme } from "./resolveTheme";
import { SectionRouter } from "./sections/SectionRouter";
import { asString } from "./utils";
import { JackPortfolioShell } from "@/app/template-preview/portfolio/jack/JackPortfolioShell";
import { AxonShell } from "@/app/template-preview/generic/axon/AxonShell";
import { VibrantWellnessShell } from "@/app/template-preview/health/vibrant-wellness/VibrantWellnessShell";

export const JACK_PORTFOLIO_TEMPLATE_ID = "pf_portfolio_jack_v1";
export const AXON_TEMPLATE_ID = "gn_axon_v1";
export const VIBRANT_WELLNESS_TEMPLATE_ID = "he_vibrant_wellness_v1";

export interface RenderableSite {
  templateId?: string | null;
  family: FamilyId;
  contentJson: Record<string, unknown>;
  themeJson: Record<string, unknown>;
  businessProfileJson: Record<string, unknown>;
  sectionSchemaSections: string[];
  resolvedImages: Record<
    string,
    { url: string; alt: string; focalPoint?: { x: number; y: number } }[]
  >;
}

function buildJsonLd(businessProfile: Record<string, unknown>, content: Record<string, unknown>) {
  const seo = (content.seo as Record<string, unknown> | undefined) ?? {};
  const localBusiness = (content.localBusiness as Record<string, unknown> | undefined) ?? {};
  const name =
    asString(localBusiness.name) ||
    asString(businessProfile.business_name) ||
    asString(seo.title);
  const phone =
    asString(businessProfile.phone) ||
    asString(businessProfile.phone_number) ||
    asString(businessProfile.whatsapp_number);
  const address = asString(businessProfile.address) || asString(businessProfile.business_address);

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    telephone: phone || undefined,
    address: address ? { "@type": "PostalAddress", streetAddress: address } : undefined,
  };
}

export function SiteRenderer(site: RenderableSite): React.JSX.Element {
  if (site.templateId === JACK_PORTFOLIO_TEMPLATE_ID) {
    return <JackPortfolioShell />;
  }

  if (site.templateId === AXON_TEMPLATE_ID) {
    return <AxonShell />;
  }

  if (site.templateId === VIBRANT_WELLNESS_TEMPLATE_ID) {
    return <VibrantWellnessShell />;
  }

  const family = FAMILIES[site.family];
  const ctx = resolveTheme({
    family: site.family,
    themeJson: site.themeJson,
    sectionSchemaSections: site.sectionSchemaSections,
  });
  const resolveImage = makeResolveImage(site.resolvedImages);

  const jsonLd = buildJsonLd(site.businessProfileJson, site.contentJson);

  return (
    <main data-family={site.family} className="bg-background text-foreground font-body min-h-screen">
      {ctx.sectionOrder.map((sectionKey) => (
        <SectionRouter
          key={sectionKey}
          sectionKey={sectionKey}
          contentJson={site.contentJson}
          family={family}
          ctx={ctx}
          businessProfile={site.businessProfileJson}
          resolveImage={resolveImage}
        />
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd)
            .replace(/</g, "\\u003c")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029"),
        }}
      />
    </main>
  );
}
