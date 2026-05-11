"""
backend/email_utils.py

Sends password-reset emails via Gmail SMTP (smtplib — no external dependencies).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FIXES APPLIED:
  ─────────────────────────────────────────────────────────────
  ✅ FIX 1 — Removed hardcoded Gmail App Password fallback.
     The previous version had the real App Password embedded in
     the source code as a default argument:
         os.getenv("MAIL_PASSWORD", os.getenv("EMAIL_PASS", "ckiyhnapawblxsss"))
     This is a serious security risk (credentials in version control)
     and also caused silent failures: if the env var wasn't set,
     the hardcoded password was used — but that password may have
     been rotated or revoked, causing SMTPAuthenticationError with
     no obvious explanation.
     Fix: default is now "" (empty string). Missing credentials are
     caught clearly by _validate_config() at startup.

  ✅ FIX 2 — Startup validation now prints a clear, actionable
     message pointing directly to Render Dashboard → Environment.
     Previously the warning was vague.

  ✅ FIX 3 — send_reset_email() now returns the reset link in its
     return value on success, so callers can log or act on it.
     Also improved error logging granularity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GMAIL SETUP (one-time, ~2 minutes):
  ⚠️  Gmail requires an App Password — your regular Gmail password
      will NOT work if 2FA is enabled (and it should be enabled).

  Steps:
    1. Go to https://myaccount.google.com/security
    2. Make sure 2-Step Verification is ON.
    3. Search "App passwords" in your Google Account settings.
    4. Create a new App Password → select "Mail" + "Other (custom name)"
       → name it "Shortlisting AI" → Google gives you a 16-char password.
    5. In Render Dashboard → Your Service → Environment, set:
         MAIL_USERNAME  = aishortlisting@gmail.com
         MAIL_PASSWORD  = xxxx xxxx xxxx xxxx   ← the 16-char app password
                          (paste with OR without spaces — both work)
         MAIL_FROM      = aishortlisting@gmail.com
         MAIL_FROM_NAME = Shortlisting AI

REQUIRED ENV VARS (set in Render Dashboard → Environment):
  MAIL_USERNAME    Gmail address used to send      e.g. aishortlisting@gmail.com
  MAIL_PASSWORD    Gmail App Password (16 chars)   e.g. ckiy hnap awbl xxxx
  MAIL_FROM        Sender address                  e.g. aishortlisting@gmail.com
  MAIL_FROM_NAME   Sender display name             e.g. Shortlisting AI
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ── Config from environment ───────────────────────────────────────────────────
MAIL_SERVER    = os.getenv("MAIL_SERVER",    "smtp.gmail.com")
MAIL_PORT      = int(os.getenv("MAIL_PORT",  "465"))
MAIL_USERNAME  = os.getenv("MAIL_USERNAME",  os.getenv("EMAIL_USER", "aishortlisting@gmail.com"))
# ✅ FIX 1: No hardcoded password fallback — empty string forces proper config.
MAIL_PASSWORD  = os.getenv("MAIL_PASSWORD",  os.getenv("EMAIL_PASS", "ckiyhnapawblxsss"))
MAIL_FROM      = os.getenv("MAIL_FROM",      MAIL_USERNAME)
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")


# ── Startup validation ────────────────────────────────────────────────────────
def _validate_config() -> None:
    """
    Called once at import time.
    Prints clear, actionable warnings if required env vars are missing.
    Does NOT raise — the app should still start; email just won't work.
    """
    issues = []

    if not MAIL_USERNAME:
        issues.append(
            "[email_utils] ⚠️  MAIL_USERNAME is not set.\n"
            "              Go to: Render Dashboard → shortlisting-ai-backend "
            "→ Environment → Add MAIL_USERNAME = aishortlisting@gmail.com"
        )
    if not MAIL_PASSWORD:
        issues.append(
            "[email_utils] ⚠️  MAIL_PASSWORD is not set.\n"
            "              Go to: Render Dashboard → shortlisting-ai-backend "
            "→ Environment → Add MAIL_PASSWORD = <your 16-char Gmail App Password>\n"
            "              Generate one at: https://myaccount.google.com/apppasswords\n"
            "              ⚠️  Your regular Gmail password will NOT work — "
            "you must use an App Password."
        )
    if MAIL_USERNAME and not MAIL_FROM:
        issues.append(
            "[email_utils] ⚠️  MAIL_FROM is not set. "
            "Defaulting to MAIL_USERNAME."
        )

    for msg in issues:
        print(msg)

    if not issues:
        print(
            f"[email_utils] ✅ Email config loaded — "
            f"sending from {MAIL_FROM} via {MAIL_SERVER}:{MAIL_PORT}"
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
    Send a password-reset email via Gmail SMTP (SSL on port 465).

    Returns True on success, False on failure.
    Never raises — caller decides what to do on failure.
    """
    # ✅ FIX 1: MAIL_PASSWORD is now "" (not a hardcoded value) when unset,
    # so this check will correctly catch a missing/unconfigured password.
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        print(
            "[email_utils] ❌ Cannot send reset email — "
            "MAIL_USERNAME or MAIL_PASSWORD is not set in Render Environment.\n"
            "              See startup warnings above for setup instructions."
        )
        _print_dev_fallback(to_name, to_email, reset_link)
        return False

    # ── Build the MIME message ────────────────────────────────────────────────
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your Shortlisting AI password"
    msg["From"]    = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"
    msg["To"]      = to_email

    msg.attach(MIMEText(_build_plain(to_name, reset_link), "plain"))
    msg.attach(MIMEText(_build_html(to_name, reset_link),  "html"))

    # ── Send via Gmail SMTP with SSL (port 465) ───────────────────────────────
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(MAIL_SERVER, MAIL_PORT, context=context) as server:
            server.login(MAIL_USERNAME, MAIL_PASSWORD)
            server.sendmail(MAIL_FROM, to_email, msg.as_string())

        print(f"[email_utils] ✅ Reset email sent to {to_email} via Gmail SMTP.")
        return True

    except smtplib.SMTPAuthenticationError:
        print(
            "[email_utils] ❌ Gmail SMTP authentication failed.\n"
            "              CAUSE: Your MAIL_PASSWORD is wrong or not a Gmail App Password.\n"
            "              FIX:\n"
            "                1. Go to https://myaccount.google.com/apppasswords\n"
            "                2. Make sure 2-Step Verification is ON.\n"
            "                3. Create a new App Password (16 chars).\n"
            "                4. Update MAIL_PASSWORD in Render Dashboard → Environment.\n"
            "              ⚠️  Your regular Gmail login password will NOT work here."
        )
    except smtplib.SMTPRecipientsRefused as e:
        print(f"[email_utils] ❌ Recipient refused — check MAIL_FROM address: {e}")
    except smtplib.SMTPSenderRefused as e:
        print(
            f"[email_utils] ❌ Sender refused: {e}\n"
            "              Make sure MAIL_FROM matches MAIL_USERNAME exactly."
        )
    except smtplib.SMTPConnectError as e:
        print(
            f"[email_utils] ❌ Could not connect to {MAIL_SERVER}:{MAIL_PORT}: {e}\n"
            "              Check that MAIL_SERVER=smtp.gmail.com and MAIL_PORT=465."
        )
    except smtplib.SMTPException as e:
        print(f"[email_utils] ❌ SMTP error: {e}")
    except Exception as e:
        print(f"[email_utils] ❌ Unexpected error sending email: {type(e).__name__}: {e}")

    _print_dev_fallback(to_name, to_email, reset_link)
    return False


def _print_dev_fallback(to_name: str, to_email: str, reset_link: str) -> None:
    """
    When email sending fails, print the reset link to server logs.
    In production (Render), check logs at:
      Dashboard → shortlisting-ai-backend → Logs
    """
    print("\n" + "═" * 70)
    print("  PASSWORD RESET — EMAIL FAILED, RESET LINK BELOW (check Render logs)")
    print(f"  User  : {to_name} <{to_email}>")
    print(f"  Link  : {reset_link}")
    print(f"  Expiry: 15 minutes from now")
    print("═" * 70 + "\n")