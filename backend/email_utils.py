"""
backend/email_utils.py

Sends password-reset emails via Resend API (https://resend.com).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROOT CAUSE OF THE 403 ERROR YOU SAW:
  ─────────────────────────────────────
  Error 1010 = Cloudflare bot-protection blocked the request.
  Two things caused it:
    1. MAIL_FROM was set to aishortlisting@gmail.com — a Gmail
       address that is NOT verified in Resend → instant 403.
    2. Missing User-Agent header → Cloudflare treats the request
       as a bot and blocks it.

  BOTH are fixed below.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SETUP (one-time, ~5 minutes):
  OPTION A — Free sandbox (no domain needed, works instantly):
    1. Sign up free at https://resend.com
    2. Go to API Keys → Create API Key → copy it
    3. In Render Dashboard → Your Service → Environment → Add:
         RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxx
         MAIL_FROM      = onboarding@resend.dev      ← free sandbox sender
         MAIL_FROM_NAME = Shortlisting AI

  OPTION B — Your own domain (recommended for production):
    1. Sign up free at https://resend.com
    2. Go to Domains → Add Domain → add your domain → verify DNS
    3. Go to API Keys → Create API Key → copy it
    4. In Render Dashboard → Your Service → Environment → Add:
         RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxx
         MAIL_FROM      = noreply@yourdomain.com     ← must match verified domain
         MAIL_FROM_NAME = Shortlisting AI

  ⚠️  NEVER use a Gmail / Yahoo / Hotmail address as MAIL_FROM.
      Resend only accepts addresses from domains you have verified,
      OR the sandbox address onboarding@resend.dev.

REQUIRED ENV VARS:
  RESEND_API_KEY   your Resend API key  (re_xxxx...)
  MAIL_FROM        sender address       (onboarding@resend.dev  OR  noreply@yourdomain.com)
  MAIL_FROM_NAME   sender display name  (Shortlisting AI)
"""

import os
import json
import urllib.request
import urllib.error

# ── Config from environment ───────────────────────────────────────────────────
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
MAIL_FROM      = os.getenv("MAIL_FROM", "onboarding@resend.dev")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")

# ── Startup validation ────────────────────────────────────────────────────────
def _validate_config():
    warnings = []

    if not RESEND_API_KEY:
        warnings.append(
            "\n[email_utils] ⚠️  WARNING: RESEND_API_KEY is not set!\n"
            "             Password reset emails will NOT be delivered.\n"
            "             Fix: Add RESEND_API_KEY to Render Dashboard → Environment."
        )

    # Warn if someone left a Gmail/Hotmail/Yahoo address as MAIL_FROM
    free_providers = ("@gmail.com", "@yahoo.com", "@hotmail.com", "@outlook.com")
    if any(MAIL_FROM.lower().endswith(p) for p in free_providers):
        warnings.append(
            f"\n[email_utils] ⚠️  WARNING: MAIL_FROM is set to '{MAIL_FROM}'.\n"
            "             Resend does NOT allow free email providers as senders.\n"
            "             Fix: Set MAIL_FROM to one of:\n"
            "               • onboarding@resend.dev  (free sandbox, works instantly)\n"
            "               • noreply@yourdomain.com  (after verifying domain in Resend)\n"
        )

    for w in warnings:
        print(w)

_validate_config()


