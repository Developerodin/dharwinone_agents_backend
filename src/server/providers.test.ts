// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, resetProviderCacheForTests, setProviderFactoryForTests } from "./providers";

beforeEach(() => {
  resetProviderCacheForTests();
  setProviderFactoryForTests(null);
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  resetProviderCacheForTests();
  setProviderFactoryForTests(null);
});

describe("cloud providers", () => {
  it("OpenAI provider parses chat completion JSON", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = get(
      {
        ollamaUrl: "http://localhost:11434",
        providers: { planner: { kind: "openai", model: "gpt-4o-mini" } },
      },
      "planner",
    );
    await expect(provider.generate("gpt-4o-mini", "ping")).resolves.toBe("hello");
  });

  it("Anthropic provider parses messages JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = get(
      {
        ollamaUrl: "http://localhost:11434",
        providers: { planner: { kind: "anthropic", model: "claude-3-5-haiku-latest" } },
      },
      "planner",
    );
    await expect(provider.generate("claude-3-5-haiku-latest", "ping")).resolves.toBe("ok");
  });

  it("generateStream concatenates OpenAI SSE content deltas into hello", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const sse =
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
      "data: [DONE]\n\n";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const provider = get(
      {
        ollamaUrl: "http://localhost:11434",
        providers: { planner: { kind: "openai", model: "gpt-4o-mini" } },
      },
      "planner",
    );
    expect(provider.generateStream).toBeTypeOf("function");
    let out = "";
    for await (const chunk of provider.generateStream!("gpt-4o-mini", "ping")) {
      out += chunk;
    }
    expect(out).toBe("hello");
  });
});
