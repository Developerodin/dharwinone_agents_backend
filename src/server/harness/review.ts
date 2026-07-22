/** Port of backend/harness/review.py */
import fs from "node:fs";
import { parseVerdict } from "./parseVerdict";
import type { Provider } from "../providers";

const PROMPT = `You are a strict, skeptical code reviewer. Review this diff for the task below.
Check every rule in the checklist. Cite file and line for every finding.

Task: {title}

Checklist:
{rules}

Diff:
{diff}

Respond ONLY with JSON:
{"verdict": "ACCEPT" or "NEEDS_FIX" or "ESCALATE", "findings": [{"file": "path", "line": 1, "issue": "..."}]}
Use NEEDS_FIX for fixable problems, ESCALATE only for security issues or if the diff does something fundamentally different from the task.`;

function loadSkepticRules(skepticPath: string, category: string): string[] {
  if (!fs.existsSync(skepticPath)) return [];
  const raw = fs.readFileSync(skepticPath, "utf8");
  const allRules: string[] = [];
  const catRules: string[] = [];
  let section: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const sec = line.match(/^(\w+):\s*$/);
    if (sec) {
      section = sec[1]!;
      continue;
    }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (!item || !section) continue;
    if (section === "all") allRules.push(item[1]!);
    else if (section === category) catRules.push(item[1]!);
  }
  return [...allRules, ...catRules];
}

export async function review(
  provider: Provider,
  model: string,
  task: Record<string, unknown>,
  diff: string,
  skepticPath: string,
  maxDiffKb: number,
): Promise<Record<string, unknown>> {
  if (Buffer.byteLength(diff, "utf8") > maxDiffKb * 1024) {
    return { verdict: "ESCALATE", findings: [], reason: "diff exceeds review size cap" };
  }
  const checklist = loadSkepticRules(skepticPath, String(task.category ?? ""));
  const prompt = PROMPT.replace("{title}", String(task.title ?? ""))
    .replace("{rules}", checklist.map((r) => `- ${r}`).join("\n"))
    .replace("{diff}", diff);
  for (let i = 0; i < 2; i++) {
    const raw = await provider.generate(model, prompt, { jsonMode: true });
    const verdict = parseVerdict(raw);
    if (verdict) return verdict;
  }
  return { verdict: "ESCALATE", findings: [], reason: "reviewer output unparseable twice" };
}
