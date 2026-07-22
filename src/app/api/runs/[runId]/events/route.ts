import { NextResponse } from "next/server";
import { streamEvents } from "@/server/events";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

type Params = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  const runDir = findRunDir(runId);
  if (!runDir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });

  let lastEventId = parseInt(new URL(request.url).searchParams.get("last_event_id") ?? "-1", 10);
  const hdr = request.headers.get("Last-Event-ID");
  if (hdr !== null) lastEventId = parseInt(hdr, 10);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamEvents(runDir, run, lastEventId)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
