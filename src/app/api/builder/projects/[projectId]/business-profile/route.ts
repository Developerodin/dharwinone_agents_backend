import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as profileService from "@/server/services/profileService";

type Params = { params: Promise<{ projectId: string }> };

const BusinessProfilePatch = z.object({
  brand: z.record(z.string(), z.unknown()).optional(),
  business: z.record(z.string(), z.unknown()).optional(),
  location: z.record(z.string(), z.unknown()).optional(),
  contact: z.record(z.string(), z.unknown()).optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  skipped: z.array(z.string()).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    return NextResponse.json(await profileService.getProfile(projectId));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { projectId } = await params;
  const { body, error } = await parseBody(request, BusinessProfilePatch);
  if (error) return error;
  try {
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    );
    return NextResponse.json(await profileService.updateProfile(projectId, patch));
  } catch (exc) {
    if (exc instanceof profileService.ProfileValidationError) {
      return NextResponse.json({ detail: String(exc) }, { status: 422 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
