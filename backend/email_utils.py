"""
backend/email_utils.py

Sends password-reset emails via Resend API (https://resend.com).

WHY RESEND INSTEAD OF SMTP?
  Render.com (and most cloud platforms) BLOCK outbound SMTP connections
  on ports 465 and 587. That is why you see:
    [Errno 101] Network is unreachable

  Resend uses plain HTTPS (port 443) which is NEVER blocked.
  Free tier: 3,000 emails/month, 100/day — more than enough.

SETUP (one-time, ~3 minutes):
  1. Sign up free at https://resend.com
  2. Go to API Keys → Create API Key → copy it
  3. Go to Domains → Add Domain (or use the free sandbox:
       from: onboarding@resend.dev  ← works instantly, no domain needed)
  4. In Render Dashboard → Your Service → Environment → Add:
       RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxx
       MAIL_FROM      = onboarding@resend.dev   (or your verified domain email)
       MAIL_FROM_NAME = Shortlisting AI

  That's it. No App Passwords, no 2FA, no SMTP config needed.

REQUIRED ENV VARS:
  RESEND_API_KEY   your Resend API key  (re_xxxx...)
  MAIL_FROM        sender address       (onboarding@resend.dev for sandbox)
  MAIL_FROM_NAME   sender display name  (Shortlisting AI)

OPTIONAL FALLBACK:
  If RESEND_API_KEY is not set, the reset link is printed to logs
  (same dev-mode behaviour as before).
"""

import os
import json
import urllib.request
import urllib.error

# ── Config from environment ───────────────────────────────────────────────────
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "re_LrQHbr7r_5dPT4DftE34AP6mUHR37kUzs")
MAIL_FROM      = os.getenv("MAIL_FROM","aishortlisting@gmail.com")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")

# ── Startup warning if not configured ────────────────────────────────────────
if not RESEND_API_KEY:
    print(
        "\n[email_utils] ⚠️  WARNING: RESEND_API_KEY is not set!\n"
        "             Password reset emails will NOT be delivered.\n"
        "             Fix:\n"
        "               1. Sign up free at https://resend.com\n"
        "               2. Create an API key\n"
        "               3. Add to Render Dashboard → Environment:\n"
        "                    RESEND_API_KEY = re_xxxxxxxxxxxx\n"
        "                    MAIL_FROM      = onboarding@resend.dev\n"
    )


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
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            print(f"[email_utils] ✅ Reset email sent to {to_email} via Resend. Response: {body}")
            return True

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else "(no body)"
        print(
            f"[email_utils] ❌ Resend API HTTP error {e.code}: {body}\n"
            f"              Dev fallback reset link: {reset_link}"
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