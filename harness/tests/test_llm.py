import json

import pytest

from harness import llm


class FakeResponse:
    def __init__(self, body):
        self._body = json.dumps(body).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_generate_sends_json_format(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout):
        captured["body"] = json.loads(req.data)
        captured["timeout"] = timeout
        return FakeResponse({"response": '{"ok": true}'})

    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)
    client = llm.Ollama("http://localhost:11434")
    out = client.generate("m", "hi", json_mode=True, num_ctx=4096, timeout_s=9)
    assert out == '{"ok": true}'
    assert captured["body"]["format"] == "json"
    assert captured["body"]["options"]["num_ctx"] == 4096
    assert captured["body"]["stream"] is False
    assert captured["timeout"] == 9


def test_healthy_true(monkeypatch):
    client = llm.Ollama("http://x")
    monkeypatch.setattr(client, "generate", lambda *a, **k: "OK")
    assert client.healthy("m") is True


def test_healthy_false_on_error(monkeypatch):
    client = llm.Ollama("http://x")

    def boom(*a, **k):
        raise OSError("refused")

    monkeypatch.setattr(client, "generate", boom)
    assert client.healthy("m") is False
