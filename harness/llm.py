"""Minimal Ollama HTTP client. urllib only - no third-party HTTP deps."""
import json
import urllib.request


class Ollama:
    def __init__(self, url):
        self.url = url.rstrip("/")

    def generate(self, model, prompt, json_mode=False, num_ctx=16384,
                 timeout_s=600):
        body = {"model": model, "prompt": prompt, "stream": False,
                "options": {"num_ctx": num_ctx}}
        if json_mode:
            body["format"] = "json"  # forces syntactically valid JSON (mitigation #6)
        req = urllib.request.Request(
            f"{self.url}/api/generate",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return json.loads(resp.read())["response"]

    def healthy(self, model, deadline_s=60):
        # a tiny generation with a hard deadline catches both a dead server
        # and the silent-CPU-fallback case, which is slow rather than dead
        try:
            out = self.generate(model, "Reply with OK", num_ctx=2048,
                                timeout_s=deadline_s)
            return bool(out)
        except Exception:
            return False
