"""
backend/email_utils.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROOT CAUSE OF EMAIL FAILURE ON RENDER FREE TIER:
  ─────────────────────────────────────────────────
  Render's free tier BLOCKS all outbound SMTP connections.
  This means Gmail SMTP (port 465 or 587) will ALWAYS fail
  with: OSError: [Errno 101] Network is unreachable

  FIX: Switched to Resend (https://resend.com) which uses
  HTTPS (port 443) — never blocked by Render free tier.

  Resend free tier: 3,000 emails/month, 100/day. No credit card.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SETUP (5 minutes):

  1. Go to https://resend.com → Sign Up (free, no credit card)

  2. Get your API key:
     Resend Dashboard → API Keys → Create API Key → copy it

  3. Sender address:
     On Resend free tier you can send FROM:
       onboarding@resend.dev   ← works immediately, no setup needed
     OR your own domain (requires DNS verification in Resend).
     Use onboarding@resend.dev for now — it works instantly.

  4. Add to Render Dashboard → shortlisting-ai-backend → Environment:
       RESEND_API_KEY  = re_xxxxxxxxxxxxxxxxxxxx
       MAIL_FROM       = onboarding@resend.dev
       MAIL_FROM_NAME  = Shortlisting AI

  No SMTP. No App Password. No port issues. Just works.
"""

import os
import json
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
=======
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "re_cLGqstZ4_9q9w1gYHUARQEtHZ2jrVyupa")
>>>>>>> a82fcba (ok)
MAIL_FROM      = os.getenv("MAIL_FROM",      "onboarding@resend.dev")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")
RESEND_API_URL = "https://api.resend.com/emails"


# ── Startup validation ────────────────────────────────────────────────────────
def _validate_config() -> None:
    if not RESEND_API_KEY:
        print(
            "[email_utils] ⚠️  RESEND_API_KEY is not set.\n"
            "              1. Sign up free at https://resend.com\n"
            "              2. Dashboard → API Keys → Create API Key\n"
            "              3. Render Dashboard → shortlisting-ai-backend "
            "→ Environment → Add RESEND_API_KEY"
        )
    else:
        print(
            f"[email_utils] ✅ Resend config loaded — "
            f"sending from '{MAIL_FROM_NAME} <{MAIL_FROM}>'"
        )


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
    Send a password-reset email via Resend HTTP API (port 443 — works on Render free tier).
    Uses only Python stdlib (urllib) — no extra pip installs needed.

    Returns True on success, False on failure. Never raises.
    """
    if not RESEND_API_KEY:
        print(
            "[email_utils] ❌ Cannot send email — RESEND_API_KEY is not set.\n"
            "              Sign up free at https://resend.com and add the key to Render."
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
        RESEND_API_URL,
        data    = payload,
        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
        },
        method = "POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body     = resp.read().decode("utf-8")
            data     = json.loads(body)
            email_id = data.get("id", "unknown")
            print(f"[email_utils] ✅ Reset email sent to {to_email} via Resend (id={email_id}).")
            return True

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            err = json.loads(body)
            msg = err.get("message") or err.get("name") or body
        except Exception:
            msg = body

        if e.code == 401:
            print(
                "[email_utils] ❌ Resend 401 — API key is invalid or expired.\n"
                "              Generate a new one at: https://resend.com/api-keys\n"
                "              Then update RESEND_API_KEY in Render Environment.\n"
                f"              Detail: {msg}"
            )
        elif e.code == 422:
            print(
                f"[email_utils] ❌ Resend 422 — request rejected: {msg}\n"
                "              Fix: set MAIL_FROM=onboarding@resend.dev in Render Environment\n"
                "              (or verify your own domain at https://resend.com/domains)"
            )
        else:
            print(f"[email_utils] ❌ Resend HTTP {e.code}: {msg}")

    except urllib.error.URLError as e:
        print(f"[email_utils] ❌ Could not reach Resend API: {e.reason}")
    except Exception as e:
        print(f"[email_utils] ❌ Unexpected error: {type(e).__name__}: {e}")

    _print_dev_fallback(to_name, to_email, reset_link)
    return False


def _print_dev_fallback(to_name: str, to_email: str, reset_link: str) -> None:
    """Prints the reset link to Render logs when email fails."""
    print("\n" + "═" * 70)
    print("  PASSWORD RESET — EMAIL FAILED, RESET LINK BELOW (check Render logs)")
    print(f"  User  : {to_name} <{to_email}>")
    print(f"  Link  : {reset_link}")
    print(f"  Expiry: 15 minutes from now")
    print("═" * 70 + "\n")
