"""
backend/email_utils.py  ── v2.1.1
All email functions needed by main.py and auth.py.

FIXED in v2.1.1:
  FIX-EMAIL-1 — send_generated_password_email() now uses datetime.now(timezone.utc)
                instead of datetime.now() so the "Registered:" timestamp in the
                email footer reflects UTC, consistent with how created_at is stored
                in the database.  Previously it used server local time which could
                show a wrong or confusing timestamp depending on deployment timezone.

  FIX-EMAIL-2 — send_welcome_email() is no longer called from auth.py (see
                FIX-AUTH-5).  The function itself is kept here unchanged because
                main.py or other modules may still call it independently.

All other functions are 100% unchanged from v2.1.0.
"""

from dotenv import load_dotenv
load_dotenv()

import os
import json
import urllib.request
import urllib.error
import logging
import re
from datetime import datetime, timezone   # FIX-EMAIL-1: import timezone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BREVO_API_KEY       = os.getenv("BREVO_API_KEY", "")
MAIL_FROM           = os.getenv("MAIL_FROM", "aishortlisting@gmail.com")
MAIL_FROM_NAME      = os.getenv("MAIL_FROM_NAME", "AI-Powered Shortlisting Platform")
SUPPORT_EMAIL       = os.getenv("SUPPORT_EMAIL", MAIL_FROM)
SUPPORT_EMAIL_NAME  = os.getenv("SUPPORT_EMAIL_NAME", MAIL_FROM_NAME)
FRONTEND_URL        = os.getenv("FRONTEND_URL", "http://localhost:5173")
BREVO_API_URL       = "https://api.brevo.com/v3/smtp/email"


# ---------------------------------------------------------------------------
# Core send helper  (unchanged)
# ---------------------------------------------------------------------------

