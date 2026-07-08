import json
import threading
import time

import pytest

from harness import llm, providers


class FakeResponse:
    def __init__(self, body):
        self._body = body if isinstance(body, bytes) else json.dumps(body).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_absent_providers_returns_ollama(monkeypatch):
    monkeypatch.setattr(providers, "_OLLAMA_CACHE", {})
    cfg = {"ollama_url": "http://localhost:11434"}
    p1 = providers.get(cfg, "planner")
    p2 = providers.get(cfg, "reviewer")
    assert p1 is p2
    assert hasattr(p1, "generate") and hasattr(p1, "healthy")


def test_per_stage_routing_distinct(monkeypatch):
    monkeypatch.setattr(providers, "_OLLAMA_CACHE", {})
    created = []

    class CapturingOllama(llm.Ollama):
        def __init__(self, url):
            created.append(url)
            super().__init__(url)

    monkeypatch.setattr(providers, "Ollama", CapturingOllama)
    cfg = {
        "ollama_url": "http://localhost:11434",
        "providers": {
            "planner": {"kind": "ollama", "model": "p-model", "base_url": "http://a:1"},
            "reviewer": {"kind": "openai", "model": "gpt-4", "base_url": "https://api.openai.com"},
        },
    }
    planner = providers.get(cfg, "planner")
    reviewer = providers.get(cfg, "reviewer")
    assert created == ["http://a:1"]
    assert planner is not reviewer
    assert reviewer.__class__.__name__ == "Wrapped"


def test_anthropic_adapter(monkeypatch):
    captured = {}
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    def fake_urlopen(req, timeout=600):
        captured["url"] = req.full_url
        captured["headers"] = dict(req.header_items())
        captured["body"] = json.loads(req.data)
        return FakeResponse({"content": [{"type": "text", "text": "hello"}]})

    monkeypatch.setattr(providers.urllib.request, "urlopen", fake_urlopen)
    cfg = {
        "ollama_url": "http://localhost:11434",
        "providers": {"planner": {"kind": "anthropic", "model": "claude-3"}},
    }
    p = providers.get(cfg, "planner")
    out = p.generate("claude-3", "hi", json_mode=True)
    assert out == "hello"
    assert captured["url"].endswith("/v1/messages")
    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert headers["x-api-key"] == "test-key"


def test_openai_adapter(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    def fake_urlopen(req, timeout=600):
        body = json.loads(req.data)
        assert body["response_format"] == {"type": "json_object"}
        return FakeResponse({"choices": [{"message": {"content": '{"ok": true}'}}]})

    monkeypatch.setattr(providers.urllib.request, "urlopen", fake_urlopen)
    cfg = {
        "ollama_url": "http://localhost:11434",
        "providers": {"planner": {"kind": "openai", "model": "gpt-4o"}},
    }
    p = providers.get(cfg, "planner")
    assert p.generate("gpt-4o", "hi", json_mode=True) == '{"ok": true}'


def test_vllm_local_adapter(monkeypatch):
    monkeypatch.setattr(providers, "_OLLAMA_CACHE", {})

    def fake_urlopen(req, timeout=600):
        return FakeResponse({"choices": [{"message": {"content": "vllm-ok"}}]})

    monkeypatch.setattr(providers.urllib.request, "urlopen", fake_urlopen)
    cfg = {
        "ollama_url": "http://localhost:11434",
        "providers": {
            "implementer_llm": {"kind": "vllm", "model": "local", "base_url": "http://127.0.0.1:8000"},
        },
    }
    p = providers.get(cfg, "implementer_llm")
    assert p.__class__.__name__ == "Wrapped"
    assert p.generate("local", "ping") == "vllm-ok"


def test_missing_env_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    cfg = {
        "ollama_url": "http://localhost:11434",
        "providers": {"planner": {"kind": "anthropic", "model": "claude-3"}},
    }
    p = providers.get(cfg, "planner")
    with pytest.raises(EnvironmentError, match="ANTHROPIC_API_KEY"):
        p.generate("claude-3", "hi")


def test_policy_raise_propagates(monkeypatch):
    monkeypatch.setattr(providers, "_OLLAMA_CACHE", {})

    def deny(stage, kind, model):
        raise PermissionError("blocked")

    cfg = {"ollama_url": "http://localhost:11434", "providers": {"planner": {"kind": "ollama", "model": "m"}}}
    with pytest.raises(PermissionError, match="blocked"):
        providers.get(cfg, "planner", policy=deny)


def test_local_semaphore_serializes(monkeypatch):
    monkeypatch.setattr(providers, "_OLLAMA_CACHE", {})
    active = []
    lock = threading.Lock()

    class SlowOllama:
        def __init__(self, url=None):
            self.url = url

        def generate(self, model, prompt, **kw):
            with lock:
                active.append(threading.current_thread().name)
                assert len(active) == 1
            time.sleep(0.05)
            with lock:
                active.pop()
            return "ok"

        def healthy(self, model, deadline_s=60):
            return True

    monkeypatch.setattr(providers, "Ollama", SlowOllama)
    cfg = {"ollama_url": "http://x"}
    p = providers.get(cfg, "planner")

    threads = [threading.Thread(target=lambda: p.generate("m", "p")) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
