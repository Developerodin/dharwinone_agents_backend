import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import { requireBuilderProject } from "@/server/builderRoute";
import * as onboardingService from "@/server/services/onboardingService";

type Params = { params: Promise<{ projectId: string }> };

const ChatMessage = z.object({ message: z.string() });

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    await requireBuilderProject(projectId);
    return NextResponse.json(await onboardingService.getChat(projectId));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  const { body, error } = await parseBody(request, ChatMessage);
  if (error) return error;
  try {
    await requireBuilderProject(projectId);
    return NextResponse.json(await onboardingService.handleMessage(projectId, body.message));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
