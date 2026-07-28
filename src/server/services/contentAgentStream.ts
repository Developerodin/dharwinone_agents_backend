/** Progressive section extraction for streamed content-agent JSON. */
import type { Provider } from "../providers";

export type ContentStreamEvent =
  | { type: "section"; key: string; content: Record<string, unknown> }
  | { type: "done"; content: Record<string, unknown>; usedFallback: boolean };

/**
 * Extract a balanced JSON object starting at `start` (must point at `{`).
 * Returns the slice end index (exclusive) or -1 if incomplete.
 */
export function findBalancedObjectEnd(text: string, start: number): number {
  if (text[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Try to parse a completed top-level section object `"key": {...}` from a partial buffer.
 */
export function tryExtractSection(
  buffer: string,
  key: string,
): Record<string, unknown> | null {
  const pattern = new RegExp(`"${key}"\\s*:\\s*\\{`);
  const match = pattern.exec(buffer);
  if (!match || match.index === undefined) return null;
  const braceStart = buffer.indexOf("{", match.index + match[0].length - 1);
  if (braceStart < 0) return null;
  const end = findBalancedObjectEnd(buffer, braceStart);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(buffer.slice(braceStart, end)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Object.keys(parsed as Record<string, unknown>).length === 0) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Stable emit order: hero first, then schema sections (minus hero), then seo.
 */
export function sectionEmitOrder(sectionSchema: Record<string, unknown>): string[] {
  const declared = Array.isArray((sectionSchema as { sections?: unknown }).sections)
    ? ((sectionSchema as { sections: string[] }).sections as string[])
    : Object.keys((sectionSchema.schema as Record<string, unknown> | undefined) ?? {});
  const rest = declared.filter((k) => k !== "hero" && k !== "seo");
  const order = ["hero", ...rest, "seo"];
  return [...new Set(order)];
}

/**
 * Stream LLM tokens (or fall back to sync generate) and yield completed sections.
 * `assemble` finalizes clamp/fallback; caller persists.
 */
export async function* streamContentSections(input: {
  provider: Provider;
  model: string;
  prompt: string;
  sectionSchema: Record<string, unknown>;
  assemble: (
    modelContent: Record<string, unknown>,
  ) => { content: Record<string, unknown>; usedFallback: boolean };
}): AsyncGenerator<ContentStreamEvent> {
  const order = sectionEmitOrder(input.sectionSchema);
  const emitted = new Set<string>();
  let buffer = "";
  const partial: Record<string, unknown> = {};

  /**
   * Emit any newly completed sections in stable order.
   */
  function* flushNew(): Generator<ContentStreamEvent> {
    for (const key of order) {
      if (emitted.has(key)) continue;
      const section = tryExtractSection(buffer, key);
      if (!section) continue;
      partial[key] = section;
      emitted.add(key);
      yield { type: "section", key, content: section };
    }
  }

  try {
    if (input.provider.generateStream) {
      for await (const chunk of input.provider.generateStream(input.model, input.prompt, {
        jsonMode: true,
        timeoutS: 20,
      })) {
        buffer += chunk;
        yield* flushNew();
      }
    } else {
      buffer = await input.provider.generate(input.model, input.prompt, {
        jsonMode: true,
        timeoutS: 20,
      });
      yield* flushNew();
    }
  } catch {
    // fall through to assemble with whatever partial we have
  }

  // Best-effort full parse if stream ended mid-object
  if (buffer.trim()) {
    try {
      const start = buffer.indexOf("{");
      const end = buffer.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(buffer.slice(start, end + 1)) as Record<string, unknown>;
        Object.assign(partial, parsed);
      }
    } catch {
      // keep partial
    }
  }

  const assembled = input.assemble(partial);
  for (const key of order) {
    if (emitted.has(key)) continue;
    const section = assembled.content[key];
    if (section && typeof section === "object" && !Array.isArray(section)) {
      emitted.add(key);
      yield { type: "section", key, content: section as Record<string, unknown> };
    }
  }
  yield { type: "done", content: assembled.content, usedFallback: assembled.usedFallback };
}
