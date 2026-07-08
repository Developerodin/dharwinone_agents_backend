import json
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from studio import config, consent, projects
from studio.app import create_app

PY = sys.executable


@pytest.fixture
def priv_env(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_DATA", str(tmp_path))
    config.reset_for_tests()
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(
        ["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True
    )
    subprocess.run(["git", "config", "user.email", "t@t.t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "README.md").write_text("hi")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True
    )
    client = TestClient(create_app())
    yield client, tmp_path
    config.reset_for_tests()


def test_local_only_blocks_anthropic(priv_env, monkeypatch):
    client, tmp_path = priv_env
    repo = str(tmp_path / "repo")
    project = projects.create(
        {
            "name": "Priv",
            "repo_root": repo,
            "privacy": "local_only",
            "providers": {
                "planner": {"kind": "anthropic", "model": "claude-3"},
            },
        }
    )
    calls = []
    import urllib.request

    real = urllib.request.urlopen

    def fake_urlopen(*a, **k):
        calls.append(1)
        return real(*a, **k)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    policy = consent.make_policy(project, "run-1")
    with pytest.raises(consent.PrivacyViolation):
        policy("planner", "anthropic", "claude-3")
    assert len(calls) == 0


def test_vllm_allowed_local_only(priv_env, tmp_path):
    _, tmp_path = priv_env
    repo = str(tmp_path / "repo")
    project = projects.create(
        {
            "name": "Vllm",
            "repo_root": repo,
            "privacy": "local_only",
            "providers": {
                "planner": {
                    "kind": "vllm",
                    "model": "local",
                    "base_url": "http://127.0.0.1:8000",
                },
            },
        }
    )
    policy = consent.make_policy(project, "run-1")
    policy("planner", "vllm", "local")


def test_consented_stage_ledger(priv_env, monkeypatch, tmp_path):
    client, tmp_path = priv_env
    repo = str(tmp_path / "repo")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    project = projects.create(
        {
            "name": "Consent",
            "repo_root": repo,
            "privacy": "per_stage",
            "stage_consents": ["planner"],
            "providers": {
                "planner": {"kind": "anthropic", "model": "claude-3"},
            },
        }
    )
    policy = consent.make_policy(project, "run-1")
    policy("planner", "anthropic", "claude-3")
    from harness.providers import get

    cfg = {
        **projects.derive_harness_cfg(project, "run-1"),
        "providers": project["providers"],
    }
    import urllib.request

    def fake_urlopen(req, timeout=600):
        class R:
            def read(self):
                return json.dumps(
                    {"content": [{"type": "text", "text": "ok"}]}
                ).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return R()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    prov = get(cfg, "planner", policy=policy)
    wrapped = consent.wrap_provider(
        prov, project, "run-1", "planner", "anthropic", "claude-3"
    )
    wrapped.generate("claude-3", "hello prompt")
    ledger = consent.read_ledger(project["id"])
    assert len(ledger) == 1
    assert "prompt_sha256" in ledger[0]
    assert "prompt_bytes" in ledger[0]
    assert "hello prompt" not in json.dumps(ledger[0])


def test_privacy_routes(priv_env, tmp_path):
    client, tmp_path = priv_env
    repo = str(tmp_path / "repo")
    project = projects.create({"name": "Routes", "repo_root": repo})
    r = client.get(f"/projects/{project['id']}/privacy")
    assert r.status_code == 200
    r2 = client.put(
        f"/projects/{project['id']}/privacy",
        json={
            "privacy": "per_stage",
            "stage_consents": ["planner"],
        },
    )
    assert r2.status_code == 200
    r3 = client.get(f"/projects/{project['id']}/consent-ledger")
    assert r3.status_code == 200
    assert r3.json() == []
