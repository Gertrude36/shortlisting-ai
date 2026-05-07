"""
backend/auth.py
────────────────────────────────────────────────────────────────
Password hashing, JWT creation/verification, and the
`get_current_user` / `require_hr` FastAPI dependencies.

FIXES APPLIED:
  - datetime.utcnow() replaced with datetime.now(timezone.utc)
    (utcnow() is deprecated in Python 3.12+ and will be removed).

  ✅ FIX — bcrypt >= 4.1 incompatibility with passlib
  ────────────────────────────────────────────────────────────────
  passlib 1.7.4 (last release, unmaintained) breaks with bcrypt >= 4.1:
    - AttributeError: module 'bcrypt' has no attribute '__about__'
    - ValueError: password cannot be longer than 72 bytes

  Two-part fix applied here:
    1. Suppress the harmless __about__ warning at import time.
    2. hash_password() and verify_password() now explicitly encode
       and truncate the password to 72 UTF-8 bytes before passing
       to passlib — matching bcrypt's hard limit.

  The pinned bcrypt==4.0.1 in requirements.txt is the primary fix;
  the truncation guard here is a belt-and-suspenders safety measure
  that makes the code correct on ANY bcrypt version.

  ✅ NEW — Password Reset Token Support
  ────────────────────────────────────────────────────────────────
  Added two functions for the forgot-password / reset-password flow:

    create_reset_token(email)
      → Creates a short-lived JWT (15 min) encoding the user's email.
        This token is embedded in the reset link sent to the user.

    verify_reset_token(token)
      → Decodes and validates the reset token.
        Returns the email string if valid, or None if expired/invalid.

  These are pure utility functions — no DB access needed here.
  The endpoints in main.py handle DB lookups and password updates.
"""

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

# ── Suppress the harmless passlib/bcrypt __about__ warning ───────────────────
# passlib tries to read bcrypt.__about__.__version__ which no longer exists in
# bcrypt >= 4.x.  The warning is printed to stderr and is harmless, but noisy.
warnings.filterwarnings(
    "ignore",
    message=".*error reading bcrypt version.*",
    category=UserWarning,
)

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db
from models import User, UserRole

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
SECRET_KEY          = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM           = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS         = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE  = 15  # minutes — reset links expire after 15 min

# ── Helpers ──────────────────────────────────────────────────────────────────
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _safe_encode(plain: str) -> str:
    """
    Truncate password to 72 UTF-8 bytes — bcrypt's hard limit.

    Why: bcrypt (all versions) silently ignores bytes beyond position 72.
    passlib >= 4.1 raises ValueError instead of truncating silently,
    which causes a 500 on registration/login for long passwords.

    Truncating here makes behaviour consistent across all bcrypt/passlib
    versions and is the approach recommended in the bcrypt docs.
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
        # Guard: only accept tokens explicitly created for password reset
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
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise credentials_exception
    except (JWTError, TypeError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
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