import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import { requireBuilderAction, requireUserId } from "@/server/builderRoute";
import * as editService from "@/server/services/editService";
import * as workingHtmlRepo from "@/server/repos/workingHtmlRepo";

type Params = { params: Promise<{ projectId: string }> };

const EditRequest = z.object({
  prompt: z.string(),
  structural: z.boolean().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId } = await params;
  const { body, error } = await parseBody(request, EditRequest);
  if (error) return error;
  try {
    await requireBuilderAction(projectId, uid, "edit");
    return NextResponse.json(
      await editService.applyEdit(projectId, body.prompt, body.structural ?? false),
    );
  } catch (exc) {
    if (exc instanceof editService.EditValidationError) {
      return NextResponse.json({ detail: String(exc) }, { status: 422 });
    }
    if (exc instanceof workingHtmlRepo.WorkingHtmlError) {
      return NextResponse.json({ detail: String(exc) }, { status: 404 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
