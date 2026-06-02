"""
backend/auth.py  ·  v2.1.0
────────────────────────────────────────────────────────────────
ALL v2.0.0 FIXES RETAINED.

NEW IN v2.1.0:

  ✅ FIX-AUTH-8 — Added `require_admin` dependency.
     System Administrator role now has its own guard.
     Admin is the only role that can:
       - Manage all users (add/delete HR, applicants)
       - View and clear system logs
       - Send HR invite codes

  ✅ FIX-AUTH-9 — Added `require_hr_or_admin` dependency.
     Allows both HR and Admin to access shared routes like
     candidate management, job management, shortlisting, and reports.
     This means existing HR routes continue to work for HR users,
     and Admin can also access them if needed.
"""

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

warnings.filterwarnings("ignore", message=".*error reading bcrypt version.*", category=UserWarning)
warnings.filterwarnings("ignore", message=".*bcrypt.*", category=UserWarning)

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
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

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
SECRET_KEY         = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM          = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS        = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE = 15   # minutes

# ── Helpers ──────────────────────────────────────────────────────────────────
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _safe_encode(plain) -> str:
    if not isinstance(plain, str):
        plain = str(plain)
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


def verify_access_token(token: str) -> "dict | str":
    if not token or not token.strip():
        return "invalid"
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        return "expired"
    except JWTError:
        return "invalid"


# ── Password Reset Tokens ─────────────────────────────────────────────────────

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


# ── Dependencies ─────────────────────────────────────────────────────────────

def get_current_user(
    token: str     = Depends(oauth2_scheme),
    db:    Session = Depends(get_db),
) -> User:
    result = verify_access_token(token)

    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer", "X-Token-Error": "TOKEN_EXPIRED"},
        )

    if result == "invalid":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer", "X-Token-Error": "TOKEN_INVALID"},
        )

    try:
        user_id: int = int(result.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token payload.",
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
    """Allows only HR role. HR manages candidates, jobs, shortlisting."""
    if current_user.role != UserRole.hr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access required.",
        )
    return current_user


def require_applicant(current_user: User = Depends(get_current_user)) -> User:
    """Allows only applicant role."""
    if current_user.role != UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant access required.",
        )
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    ✅ FIX-AUTH-8: Allows only the System Administrator role.
    Admin controls: user management, system logs, HR invites.
    """
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Administrator access required.",
        )
    return current_user


def require_hr_or_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    ✅ FIX-AUTH-9: Allows both HR and Admin to access shared routes.
    Used for: candidate management, jobs, shortlisting, reports, document downloads.
    This ensures Admin can oversee all HR operations without needing
    to switch accounts, while HR retains full operational access.
    """
    if current_user.role not in (UserRole.hr, UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR or Administrator access required.",
        )
    return current_user