import * as analyticsRepo from "../repos/analyticsRepo";
import * as profilesRepo from "../repos/profilesRepo";
import * as workingHtmlRepo from "../repos/workingHtmlRepo";
import { Prisma } from "@/generated/prisma/client";
import { runQuality } from "./contextService";
import { prisma } from "../db";
import { toDoc } from "../repos/doc";

export async function runQualityGate(projectId: string): Promise<Record<string, unknown>> {
  const profile = await profilesRepo.get(projectId);
  const html = await workingHtmlRepo.requireHtml(projectId);
  const result = runQuality(html, profile);
  await prisma().builderQuality.create({
    data: { projectId, result: result as Prisma.InputJsonValue, ts: Date.now() / 1000 },
  });
  return result;
}

export async function latestQuality(projectId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma().builderQuality.findFirst({
    where: { projectId },
    orderBy: { ts: "desc" },
  });
  return (row?.result as Record<string, unknown> | null) ?? null;
}

export async function publish(
  projectId: string,
  channel = "preview",
  versionId: string | null = null,
): Promise<Record<string, unknown>> {
  const gate = await runQualityGate(projectId);
  if (gate.verdict === "fail") throw new Error("quality gate failed");
  const releaseId = randomId();
  const row = await prisma().builderRelease.create({
    data: {
      releaseId,
      projectId,
      channel,
      versionId,
      status: "success",
      createdAt: Date.now() / 1000,
    },
  });
  await analyticsRepo.track(projectId, "publish_success", { channel });
  return toDoc(row) as Record<string, unknown>;
}

export async function listReleases(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().builderRelease.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
