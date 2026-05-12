"""
backend/email_utils.py

Uses Brevo HTTP API (port 443) — works on Render free tier.
Free tier: 300 emails/day, sends to ANY email address, no domain needed.

REQUIRED ENVIRONMENT VARIABLES in Render Dashboard:
  BREVO_API_KEY  = xkeysib-xxxxxxxxxxxxxxxxxxxx
  MAIL_FROM      = aishortlisting@gmail.com
  MAIL_FROM_NAME = Shortlisting Solutions
  FRONTEND_URL   = https://shortlisting-ai.vercel.app
"""

import os
import json
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
BREVO_API_KEY  = os.getenv("BREVO_API_KEY", "")
MAIL_FROM      = os.getenv("MAIL_FROM", "aishortlisting@gmail.com")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting Solutions")
FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:5173")
BREVO_API_URL  = "https://api.brevo.com/v3/smtp/email"


# ── Startup validation ────────────────────────────────────────────────────────
def _validate_config() -> None:
    if not BREVO_API_KEY:
        print(
            "[email_utils] ⚠️  BREVO_API_KEY is not set — emails will NOT be sent.\n"
            "              1. Sign up free at https://brevo.com\n"
            "              2. Dashboard → SMTP & API → API keys & MCP → Generate\n"
            "              3. Render → Environment → Add BREVO_API_KEY"
        )
    else:
        print(f"[email_utils] ✅ BREVO_API_KEY loaded.")

    if not MAIL_FROM:
        print(
            "[email_utils] ⚠️  MAIL_FROM is not set.\n"
            "              Set it to your verified Brevo sender email:\n"
            "              MAIL_FROM = aishortlisting@gmail.com"
        )
    else:
        print(f"[email_utils] ✅ Sending from '{MAIL_FROM_NAME} <{MAIL_FROM}>'")

    if FRONTEND_URL.startswith("http://localhost"):
        print(
            "[email_utils] ⚠️  FRONTEND_URL is localhost — reset links won't work for real users.\n"
            "              Fix: Render → Environment → FRONTEND_URL = https://shortlisting-ai.vercel.app"
        )
    else:
        print(f"[email_utils] ✅ FRONTEND_URL = {FRONTEND_URL}")


_validate_config()


# ── HTML email template ───────────────────────────────────────────────────────
def _build_html(to_name: str, reset_link: str) -> str:
    return f"""<!DOCTYPE html>
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
</html>"""


def _build_plain(to_name: str, reset_link: str) -> str:
    return f"""Hi {to_name},

We received a request to reset the password for your Shortlisting AI account.

Click the link below to choose a new password (expires in 15 minutes):

{reset_link}

If you did not request this, you can safely ignore this email.

— The Shortlisting AI Team
"""


# ── Send via Brevo HTTP API ───────────────────────────────────────────────────
def send_reset_email(to_name: str, to_email: str, reset_link: str) -> bool:
    """
    Send a password-reset email via Brevo HTTP API (port 443).
    Works on Render free tier. Sends to ANY email address.
    Uses only Python stdlib (urllib) — no extra packages needed.
    Returns True on success, False on failure. Never raises.
    """
    if not BREVO_API_KEY or not MAIL_FROM:
        print(
            "[email_utils] ❌ Cannot send — BREVO_API_KEY or MAIL_FROM not set.\n"
            "              Add them in Render Dashboard → Environment."
        )
        _print_dev_fallback(to_name, to_email, reset_link)
        return False

    payload = json.dumps({
        "sender": {
            "name":  MAIL_FROM_NAME,
            "email": MAIL_FROM,
        },
        "to": [
            {"name": to_name, "email": to_email}
        ],
        "subject":     "Reset your Shortlisting AI password",
        "htmlContent": _build_html(to_name, reset_link),
        "textContent": _build_plain(to_name, reset_link),
    }).encode("utf-8")

    req = urllib.request.Request(
        BREVO_API_URL,
        data    = payload,
        headers = {
            "api-key":      BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
        method = "POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body   = resp.read().decode("utf-8")
            data   = json.loads(body)
            msg_id = data.get("messageId", "unknown")
            print(f"[email_utils] ✅ Reset email sent to {to_email} via Brevo (messageId={msg_id}).")
            return True

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            err = json.loads(body)
            msg = err.get("message") or str(err)
        except Exception:
            msg = body

        if e.code == 401:
            print(
                "[email_utils] ❌ Brevo 401 — API key invalid.\n"
                "              Generate a new key: Brevo Dashboard → SMTP & API → API keys & MCP\n"
                "              Then update BREVO_API_KEY in Render Environment.\n"
                f"              Detail: {msg}"
            )
        elif e.code == 400:
            print(
                f"[email_utils] ❌ Brevo 400 — Bad request: {msg}\n"
                "              Most likely: MAIL_FROM email is not verified in Brevo.\n"
                "              Fix: Brevo Dashboard → Senders, domains, IPs → Senders → verify email."
            )
        elif e.code == 429:
            print(
                "[email_utils] ❌ Brevo 429 — Daily limit reached (300/day on free tier).\n"
                f"              Detail: {msg}"
            )
        else:
            print(f"[email_utils] ❌ Brevo HTTP {e.code}: {msg}")

    except urllib.error.URLError as e:
        print(f"[email_utils] ❌ Could not reach Brevo API: {e.reason}")
    except Exception as e:
        print(f"[email_utils] ❌ Unexpected error: {type(e).__name__}: {e}")

    _print_dev_fallback(to_name, to_email, reset_link)
    return False


def _print_dev_fallback(to_name: str, to_email: str, reset_link: str) -> None:
    """Prints the reset link to logs when email fails — copy this link manually."""
    print("\n" + "═" * 70)
    print("  PASSWORD RESET — EMAIL FAILED, USE THIS LINK MANUALLY")
    print(f"  User  : {to_name} <{to_email}>")
    print(f"  Link  : {reset_link}")
    print(f"  Expiry: 15 minutes from now")
    print("═" * 70 + "\n")