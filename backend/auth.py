"""
backend/auth.py  ·  v2.2.0 - COMPLETE WITH REGISTRATION & EMAIL
----------------------------------------------------------------
FIXED: Added registration endpoint with welcome email
"""

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

warnings.filterwarnings("ignore", message=".*error reading bcrypt version.*", category=UserWarning)
warnings.filterwarnings("ignore", message=".*bcrypt.*", category=UserWarning)

from fastapi import APIRouter, Depends, HTTPException, status, Request
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
from schemas import RegisterRequest, LoginRequest, TokenResponse, ResetPasswordRequest
from email_utils import send_welcome_email, send_reset_email

load_dotenv()

# -- Router -------------------------------------------------------------------
router = APIRouter(prefix="/auth", tags=["Authentication"])

# -- Config -------------------------------------------------------------------
SECRET_KEY         = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM          = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS        = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE = 15   # minutes
FRONTEND_URL       = os.getenv("FRONTEND_URL", "http://localhost:5173")

# -- Helpers ------------------------------------------------------------------
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


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
# REGISTRATION ENDPOINT - THIS WAS MISSING!
# =============================================================================

@router.post("/register")
def register(user_data: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user and send welcome email."""
    
    print(f"\n📝 REGISTRATION: {user_data.email}")
    
    # Check if user exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Map role
    role_map = {"applicant": UserRole.applicant, "hr": UserRole.hr, "admin": UserRole.admin}
    role = role_map.get(user_data.role, UserRole.applicant)
    
    # Validate HR code if role is HR
    if role == UserRole.hr:
        hr_code = os.getenv("HR_INVITE_CODE", "HR@Shortlist2025!")
        if user_data.hr_code != hr_code:
            raise HTTPException(status_code=400, detail="Invalid HR invite code")
    
    # Create user
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    print(f"✅ USER CREATED: ID={new_user.id}, Email={new_user.email}")
    
    # ========================================================================
    # SEND WELCOME EMAIL
    # ========================================================================
    try:
        print(f"📧 Sending welcome email to {new_user.email}...")
        email_sent = send_welcome_email(
            to_name=new_user.full_name,
            to_email=new_user.email,
            role=user_data.role,
        )
        if email_sent:
            print(f"✅ Welcome email sent successfully to {new_user.email}")
        else:
            print(f"❌ Failed to send welcome email to {new_user.email}")
    except Exception as e:
        print(f"❌ Email error: {e}")
    
    # Create access token
    access_token = create_access_token(data={"sub": new_user.id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user_data.role,
        user_id=new_user.id,
        full_name=new_user.full_name,
    )


@router.post("/login")
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password."""
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is disabled")
    
    access_token = create_access_token(data={"sub": user.id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role.value,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/forgot-password")
def forgot_password(email: str, db: Session = Depends(get_db)):
    """Send password reset email."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": "If your email is registered, you will receive a reset link"}
    
    reset_token = create_reset_token(email)
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    
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


@router.get("/me")
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """Get current user information."""
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role.value,
        "phone": current_user.phone,
        "address": current_user.address,
        "national_id": current_user.national_id,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
    }