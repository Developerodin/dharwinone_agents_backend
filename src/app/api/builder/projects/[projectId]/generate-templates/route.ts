import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as analyticsRepo from "@/server/repos/analyticsRepo";
import * as profileService from "@/server/services/profileService";
import * as personalizationService from "@/server/services/personalizationService";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";
  try {
    await requireBuilderProject(projectId);
    await profileService.requireGenerationReady(projectId);
    const templates = await personalizationService.generateForProject(projectId, force);
    await analyticsRepo.track(projectId, "generate_templates", { count: templates.length });
    return NextResponse.json({ status: "ready", templates });
  } catch (exc) {
    if (exc instanceof profileService.ProfileIncompleteError) {
      return NextResponse.json(
        { detail: { code: "profile_incomplete", missingFields: exc.missingFields } },
        { status: 422 },
      );
    }
    if (exc instanceof personalizationService.PersonalizationError) {
      return NextResponse.json({ detail: String(exc) }, { status: 500 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
