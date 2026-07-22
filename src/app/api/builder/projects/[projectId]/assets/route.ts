import { NextResponse } from "next/server";
import * as assetService from "@/server/services/assetService";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    return NextResponse.json(await assetService.listAssets(projectId));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
