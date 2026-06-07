from __future__ import annotations

from datetime import datetime, date
from typing import Optional, List, Any
import re
from pydantic import BaseModel, EmailStr, field_validator


# ===============================================================
# AUTH
# ===============================================================

class RegisterRequest(BaseModel):
    full_name: str
    email:     EmailStr
    password:  str
    role:      str = "applicant"
    hr_code:   Optional[str] = None

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
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("one uppercase letter (A-Z)")
        if not re.search(r"[a-z]", v):
            errors.append("one lowercase letter (a-z)")
        if not re.search(r"\d", v):
            errors.append("one number (0-9)")
        if not re.search(r"[^A-Za-z0-9]", v):
            errors.append("one special character (!@#$%^&* ...)")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ("applicant", "hr", "admin"):
            raise ValueError("role must be 'applicant', 'hr', or 'admin'")
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


class ResetPasswordRequest(BaseModel):
    token:       str
    new_password: str
    
    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("one uppercase letter (A-Z)")
        if not re.search(r"[a-z]", v):
            errors.append("one lowercase letter (a-z)")
        if not re.search(r"\d", v):
            errors.append("one number (0-9)")
        if not re.search(r"[^A-Za-z0-9]", v):
            errors.append("one special character (!@#$%^&* ...)")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


# ===============================================================
# ADMIN
# ===============================================================

class AdminInviteHRRequest(BaseModel):
    email:     EmailStr
    full_name: str = "HR Applicant"


class UserListItem(BaseModel):
    id:         int
    full_name:  str
    email:      str
    role:       str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ===============================================================
# JOBS
# ===============================================================

class JobCreate(BaseModel):
    title:                     str
    description:               Optional[str] = None
    location:                  Optional[str] = None
    employment_type:           Optional[str] = None
    job_level:                 Optional[str] = None
    number_of_posts:           Optional[int] = 1
    deadline:                  Optional[datetime] = None
    responsibilities:          Optional[str] = None
    required_education_levels: str
    required_fields:           str
    required_min_experience:   int = 0
    required_max_experience:   int = 20
    required_skills:           str
    required_certifications:   Optional[str] = None
    preferred_qualifications:  Optional[str] = None
    about_role:                Optional[str] = None

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


# ===============================================================
# APPLICATIONS
# ===============================================================

class ApplicationCreate(BaseModel):
    job_id:          int
    address:         Optional[str] = None
    phone:           Optional[str] = None
    date_of_birth:   Optional[str] = None
    gender:          str
    education_level: str
    field_of_study:  str
    graduation_year: int
    experience_years: int = 0
    skills:          str
    certifications:  Optional[str] = None

    @field_validator("experience_years")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("experience_years must be >= 0")
        return v
    
    @field_validator("graduation_year")
    @classmethod
    def valid_year(cls, v: int) -> int:
        current_year = datetime.now().year
        if v < 1950 or v > current_year + 5:
            raise ValueError(f"Graduation year must be between 1950 and {current_year + 5}")
        return v


class DocumentOut(BaseModel):
    id:            int
    doc_type:      str
    original_name: Optional[str] = None
    uploaded_at:   Optional[datetime] = None

    @field_validator("doc_type", mode="before")
    @classmethod
    def coerce_doc_type(cls, v: Any) -> str:
        if v is None:
            return ""
        try:
            return v.value
        except AttributeError:
            return str(v)

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
    decision:         str = "pending"
    ai_score:         Optional[float]
    ai_reason:        Optional[str]
    doc_verified:     bool = False
    submitted_at:     Optional[datetime] = None
    shortlisted_at:   Optional[datetime] = None
    documents:        List[DocumentOut] = []

    @field_validator("decision", mode="before")
    @classmethod
    def coerce_decision(cls, v: Any) -> str:
        if v is None:
            return "pending"
        try:
            return v.value
        except AttributeError:
            return str(v)

    @field_validator("documents", mode="before")
    @classmethod
    def coerce_documents(cls, v: Any) -> list:
        if v is None:
            return []
        try:
            return list(v)
        except Exception:
            return []

    model_config = {"from_attributes": True}


# ===============================================================
# HR -- candidate list item
# ===============================================================

