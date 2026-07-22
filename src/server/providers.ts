// Port of backend/harness/providers.py + backend/harness/llm.py — fetch-only, no SDKs.

export type ProviderKind = "ollama" | "vllm" | "anthropic" | "openai";

export interface StageProviderConfig {
  kind?: string;
  model?: string;
  baseUrl?: string;
}

export interface ProviderConfig {
  ollamaUrl: string;
  providers?: Record<string, StageProviderConfig | undefined>;
}

export type ProviderPolicy = (stage: string, kind: string, model: string) => void;

export interface GenerateOptions {
  jsonMode?: boolean;
  numCtx?: number;
  timeoutS?: number;
}

export interface Provider {
  generate(model: string, prompt: string, options?: GenerateOptions): Promise<string>;
  healthy(model: string, deadlineS?: number): Promise<boolean>;
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not set`);
  return val;
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutS: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutS * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`request to ${url} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

class OllamaProvider implements Provider {
  constructor(private url: string) {
    this.url = stripTrailingSlashes(url);
  }

  async generate(model: string, prompt: string, options: GenerateOptions = {}): Promise<string> {
    const { jsonMode = false, numCtx = 16384, timeoutS = 600 } = options;
    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
      options: { num_ctx: numCtx },
    };
    if (jsonMode) body.format = "json";
    const data = await postJson(
      `${this.url}/api/generate`,
      body,
      { "Content-Type": "application/json" },
      timeoutS,
    );
    return String(data.response ?? "");
  }

  async healthy(model: string, deadlineS = 60): Promise<boolean> {
    try {
      return Boolean(await this.generate(model, "Reply with OK", { numCtx: 2048, timeoutS: deadlineS }));
    } catch {
      return false;
    }
  }
}

class AnthropicProvider implements Provider {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = stripTrailingSlashes(baseUrl || "https://api.anthropic.com");
  }

  async generate(model: string, prompt: string, options: GenerateOptions = {}): Promise<string> {
    const { jsonMode = false, timeoutS = 600 } = options;
    const content = jsonMode ? `${prompt}\nRespond with JSON only.` : prompt;
    const data = await postJson(
      `${this.baseUrl}/v1/messages`,
      { model, max_tokens: 4096, messages: [{ role: "user", content }] },
      {
        "Content-Type": "application/json",
        "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      timeoutS,
    );
    const parts = (data.content as Array<{ type?: string; text?: string }>) ?? [];
    return parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
  }

  async healthy(model: string, deadlineS = 60): Promise<boolean> {
    try {
      return Boolean(await this.generate(model, "Reply with OK", { timeoutS: deadlineS }));
    } catch {
      return false;
    }
  }
}

class OpenAICompatProvider implements Provider {
  constructor(
    protected baseUrl: string,
    protected apiKeyEnv = "OPENAI_API_KEY",
    protected authBearer = true,
  ) {
    this.baseUrl = stripTrailingSlashes(baseUrl);
  }

  async generate(model: string, prompt: string, options: GenerateOptions = {}): Promise<string> {
    const { jsonMode = false, timeoutS = 600 } = options;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authBearer) headers.Authorization = `Bearer ${requireEnv(this.apiKeyEnv)}`;
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const data = await postJson(`${this.baseUrl}/v1/chat/completions`, body, headers, timeoutS);
    const choices = data.choices as Array<{ message?: { content?: string } }>;
    return choices[0]?.message?.content ?? "";
  }

  async healthy(model: string, deadlineS = 60): Promise<boolean> {
    try {
      return Boolean(await this.generate(model, "Reply with OK", { timeoutS: deadlineS }));
    } catch {
      return false;
    }
  }
}

class OpenAIProvider extends OpenAICompatProvider {
  constructor(baseUrl?: string) {
    super(baseUrl || "https://api.openai.com");
  }
}

class VllmProvider extends OpenAICompatProvider {
  constructor(baseUrl: string) {
    super(baseUrl, "", false);
  }
}

class AsyncSemaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits += 1;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const LOCAL_SEMAPHORE = new AsyncSemaphore(1);
const CLOUD_SEMAPHORE = new AsyncSemaphore(4);

function wrapSemaphore(inner: Provider, sem: AsyncSemaphore): Provider {
  return {
    generate: (model, prompt, options) => sem.run(() => inner.generate(model, prompt, options)),
    healthy: (model, deadlineS) => inner.healthy(model, deadlineS),
  };
}

const ollamaCache = new Map<string, Provider>();

function getImpl(cfg: ProviderConfig, stage: string, policy?: ProviderPolicy): Provider {
  const providersCfg = cfg.providers;
  if (!providersCfg) {
    const url = cfg.ollamaUrl;
    if (!ollamaCache.has(url)) {
      ollamaCache.set(url, wrapSemaphore(new OllamaProvider(url), LOCAL_SEMAPHORE));
    }
    return ollamaCache.get(url)!;
  }

  const stageCfg = providersCfg[stage] ?? {};
  const kind = stageCfg.kind ?? "ollama";
  const model = stageCfg.model ?? "";
  if (policy) policy(stage, kind, model);

  switch (kind) {
    case "ollama":
      return wrapSemaphore(new OllamaProvider(stageCfg.baseUrl ?? cfg.ollamaUrl), LOCAL_SEMAPHORE);
    case "vllm":
      return wrapSemaphore(new VllmProvider(stageCfg.baseUrl ?? "http://127.0.0.1:8000"), LOCAL_SEMAPHORE);
    case "anthropic":
      return wrapSemaphore(new AnthropicProvider(stageCfg.baseUrl), CLOUD_SEMAPHORE);
    case "openai":
      return wrapSemaphore(new OpenAIProvider(stageCfg.baseUrl), CLOUD_SEMAPHORE);
    default:
      throw new Error(`unknown provider kind: ${JSON.stringify(kind)}`);
  }
}

let factoryOverride: typeof getImpl | null = null;

export function setProviderFactoryForTests(fn: typeof getImpl | null): void {
  factoryOverride = fn;
}

export function get(cfg: ProviderConfig, stage: string, policy?: ProviderPolicy): Provider {
  return (factoryOverride ?? getImpl)(cfg, stage, policy);
}

export function resetProviderCacheForTests(): void {
  ollamaCache.clear();
}
