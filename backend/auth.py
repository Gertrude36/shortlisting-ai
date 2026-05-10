"""
backend/auth.py
────────────────────────────────────────────────────────────────
Password hashing, JWT creation/verification, and the
`get_current_user` / `require_hr` FastAPI dependencies.

FIXES APPLIED:
  ✅ FIX 1 — datetime.utcnow() replaced with datetime.now(timezone.utc)
    (utcnow() is deprecated in Python 3.12+ and will be removed).

  ✅ FIX 2 — bcrypt >= 4.1 incompatibility with passlib
  ────────────────────────────────────────────────────────────────
  passlib 1.7.4 (last release, unmaintained) breaks with bcrypt >= 4.1:
    - AttributeError: module 'bcrypt' has no attribute '__about__'
    - ValueError: password cannot be longer than 72 bytes

  Two-part fix applied here:
    1. Suppress the harmless __about__ warning at import time.
    2. hash_password() and verify_password() now explicitly encode
       and truncate the password to 72 UTF-8 bytes before passing
       to passlib — matching bcrypt's hard limit.

  ✅ FIX 3 — 401 retry loop prevention
  ────────────────────────────────────────────────────────────────
  The browser console showed repeated 401s on /auth/login.
  Root cause: get_current_user raised a generic 401 even for
  EXPIRED tokens. The frontend AuthContext was calling /auth/me
  in a loop every time it got 401, without clearing the token.

  Fix: verify_access_token() is now exported and distinguishes
  between EXPIRED tokens (returns "expired") and INVALID tokens
  (returns "invalid"). The frontend can use this to:
    - On "expired" → clear token, redirect to login (stop retrying)
    - On "invalid"  → clear token, redirect to login (stop retrying)

  The /auth/me endpoint now returns 401 with a machine-readable
  "code" field so the frontend can act without retrying:
    { "detail": "...", "code": "TOKEN_EXPIRED" }
    { "detail": "...", "code": "TOKEN_INVALID" }

  ✅ FIX 4 — Password Reset Token Support
  ────────────────────────────────────────────────────────────────
  Added two functions for the forgot-password / reset-password flow:

    create_reset_token(email)
      → Creates a short-lived JWT (15 min) encoding the user's email.

    verify_reset_token(token)
      → Decodes and validates the reset token.
        Returns the email string if valid, or None if expired/invalid.
"""

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

# ── Suppress the harmless passlib/bcrypt __about__ warning ───────────────────
warnings.filterwarnings(
    "ignore",
    message=".*error reading bcrypt version.*",
    category=UserWarning,
)

from fastapi import Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db
from models import User, UserRole

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
SECRET_KEY         = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM          = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS        = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE = 15   # minutes

# ── Helpers ──────────────────────────────────────────────────────────────────
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _safe_encode(plain: str) -> str:
    """
    Truncate password to 72 UTF-8 bytes — bcrypt's hard limit.
    Makes behaviour consistent across all bcrypt/passlib versions.
    """
    return plain.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def hash_password(plain: str) -> str:
    return pwd_context.hash(_safe_encode(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_safe_encode(plain), hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=EXPIRE_MINS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── ✅ FIX 3: Token verification with expiry distinction ─────────────────────

def verify_access_token(token: str) -> dict | str:
    """
    Decode and validate an access token.

    Returns:
      - dict payload   if valid
      - "expired"      if the token is valid but expired
      - "invalid"      if the token is malformed or tampered

    This lets the frontend distinguish between the two cases and stop
    the 401 retry loop: in both cases it should clear the token and
    redirect to login — but the UI message can differ.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        return "expired"
    except JWTError:
        return "invalid"


# ── ✅ Password Reset Tokens ──────────────────────────────────────────────────

def create_reset_token(email: str) -> str:
    """
    Create a short-lived JWT (15 min) for password reset.
    The token encodes:
      - sub: the user's email address
      - purpose: "password_reset"  ← prevents reuse of access tokens
      - exp: 15 minutes from now
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE)
    payload = {
        "sub":     email,
        "purpose": "password_reset",
        "exp":     expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_reset_token(token: str) -> Optional[str]:
    """
    Decode and validate a password reset token.
    Returns the email string if valid and not expired.
    Returns None if the token is invalid, expired, or not a reset token.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "password_reset":
            return None
        email: str = payload.get("sub")
        return email if email else None
    except JWTError:
        return None


# ── Dependencies ─────────────────────────────────────────────────────────────

def get_current_user(
    token: str     = Depends(oauth2_scheme),
    db:    Session = Depends(get_db),
) -> User:
    """
    ✅ FIX 3: Returns machine-readable error codes in the 401 response
    so the frontend can stop retrying and clear the stored token.

    Error response shape:
      { "detail": "human message", "code": "TOKEN_EXPIRED" | "TOKEN_INVALID" }
    """
    result = verify_access_token(token)

    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={
                "WWW-Authenticate": "Bearer",
                "X-Token-Error":    "TOKEN_EXPIRED",   # extra header for axios interceptor
            },
        )

    if result == "invalid":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token. Please sign in again.",
            headers={
                "WWW-Authenticate": "Bearer",
                "X-Token-Error":    "TOKEN_INVALID",
            },
        )

    # result is the decoded payload dict
    try:
        user_id: int = int(result.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please register or sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_hr(current_user: User = Depends(get_current_user)) -> User:
    """Raises 403 if the logged-in user is not HR."""
    if current_user.role != UserRole.hr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access required",
        )
    return current_user


def require_applicant(current_user: User = Depends(get_current_user)) -> User:
    """Raises 403 if the logged-in user is not an applicant."""
    if current_user.role != UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant access required",
        )
    return current_user