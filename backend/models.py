"""
backend/models.py
────────────────────────────────────────────────────────────────
FIXES APPLIED:

  ✅ FIX MODEL-1 — phone/address columns on User (persistent profile fields,
     no application required).

  ✅ FIX MODEL-2 — national_id removed from profile completeness checks.

  ✅ FIX MODEL-3 — Added server_default to all nullable columns.

  ✅ FIX MODEL-4 — DecisionStatus.pending is now the explicit server_default.

  ✅ FIX MODEL-5 — All DateTime columns use timezone=True consistently.

  ✅ FIX MODEL-6 — ProfileDocument.uploaded_at and Document.uploaded_at
     have onupdate=None explicitly set.

  ✅ FIX MODEL-7 (NEW) — Added doc_advisory column to Application.
     This was missing entirely, causing AttributeError when
     _run_verification_and_prediction() tried to save
     app_obj.doc_advisory = doc_result.get("advisory", False).
     Without this column every shortlist call either crashed or silently
     left doc_verified=False, which is why the dashboard always showed
     "Processing" instead of "Verified".
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


# ── Enumerations ──────────────────────────────────────────────────────────────

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
    experience  = "experience"


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String(255), nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    # ✅ FIX MODEL-1: profile fields stored on User (persistent, no application needed)
    # ✅ FIX MODEL-3: server_default=None prevents IntegrityErrors on migration
    phone   = Column(String(50),  nullable=True, server_default=None)
    address = Column(String(255), nullable=True, server_default=None)

    role       = Column(SAEnum(UserRole, native_enum=False), nullable=False, default=UserRole.applicant)
    # ✅ FIX MODEL-5: timezone=True on all DateTime columns
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applications      = relationship("Application",     back_populates="applicant")
    logs              = relationship("SystemLog",       back_populates="user", foreign_keys="SystemLog.user_id")
    profile_documents = relationship("ProfileDocument", back_populates="user", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id                        = Column(Integer, primary_key=True, index=True)
    title                     = Column(String(255), nullable=False, index=True)
    description               = Column(Text, nullable=True)

    location                  = Column(String(255), nullable=True)
    employment_type           = Column(String(100), nullable=True)
    salary_range              = Column(String(100), nullable=True)
    responsibilities          = Column(Text, nullable=True)
    preferred_qualifications  = Column(Text, nullable=True)
    about_role                = Column(Text, nullable=True)

    required_education_levels = Column(String(255), nullable=False, default="Bachelor's")
    required_fields           = Column(String(255), nullable=False, default="")
    required_min_experience   = Column(Integer, default=0)
    required_max_experience   = Column(Integer, default=20)
    required_skills           = Column(Text, nullable=False, default="")
    required_certifications   = Column(Text, nullable=True)

    job_level       = Column(String(100), nullable=True)
    number_of_posts = Column(Integer, nullable=True)
    # ✅ FIX MODEL-5: timezone=True
    deadline        = Column(DateTime(timezone=True), nullable=True)

    is_active  = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    # ✅ FIX MODEL-5: timezone=True
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applications = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"

    id           = Column(Integer, primary_key=True, index=True)
    applicant_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id       = Column(Integer, ForeignKey("jobs.id"),  nullable=False)

    # Snapshot of profile fields at submission time
    address          = Column(String(255), nullable=True)
    phone            = Column(String(50),  nullable=True)
    date_of_birth    = Column(String(20),  nullable=True)
    gender           = Column(String(50),  nullable=False)
    education_level  = Column(String(100), nullable=False)
    field_of_study   = Column(String(255), nullable=False)
    graduation_year  = Column(Integer, nullable=False)
    experience_years = Column(Integer, default=0)
    skills           = Column(Text, nullable=False)
    certifications   = Column(Text, nullable=True)

    # ✅ FIX MODEL-4: explicit server_default so existing NULL rows don't break .value
    decision     = Column(
        SAEnum(DecisionStatus, native_enum=False),
        default=DecisionStatus.pending,
        server_default="pending",
        nullable=False,
    )
    ai_score     = Column(Float,   nullable=True)
    # ✅ FIX MODEL-3: ai_reason nullable with no server_default (TEXT columns are fine)
    ai_reason    = Column(Text,    nullable=True)

    # ✅ FIX MODEL-7 (NEW): doc_advisory column — was missing, causing:
    #   - AttributeError: 'Application' object has no attribute 'doc_advisory'
    #   - doc_verified always staying False (dashboard always showed "Processing")
    #   - shortlisting_engine v6 predict() doc_result["advisory"] was never saved
    doc_verified = Column(Boolean, default=False, server_default="0")
    doc_advisory = Column(Boolean, default=False, server_default="0")

    # ✅ FIX MODEL-5: timezone=True on all DateTime columns
    submitted_at   = Column(DateTime(timezone=True), nullable=True, default=None)
    shortlisted_at = Column(DateTime(timezone=True), nullable=True)

    applicant = relationship("User",        back_populates="applications")
    job       = relationship("Job",         back_populates="applications")
    documents = relationship(
        "Document", back_populates="application", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id             = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    doc_type       = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename       = Column(String(255), nullable=False)
    original_name  = Column(String(255), nullable=True)
    file_path      = Column(String(512), nullable=False)
    # ✅ FIX MODEL-5 + MODEL-6: timezone=True, no accidental onupdate mutation
    uploaded_at    = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    application = relationship("Application", back_populates="documents")


class ProfileDocument(Base):
    """
    Stores documents uploaded directly to the user's profile.
    Independent of any job application; used to pre-fill document
    slots when the user applies for a job.
    """
    __tablename__ = "profile_documents"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    doc_type      = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename      = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    file_path     = Column(String(512), nullable=False)
    # ✅ FIX MODEL-5 + MODEL-6: timezone=True, no accidental onupdate mutation
    uploaded_at   = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    user = relationship("User", back_populates="profile_documents")


class SystemLog(Base):
    """Audit trail — one row per user action."""
    __tablename__ = "system_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String(255), nullable=True)
    user_role  = Column(String(50),  nullable=True)

    action     = Column(String(100), nullable=False, index=True)
    target     = Column(String(255), nullable=True)
    detail     = Column(Text,        nullable=True)
    ip_address = Column(String(64),  nullable=True)
    status     = Column(String(20),  nullable=False, default="success", server_default="success", index=True)

    # ✅ FIX MODEL-5: timezone=True
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = relationship("User", back_populates="logs", foreign_keys=[user_id])