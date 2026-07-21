"""SMTP email service with console fallback."""

import pytest

from studio.services import email_service


def test_console_mode_when_smtp_unconfigured(monkeypatch, capsys):
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    email_service.send_email("a@b.com", "Hello", "<p>Hi</p>")
    out = capsys.readouterr().out
    assert "a@b.com" in out
    assert "<p>Hi</p>" in out


def test_sends_via_smtp_when_configured(monkeypatch):
    calls = {}

    def fake_deliver(to, subject, html):
        calls["to"] = to
        calls["subject"] = subject
        calls["html"] = html

    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_TIMEOUT", "7")
    monkeypatch.setenv("SMTP_USERNAME", "developer@theodin.in")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    monkeypatch.setenv("EMAIL_FROM", "theodinjaipur@gmail.com")
    monkeypatch.setattr(email_service, "_deliver_smtp", fake_deliver)
    email_service.send_email("a@b.com", "Hello", "<p>Hi</p>")
    assert calls["to"] == "a@b.com"
    assert calls["subject"] == "Hello"
    assert calls["html"] == "<p>Hi</p>"


def test_verification_email_contains_link(monkeypatch, capsys):
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "http://localhost:3000")
    email_service.send_verification("a@b.com", "tok123")
    out = capsys.readouterr().out
    assert "http://localhost:3000/verify?token=tok123" in out


def test_verification_email_uses_runtime_base_url_when_env_missing(monkeypatch, capsys):
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    email_service.send_verification("a@b.com", "tok123", base_url="https://agents.dharwinone.com")
    out = capsys.readouterr().out
    assert "https://agents.dharwinone.com/verify?token=tok123" in out


def test_reset_email_contains_link(monkeypatch, capsys):
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "http://localhost:3000")
    email_service.send_password_reset("a@b.com", "tok456")
    out = capsys.readouterr().out
    assert "http://localhost:3000/reset-password?token=tok456" in out
