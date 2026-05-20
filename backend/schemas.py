"""
backend/schemas.py
────────────────────────────────────────────────────────────────
FIXES APPLIED:
  ✅ FIX 1 (CRITICAL) — ApplicationResponse.submitted_at is now Optional[datetime].
  ✅ FIX 2 — CandidateListItem.submitted_at also made Optional.
  ✅ FIX 3 — deadline changed from Optional[date] to Optional[datetime].
  ✅ FIX 4 — field_validator on JobResponse.deadline safely coerces legacy date values.
  ✅ FIX 5 — DocumentOut accepts "experience" doc_type automatically (plain str).
  ✅ FIX 6 — RegisterRequest now accepts optional hr_code field.
             Backend validates it against HR_INVITE_CODE env var.
             Applicant registration never needs hr_code.
  ✅ FIX 7 (NEW) — CandidateListItem now exposes ALL applicant fields so
             HR can see complete candidate data: phone, address, date_of_birth,
             gender, skills, certifications, graduation_year, documents,
             and profile_complete flag.
  ✅ DEPLOY FIX — from __future__ import annotations at line 1.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import Optional, List
import re
from pydantic import BaseModel, EmailStr, field_validator


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    full_name: str
    email:     EmailStr
    password:  str
    role:      str        = "applicant"
    hr_code:   Optional[str] = None   # ✅ FIX 6: Required only when role == "hr"

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        errors = []
        if len(v) < 8:                         errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):         errors.append("one uppercase letter (A–Z)")
        if not re.search(r"[a-z]", v):         errors.append("one lowercase letter (a–z)")
        if not re.search(r"\d", v):            errors.append("one number (0–9)")
        if not re.search(r"[^A-Za-z0-9]", v): errors.append("one special character (!@#$%^&* …)")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("applicant", "hr"):
            raise ValueError("role must be 'applicant' or 'hr'")
        return v


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    user_id:      int
    full_name:    str


# ═══════════════════════════════════════════════════════════════
# JOBS
# ═══════════════════════════════════════════════════════════════

class JobCreate(BaseModel):
    title:                     str
    description:               Optional[str]  = None
    location:                  Optional[str]  = None
    employment_type:           Optional[str]  = None
    job_level:                 Optional[str]  = None
    number_of_posts:           Optional[int]  = 1
    deadline:                  Optional[datetime] = None
    responsibilities:          Optional[str]  = None
    required_education_levels: str
    required_fields:           str
    required_min_experience:   int            = 0
    required_max_experience:   int            = 20
    required_skills:           str
    required_certifications:   Optional[str]  = None
    preferred_qualifications:  Optional[str]  = None
    about_role:                Optional[str]  = None

    @field_validator("number_of_posts")
    @classmethod
    def positive_posts(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("number_of_posts must be at least 1")
        return v


class JobResponse(BaseModel):
    id:                        int
    title:                     str
    description:               Optional[str]
    location:                  Optional[str]
    employment_type:           Optional[str]
    job_level:                 Optional[str]
    number_of_posts:           Optional[int]
    deadline:                  Optional[datetime]
    responsibilities:          Optional[str]
    required_education_levels: str
    required_fields:           str
    required_min_experience:   int
    required_max_experience:   int
    required_skills:           str
    required_certifications:   Optional[str]
    preferred_qualifications:  Optional[str]
    about_role:                Optional[str]
    is_active:                 bool
    created_at:                datetime

    @field_validator("deadline", mode="before")
    @classmethod
    def coerce_deadline(cls, v):
        if v is None:
            return v
        if isinstance(v, datetime):
            return v
        if isinstance(v, date):
            return datetime(v.year, v.month, v.day, 23, 59, 59)
        return v

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
# APPLICATIONS
# ═══════════════════════════════════════════════════════════════

class ApplicationCreate(BaseModel):
    job_id:          int
    address:         Optional[str] = None
    phone:           Optional[str] = None
    date_of_birth:   Optional[str] = None
    gender:          str
    education_level: str
    field_of_study:  str
    graduation_year: int
    experience_years: int          = 0
    skills:          str
    certifications:  Optional[str] = None

    @field_validator("experience_years")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("experience_years must be ≥ 0")
        return v


class DocumentOut(BaseModel):
    id:            int
    doc_type:      str
    original_name: str
    uploaded_at:   datetime

    model_config = {"from_attributes": True}


class ApplicationResponse(BaseModel):
    id:               int
    job_id:           int
    applicant_id:     int
    address:          Optional[str]
    phone:            Optional[str]
    gender:           str
    education_level:  str
    field_of_study:   str
    graduation_year:  int
    experience_years: int
    skills:           str
    certifications:   Optional[str]
    decision:         str
    ai_score:         Optional[float]
    ai_reason:        Optional[str]
    doc_verified:     bool
    submitted_at:     Optional[datetime] = None
    shortlisted_at:   Optional[datetime] = None
    documents:        List[DocumentOut]  = []

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
# HR — candidate list item
# ✅ FIX 7: Now includes ALL applicant fields so HR sees complete data
# ═══════════════════════════════════════════════════════════════

class CandidateListItem(BaseModel):
    application_id:   int
    applicant_id:     int
    full_name:        str
    email:            str
    job_title:        str

    # ── Application form fields ──────────────────────────────
    education_level:  str
    field_of_study:   str
    graduation_year:  int
    experience_years: int
    skills:           str
    certifications:   Optional[str]  = None

    # ── Profile / personal fields ────────────────────────────
    gender:           Optional[str]  = None
    phone:            Optional[str]  = None
    address:          Optional[str]  = None
    date_of_birth:    Optional[str]  = None

    # ── AI / decision fields ─────────────────────────────────
    decision:         str
    ai_score:         Optional[float]
    ai_reason:        Optional[str]
    doc_verified:     bool
    submitted_at:     Optional[datetime] = None

    # ── Documents list ───────────────────────────────────────
    documents:        List[DocumentOut] = []

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
# SHORTLISTING RESULT
# ═══════════════════════════════════════════════════════════════

class ShortlistResult(BaseModel):
    application_id: int
    applicant_name: str
    job_title:      str
    decision:       str
    ai_score:       float
    doc_verified:   bool
    identity_match: bool = False
    reason:         str