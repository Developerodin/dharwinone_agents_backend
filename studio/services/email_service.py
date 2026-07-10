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


# Email-client constraints: table layout, inline CSS, system fonts, no
# animation/web fonts. Brand green #41A454 for the logo mark; darker #2B7F3F
# for button/links so white-on-green text meets WCAG AA (>=4.5:1).
_FONT = (
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
)


def _layout(preheader, title, intro, button_label, link, footnote):
    return f"""\
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#f3f6f4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f6f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td style="padding:0 8px 20px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" height="36" align="center" bgcolor="#41A454" style="border-radius:9px;font-family:{_FONT};font-size:19px;font-weight:700;color:#ffffff;line-height:36px;">D</td>
                  <td style="padding-left:10px;font-family:{_FONT};font-size:17px;font-weight:700;color:#0f172a;">Dharwin&nbsp;One</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e4eae6;border-radius:14px;padding:36px 32px;">
              <h1 style="margin:0 0 12px 0;font-family:{_FONT};font-size:21px;line-height:1.35;font-weight:700;color:#0f172a;">{title}</h1>
              <p style="margin:0 0 24px 0;font-family:{_FONT};font-size:15px;line-height:1.6;color:#475569;">{intro}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td bgcolor="#2B7F3F" style="border-radius:9px;">
                    <a href="{link}" style="display:inline-block;padding:13px 32px;font-family:{_FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">{button_label}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-family:{_FONT};font-size:13px;line-height:1.6;color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin:0 0 24px 0;padding:12px 14px;background-color:#f6f8f7;border:1px solid #e4eae6;border-radius:8px;font-family:{_FONT};font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="{link}" style="color:#2B7F3F;text-decoration:underline;">{link}</a>
              </p>
              <p style="margin:0;font-family:{_FONT};font-size:13px;line-height:1.6;color:#64748b;">{footnote}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 8px 0 8px;font-family:{_FONT};font-size:12px;line-height:1.6;color:#94a3b8;">
              Dharwin One &middot; AI calling agents and campaign workspace<br>
              You received this email because of activity on your Dharwin One account.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_verification(to, raw_token):
    link = f"{app_base_url()}/verify?token={urllib.parse.quote(raw_token)}"
    send_email(
        to,
        "Verify your Dharwin One account",
        _layout(
            preheader="Confirm your email to activate your Dharwin One account.",
            title="Verify your email",
            intro=(
                "Welcome to Dharwin One! Click the button below to confirm "
                "this email address and activate your account."
            ),
            button_label="Verify email",
            link=link,
            footnote=(
                "This link expires in 24 hours. If you didn't create a "
                "Dharwin One account, you can safely ignore this email."
            ),
        ),
    )


def send_password_reset(to, raw_token):
    link = f"{app_base_url()}/reset-password?token={urllib.parse.quote(raw_token)}"
    send_email(
        to,
        "Reset your Dharwin One password",
        _layout(
            preheader="Choose a new password for your Dharwin One account.",
            title="Reset your password",
            intro=(
                "We received a request to reset the password for your "
                "Dharwin One account. Click the button below to choose a "
                "new one."
            ),
            button_label="Reset password",
            link=link,
            footnote=(
                "This link expires in 1 hour. If you didn't request a "
                "password reset, you can safely ignore this email — your "
                "password won't change."
            ),
        ),
    )
