import { redirect } from "next/navigation";
import { appPublicBase } from "@/server/services/siteShareService";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

/**
 * Legacy Sites-host share URL → redirect to the app host launch-template renderer.
 */
export default async function SharedSitePreviewRedirect({ params }: PageProps) {
  const { token: raw } = await params;
  const token = encodeURIComponent(decodeURIComponent(raw));
  redirect(`${appPublicBase()}/sites/preview/share/${token}`);
}
