import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { verifyJwt, TokenError } from "@/server/security";
import {
  getDraftRenderable,
  RenderForbiddenError,
} from "@/server/services/siteRenderService";
import { SiteRenderer } from "../../../_render/SiteRenderer";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { siteId } = await params;
  const { t: token } = await searchParams;
  if (!token) return { title: "Draft preview", robots: { index: false, follow: false } };
  try {
    const userId = await verifyJwt(token);
    const site = await getDraftRenderable(siteId, userId);
    const content = site.contentJson;
    const seo = (content.seo as Record<string, unknown> | undefined) ?? {};
    const hero = (content.hero as Record<string, unknown> | undefined) ?? {};
    return {
      title: String(seo.title ?? hero.headline ?? "Draft preview"),
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "Draft preview", robots: { index: false, follow: false } };
  }
}

export default async function DraftSitePreviewPage({ params, searchParams }: PageProps) {
  const { siteId } = await params;
  const { t: token } = await searchParams;

  if (!token) {
    return <p>Preview token required (?t=)</p>;
  }

  let userId: string;
  try {
    userId = await verifyJwt(token);
  } catch (err) {
    if (err instanceof TokenError) {
      return <p>Invalid or expired preview token</p>;
    }
    throw err;
  }

  let site;
  try {
    site = await getDraftRenderable(siteId, userId);
  } catch (err) {
    if (err instanceof RenderForbiddenError) {
      return <p>Forbidden — you do not own this site</p>;
    }
    if (err instanceof Error && err.message === "site not found") notFound();
    throw err;
  }

  return SiteRenderer(site);
}
