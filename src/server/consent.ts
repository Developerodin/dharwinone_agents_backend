// Port of backend/studio/consent.py — ledger read + runs-engine policy helpers.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { consentPath } from "./paths";
import type { Provider, ProviderPolicy } from "./providers";

export class PrivacyViolation extends Error {}

const LOCAL_KINDS = new Set(["ollama", "vllm"]);
const CLOUD_KINDS = new Set(["anthropic", "openai"]);

export type ConsentLedgerEntry = {
  ts: number;
  run_id: string;
  stage: string;
  kind: string;
  model: string;
  prompt_bytes: number;
  prompt_sha256: string;
};

export function readLedger(projectId: string): ConsentLedgerEntry[] {
  const p = consentPath(projectId);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf-8");
  const out: ConsentLedgerEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) out.push(JSON.parse(trimmed) as ConsentLedgerEntry);
  }
  return out;
}

export function makePolicy(project: Record<string, unknown>, _runId: string): ProviderPolicy {
  const privacy = String(project.privacy ?? "local_only");
  const consents = new Set((project.stage_consents as string[] | undefined) ?? []);
  return (stage: string, kind: string) => {
    if (privacy === "local_only") {
      if (!LOCAL_KINDS.has(kind)) {
        throw new PrivacyViolation(`local_only: '${kind}' provider blocked for stage '${stage}'`);
      }
    } else if (privacy === "per_stage") {
      if (CLOUD_KINDS.has(kind) && !consents.has(stage)) {
        throw new PrivacyViolation(`per_stage: stage '${stage}' not in stage_consents`);
      }
    }
  };
}

function appendLedger(
  projectId: string,
  runId: string,
  stage: string,
  kind: string,
  model: string,
  prompt: string,
): void {
  const p = consentPath(projectId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const entry: ConsentLedgerEntry = {
    ts: Date.now() / 1000,
    run_id: runId,
    stage,
    kind,
    model,
    prompt_bytes: Buffer.byteLength(prompt, "utf-8"),
    prompt_sha256: createHash("sha256").update(prompt, "utf-8").digest("hex"),
  };
  fs.appendFileSync(p, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function wrapProvider(
  provider: Provider,
  project: Record<string, unknown> & { id: string },
  runId: string,
  stage: string,
  kind: string,
  model: string,
): Provider {
  if (!CLOUD_KINDS.has(kind)) return provider;
  return {
    generate(m, prompt, options) {
      appendLedger(project.id, runId, stage, kind, model, prompt);
      return provider.generate(m, prompt, options);
    },
    healthy(m, deadlineS) {
      return provider.healthy(m, deadlineS);
    },
  };
}
