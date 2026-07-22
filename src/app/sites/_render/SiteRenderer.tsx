import { FAMILIES, type FamilyId } from "./families";
import { buildImageMap, makeResolveImage } from "./imageMap";
import { resolveTheme } from "./resolveTheme";
import { SectionRouter } from "./sections/SectionRouter";
import { asString } from "./utils";

export interface RenderableSite {
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
