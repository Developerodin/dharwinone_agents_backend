/** parse_verdict from backend/harness/packets.py */
const VERDICTS = new Set(["ACCEPT", "NEEDS_FIX", "ESCALATE"]);

export function parseVerdict(raw: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || !VERDICTS.has(String(obj.verdict))) return null;
    if (!Array.isArray(obj.findings)) obj.findings = [];
    if (obj.verdict === "NEEDS_FIX") {
      const cited = (obj.findings as unknown[]).filter(
        (f) =>
          f &&
          typeof f === "object" &&
          (f as Record<string, unknown>).file &&
          (f as Record<string, unknown>).line,
      );
      if (!cited.length) {
        obj.verdict = "ACCEPT";
        obj.downgraded = true;
      }
    }
    return obj;
  } catch {
    return null;
  }
}
