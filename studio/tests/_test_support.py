"""Shared fakes for studio subprocess tests."""


class FakeProvider:
    def generate(self, model, prompt, **kw):
        if "Plan this coding task" in prompt:
            return '{"approach": "edit VALUE", "files": ["src/app.py"]}'
        if "Summarize this coding plan" in prompt:
            return '{"summary": "Bump VALUE", "files": ["src/app.py"]}'
        return '{"verdict": "ACCEPT", "findings": []}'

    def healthy(self, model, deadline_s=60):
        return True
