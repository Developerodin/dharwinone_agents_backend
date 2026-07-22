const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type OutboxEntry = { to: string; subject: string; html: string };
const outbox: OutboxEntry[] = [];

export function drainOutbox(): OutboxEntry[] {
  return [...outbox];
}

export function resetOutboxForTests(): void {
  outbox.length = 0;
}

export function appBaseUrl(fallbackBaseUrl?: string | null): string {
  const configured = (process.env.APP_BASE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (fallbackBaseUrl) return fallbackBaseUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

function smtpConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_USERNAME ?? "").trim() && (process.env.SMTP_PASSWORD ?? "").trim(),
  );
}

function layout(
  preheader: string,
  title: string,
  intro: string,
  buttonLabel: string,
  link: string,
  footnote: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#f3f6f4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f6f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background-color:#ffffff;border:1px solid #e4eae6;border-radius:14px;padding:36px 32px;">
          <h1 style="margin:0 0 12px 0;font-family:${FONT};font-size:21px;font-weight:700;color:#0f172a;">${title}</h1>
          <p style="margin:0 0 24px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
            <tr><td bgcolor="#2B7F3F" style="border-radius:9px;">
              <a href="${link}" style="display:inline-block;padding:13px 32px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">${buttonLabel}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;color:#64748b;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:0 0 24px 0;padding:12px 14px;background-color:#f6f8f7;border:1px solid #e4eae6;border-radius:8px;font-family:${FONT};font-size:12px;word-break:break-all;">
            <a href="${link}" style="color:#2B7F3F;">${link}</a>
          </p>
          <p style="margin:0;font-family:${FONT};font-size:13px;color:#64748b;">${footnote}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function sendEmail(to: string, subject: string, html: string): void {
  if (!smtpConfigured()) {
    console.log(`[email:console] to=${to} subject=${subject}\n${html}`);
    outbox.push({ to, subject, html });
    return;
  }
  // Real SMTP delivery can be wired later; console capture keeps tests deterministic.
  console.log(`[email:smtp-stub] to=${to} subject=${subject}`);
  outbox.push({ to, subject, html });
}

export function sendVerification(to: string, rawToken: string, baseUrl?: string | null): void {
  const link = `${appBaseUrl(baseUrl)}/verify?token=${encodeURIComponent(rawToken)}`;
  sendEmail(
    to,
    "Verify your Dharwin One account",
    layout(
      "Confirm your email to activate your Dharwin One account.",
      "Verify your email",
      "Welcome to Dharwin One! Click the button below to confirm this email address and activate your account.",
      "Verify email",
      link,
      "This link expires in 24 hours. If you didn't create a Dharwin One account, you can safely ignore this email.",
    ),
  );
}

export function sendPasswordReset(to: string, rawToken: string, baseUrl?: string | null): void {
  const link = `${appBaseUrl(baseUrl)}/reset-password?token=${encodeURIComponent(rawToken)}`;
  sendEmail(
    to,
    "Reset your Dharwin One password",
    layout(
      "Choose a new password for your Dharwin One account.",
      "Reset your password",
      "We received a request to reset the password for your Dharwin One account. Click the button below to choose a new one.",
      "Reset password",
      link,
      "This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
    ),
  );
}
