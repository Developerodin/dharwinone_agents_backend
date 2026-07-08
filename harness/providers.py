"""LLM provider registry with cloud adapters and concurrency limits."""
import json
import os
import threading
import urllib.request

from harness.llm import Ollama

LOCAL_SEMAPHORE = threading.Semaphore(1)
CLOUD_SEMAPHORE = threading.Semaphore(4)

_LOCAL_KINDS = frozenset({"ollama", "vllm"})
_OLLAMA_CACHE = {}


def _require_env(name):
    val = os.environ.get(name)
    if not val:
        raise EnvironmentError(f"{name} is not set")
    return val


def _wrap_semaphore(inner, sem):
    class Wrapped:
        def generate(self, model, prompt, json_mode=False, num_ctx=16384,
                     timeout_s=600):
            with sem:
                return inner.generate(
                    model, prompt, json_mode=json_mode, num_ctx=num_ctx,
                    timeout_s=timeout_s)

        def healthy(self, model, deadline_s=60):
            return inner.healthy(model, deadline_s=deadline_s)

    return Wrapped()


class _AnthropicProvider:
    def __init__(self, base_url=None):
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")

    def generate(self, model, prompt, json_mode=False, num_ctx=16384,
                 timeout_s=600):
        key = _require_env("ANTHROPIC_API_KEY")
        body = {
            "model": model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_mode:
            body["messages"][0]["content"] = prompt + "\nRespond with JSON only."
        req = urllib.request.Request(
            f"{self.base_url}/v1/messages",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            })
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
        parts = data.get("content") or []
        return "".join(p.get("text", "") for p in parts if p.get("type") == "text")

    def healthy(self, model, deadline_s=60):
        try:
            return bool(self.generate(model, "Reply with OK", num_ctx=2048,
                                      timeout_s=deadline_s))
        except Exception:
            return False


class _OpenAICompatProvider:
    """OpenAI chat-completions API (OpenAI cloud or vLLM local)."""

    def __init__(self, base_url, api_key_env="OPENAI_API_KEY", auth_bearer=True):
        self.base_url = base_url.rstrip("/")
        self.api_key_env = api_key_env
        self.auth_bearer = auth_bearer

    def generate(self, model, prompt, json_mode=False, num_ctx=16384,
                 timeout_s=600):
        headers = {"Content-Type": "application/json"}
        if self.auth_bearer:
            headers["Authorization"] = f"Bearer {_require_env(self.api_key_env)}"
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"]

    def healthy(self, model, deadline_s=60):
        try:
            return bool(self.generate(model, "Reply with OK", num_ctx=2048,
                                      timeout_s=deadline_s))
        except Exception:
            return False


class _OpenAIProvider(_OpenAICompatProvider):
    def __init__(self, base_url=None):
        super().__init__(base_url or "https://api.openai.com")


class _VllmProvider(_OpenAICompatProvider):
    def __init__(self, base_url):
        super().__init__(base_url, api_key_env="", auth_bearer=False)

    def generate(self, model, prompt, json_mode=False, num_ctx=16384,
                 timeout_s=600):
        headers = {"Content-Type": "application/json"}
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"]


def get(cfg, stage, policy=None):
    """Return a duck-typed provider for the given pipeline stage."""
    providers_cfg = cfg.get("providers")
    if not providers_cfg:
        url = cfg["ollama_url"]
        if url not in _OLLAMA_CACHE:
            inner = Ollama(url)
            _OLLAMA_CACHE[url] = _wrap_semaphore(inner, LOCAL_SEMAPHORE)
        return _OLLAMA_CACHE[url]

    stage_cfg = providers_cfg.get(stage) or {}
    kind = stage_cfg.get("kind", "ollama")
    model = stage_cfg.get("model", "")
    if policy is not None:
        policy(stage, kind, model)

    if kind == "ollama":
        inner = Ollama(stage_cfg.get("base_url", cfg["ollama_url"]))
        return _wrap_semaphore(inner, LOCAL_SEMAPHORE)
    if kind == "vllm":
        base = stage_cfg.get("base_url", "http://127.0.0.1:8000")
        return _wrap_semaphore(_VllmProvider(base), LOCAL_SEMAPHORE)
    if kind == "anthropic":
        return _wrap_semaphore(
            _AnthropicProvider(stage_cfg.get("base_url")), CLOUD_SEMAPHORE)
    if kind == "openai":
        return _wrap_semaphore(
            _OpenAIProvider(stage_cfg.get("base_url")), CLOUD_SEMAPHORE)
    raise ValueError(f"unknown provider kind: {kind!r}")
