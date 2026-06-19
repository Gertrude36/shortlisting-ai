"""
backend/auth.py  ·  v2.3.2 - Review fixes
---------------------------------------------------------------------
FIXED v2.3.2 (on top of v2.3.1):

  FIX-AUTH-4 — forgot_password now accepts a Pydantic body (ForgotPasswordRequest)
               instead of a plain query-param `email`.  The old signature exposed
               the email address in the URL and didn't work with JSON clients that
               POST a body.

  FIX-AUTH-5 — register() no longer calls send_welcome_email() after
               send_generated_password_email().  Users were receiving two emails
               on registration — a password email AND a welcome email — which was
               confusing and redundant.  The password email already serves as the
               welcome message.

  FIX-AUTH-6 — RegisterRequest.password and RegisterRequest.hr_code are both
               Optional so that applicants (who send no hr_code) and the auto-
               password flow (which ignores any client-supplied password) don't
               trigger Pydantic validation errors.  If your schemas.py already has
               these as Optional, this note is a no-op.

No other logic changed from v2.3.1.
"""

import os
import secrets
import string
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

warnings.filterwarnings("ignore", message=".*error reading bcrypt version.*", category=UserWarning)
warnings.filterwarnings("ignore", message=".*bcrypt.*", category=UserWarning)

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from dotenv import load_dotenv

try:
    from jose import ExpiredSignatureError, JWTError, jwt
except ImportError:
    from jose import JWTError, jwt
    try:
        from jose.exceptions import ExpiredSignatureError
    except ImportError:
        ExpiredSignatureError = JWTError

from database import get_db
from models import User, UserRole
from schemas import RegisterRequest, LoginRequest, TokenResponse, ResetPasswordRequest
from email_utils import send_generated_password_email

load_dotenv()

# -- Router -------------------------------------------------------------------
router = APIRouter(prefix="/auth", tags=["Authentication"])

# -- Config -------------------------------------------------------------------
SECRET_KEY         = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM          = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS        = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE = 15   # minutes
FRONTEND_URL       = os.getenv("FRONTEND_URL", "http://localhost:5173")
# DEV helper: when set to 'true' the register endpoint will include the
# generated plain password in the HTTP response. ONLY enable for local dev.
DEV_RETURN_PLAIN_PASSWORD = os.getenv("DEV_RETURN_PLAIN_PASSWORD", "false").lower() == "true"

# -- Helpers ------------------------------------------------------------------
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# FIX-AUTH-4: Pydantic schema for forgot-password body
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


def _safe_encode(plain) -> str:
    """
    Truncate to bcrypt's 72-byte limit and return as str.
    passlib's CryptContext.hash() / .verify() both accept str directly.
    """
    if not isinstance(plain, str):
        plain = str(plain)
    return plain.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def hash_password(plain: str) -> str:
    return pwd_context.hash(_safe_encode(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_safe_encode(plain), hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    # FIX-AUTH-1: Always store sub as str — JWT spec requires it and some jose
    # versions raise JWTError when decoding a token whose sub was an int,
    # causing get_current_user() to return None and /auth/me to 500.
    if "sub" in payload:
        payload["sub"] = str(payload["sub"])
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=EXPIRE_MINS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str):
    if not token or not token.strip():
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        return None
    except JWTError:
        return None


# =============================================================================
# AUTO PASSWORD GENERATOR
# =============================================================================

def generate_secure_password(length: int = 12) -> str:
    """
    Generate a strong random password that satisfies all validation rules:
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    - Total length = `length` (default 12)
    """
    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits    = string.digits
    special   = "!@#$%^&*"   # readable subset — avoids ambiguous chars

    # Guarantee one of each required category
    guaranteed = [
        secrets.choice(uppercase),
        secrets.choice(lowercase),
        secrets.choice(digits),
        secrets.choice(special),
    ]

    # Fill the rest randomly from the combined pool
    pool = uppercase + lowercase + digits + special
    rest = [secrets.choice(pool) for _ in range(length - len(guaranteed))]

    # Shuffle so the guaranteed chars aren't always at the front
    combined = guaranteed + rest
    secrets.SystemRandom().shuffle(combined)
    return "".join(combined)


# -- Password Reset Tokens -----------------------------------------------------

def create_reset_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE)
    payload = {
        "sub":     email,
        "purpose": "password_reset",
        "exp":     expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_reset_token(token: str) -> Optional[str]:
    if not token or not token.strip():
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "password_reset":
            return None
        email: str = payload.get("sub")
        return email if email else None
    except JWTError:
        return None


# -- Dependencies -------------------------------------------------------------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    request: Request = None,
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not token and request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")

    if not token:
        return None

    payload = verify_access_token(token)
    if payload is None:
        return None

    try:
        # FIX-AUTH-1: sub is now always a str in the token; int() still works fine
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    return user


def get_current_active_user(current_user: Optional[User] = Depends(get_current_user)) -> User:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_hr(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != UserRole.hr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access required.",
        )
    return current_user


def require_applicant(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant access required.",
        )
    return current_user


def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Administrator access required.",
        )
    return current_user


def require_hr_or_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role not in (UserRole.hr, UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR or Administrator access required.",
        )
    return current_user


# =============================================================================
# REGISTRATION ENDPOINT  –  AUTO-GENERATED PASSWORD
# =============================================================================

