"""
backend/schemas.py
────────────────────────────────────────────────────────────────
FIXES APPLIED:
  ✅ FIX 1 (CRITICAL) — ApplicationResponse.submitted_at is now
     Optional[datetime] instead of datetime. Since models.py now
     defaults submitted_at to None for drafts, serialising a draft
     application would crash with a validation error if this field
     was non-optional. The finalize endpoint still stamps it with a
     real datetime, so finalized applications are unaffected.

  ✅ FIX 2 — CandidateListItem.submitted_at also made Optional for
     the same reason (HR endpoint filters to submitted_at != None,
     but the Pydantic schema must still accept None defensively).

  ✅ FIX 3 — deadline changed from Optional[date] to Optional[datetime]
     in both JobCreate and JobResponse so HR can specify the exact
     hour, minute, and second when a posting closes.

  ✅ FIX 4 — field_validator on JobResponse.deadline safely coerces
     legacy date-only DB values into datetime objects.

  ✅ FIX 5 (NEW) — experience added to the DocumentOut model_config
     documentation comment. DocumentOut itself is generic (doc_type
     is a plain str) so no schema change is needed — the new
     "experience" doc_type value flows through automatically.
     ApplicationCreate and ApplicationResponse are unchanged because
     experience evidence is captured via the Document upload flow,
     not as a form field.
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
    email: EmailStr
    password: str
    role: str = "applicant"

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
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str


# ═══════════════════════════════════════════════════════════════
# JOBS
# ═══════════════════════════════════════════════════════════════

class JobCreate(BaseModel):
    title: str
    description: Optional[str]              = None
    location: Optional[str]                 = None
    employment_type: Optional[str]          = None
    job_level: Optional[str]                = None
    number_of_posts: Optional[int]          = 1
    deadline: Optional[datetime]            = None
    responsibilities: Optional[str]         = None
    required_education_levels: str
    required_fields: str
    required_min_experience: int            = 0
    required_max_experience: int            = 20
    required_skills: str
    required_certifications: Optional[str]  = None
    preferred_qualifications: Optional[str] = None
    about_role: Optional[str]               = None

    @field_validator("number_of_posts")
    @classmethod
    def positive_posts(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("number_of_posts must be at least 1")
        return v


class JobResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    location: Optional[str]
    employment_type: Optional[str]
    job_level: Optional[str]
    number_of_posts: Optional[int]
    deadline: Optional[datetime]
    responsibilities: Optional[str]
    required_education_levels: str
    required_fields: str
    required_min_experience: int
    required_max_experience: int
    required_skills: str
    required_certifications: Optional[str]
    preferred_qualifications: Optional[str]
    about_role: Optional[str]
    is_active: bool
    created_at: datetime

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
    job_id: int
    address: Optional[str]        = None
    phone: Optional[str]          = None
    date_of_birth: Optional[str]  = None
    gender: str
    education_level: str
    field_of_study: str
    graduation_year: int
    experience_years: int         = 0
    skills: str
    certifications: Optional[str] = None

    @field_validator("experience_years")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("experience_years must be ≥ 0")
        return v


class DocumentOut(BaseModel):
    """
    Generic document output schema.
    doc_type is a plain str so it accepts ALL DocumentType enum values:
      id_card | cv | diploma | certificate | experience
    No schema change is needed when new doc types are added to the enum.
    """
    id: int
    doc_type: str
    original_name: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    applicant_id: int
    address: Optional[str]
    phone: Optional[str]
    gender: str
    education_level: str
    field_of_study: str
    graduation_year: int
    experience_years: int
    skills: str
    certifications: Optional[str]
    decision: str
    ai_score: Optional[float]
    ai_reason: Optional[str]
    doc_verified: bool
    # ✅ FIX 1 (CRITICAL): Must be Optional because drafts have submitted_at=None.
    # Before this fix, returning a draft (e.g. during the document upload step)
    # would crash with a Pydantic validation error since None is not a datetime.
    submitted_at: Optional[datetime] = None
    shortlisted_at: Optional[datetime] = None
    documents: List[DocumentOut] = []

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
# HR — candidate list item
# ═══════════════════════════════════════════════════════════════

class CandidateListItem(BaseModel):
    application_id: int
    applicant_id: int
    full_name: str
    email: str
    job_title: str
    education_level: str
    field_of_study: str
    experience_years: int
    decision: str
    ai_score: Optional[float]
    ai_reason: Optional[str]
    doc_verified: bool
    # ✅ FIX 2: Also Optional here for defensive consistency,
    # even though the HR endpoint filters to submitted_at != None.
    submitted_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
# SHORTLISTING RESULT
# ═══════════════════════════════════════════════════════════════

class ShortlistResult(BaseModel):
    application_id: int
    applicant_name: str
    job_title: str
    decision: str
    ai_score: float
    doc_verified: bool
    identity_match: bool = False
    reason: str