"""
backend/auth.py  ·  v2.0.0
────────────────────────────────────────────────────────────────
Password hashing, JWT creation/verification, and the
`get_current_user` / `require_hr` FastAPI dependencies.

FIXES IN v2.0.0:

  ✅ FIX-AUTH-1 — jose version compatibility for ExpiredSignatureError.
     On some versions of python-jose (< 3.3.0), ExpiredSignatureError
     is not exported from the top-level `jose` package — only from
     `jose.exceptions`. The old import crashed with ImportError at
     startup, causing ALL endpoints to return 500.
     Fix: try both import paths with a safe fallback.

  ✅ FIX-AUTH-2 — datetime.utcnow() replaced with datetime.now(timezone.utc)
     (retained from previous version).

  ✅ FIX-AUTH-3 — bcrypt >= 4.1 incompatibility with passlib suppressed
     (retained from previous version).

  ✅ FIX-AUTH-4 — Password Reset Token Support (retained).

  ✅ FIX-AUTH-5 — require_hr / require_applicant raise clean 403 (retained).

  ✅ FIX-AUTH-6 — get_current_user handles missing/None token (retained).

  ✅ FIX-AUTH-7 — _safe_encode handles non-string input (retained).
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
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# ✅ FIX-AUTH-1 — Safe import for ExpiredSignatureError across jose versions.
# python-jose < 3.3.0 does not export ExpiredSignatureError from the top-level
# `jose` package. This caused an ImportError that silently broke ALL auth and
# made every protected endpoint return 500. We try both import paths.
try:
    from jose import ExpiredSignatureError, JWTError, jwt
except ImportError:
    # Older jose versions: ExpiredSignatureError lives in jose.exceptions
    from jose import JWTError, jwt
    try:
        from jose.exceptions import ExpiredSignatureError
    except ImportError:
        # Ultimate fallback: treat expired as a generic JWTError subclass
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
    """
    ✅ FIX-AUTH-7: Coerce to str before encoding, then truncate to 72 UTF-8
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


# ── ✅ FIX-AUTH-3: Token verification with expiry distinction ─────────────────

def verify_access_token(token: str) -> "dict | str":
    """
    Decode and validate an access token.

    Returns:
      - dict payload   if valid
      - "expired"      if the token is valid but expired
      - "invalid"      if the token is malformed or tampered
    """
    # ✅ FIX-AUTH-6: guard against empty/None token
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
    ✅ FIX-AUTH-3 + FIX-AUTH-6: Returns machine-readable error codes in 401
    responses so the frontend can stop the retry loop and clear its token.

    Response shape on error:
      { "detail": "human message" }
      Header: X-Token-Error: TOKEN_EXPIRED | TOKEN_INVALID
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
    ✅ FIX-AUTH-5: Raises a clean 403 (no WWW-Authenticate header) if the
    logged-in user is not HR.
    """
    if current_user.role != UserRole.hr:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR access required.",
        )
    return current_user


def require_applicant(current_user: User = Depends(get_current_user)) -> User:
    """
    ✅ FIX-AUTH-5: Raises a clean 403 if the logged-in user is not an applicant.
    """
    if current_user.role != UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicant access required.",
        )
    return current_user