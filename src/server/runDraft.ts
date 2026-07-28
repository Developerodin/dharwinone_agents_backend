/** Retired HTML draft helpers — /api/runs returns 410; keep minimal writers for old run dirs. */
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "./packets";

export type DraftVariant = { id: string; label: string; html: string };

/** @deprecated HTML builder drafts retired — /api/runs returns 410. */
export function makeVariants(_prompt: string): [string, DraftVariant[]] {
  throw new Error(
    "HTML builder drafts retired. Use Phase 1 /api/sites (React + JSON) via /web-agent.",
  );
}

export function writeVariants(runDir: string, variants: DraftVariant[]): void {
  variants.forEach((v, i) => {
    fs.writeFileSync(path.join(runDir, `draft-${i}.html`), v.html, "utf-8");
  });
}

export function writeDraft(runDir: string, html: string): string {
  const p = path.join(runDir, "draft.html");
  fs.writeFileSync(p, html, "utf-8");
  return p;
}

export function readChoice(runDir: string): Record<string, unknown> | null {
  const p = path.join(runDir, "draft-choice.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
}

export { atomicWriteJson };
