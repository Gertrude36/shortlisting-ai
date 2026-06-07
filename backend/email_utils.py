"""
backend/email_utils.py - COMPLETE FIXED VERSION
Contains ALL email functions needed by auth.py
"""

from dotenv import load_dotenv
load_dotenv()

import os
import json
import urllib.request
import urllib.error
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# -- Config --------------------------------------------------------------------
BREVO_API_KEY  = os.getenv("BREVO_API_KEY", "")
MAIL_FROM      = os.getenv("MAIL_FROM", "aishortlisting@gmail.com")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "AI-Powered Shortlisting Platform")
FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:5173")
BREVO_API_URL  = "https://api.brevo.com/v3/smtp/email"


# -- Send email function -------------------------------------------------------
def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str = None,
    to_name: str = None,
) -> bool:
    """Send email using Brevo API."""
    
    if not BREVO_API_KEY:
        print("[email] ERROR: BREVO_API_KEY is not set!")
        return False
    
    if not to_name:
        to_name = to_email.split("@")[0]
    
    if not text_content:
        import re
        text_content = re.sub(r'<[^>]+>', '', html_content)
    
    payload = {
        "sender": {
            "name": MAIL_FROM_NAME,
            "email": MAIL_FROM
        },
        "to": [{"name": to_name, "email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
        "replyTo": {
            "email": MAIL_FROM,
            "name": MAIL_FROM_NAME
        },
        "headers": {
            "X-Priority": "3",
            "X-Mailer": "AI Shortlisting Platform",
            "List-Unsubscribe": f"<{FRONTEND_URL}/unsubscribe>",
        }
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
        
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status in (200, 201, 202):
                print(f"[email] Email sent successfully to {to_email}")
                return True
            else:
                print(f"[email] Failed with status {response.status}")
                return False
                
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        print(f"[email] HTTPError {e.code}: {error_body[:200]}")
        return False
    except Exception as e:
        print(f"[email] Error: {e}")
        return False


# -- Welcome Email -------------------------------------------------------------
def send_welcome_email(to_name: str, to_email: str, role: str = "applicant") -> bool:
    """Send welcome email after registration."""
    
    role_label = {
        "applicant": "Job Applicant",
        "hr": "HR Recruiter", 
        "admin": "System Administrator"
    }.get(role, role.title())
    
    dashboard_url = f"{FRONTEND_URL}/dashboard"
    login_url = f"{FRONTEND_URL}/login"
    
    text_content = f"""
WELCOME TO AI SHORTLISTING PLATFORM

Dear {to_name},

Thank you for registering with our AI-powered recruitment platform.

YOUR ACCOUNT DETAILS:
- Email: {to_email}
- Role: {role_label}
- Registration Date: {datetime.now().strftime('%B %d, %Y')}

GET STARTED:
{login_url}

WHAT'S NEXT?
1. Sign in to your account using your email and password
2. Complete your profile with education and work experience
3. Upload your documents (CV, ID, certificates)
4. Apply for jobs that match your skills
5. Track your application status in real-time

Best regards,
AI Recruitment Team
"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Welcome to AI Shortlisting Platform</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;">Welcome to AI Shortlisting</h1>
        </div>
        <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px;">
            <p style="margin:0 0 16px;">Dear <strong>{to_name}</strong>,</p>
            <p style="margin:0 0 24px;">Thank you for registering with our AI-powered recruitment platform.</p>
            
            <div style="background:#f0f9ff;border-left:4px solid #2563eb;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0 0 8px;"><strong>Your Account Details:</strong></p>
                <p style="margin:0;">📧 Email: {to_email}<br>👤 Role: {role_label}</p>
            </div>
            
            <a href="{login_url}" style="display:block;background:#2563eb;color:#ffffff;text-align:center;padding:14px;border-radius:8px;text-decoration:none;margin-bottom:24px;">Sign In to Your Account →</a>
            
            <hr style="border:none;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#718096;text-align:center;">© 2025 AI-Powered Shortlisting Platform</p>
        </div>
    </div>
</body>
</html>"""
    
    return send_email(
        to_email=to_email,
        subject=f"Welcome to AI Shortlisting Platform, {to_name}!",
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
    )


# -- Password Reset Email ------------------------------------------------------
def send_reset_email(to_name: str, to_email: str, reset_link: str) -> bool:
    """Send password reset email."""
    
    text_content = f"""
PASSWORD RESET REQUEST

Dear {to_name},

We received a request to reset your password.

Click this link to reset your password (expires in 15 minutes):
{reset_link}

If you didn't request this, please ignore this email.

Best regards,
AI Recruitment Team
"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#e74c3c;border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;">Reset Your Password</h1>
        </div>
        <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px;">
            <p>Dear <strong>{to_name}</strong>,</p>
            <p>We received a request to reset your password.</p>
            
            <a href="{reset_link}" style="display:block;background:#e74c3c;color:#ffffff;text-align:center;padding:14px;border-radius:8px;text-decoration:none;margin:24px 0;">Reset Password</a>
            
            <p style="font-size:12px;color:#718096;">This link expires in 15 minutes.</p>
            <p style="font-size:12px;color:#718096;">If you didn't request this, please ignore this email.</p>
        </div>
    </div>
</body>
</html>"""
    
    return send_email(
        to_email=to_email,
        subject="Reset Your Password - AI Shortlisting Platform",
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
    )


# -- HR Invite Email -----------------------------------------------------------
def send_hr_invite_email(to_name: str, to_email: str, invite_code: str) -> bool:
    """Send HR invite code email."""
    
    register_url = f"{FRONTEND_URL}/register"
    
    text_content = f"""
HR INVITE CODE

Dear {to_name},

Your HR invite code is: {invite_code}

How to register:
1. Go to {register_url}
2. Select role: HR / Recruiter
3. Enter the invite code above
4. Complete your registration

Best regards,
AI Recruitment Team
"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Your HR Invite Code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;">HR Invite Code</h1>
        </div>
        <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px;">
            <p>Dear <strong>{to_name}</strong>,</p>
            <p>Your HR invite code is:</p>
            <div style="background:#f0f0f0;padding:20px;text-align:center;font-size:32px;font-weight:bold;font-family:monospace;border-radius:8px;margin:20px 0;">{invite_code}</div>
            <p><strong>How to register:</strong></p>
            <ol>
                <li>Go to <a href="{register_url}">{register_url}</a></li>
                <li>Select role: <strong>HR / Recruiter</strong></li>
                <li>Enter the invite code above</li>
                <li>Complete your registration</li>
            </ol>
        </div>
    </div>
</body>
</html>"""
    
    return send_email(
        to_email=to_email,
        subject="Your HR Invite Code - AI Shortlisting Platform",
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
    )


# -- Shortlisting Result Email -------------------------------------------------
def send_shortlisting_result_email(
    to_name: str,
    to_email: str,
    job_title: str,
    decision: str,
    ai_score: float = None,
    reason_summary: str = "",
) -> bool:
    """Send shortlisting result to applicant."""
    
    is_shortlisted = decision == "shortlisted"
    score_pct = round(ai_score * 100, 1) if ai_score else None
    
    if is_shortlisted:
        subject = f"Congratulations! You've been shortlisted for {job_title}"
        status_text = "Congratulations! You have been shortlisted!"
    else:
        subject = f"Application Update: {job_title}"
        status_text = "Thank you for your application"
    
    text_content = f"""
APPLICATION RESULT

Dear {to_name},

Job: {job_title}
Result: {status_text}
{f'AI Match Score: {score_pct}%' if score_pct else ''}

{reason_summary or 'Evaluation completed by AI shortlisting system.'}

View your application: {FRONTEND_URL}/dashboard

Best regards,
AI Recruitment Team
"""
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Application Result</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;">Application Result</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);">{job_title}</p>
        </div>
        <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px 24px;">
            <p>Dear <strong>{to_name}</strong>,</p>
            <div style="background:{'#16a34a' if is_shortlisted else '#dc2626'};color:white;padding:15px;border-radius:8px;text-align:center;margin:20px 0;">
                <strong>{status_text}</strong>
            </div>
            {f'<div style="background:#f9fafb;padding:15px;text-align:center;border-radius:8px;margin:20px 0;"><strong>AI Match Score:</strong> {score_pct}%</div>' if score_pct else ''}
            <p><a href="{FRONTEND_URL}/dashboard" style="display:inline-block;background:#667eea;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">View Dashboard</a></p>
        </div>
    </div>
</body>
</html>"""
    
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        to_name=to_name,
    )


# -- Test email function -------------------------------------------------------
def send_test_email(to_email: str, to_name: str = "Test User") -> bool:
    """Send a test email."""
    return send_welcome_email(to_name, to_email, "applicant")