"""Resend email service with console fallback."""

import pytest

from studio.services import email_service


def test_console_mode_when_no_api_key(monkeypatch, capsys):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    email_service.send_email("a@b.com", "Hello", "<p>Hi</p>")
    out = capsys.readouterr().out
    assert "a@b.com" in out
    assert "<p>Hi</p>" in out


def test_sends_via_resend_when_key_set(monkeypatch):
    calls = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls["url"] = url
        calls["headers"] = headers
        calls["json"] = json

        class R:
            def raise_for_status(self):
                pass

        return R()

    monkeypatch.setenv("RESEND_API_KEY", "re_123")
    monkeypatch.setenv("AUTH_EMAIL_FROM", "Dharwin <no-reply@example.com>")
    monkeypatch.setattr(email_service.httpx, "post", fake_post)
    email_service.send_email("a@b.com", "Hello", "<p>Hi</p>")
    assert calls["url"] == "https://api.resend.com/emails"
    assert calls["headers"]["Authorization"] == "Bearer re_123"
    assert calls["json"]["to"] == ["a@b.com"]
    assert calls["json"]["from"] == "Dharwin <no-reply@example.com>"


def test_verification_email_contains_link(monkeypatch, capsys):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "http://localhost:3000")
    email_service.send_verification("a@b.com", "tok123")
    out = capsys.readouterr().out
    assert "http://localhost:3000/verify?token=tok123" in out


def test_reset_email_contains_link(monkeypatch, capsys):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "http://localhost:3000")
    email_service.send_password_reset("a@b.com", "tok456")
    out = capsys.readouterr().out
    assert "http://localhost:3000/reset-password?token=tok456" in out
