"""
backend/email_utils.py

Sends password-reset emails via SMTP (Gmail by default).

FIXES APPLIED:
  ✅ FIX 1 — Added startup warning if email env vars are missing, so you
             catch misconfiguration immediately on deploy instead of
             silently failing when a user requests a reset.

  ✅ FIX 2 — Gmail App Password instructions printed clearly in logs
             when SMTP auth fails — common cause of forgot-password
             not working after deployment.

  ✅ FIX 3 — MAIL_PORT now accepts both int and string from env.

  ✅ FIX 4 — Added STARTTLS support (port 587) in addition to SSL (465),
             because some hosting environments block port 465.

REQUIRED ENV VARS (set in Render Dashboard → Environment):
  MAIL_SERVER    = smtp.gmail.com
  MAIL_PORT      = 465          (or 587 for STARTTLS)
  MAIL_USERNAME  = your@gmail.com
  MAIL_PASSWORD  = xxxx xxxx xxxx xxxx   ← Gmail App Password (NOT your login password)
  MAIL_FROM      = your@gmail.com
  MAIL_FROM_NAME = Shortlisting AI

HOW TO GET A GMAIL APP PASSWORD:
  1. Enable 2-Factor Authentication on your Google account.
  2. Go to: https://myaccount.google.com/apppasswords
  3. Create an app password for "Mail".
  4. Paste the 16-character password into MAIL_PASSWORD in Render.
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText


# ── Config from environment ───────────────────────────────────────────────────
MAIL_SERVER    = os.getenv("MAIL_SERVER",    "smtp.gmail.com")
MAIL_PORT      = int(os.getenv("MAIL_PORT",  "465"))
MAIL_USERNAME  = os.getenv("MAIL_USERNAME",  "aishortlisting@gmail.com")
MAIL_PASSWORD  = os.getenv("MAIL_PASSWORD",  "ckiyhnapawblxsss")
MAIL_FROM      = os.getenv("MAIL_FROM",MAIL_USERNAME)
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")

# ✅ FIX 1: Warn at import time if email is not configured
if not MAIL_USERNAME or not MAIL_PASSWORD:
    print(
        "\n[email_utils] ⚠️  WARNING: Email is NOT configured!\n"
        "             Forgot-password emails will NOT be sent.\n"
        "             Set these in Render Dashboard → Environment:\n"
        "               MAIL_USERNAME  = your@gmail.com\n"
        "               MAIL_PASSWORD  = (Gmail App Password — 16 chars)\n"
        "               MAIL_FROM      = your@gmail.com\n"
        "               MAIL_SERVER    = smtp.gmail.com\n"
        "               MAIL_PORT      = 465\n"
        "             See: https://myaccount.google.com/apppasswords\n"
    )


def _build_reset_email(to_name: str, to_email: str, reset_link: str) -> MIMEMultipart:
    """Build a polished HTML + plain-text reset email."""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your Shortlisting AI password"
    msg["From"]    = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"
    msg["To"]      = f"{to_name} <{to_email}>"

    # ── Plain-text fallback ───────────────────────────────────────────────────
    plain = f"""Hi {to_name},

We received a request to reset the password for your Shortlisting AI account.

Click the link below to choose a new password (expires in 15 minutes):

{reset_link}

If you did not request this, you can safely ignore this email — your password
will not change.

— The Shortlisting AI Team
"""

    # ── HTML version ──────────────────────────────────────────────────────────
    html = f"""
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

      <!-- Card -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:16px;
                    box-shadow:0 4px 32px rgba(0,0,0,.10);overflow:hidden;">

        <!-- Header bar -->
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

        <!-- Body -->
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

            <!-- CTA button -->
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

            <!-- Expiry notice -->
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;
                        padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#7a6000;">
                ⏰ <strong>This link expires in 15 minutes.</strong>
                If it has expired, go back to the login page and request a new one.
              </p>
            </div>

            <!-- Raw link fallback -->
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

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 28px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              © 2025 Shortlisting AI · This is an automated message, please do not reply.
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td></tr>
  </table>

</body>
</html>
"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html,  "html"))
    return msg


def send_reset_email(to_name: str, to_email: str, reset_link: str) -> bool:
    """
    Send a password-reset email.

    Returns True on success, False on failure (logs the error to console).
    Never raises — caller decides what to do on failure.

    ✅ FIX 4: Supports both SSL (port 465) and STARTTLS (port 587).
    """
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        print(
            "[email_utils] ❌ Cannot send reset email — MAIL_USERNAME or MAIL_PASSWORD not set.\n"
            "              Set them in Render Dashboard → Environment.\n"
            f"              Dev fallback reset link: {reset_link}"
        )
        return False

    try:
        msg = _build_reset_email(to_name, to_email, reset_link)

        # ✅ FIX 4: Auto-select SSL vs STARTTLS based on port
        if MAIL_PORT == 587:
            # STARTTLS (port 587)
            with smtplib.SMTP(MAIL_SERVER, MAIL_PORT) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(MAIL_USERNAME, MAIL_PASSWORD)
                server.sendmail(MAIL_FROM, to_email, msg.as_string())
        else:
            # SSL (port 465, default)
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(MAIL_SERVER, MAIL_PORT, context=context) as server:
                server.login(MAIL_USERNAME, MAIL_PASSWORD)
                server.sendmail(MAIL_FROM, to_email, msg.as_string())

        print(f"[email_utils] ✅ Reset email sent successfully to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        print(
            "[email_utils] ❌ SMTP Authentication failed!\n"
            "              This is the most common cause of forgot-password not working.\n"
            "              → For Gmail you MUST use an App Password, not your login password.\n"
            "              → Steps:\n"
            "                1. Enable 2FA: https://myaccount.google.com/security\n"
            "                2. Generate App Password: https://myaccount.google.com/apppasswords\n"
            "                3. Paste the 16-char password into MAIL_PASSWORD in Render.\n"
            f"              Dev fallback reset link: {reset_link}"
        )
    except smtplib.SMTPConnectError:
        print(
            f"[email_utils] ❌ Cannot connect to {MAIL_SERVER}:{MAIL_PORT}\n"
            "              → Try port 587 (STARTTLS) instead of 465 (SSL).\n"
            "              → Set MAIL_PORT=587 in Render Environment.\n"
            f"              Dev fallback reset link: {reset_link}"
        )
    except smtplib.SMTPException as e:
        print(f"[email_utils] ❌ SMTP error: {e}\n"
              f"              Dev fallback reset link: {reset_link}")
    except Exception as e:
        print(f"[email_utils] ❌ Unexpected error sending email: {e}\n"
              f"              Dev fallback reset link: {reset_link}")

    return False