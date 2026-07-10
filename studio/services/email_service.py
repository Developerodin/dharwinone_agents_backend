"""Outbound email via Resend's HTTP API; console fallback when unconfigured."""

import os
import urllib.parse

import httpx


def app_base_url():
    return os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")


def send_email(to, subject, html):
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        print(f"[email:console] to={to} subject={subject}\n{html}")
        return
    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": os.environ.get(
                "AUTH_EMAIL_FROM", "Dharwin One <onboarding@resend.dev>"
            ),
            "to": [to],
            "subject": subject,
            "html": html,
        },
        timeout=10,
    )
    response.raise_for_status()


def send_verification(to, raw_token):
    link = f"{app_base_url()}/verify?token={urllib.parse.quote(raw_token)}"
    send_email(
        to,
        "Verify your Dharwin One account",
        f'<p>Welcome to Dharwin One! Confirm your email to activate your '
        f'account.</p><p><a href="{link}">Verify email</a></p>'
        f"<p>Or open: {link}</p><p>This link expires in 24 hours.</p>",
    )


def send_password_reset(to, raw_token):
    link = f"{app_base_url()}/reset-password?token={urllib.parse.quote(raw_token)}"
    send_email(
        to,
        "Reset your Dharwin One password",
        f'<p>We received a request to reset your password.</p>'
        f'<p><a href="{link}">Reset password</a></p>'
        f"<p>Or open: {link}</p><p>This link expires in 1 hour. If you did "
        f"not request this, ignore this email.</p>",
    )