# ── HTML email template ───────────────────────────────────────────────────────
def _build_html(to_name: str, reset_link: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:16px;
                    box-shadow:0 4px 32px rgba(0,0,0,.10);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 60%,#1d4ed8 100%);
                     padding:32px 40px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,.15);
                        border:1px solid rgba(255,255,255,.3);border-radius:99px;
                        padding:5px 18px;font-size:11px;font-weight:700;
                        letter-spacing:.08em;text-transform:uppercase;color:#ffffff;
                        margin-bottom:16px;">
              Password Reset
            </div>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">
              Reset your password
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:16px;color:#374151;">
              Hi <strong>{to_name}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.7;">
              We received a request to reset the password for your
              <strong>Shortlisting AI</strong> account. Click the button below
              to choose a new password.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="{reset_link}"
                     style="display:inline-block;padding:14px 36px;
                            background:linear-gradient(135deg,#2563eb,#1d4ed8);
                            color:#ffffff;font-size:15px;font-weight:700;
                            text-decoration:none;border-radius:8px;
                            letter-spacing:.02em;">
                    Reset My Password
                  </a>
                </td>
              </tr>
            </table>
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;
                        padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#7a6000;">
                ⏰ <strong>This link expires in 15 minutes.</strong>
                If it has expired, go back to the login page and request a new one.
              </p>
            </div>
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="margin:0 0 24px;font-size:12px;word-break:break-all;
                      color:#2563eb;background:#f0f4ff;padding:10px 12px;
                      border-radius:6px;border:1px solid #dbeafe;">
              {reset_link}
            </p>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              If you did not request a password reset, you can safely ignore
              this email — your password will not change.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              © 2025 Shortlisting AI · This is an automated message, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _build_plain(to_name: str, reset_link: str) -> str:
    return f"""Hi {to_name},

We received a request to reset the password for your Shortlisting AI account.

Click the link below to choose a new password (expires in 15 minutes):

{reset_link}

If you did not request this, you can safely ignore this email.

— The Shortlisting AI Team
"""


def send_reset_email(to_name: str, to_email: str, reset_link: str) -> bool:
    """
    Send a password-reset email via Resend API (HTTPS — works on Render).

    Returns True on success, False on failure.
    Never raises — caller decides what to do on failure.
    """
    if not RESEND_API_KEY:
        print(
            "[email_utils] ❌ Cannot send reset email — RESEND_API_KEY not set.\n"
            "              Set it in Render Dashboard → Environment.\n"
            f"              Dev fallback reset link: {reset_link}"
        )
        _print_dev_fallback(to_name, to_email, reset_link)
        return False

    # Warn (but still try) if MAIL_FROM looks like a free provider
    free_providers = ("@gmail.com", "@yahoo.com", "@hotmail.com", "@outlook.com")
    if any(MAIL_FROM.lower().endswith(p) for p in free_providers):
        print(
            f"[email_utils] ⚠️  MAIL_FROM '{MAIL_FROM}' is a free email provider.\n"
            "              Resend will reject this with 403. Use onboarding@resend.dev instead."
        )

    payload = json.dumps({
        "from":    f"{MAIL_FROM_NAME} <{MAIL_FROM}>",
        "to":      [to_email],
        "subject": "Reset your Shortlisting AI password",
        "html":    _build_html(to_name, reset_link),
        "text":    _build_plain(to_name, reset_link),
    }).encode("utf-8")

    req = urllib.request.Request(
        url     = "https://api.resend.com/emails",
        data    = payload,
        method  = "POST",
        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
            # ✅ FIX: Adding User-Agent prevents Cloudflare error 1010 (bot block)
            "User-Agent":    "ShortlistingAI/1.0 (contact@shortlisting.ai)",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode()
            print(f"[email_utils] ✅ Reset email sent to {to_email} via Resend. Response: {body}")
            return True

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else "(no body)"

        # Provide actionable guidance for common error codes
        if e.code == 403:
            print(
                f"[email_utils] ❌ Resend API 403 Forbidden.\n"
                f"              Response: {body}\n"
                "              Most likely causes:\n"
                "                1. MAIL_FROM is a Gmail/Yahoo/Hotmail address — not allowed.\n"
                "                   Fix: Set MAIL_FROM=onboarding@resend.dev in Render env vars.\n"
                "                2. RESEND_API_KEY is wrong or expired.\n"
                "                   Fix: Regenerate key at https://resend.com/api-keys\n"
            )
        elif e.code == 422:
            print(
                f"[email_utils] ❌ Resend API 422 Unprocessable.\n"
                f"              Response: {body}\n"
                "              MAIL_FROM domain is not verified in Resend.\n"
                "              Fix: Use onboarding@resend.dev OR verify your domain at https://resend.com/domains\n"
            )
        elif e.code == 401:
            print(
                f"[email_utils] ❌ Resend API 401 Unauthorized.\n"
                "              RESEND_API_KEY is missing or invalid.\n"
                "              Fix: Check your key at https://resend.com/api-keys\n"
            )
        else:
            print(
                f"[email_utils] ❌ Resend API HTTP error {e.code}: {body}"
            )

    except urllib.error.URLError as e:
        print(
            f"[email_utils] ❌ Resend API connection error: {e.reason}\n"
            f"              Dev fallback reset link: {reset_link}"
        )
    except Exception as e:
        print(
            f"[email_utils] ❌ Unexpected error: {e}\n"
            f"              Dev fallback reset link: {reset_link}"
        )

    _print_dev_fallback(to_name, to_email, reset_link)
    return False


def _print_dev_fallback(to_name: str, to_email: str, reset_link: str) -> None:
    print("\n" + "═" * 60)
    print("  PASSWORD RESET — EMAIL FAILED, dev fallback below")
    print(f"  User  : {to_name} <{to_email}>")
    print(f"  Link  : {reset_link}")
    print(f"  Expiry: 15 minutes from now")
    print("═" * 60 + "\n")