"""
backend/models.py
────────────────────────────────────────────────────────────────
FIXES APPLIED:
  ✅ FIX 1 (CRITICAL) — Application.submitted_at defaults to None.
  ✅ FIX 2 — All DateTime defaults use lambda: datetime.now(timezone.utc).
  ✅ FIX 3 — cascade="all, delete-orphan" on Job.applications and
     Application.documents ensures DB integrity on deletion.
  ✅ FIX 4 — PostgreSQL compatibility: native_enum=False.
  ✅ FIX 5 — Added DocumentType.experience for experience/employment
     letters, reference letters, or work certificates.
  ✅ DEPLOY FIX — from __future__ import annotations at line 1.
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
    # ✅ FIX 5: Experience document — employment letter, reference
    # letter, or work certificate proving declared experience_years.
    experience  = "experience"


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String(255), nullable=False)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    role       = Column(SAEnum(UserRole, native_enum=False), nullable=False, default=UserRole.applicant)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applications = relationship("Application", back_populates="applicant")


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
    deadline        = Column(DateTime(timezone=True), nullable=True)

    is_active  = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applications = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"

    id           = Column(Integer, primary_key=True, index=True)
    applicant_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id       = Column(Integer, ForeignKey("jobs.id"),  nullable=False)

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

    decision     = Column(SAEnum(DecisionStatus, native_enum=False), default=DecisionStatus.pending)
    ai_score     = Column(Float,   nullable=True)
    ai_reason    = Column(Text,    nullable=True)
    doc_verified = Column(Boolean, default=False)

    # ✅ FIX 1: default=None — new applications are DRAFTS.
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
    uploaded_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    application = relationship("Application", back_populates="documents")