def _send_brevo_email(
    to_name: str,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str = "",
) -> bool:
    """
    Low-level Brevo send.  Called directly from main.py (finalize_application)
    and also used internally by all helper functions below.
    Returns True on success, False on any failure.
    """
    if not BREVO_API_KEY:
        print("[email] ERROR: BREVO_API_KEY is not set — email not sent.")
        return False

    if not to_name:
        to_name = to_email.split("@")[0]

    if not text_content:
        text_content = re.sub(r"<[^>]+>", "", html_content)

    payload = {
        "sender": {"name": MAIL_FROM_NAME, "email": MAIL_FROM},
        "to": [{"name": to_name, "email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
        "replyTo": {"email": MAIL_FROM, "name": MAIL_FROM_NAME},
        "headers": {
            "X-Priority": "3",
            "X-Mailer": "AI Shortlisting Platform",
            "List-Unsubscribe": f"<{FRONTEND_URL}/unsubscribe>",
        },
    }

    try:
        req = urllib.request.Request(
            BREVO_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "accept": "application/json",
                "api-key": BREVO_API_KEY,
                "content-type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status in (200, 201, 202):
                print(f"[email]  Sent to {to_email}: {subject!r}")
                return True
            print(f"[email] Unexpected status {resp.status} for {to_email}")
            return False

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        print(f"[email] HTTPError {exc.code} for {to_email}: {body[:300]}")
        return False
    except urllib.error.URLError as exc:
        print(f"[email] URLError for {to_email}: {exc.reason}")
        return False
    except Exception as exc:
        print(f"[email] Unexpected error for {to_email}: {exc!r}")
        return False


# Keep the old name as an alias for any internal callers
def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str = "",
    to_name: str = "",
) -> bool:
    return _send_brevo_email(to_name, to_email, subject, html_content, text_content)


# ---------------------------------------------------------------------------
# Auto-generated password email  (FIX-EMAIL-1: UTC timestamp)
# ---------------------------------------------------------------------------

def send_generated_password_email(
    to_name: str,
    to_email: str,
    plain_password: str,
    role: str = "applicant",
) -> bool:
    """
    Sent immediately after a new account is created.
    Contains the system-generated password and instructions to log in and
    change the password via the forgot-password flow.

    FIX-EMAIL-1: Uses datetime.now(timezone.utc) for the footer timestamp so
    it always shows UTC regardless of the server's local timezone setting.
    """
    role_label = {
        "applicant": "Job Applicant",
        "hr": "HR Recruiter",
        "admin": "System Administrator",
    }.get(role, role.title())

    login_url = f"{FRONTEND_URL}/login"
    reset_url = f"{FRONTEND_URL}/forgot-password"
    subject   = "Your Login Password - AI Shortlisting Platform"

    # FIX-EMAIL-1: timezone-aware UTC timestamp
    now_utc = datetime.now(timezone.utc)

    text_content = f"""
YOUR ACCOUNT PASSWORD

Dear {to_name},

Your account has been created successfully as a {role_label}.

Here are your login credentials:
  Email:    {to_email}
  Password: {plain_password}

Sign in at: {login_url}

IMPORTANT: This password was auto-generated. We strongly recommend changing it
after your first login by visiting: {reset_url}

If you did not create this account, please contact our support team immediately.

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Your Login Password</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="
      background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);
      border-radius:16px 16px 0 0;
      padding:32px 28px;
      text-align:center;
    ">
      <div style="font-size:2.4rem;margin-bottom:10px;">&#128272;</div>
      <h1 style="margin:0;color:#fff;font-size:1.5rem;font-weight:800;">
        Your Account is Ready
      </h1>
      <p style="margin:8px 0 0;color:#bfdbfe;font-size:.9rem;">
        AI-Powered Shortlisting Platform
      </p>
    </div>

    <!-- Body -->
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 28px;">

      <p style="color:#374151;font-size:.95rem;line-height:1.7;">
        Dear <strong>{to_name}</strong>,
      </p>
      <p style="color:#374151;font-size:.95rem;line-height:1.7;">
        Your account has been created successfully as a <strong>{role_label}</strong>.
        Below are your auto-generated login credentials:
      </p>

      <!-- Credentials box -->
      <div style="
        background:#f0f9ff;
        border:2px solid #2563eb;
        border-radius:12px;
        padding:24px 28px;
        margin:24px 0;
      ">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="
              padding:8px 0;
              font-size:.85rem;
              font-weight:700;
              color:#6b7280;
              text-transform:uppercase;
              letter-spacing:.06em;
              width:90px;
            ">Email</td>
            <td style="
              padding:8px 0;
              font-size:.95rem;
              color:#111827;
              font-weight:600;
            ">{to_email}</td>
          </tr>
          <tr>
            <td style="
              padding:8px 0;
              font-size:.85rem;
              font-weight:700;
              color:#6b7280;
              text-transform:uppercase;
              letter-spacing:.06em;
            ">Password</td>
            <td style="padding:8px 0;">
              <span style="
                display:inline-block;
                background:#1e3a5f;
                color:#fff;
                font-family:monospace;
                font-size:1.15rem;
                font-weight:700;
                letter-spacing:.12em;
                padding:8px 18px;
                border-radius:8px;
              ">{plain_password}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Warning banner -->
      <div style="
        background:#fff7ed;
        border-left:4px solid #f59e0b;
        border-radius:8px;
        padding:14px 18px;
        margin-bottom:24px;
      ">
        <strong style="color:#92400e;font-size:.9rem;">
          &#9888;&#65039; Change your password after first login
        </strong>
        <p style="margin:4px 0 0;font-size:.82rem;color:#78350f;line-height:1.5;">
          This password was auto-generated by the system. For your security,
          please update it as soon as you log in.
        </p>
      </div>

      <!-- CTA buttons -->
      <div style="margin-bottom:28px;">
        <a href="{login_url}"
           style="
             display:inline-block;
             background:#2563eb;
             color:#fff;
             text-align:center;
             padding:13px 28px;
             border-radius:8px;
             text-decoration:none;
             font-weight:700;
             font-size:.95rem;
             margin-right:12px;
             margin-bottom:8px;
           ">
          Sign In &rarr;
        </a>
        <a href="{reset_url}"
           style="
             display:inline-block;
             background:#f9fafb;
             color:#374151;
             text-align:center;
             padding:13px 28px;
             border-radius:8px;
             text-decoration:none;
             font-weight:700;
             font-size:.95rem;
             border:1px solid #e5e7eb;
             margin-bottom:8px;
           ">
          Change Password
        </a>
      </div>

      <!-- Account details footer -->
      <div style="
        background:#f9fafb;
        border-radius:8px;
        padding:14px 18px;
        font-size:.82rem;
        color:#6b7280;
        line-height:1.7;
      ">
        <strong>Account Details</strong><br>
        Role: {role_label}<br>
        Registered: {now_utc.strftime('%B %d, %Y at %H:%M UTC')}<br>
        Platform: AI-Powered Shortlisting System
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

      <p style="font-size:.75rem;color:#9ca3af;text-align:center;line-height:1.6;">
        If you did not create this account, please contact support immediately.<br>
        &copy; {now_utc.year} AI-Powered Shortlisting Platform &middot; Automated message
      </p>
    </div>

  </div>
</body>
</html>"""

    return _send_brevo_email(
        to_name, to_email, subject, html_content, text_content
    )


# ---------------------------------------------------------------------------
# Welcome email  (unchanged — kept for other callers e.g. main.py)
# ---------------------------------------------------------------------------

def send_welcome_email(to_name: str, to_email: str, role: str = "applicant") -> bool:
    role_label = {
        "applicant": "Job Applicant",
        "hr": "HR Recruiter",
        "admin": "System Administrator",
    }.get(role, role.title())

    login_url = f"{FRONTEND_URL}/login"
    now_utc   = datetime.now(timezone.utc)   # FIX-EMAIL-1: consistent UTC

    text_content = f"""
WELCOME TO AI SHORTLISTING PLATFORM

Dear {to_name},

Thank you for registering as a {role_label}.

Sign in at: {login_url}

Next steps:
1. Complete your profile
2. Upload your documents (CV, ID, diploma)
3. Browse and apply for jobs
4. Track your application status in real-time

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Welcome</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:16px 16px 0 0;
                padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;">Welcome to AI Shortlisting</h1>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 24px;">
      <p>Dear <strong>{to_name}</strong>,</p>
      <p>Thank you for registering as a <strong>{role_label}</strong>.</p>
      <div style="background:#f0f9ff;border-left:4px solid #2563eb;border-radius:8px;
                  padding:16px;margin:16px 0;">
        <p style="margin:0;">Email: {to_email}<br>Role: {role_label}<br>
           Registered: {now_utc.strftime('%B %d, %Y')}</p>
      </div>
      <a href="{login_url}"
         style="display:block;background:#2563eb;color:#fff;text-align:center;
                padding:14px;border-radius:8px;text-decoration:none;font-weight:700;
                margin:20px 0;">
        Sign In to Your Account &rarr;
      </a>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#718096;text-align:center;">
        &copy; {now_utc.year} AI-Powered Shortlisting Platform
      </p>
    </div>
  </div>
</body>
</html>"""

    return _send_brevo_email(
        to_name, to_email,
        f"Welcome to AI Shortlisting Platform, {to_name}!",
        html_content, text_content,
    )


def send_support_request_email(
    from_name: str,
    from_email: str,
    subject: str,
    message: str,
) -> bool:
    """Send a support request notification email to the platform support address."""
    title = subject.strip() or "New support request"
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset=\"UTF-8\"></head>
<body style=\"margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;\">
  <div style=\"max-width:600px;margin:0 auto;padding:20px;\">
    <div style=\"background:#1e3a5f;color:#fff;border-radius:16px 16px 0 0;padding:28px;\">
      <h1 style=\"margin:0;font-size:1.5rem;\">Support request received</h1>
    </div>
    <div style=\"background:#fff;border-radius:0 0 16px 16px;padding:28px;\">
      <p style=\"color:#334155;font-size:.95rem;line-height:1.7;\">
        A new support request has been submitted by <strong>{from_name}</strong> (<a href=\"mailto:{from_email}\" style=\"color:#2563eb;\">{from_email}</a>).
      </p>
      <p style=\"margin:18px 0 0;color:#334155;font-size:.95rem;line-height:1.7;\"><strong>Subject:</strong> {title}</p>
      <div style=\"margin-top:20px;padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;\">
        <p style=\"margin:0;color:#111827;font-size:.95rem;line-height:1.8;white-space:pre-wrap;\">{message}</p>
      </div>
      <p style=\"margin:24px 0 0;color:#6b7280;font-size:.82rem;line-height:1.7;\">Reply to {from_name} at {from_email} to continue the conversation.</p>
    </div>
  </div>
</body>
</html>"""
    text_content = f"Support request from {from_name} <{from_email}>\n\nSubject: {title}\n\n{message}\n\nReply to: {from_email}"
    return _send_brevo_email(
        SUPPORT_EMAIL_NAME,
        SUPPORT_EMAIL,
        f"Support request: {title}",
        html_content,
        text_content,
    )


# ---------------------------------------------------------------------------
# Password reset email  (unchanged)
# ---------------------------------------------------------------------------

def send_reset_email(to_name: str, to_email: str, reset_link: str) -> bool:
    now_utc = datetime.now(timezone.utc)

    text_content = f"""
PASSWORD RESET REQUEST

Dear {to_name},

Click the link below to reset your password (expires in 15 minutes):
{reset_link}

If you did not request this, please ignore this email.

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#dc2626;border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;">Reset Your Password</h1>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 24px;">
      <p>Dear <strong>{to_name}</strong>,</p>
      <p>We received a request to reset your password.</p>
      <a href="{reset_link}"
         style="display:block;background:#dc2626;color:#fff;text-align:center;
                padding:14px;border-radius:8px;text-decoration:none;font-weight:700;
                margin:24px 0;">
        Reset Password &rarr;
      </a>
      <p style="font-size:12px;color:#718096;">This link expires in 15 minutes.</p>
      <p style="font-size:12px;color:#718096;">
        If you did not request this, please ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#718096;text-align:center;">
        &copy; {now_utc.year} AI-Powered Shortlisting Platform
      </p>
    </div>
  </div>
</body>
</html>"""

    return _send_brevo_email(
        to_name, to_email,
        "Reset Your Password - AI Shortlisting Platform",
        html_content, text_content,
    )


# ---------------------------------------------------------------------------
# HR invite email  (unchanged)
# ---------------------------------------------------------------------------

def send_hr_invite_email(to_name: str, to_email: str, invite_code: str) -> bool:
    register_url = f"{FRONTEND_URL}/register"
    now_utc      = datetime.now(timezone.utc)

    text_content = f"""
HR INVITE CODE

Dear {to_name},

Your HR invite code is: {invite_code}

How to register:
1. Go to {register_url}
2. Select role: HR / Recruiter
3. Enter the invite code: {invite_code}
4. Complete your registration

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>HR Invite Code</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:16px 16px 0 0;
                padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;">HR Invite Code</h1>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 24px;">
      <p>Dear <strong>{to_name}</strong>,</p>
      <p>Your HR invite code is:</p>
      <div style="background:#f0f0f0;padding:20px;text-align:center;font-size:32px;
                  font-weight:bold;font-family:monospace;border-radius:8px;margin:20px 0;
                  letter-spacing:4px;">
        {invite_code}
      </div>
      <p><strong>How to register:</strong></p>
      <ol>
        <li>Go to <a href="{register_url}">{register_url}</a></li>
        <li>Select role: <strong>HR / Recruiter</strong></li>
        <li>Enter the invite code above</li>
        <li>Complete your registration</li>
      </ol>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#718096;text-align:center;">
        &copy; {now_utc.year} AI-Powered Shortlisting Platform
      </p>
    </div>
  </div>
</body>
</html>"""

    return _send_brevo_email(
        to_name, to_email,
        "Your HR Invite Code - AI Shortlisting Platform",
        html_content, text_content,
    )


# ---------------------------------------------------------------------------
# Shortlisting result email  (unchanged)
# ---------------------------------------------------------------------------

def send_shortlisting_result_email(
    to_name: str,
    to_email: str,
    job_title: str,
    decision: str,
    ai_score: float = None,
    reason_summary: str = "",
) -> bool:
    is_shortlisted = decision == "shortlisted"
    score_pct = round(ai_score * 100, 1) if ai_score is not None else None
    now_utc   = datetime.now(timezone.utc)

    if is_shortlisted:
        subject      = f"Congratulations! You've been shortlisted for {job_title}"
        status_text  = "Congratulations! You have been shortlisted!"
        status_emoji = "&#127881;"
        status_color = "#16a34a"
    elif decision == "manual_review":
        subject      = f"Application Update: {job_title} — Under Review"
        status_text  = "Your application is under HR review"
        status_emoji = "&#128203;"
        status_color = "#d97706"
    else:
        subject      = f"Application Update: {job_title}"
        status_text  = "Thank you for your application"
        status_emoji = ""
        status_color = "#dc2626"

    score_html = (
        f'<div style="background:#f9fafb;padding:12px;text-align:center;border-radius:8px;margin:16px 0;">'
        f'<strong>AI Match Score:</strong> {score_pct}%</div>'
        if score_pct is not None else ""
    )

    summary_html = (
        f'<p style="color:#374151;font-size:14px;">{reason_summary}</p>'
        if reason_summary else ""
    )

    text_content = f"""
APPLICATION RESULT

Dear {to_name},

Job: {job_title}
Result: {status_text}
{f'AI Match Score: {score_pct}%' if score_pct is not None else ''}

{reason_summary or 'Evaluation completed by the AI shortlisting system.'}

View your application: {FRONTEND_URL}/dashboard

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Application Result</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px 16px 0 0;
                padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;">Application Result</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.9);">{job_title}</p>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 24px;">
      <p>Dear <strong>{to_name}</strong>,</p>
      <div style="background:{status_color};color:#fff;padding:16px;border-radius:8px;
                  text-align:center;margin:20px 0;font-size:16px;">
        <strong>{status_emoji} {status_text}</strong>
      </div>
      {score_html}
      {summary_html}
      <a href="{FRONTEND_URL}/dashboard"
         style="display:inline-block;background:#667eea;color:#fff;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">
        View Dashboard
      </a>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;">
        &copy; {now_utc.year} AI-Powered Shortlisting Platform &middot; Automated message
      </p>
    </div>
  </div>
</body>
</html>"""

    return _send_brevo_email(to_name, to_email, subject, html_content, text_content)


# ---------------------------------------------------------------------------
# Application submission confirmation email  (unchanged)
# ---------------------------------------------------------------------------

def send_application_submission_email(
    to_name: str,
    to_email: str,
    job_title: str,
) -> bool:
    subject = f"Application Submitted Successfully - {job_title}"
    now_utc = datetime.now(timezone.utc)

    text_content = f"""
APPLICATION SUBMITTED

Dear {to_name},

Your application for "{job_title}" has been submitted successfully.

Your documents are being verified and your application will be reviewed by the AI
shortlisting system. You will receive another email with the result once the
evaluation is complete.

View your application: {FRONTEND_URL}/dashboard

Best regards,
AI Recruitment Team
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Application Submitted</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#059669,#10b981);border-radius:16px 16px 0 0;
                padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;">Application Submitted &#10003;</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,.9);">{job_title}</p>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px 24px;">
      <p>Dear <strong>{to_name}</strong>,</p>
      <p>Your application has been submitted successfully.</p>
      <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:8px;
                  padding:16px;margin:20px 0;">
        <strong>Status:</strong> Under AI Review<br>
        <small style="color:#6b7280;">
          Documents are being verified. You will receive a result email soon.
        </small>
      </div>
      <a href="{FRONTEND_URL}/dashboard"
         style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:700;">
        View My Application
      </a>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;">
        &copy; {now_utc.year} AI-Powered Shortlisting Platform
      </p>
    </div>
  </div>
</body>
</html>"""

    return _send_brevo_email(to_name, to_email, subject, html_content, text_content)


# ---------------------------------------------------------------------------
# Test email  (unchanged)
# ---------------------------------------------------------------------------

def send_test_email(to_email: str, to_name: str = "Test User") -> bool:
    """Send a test welcome email to verify Brevo connectivity."""
    return send_welcome_email(to_name, to_email, "applicant")