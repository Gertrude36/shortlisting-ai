"""
backend/models.py
────────────────────────────────────────────────────────────────
FIXES APPLIED:
  ✅ FIX 1 (CRITICAL) — Application.submitted_at now defaults to
     None instead of datetime.now(). The old default meant every
     draft was immediately stamped as "submitted", making it visible
     to HR before the applicant clicked Submit. Now drafts have
     submitted_at=NULL and are only stamped when /finalize is called.

  ✅ FIX 2 — All Column(DateTime, default=datetime.utcnow) replaced
     with default=lambda: datetime.now(timezone.utc).
     datetime.utcnow() is deprecated in Python 3.12+ and will be
     removed in a future version.

  ✅ FIX 3 — cascade="all, delete-orphan" on Job.applications and
     Application.documents ensures DB integrity on deletion.
"""

from __future__ import annotations
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    DateTime, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from database import Base


# ── Enumerations ─────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    applicant = "applicant"
    hr        = "hr"


class DecisionStatus(str, enum.Enum):
    pending         = "pending"
    shortlisted     = "shortlisted"
    not_shortlisted = "not_shortlisted"


class DocumentType(str, enum.Enum):
    id_card     = "id_card"
    cv          = "cv"
    diploma     = "diploma"
    certificate = "certificate"


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String,  nullable=False)
    email           = Column(String,  unique=True, index=True, nullable=False)
    hashed_password = Column(String,  nullable=False)
    role            = Column(SAEnum(UserRole), nullable=False, default=UserRole.applicant)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    applications = relationship("Application", back_populates="applicant")


class Job(Base):
    __tablename__ = "jobs"

    id                        = Column(Integer, primary_key=True, index=True)
    title                     = Column(String, nullable=False, index=True)
    description               = Column(Text,   nullable=True)

    # Rich description fields
    location                  = Column(String, nullable=True)
    employment_type           = Column(String, nullable=True)
    salary_range              = Column(String, nullable=True)
    responsibilities          = Column(Text,   nullable=True)
    preferred_qualifications  = Column(Text,   nullable=True)
    about_role                = Column(Text,   nullable=True)

    # Shortlisting criteria
    required_education_levels = Column(String, nullable=False, default="Bachelor's")
    required_fields           = Column(String, nullable=False, default="")
    required_min_experience   = Column(Integer, default=0)
    required_max_experience   = Column(Integer, default=20)
    required_skills           = Column(Text,   nullable=False, default="")
    required_certifications   = Column(Text,   nullable=True)

    # Additional fields
    job_level       = Column(String,  nullable=True)
    number_of_posts = Column(Integer, nullable=True)
    deadline        = Column(DateTime, nullable=True)

    is_active  = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # cascade ensures Applications (and their Documents) are deleted with the Job
    applications = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"

    id               = Column(Integer, primary_key=True, index=True)
    applicant_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id           = Column(Integer, ForeignKey("jobs.id"),  nullable=False)

    address          = Column(String, nullable=True)
    phone            = Column(String, nullable=True)
    date_of_birth    = Column(String, nullable=True)
    gender           = Column(String, nullable=False)
    education_level  = Column(String, nullable=False)
    field_of_study   = Column(String, nullable=False)
    graduation_year  = Column(Integer, nullable=False)
    experience_years = Column(Integer, default=0)
    skills           = Column(Text,   nullable=False)
    certifications   = Column(Text,   nullable=True)

    decision         = Column(SAEnum(DecisionStatus), default=DecisionStatus.pending)
    ai_score         = Column(Float,   nullable=True)
    ai_reason        = Column(Text,    nullable=True)
    doc_verified     = Column(Boolean, default=False)

    # ✅ FIX 1 (CRITICAL): default=None means new applications are DRAFTS.
    # submitted_at is only set when the applicant calls POST /applications/{id}/finalize.
    # Previously this defaulted to datetime.now(timezone.utc), which meant every draft
    # was immediately stamped as "submitted" and appeared in the HR dashboard.
    submitted_at   = Column(DateTime, nullable=True, default=None)
    shortlisted_at = Column(DateTime, nullable=True)

    applicant = relationship("User",        back_populates="applications")
    job       = relationship("Job",         back_populates="applications")
    # cascade ensures Documents are deleted with the Application
    documents = relationship(
        "Document", back_populates="application", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id             = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    doc_type       = Column(SAEnum(DocumentType), nullable=False)
    filename       = Column(String, nullable=False)
    original_name  = Column(String, nullable=True)
    file_path      = Column(String, nullable=False)
    uploaded_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="documents")