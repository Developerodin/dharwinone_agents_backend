"""Privacy policy enforcement and consent ledger."""

import hashlib
import json
import os
import time

from studio import config


class PrivacyViolation(Exception):
    pass


_LOCAL_KINDS = frozenset({"ollama", "vllm"})
_CLOUD_KINDS = frozenset({"anthropic", "openai"})


def make_policy(project, run_id):
    """Return providers.get policy callback for this project/run."""
    privacy = project.get("privacy", "local_only")
    consents = set(project.get("stage_consents") or [])

    def policy(stage, kind, model):
        if privacy == "local_only":
            if kind not in _LOCAL_KINDS:
                raise PrivacyViolation(
                    f"local_only: {kind!r} provider blocked for stage {stage!r}"
                )
        elif privacy == "per_stage":
            if kind in _CLOUD_KINDS and stage not in consents:
                raise PrivacyViolation(
                    f"per_stage: stage {stage!r} not in stage_consents"
                )

    return policy


def _append_ledger(project_id, run_id, stage, kind, model, prompt):
    path = config.consent_path(project_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    entry = {
        "ts": time.time(),
        "run_id": run_id,
        "stage": stage,
        "kind": kind,
        "model": model,
        "prompt_bytes": len(prompt.encode("utf-8")),
        "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
    }
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def wrap_provider(provider, project, run_id, stage, kind, model):
    """Wrap cloud provider generate() to append consent ledger lines."""
    if kind not in _CLOUD_KINDS:
        return provider

    class LedgerWrapper:
        def generate(self, m, prompt, json_mode=False, num_ctx=16384, timeout_s=600):
            _append_ledger(project["id"], run_id, stage, kind, model, prompt)
            return provider.generate(
                m, prompt, json_mode=json_mode, num_ctx=num_ctx, timeout_s=timeout_s
            )

        def healthy(self, m, deadline_s=60):
            return provider.healthy(m, deadline_s=deadline_s)

    return LedgerWrapper()


def read_ledger(project_id):
    path = config.consent_path(project_id)
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out
