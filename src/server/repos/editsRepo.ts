import { prisma } from "../db";
import { toDoc } from "./doc";

export async function append(
  projectId: string,
  data: {
    source: string;
    userPrompt: string;
    actionSummary: string;
    changeScope: string;
    targets?: string[];
    versionId?: string | null;
  },
): Promise<Record<string, unknown>> {
  const row = await prisma().builderEdit.create({
    data: {
      editId: randomId(),
      projectId,
      versionId: data.versionId ?? null,
      ts: Date.now() / 1000,
      actor: "user",
      source: data.source,
      userPrompt: data.userPrompt,
      actionSummary: data.actionSummary,
      changeScope: data.changeScope,
      targets: data.targets ?? [],
    },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function listForProject(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().builderEdit.findMany({
    where: { projectId },
    orderBy: { ts: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
