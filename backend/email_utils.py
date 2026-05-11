"""
backend/email_utils.py

Sends password-reset emails via Gmail SMTP (smtplib — no external dependencies).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROOT CAUSE OF THE EMAIL NOT SENDING:
  ─────────────────────────────────────
  The previous version used the Resend API, but:
    1. RESEND_API_KEY was never set in .env or Render environment.
    2. MAIL_FROM was set to a Gmail address — Resend rejects that.
    3. All the MAIL_USERNAME / MAIL_PASSWORD / MAIL_SERVER vars
       in .env were being completely ignored.

  FIX: Switched to Gmail SMTP using smtplib (Python built-in).
  Your existing .env vars now work as-is:
    MAIL_USERNAME  =  aishortlisting@gmail.com
    MAIL_PASSWORD  =  your 16-char Gmail App Password
    MAIL_FROM      =  aishortlisting@gmail.com
    MAIL_FROM_NAME =  Shortlisting AI
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
         MAIL_FROM      = aishortlisting@gmail.com
         MAIL_FROM_NAME = Shortlisting AI

  Your current .env already has the right structure — just make sure
  MAIL_PASSWORD is the App Password (16 chars), not your regular password.

REQUIRED ENV VARS:
  MAIL_USERNAME    Gmail address used to send      (aishortlisting@gmail.com)
  MAIL_PASSWORD    Gmail App Password (16 chars)   (ckiy hnap awbl xsss)
  MAIL_FROM        Sender address                  (aishortlisting@gmail.com)
  MAIL_FROM_NAME   Sender display name             (Shortlisting AI)
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ── Config from environment ───────────────────────────────────────────────────
MAIL_SERVER   = os.getenv("MAIL_SERVER",   "smtp.gmail.com")
MAIL_PORT     = int(os.getenv("MAIL_PORT", "465"))
MAIL_USERNAME = os.getenv("MAIL_USERNAME", os.getenv("EMAIL_USER", "aishortlisting@gmail.com"))
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", os.getenv("EMAIL_PASS", "ckiyhnapawblxsss"))
MAIL_FROM     = os.getenv("MAIL_FROM",     MAIL_USERNAME)
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Shortlisting AI")


# ── Startup validation ────────────────────────────────────────────────────────
def _validate_config() -> None:
    issues = []
    if not MAIL_USERNAME:
        issues.append(
            "[email_utils] ⚠️  MAIL_USERNAME is not set. "
            "Add it in Render Dashboard → Environment."
        )
    if not MAIL_PASSWORD:
        issues.append(
            "[email_utils] ⚠️  MAIL_PASSWORD is not set. "
            "Add your Gmail App Password in Render Dashboard → Environment.\n"
            "             (Regular Gmail password won't work — "
            "generate an App Password at https://myaccount.google.com/apppasswords)"
        )
    for msg in issues:
        print(msg)


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
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        print(
            "[email_utils] ❌ Cannot send reset email — "
            "MAIL_USERNAME or MAIL_PASSWORD is not set."
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
            "              Your MAIL_PASSWORD must be a Gmail App Password (16 chars),\n"
            "              NOT your regular Gmail login password.\n"
            "              Generate one at: https://myaccount.google.com/apppasswords\n"
            "              Make sure 2-Step Verification is enabled on your Google account."
        )
    except smtplib.SMTPRecipientsRefused as e:
        print(f"[email_utils] ❌ Recipient refused: {e}")
    except smtplib.SMTPException as e:
        print(f"[email_utils] ❌ SMTP error: {e}")
    except Exception as e:
        print(f"[email_utils] ❌ Unexpected error sending email: {e}")

    _print_dev_fallback(to_name, to_email, reset_link)
    return False


def _print_dev_fallback(to_name: str, to_email: str, reset_link: str) -> None:
    print("\n" + "═" * 60)
    print("  PASSWORD RESET — EMAIL FAILED, dev fallback below")
    print(f"  User  : {to_name} <{to_email}>")
    print(f"  Link  : {reset_link}")
    print(f"  Expiry: 15 minutes from now")
    print("═" * 60 + "\n")