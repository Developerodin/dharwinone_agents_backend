import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";

export async function track(
  projectId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const row = await prisma().builderAnalytic.create({
    data: {
      eventId: randomId(),
      projectId,
      eventType,
      metadata: metadata as Prisma.InputJsonValue,
      ts: Date.now() / 1000,
    },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function listForProject(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().builderAnalytic.findMany({
    where: { projectId },
    orderBy: { ts: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}

export async function summarize(projectId: string): Promise<Record<string, unknown>> {
  const events = await listForProject(projectId);
  const counts: Record<string, number> = {};
  for (const event of events) {
    const key = (event.eventType as string | undefined) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { projectId, counts, total: events.length };
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