class CandidateListItem(BaseModel):
    application_id:   int
    applicant_id:     int
    full_name:        str
    email:            str
    job_title:        str

    education_level:  str
    field_of_study:   str
    graduation_year:  int
    experience_years: int
    skills:           str
    certifications:   Optional[str] = None

    gender:           Optional[str] = None
    phone:            Optional[str] = None
    address:          Optional[str] = None
    date_of_birth:    Optional[str] = None

    decision:         str
    ai_score:         Optional[float]
    ai_reason:        Optional[str]
    doc_verified:     bool
    submitted_at:     Optional[datetime] = None

    ocr_confidence_flag: bool = False
    ocr_quality_score:   Optional[float] = None
    hr_review_note:      Optional[str] = None
    hr_reviewed_at:      Optional[str] = None

    documents: List[DocumentOut] = []

    @field_validator("decision", mode="before")
    @classmethod
    def coerce_decision(cls, v: Any) -> str:
        if v is None:
            return "pending"
        try:
            return v.value
        except AttributeError:
            return str(v)

    model_config = {"from_attributes": True}


# ===============================================================
# SHORTLISTING RESULT
# ===============================================================

class ShortlistResult(BaseModel):
    application_id: int
    applicant_name: str
    job_title:      str
    decision:       str
    ai_score:       float
    doc_verified:   bool
    identity_match: bool = False
    reason:         str


# ===============================================================
# MANUAL REVIEW QUEUE SCHEMAS
# ===============================================================

class ManualReviewDocumentItem(BaseModel):
    id:            int
    doc_type:      str
    original_name: Optional[str] = None
    uploaded_at:   Optional[str] = None
    download_url:  Optional[str] = None


class ManualReviewApplicationItem(BaseModel):
    application_id:      int
    applicant_id:        int
    full_name:           str
    email:               str
    job_title:           str
    job_id:              int

    education_level:     str
    field_of_study:      str
    graduation_year:     int
    experience_years:    int
    skills:              str
    certifications:      Optional[str] = None
    gender:              Optional[str] = None
    phone:               Optional[str] = None
    address:             Optional[str] = None

    decision:            str
    ai_score:            Optional[float] = None
    doc_verified:        bool = False

    ocr_confidence_flag: bool = False
    ocr_quality_score:   Optional[float] = None
    ocr_matches:         List[str] = []
    ocr_mismatches:      List[str] = []
    ocr_warnings:        List[str] = []
    ocr_done:            bool = False

    review_reason:       str = "low_ocr"
    review_reason_label: str = "Low OCR Quality"

    hr_review_note:      Optional[str] = None
    hr_reviewed_by:      Optional[int] = None
    hr_reviewed_at:      Optional[str] = None

    submitted_at:        Optional[datetime] = None
    documents:           List[ManualReviewDocumentItem] = []


class ManualReviewQueueResponse(BaseModel):
    total:          int
    low_ocr:        int
    low_confidence: int
    missing_info:   int
    applications:   List[ManualReviewApplicationItem] = []


class ManualReviewActionRequest(BaseModel):
    note: Optional[str] = None


# ===============================================================
# REPORTING SCHEMAS
# ===============================================================

class JobReportSummary(BaseModel):
    total_applicants: int
    shortlisted:      int
    not_shortlisted:  int
    pending:          int
    manual_review:    int
    average_score:    Optional[float] = None
    top_score:        Optional[float] = None
    shortlist_rate:   float = 0.0


class TopCandidateItem(BaseModel):
    full_name:      str
    email:          str
    ai_score:       float
    application_id: int


class AdminJobReportItem(BaseModel):
    job_id:          int
    job_title:       str
    location:        Optional[str] = None
    employment_type: Optional[str] = None
    deadline:        Optional[str] = None
    created_at:      Optional[str] = None
    summary:         JobReportSummary
    top_candidates:  List[TopCandidateItem] = []


class AdminSystemTotals(BaseModel):
    total_jobs:              int
    total_applicants:        int
    total_shortlisted:       int
    total_not_shortlisted:   int
    total_pending:           int
    total_manual_review:     int
    overall_shortlist_rate:  float = 0.0
    average_score:           Optional[float] = None


class AdminSystemReport(BaseModel):
    system_totals: AdminSystemTotals
    job_reports:   List[AdminJobReportItem]
    generated_at:  str