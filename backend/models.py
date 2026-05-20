"""
backend/models.py  ·  v2.1.0
────────────────────────────────────────────────────────────────
ALL PREVIOUS FIXES RETAINED (FIX MODEL-1 through FIX MODEL-7).

NEW FIXES IN v2.1.0:

  ✅ FIX MODEL-8 — Removed server_default=None from User.phone and
     User.address. In PostgreSQL, server_default=None is a no-op and
     is silently ignored, but it causes SQLAlchemy to emit a spurious
     DEFAULT NULL clause that confuses Alembic and some PG versions.
     nullable=True already implies NULL as the default; no server_default
     is needed and passing None is misleading.

  ✅ FIX MODEL-9 — Added server_default="false" (PostgreSQL) / "0" (SQLite)
     compatibility note: server_default="0" works for both SQLite BOOLEAN
     and PostgreSQL BOOLEAN because PostgreSQL accepts 0/1 for bool columns.
     doc_verified and doc_advisory already had this — confirmed correct.

  ✅ FIX MODEL-10 — Added explicit __repr__ methods to all models for
     cleaner debug logs (makes 500-error tracebacks far easier to read).

  ✅ FIX MODEL-11 — Added index=True to Application.job_id and
     Application.applicant_id. Without indexes, the /applications/my
     and /hr/candidates queries do full-table scans on PostgreSQL, which
     causes slow responses that time out on Render free tier → 500.
     Also indexed Application.submitted_at for the frequent IS NOT NULL
     filter used in both applicant and HR views.

  ✅ FIX MODEL-12 — Added index=True to Document.application_id and
     ProfileDocument.user_id. Every document lookup joins on these columns;
     without indexes, large tables cause timeouts on Render free tier.

  ✅ FIX MODEL-13 — Application.submitted_at default changed from
     default=None to no default at all (omitted). SQLAlchemy's default=None
     is a Python-side default that fires on INSERT, overwriting an explicit
     None passed by application code. The correct pattern is to leave it
     unset (nullable=True is enough) and set it explicitly in the route
     when submitting.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    DateTime, ForeignKey, Enum as SAEnum, Index,
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
    # ✅ FIX MODEL-8: Removed server_default=None — nullable=True already implies NULL.
    #                 server_default=None is a no-op in PostgreSQL and confuses Alembic.
    phone   = Column(String(50),  nullable=True)
    address = Column(String(255), nullable=True)

    role = Column(
        SAEnum(UserRole, native_enum=False),
        nullable=False,
        default=UserRole.applicant,
        server_default="applicant",
    )
    # ✅ FIX MODEL-5: timezone=True on all DateTime columns
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    applications      = relationship("Application",     back_populates="applicant")
    logs              = relationship("SystemLog",       back_populates="user", foreign_keys="SystemLog.user_id")
    profile_documents = relationship("ProfileDocument", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return f"<User id={self.id} email={self.email!r} role={self.role}>"


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

    required_education_levels = Column(String(255), nullable=False, default="Bachelor's",  server_default="Bachelor's")
    required_fields           = Column(String(255), nullable=False, default="",            server_default="")
    required_min_experience   = Column(Integer, default=0,  server_default="0")
    required_max_experience   = Column(Integer, default=20, server_default="20")
    required_skills           = Column(Text, nullable=False, default="", server_default="")
    required_certifications   = Column(Text, nullable=True)

    job_level       = Column(String(100), nullable=True)
    number_of_posts = Column(Integer, nullable=True)
    # ✅ FIX MODEL-5: timezone=True
    deadline        = Column(DateTime(timezone=True), nullable=True)

    is_active  = Column(Boolean, default=True, server_default="1")
    created_by = Column(Integer, ForeignKey("users.id"))
    # ✅ FIX MODEL-5: timezone=True
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    applications = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return f"<Job id={self.id} title={self.title!r}>"


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ FIX MODEL-11: index=True on FK columns used in WHERE/JOIN on every request.
    #    Without these, PostgreSQL does full-table scans → timeouts on Render → 500.
    applicant_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    job_id       = Column(Integer, ForeignKey("jobs.id"),  nullable=False, index=True)

    # Snapshot of profile fields at submission time
    address          = Column(String(255), nullable=True)
    phone            = Column(String(50),  nullable=True)
    date_of_birth    = Column(String(20),  nullable=True)
    gender           = Column(String(50),  nullable=False,  server_default="")
    education_level  = Column(String(100), nullable=False,  server_default="")
    field_of_study   = Column(String(255), nullable=False,  server_default="")
    graduation_year  = Column(Integer, nullable=False,      server_default="0")
    experience_years = Column(Integer, default=0,           server_default="0")
    skills           = Column(Text, nullable=False,         server_default="")
    certifications   = Column(Text, nullable=True)

    # ✅ FIX MODEL-4: explicit server_default so existing NULL rows don't break .value
    decision = Column(
        SAEnum(DecisionStatus, native_enum=False),
        default=DecisionStatus.pending,
        server_default="pending",
        nullable=False,
    )
    ai_score  = Column(Float,   nullable=True)
    ai_reason = Column(Text,    nullable=True)

    # ✅ FIX MODEL-7: doc_advisory was missing — caused AttributeError in shortlisting
    doc_verified = Column(Boolean, default=False, server_default="0")
    doc_advisory = Column(Boolean, default=False, server_default="0")

    # ✅ FIX MODEL-5: timezone=True on all DateTime columns
    # ✅ FIX MODEL-13: No default= here. default=None fires on INSERT and overwrites
    #    an explicit submitted_at=None passed by the route, causing confusion.
    #    nullable=True is sufficient — set submitted_at explicitly in the route.
    submitted_at   = Column(DateTime(timezone=True), nullable=True)
    shortlisted_at = Column(DateTime(timezone=True), nullable=True)

    # ✅ FIX MODEL-11: Index on submitted_at — used in IS NOT NULL filters everywhere.
    __table_args__ = (
        Index("ix_applications_submitted_at", "submitted_at"),
    )

    applicant = relationship("User",        back_populates="applications")
    job       = relationship("Job",         back_populates="applications")
    documents = relationship(
        "Document", back_populates="application", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return (
            f"<Application id={self.id} applicant_id={self.applicant_id} "
            f"job_id={self.job_id} decision={self.decision}>"
        )


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ FIX MODEL-12: index=True — every document query filters by application_id.
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)
    doc_type       = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename       = Column(String(255), nullable=False)
    original_name  = Column(String(255), nullable=True)
    file_path      = Column(String(512), nullable=False)

    # ✅ FIX MODEL-5 + MODEL-6: timezone=True, onupdate=None prevents accidental mutation
    uploaded_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    application = relationship("Application", back_populates="documents")

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return f"<Document id={self.id} type={self.doc_type} app={self.application_id}>"


class ProfileDocument(Base):
    """
    Stores documents uploaded directly to the user's profile.
    Independent of any job application; used to pre-fill document
    slots when the user applies for a job.
    """
    __tablename__ = "profile_documents"

    id = Column(Integer, primary_key=True, index=True)

    # ✅ FIX MODEL-12: index=True — every profile-doc query filters by user_id.
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doc_type      = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename      = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    file_path     = Column(String(512), nullable=False)

    # ✅ FIX MODEL-5 + MODEL-6: timezone=True, onupdate=None
    uploaded_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    user = relationship("User", back_populates="profile_documents")

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return f"<ProfileDocument id={self.id} type={self.doc_type} user={self.user_id}>"


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
    status     = Column(
        String(20), nullable=False,
        default="success", server_default="success",
        index=True,
    )

    # ✅ FIX MODEL-5: timezone=True
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = relationship("User", back_populates="logs", foreign_keys=[user_id])

    def __repr__(self) -> str:  # ✅ FIX MODEL-10
        return f"<SystemLog id={self.id} action={self.action!r} user={self.user_email!r}>"