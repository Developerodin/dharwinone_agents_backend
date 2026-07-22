import { notFound } from "next/navigation";
import type { Metadata } from "next";
import * as siteRenderService from "@/server/services/siteRenderService";
import { SiteRenderer } from "../../_render/SiteRenderer";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ subdomain: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subdomain } = await params;
  const site = await siteRenderService.getPublishedRenderable(subdomain);
  if (!site) return { title: "Site not found" };
  const content = site.contentJson;
  const seo = (content.seo as Record<string, unknown> | undefined) ?? {};
  const hero = (content.hero as Record<string, unknown> | undefined) ?? {};
  return {
    title: String(seo.title ?? hero.headline ?? subdomain),
    description: String(seo.description ?? ""),
  };
}

export default async function PublishedSitePreviewPage({ params }: PageProps) {
  const { subdomain } = await params;
  const site = await siteRenderService.getPublishedRenderable(subdomain);
  if (!site) notFound();

  return SiteRenderer(site);
}
