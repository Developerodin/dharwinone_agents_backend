import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";

export type Turn = {
  role: string;
  text: string;
  ts: number;
  meta?: Record<string, unknown>;
};

export async function ensure(projectId: string): Promise<Record<string, unknown>> {
  let row = await prisma().conversation.findUnique({ where: { projectId } });
  if (!row) {
    row = await prisma().conversation.create({ data: { projectId, turns: [] } });
  }
  return (toDoc(row) ?? {}) as Record<string, unknown>;
}

export async function appendTurn(
  projectId: string,
  role: string,
  text: string,
  meta?: Record<string, unknown>,
): Promise<Turn> {
  const turn: Turn = { role, text, ts: Date.now() / 1000, meta: meta ?? {} };
  const row = await prisma().conversation.findUnique({ where: { projectId } });
  const turns = [...((row?.turns as Turn[] | null) ?? []), turn] as Prisma.InputJsonValue;
  if (row) {
    await prisma().conversation.update({ where: { projectId }, data: { turns } });
  } else {
    await prisma().conversation.create({ data: { projectId, turns } });
  }
  return turn;
}

export async function listTurns(projectId: string): Promise<Turn[]> {
  const doc = await ensure(projectId);
  return [...((doc.turns as Turn[] | undefined) ?? [])];
}
