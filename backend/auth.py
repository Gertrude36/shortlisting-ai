"""
backend/auth.py
────────────────────────────────────────────────────────────────
Password hashing, JWT creation/verification, and the
`get_current_user` / `require_hr` FastAPI dependencies.

FIXES APPLIED:
  ✅ FIX 1 — datetime.utcnow() replaced with datetime.now(timezone.utc)

  ✅ FIX 2 — bcrypt >= 4.1 incompatibility with passlib
     passlib 1.7.4 breaks with bcrypt >= 4.1:
       - AttributeError: module 'bcrypt' has no attribute '__about__'
       - ValueError: password cannot be longer than 72 bytes
     Fix: suppress the warning + truncate passwords to 72 UTF-8 bytes.

  ✅ FIX 3 — 401 retry loop prevention
     verify_access_token() distinguishes EXPIRED vs INVALID tokens.
     get_current_user() returns machine-readable codes so the frontend
     can clear its token and stop retrying on 401.

  ✅ FIX 4 — Password Reset Token Support
     create_reset_token(email) / verify_reset_token(token) added.

  ✅ FIX 5 (NEW) — require_hr / require_applicant raise 403, not 401.
     Previously a role mismatch could surface as a 401 in some proxy
     configurations because HTTPException headers included WWW-Authenticate.
     Now role-guard errors are clean 403s with no auth headers.

  ✅ FIX 6 (NEW) — get_current_user now handles a missing/None token
     explicitly (e.g. when oauth2_scheme returns "" on some FastAPI
     versions) rather than letting jwt.decode raise an opaque error.

  ✅ FIX 7 (NEW) — _safe_encode truncation now handles non-string input
     gracefully (converts to str first) to prevent unexpected TypeErrors
     from downstream callers.
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
warnings.filterwarnings(
    "ignore",
    message=".*bcrypt.*",
    category=UserWarning,
)

from fastapi import Depends, HTTPException, status
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


def _safe_encode(plain) -> str:
    """
    ✅ FIX 7: Coerce to str before encoding, then truncate to 72 UTF-8
    bytes — bcrypt's hard limit. Consistent across all bcrypt/passlib versions.
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
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=EXPIRE_MINS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── ✅ FIX 3: Token verification with expiry distinction ─────────────────────

def verify_access_token(token: str) -> "dict | str":
    """
    Decode and validate an access token.

    Returns:
      - dict payload   if valid
      - "expired"      if the token is valid but expired
      - "invalid"      if the token is malformed or tampered
    """
    # ✅ FIX 6: guard against empty/None token
    if not token or not token.strip():
        return "invalid"

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
    Encodes:
      - sub: user's email address
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
    Returns the email string if valid and not expired, else None.
    """
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
    """
    ✅ FIX 3 + FIX 6: Returns machine-readable error codes in 401 responses
    so the frontend can stop the retry loop and clear its stored token.

    Response shape on error:
      { "detail": "human message", "code": "TOKEN_EXPIRED" | "TOKEN_INVALID" }
    (code surfaced via X-Token-Error header for axios interceptors)
    """
    result = verify_access_token(token)

    if result == "expired":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
            headers={
                "WWW-Authenticate": "Bearer",
                "X-Token-Error":    "TOKEN_EXPIRED",
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
    """
    ✅ FIX 5: Raises a clean 403 (no WWW-Authenticate header) if the
    logged-in user is not HR. Previously the 401 header from
    get_current_user could leak through on some proxy configurations.
    """
    if current_user.role != UserRole.hr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access required.",
        )
    return current_user


def require_applicant(current_user: User = Depends(get_current_user)) -> User:
    """
    ✅ FIX 5: Raises a clean 403 if the logged-in user is not an applicant.
    """
    if current_user.role != UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant access required.",
        )
    return current_user