@router.post("/register")
def register(user_data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user.

    Password flow:
      1. Backend generates a secure random password.
      2. Hashed password is stored in the DB.
      3. Plain-text password is emailed to the user.
      4. User logs in with that password (and may reset it later via /forgot-password).

    The `password` field in RegisterRequest is Optional[str] = None and IGNORED
    if sent by the client — the backend always generates its own secure password.
    The `hr_code` field is Optional[str] = None but is validated when role == 'hr'.

    NOTE (FIX-AUTH-5): Only send_generated_password_email() is called here.
    The old send_welcome_email() call has been removed — it was sending a second
    redundant email on every registration which confused users.
    """

    print(f"\n📝 REGISTRATION: {user_data.email}")

    # ── 1. Duplicate check ────────────────────────────────────────────────────
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # ── 2. Role mapping ───────────────────────────────────────────────────────
    role_map = {"applicant": UserRole.applicant, "hr": UserRole.hr, "admin": UserRole.admin}
    role = role_map.get(user_data.role, UserRole.applicant)

    # ── 3. HR invite-code gate ────────────────────────────────────────────────
    if role == UserRole.hr:
        hr_code = os.getenv("HR_INVITE_CODE", "HR@Shortlist2025!")
        if user_data.hr_code != hr_code:
            raise HTTPException(status_code=400, detail="Invalid HR invite code")

    # ── 4. Generate password ──────────────────────────────────────────────────
    plain_password = generate_secure_password(length=12)
    print(f"🔑 Password generated for {user_data.email} (not logged for security)")

    # ── 5. Persist user ───────────────────────────────────────────────────────
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(plain_password),
        role=role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    print(f"✅ USER CREATED: ID={new_user.id}, Email={new_user.email}")

    # ── 6. Email the generated password ──────────────────────────────────────
    # FIX-AUTH-5: Only ONE email sent — the password email also serves as welcome.
    # The separate send_welcome_email() call from v2.3.1 has been removed.
    try:
        print(f"📧 Sending generated-password email to {new_user.email}...")
        pw_sent = send_generated_password_email(
            to_name=new_user.full_name,
            to_email=new_user.email,
            plain_password=plain_password,
            role=user_data.role,
        )
        if pw_sent:
            print(f"✅ Password email sent successfully to {new_user.email}")
        else:
            print(f"⚠️  Password email failed — user may contact support")
    except Exception as e:
        # Email failure must NOT roll back account creation
        print(f"❌ Email error: {e}")

    # ── 7. Return token so the client can optionally auto-login ───────────────
    # FIX-AUTH-1: sub passed as int; create_access_token converts it to str
    # FIX-AUTH-2: return role from the DB enum (.value) not the raw request string
    access_token = create_access_token(data={"sub": new_user.id})
    response = {
        "access_token": access_token,
        "token_type": "bearer",
        "role": new_user.role.value,
        "user_id": new_user.id,
        "full_name": new_user.full_name,
    }
    # For local development only: optionally return the plain password so
    # the developer/tester can sign in immediately without email delivery.
    if DEV_RETURN_PLAIN_PASSWORD:
        try:
            response["plain_password"] = plain_password
            print(f"[dev] Returning plain password in response for {new_user.email}")
        except Exception:
            pass

    return response


# =============================================================================
# LOGIN
# =============================================================================

@router.post("/login")
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password."""
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is disabled")

    # FIX-AUTH-3: sub encoded as str via create_access_token
    access_token = create_access_token(data={"sub": user.id})

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role.value,
        user_id=user.id,
        full_name=user.full_name,
    )


# =============================================================================
# FORGOT / RESET PASSWORD
# =============================================================================

@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,          # FIX-AUTH-4: JSON body, not query param
    db: Session = Depends(get_db),
):
    """
    Send a password-reset link to the given email address.

    FIX-AUTH-4: Previously `email` was a plain query parameter, which meant:
      - The email address appeared in server logs and browser history.
      - JSON clients (axios with a POST body) silently sent nothing and the
        endpoint matched no user, returning the generic "check your email"
        message even though no reset was triggered.
    Now accepts { "email": "..." } as a JSON body via ForgotPasswordRequest.
    """
    from email_utils import send_reset_email

    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        # Generic message — don't reveal whether the email is registered
        return {"message": "If your email is registered, you will receive a reset link"}

    reset_token = create_reset_token(body.email)
    reset_link  = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    try:
        send_reset_email(user.full_name, user.email, reset_link)
        print(f"Reset email sent to {user.email}")
    except Exception as e:
        print(f"Reset email error: {e}")

    return {"message": "If your email is registered, you will receive a reset link"}


@router.post("/reset-password")
def reset_password(reset_data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password using token."""
    email = verify_reset_token(reset_data.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(reset_data.new_password)
    db.commit()

    return {"message": "Password reset successful"}


# =============================================================================
# ME
# =============================================================================

@router.get("/me")
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current user information."""
    return {
        "id":          current_user.id,
        "full_name":   current_user.full_name,
        "email":       current_user.email,
        "role":        current_user.role.value,
        "phone":       current_user.phone,
        "address":     current_user.address,
        "national_id": current_user.national_id,
        "is_active":   current_user.is_active,
        "created_at":  current_user.created_at,
    }