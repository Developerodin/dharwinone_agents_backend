import { NextResponse } from "next/server";
import { listActiveTemplates } from "@/server/data/templateRegistry";

export async function GET() {
  const templates = listActiveTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    subcategory: t.subcategory,
    version: t.version,
    status: t.status,
    style_tags: t.style_tags,
    description: t.description,
    preview_desktop_url: t.preview_desktop_url,
    preview_mobile_url: t.preview_mobile_url,
    section_schema: t.section_schema,
  }));
  return NextResponse.json({ templates });
}
