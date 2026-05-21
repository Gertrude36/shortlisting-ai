"""
backend/models.py  ·  v2.2.0
────────────────────────────────────────────────────────────────
ALL PREVIOUS FIXES RETAINED (FIX MODEL-1 through FIX MODEL-13).

NEW IN v2.2.0:

  ✅ FIX MODEL-14 (CRITICAL — 500 FIX) — Added national_id column to the
     User model. main.py v6.6.0 references current_user.national_id in
     /auth/me, PUT /profile, and _build_profile_response(), but models.py
     never defined the column on the ORM class. SQLAlchemy's attribute
     lookup raised:

       AttributeError: 'User' object has no attribute 'national_id'

     which was caught by the CORSFallback middleware and logged, then
     returned as a 500. The frontend received 500 on GET /auth/me after
     every login, which prevented AuthContext from confirming the user
     was authenticated — so the app stayed on the login page even though
     the login POST itself returned 200 OK.

     Fix: add national_id = Column(String(50), nullable=True) to User,
     consistent with the runtime migration in ensure_user_profile_columns().
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
    phone      = Column(String(50),  nullable=True)
    address    = Column(String(255), nullable=True)

    # ✅ FIX MODEL-14 (CRITICAL): national_id was referenced in main.py v6.6.0
    # (in /auth/me, PUT /profile, and _build_profile_response) but was missing
    # from the ORM model. This caused:
    #   AttributeError: 'User' object has no attribute 'national_id'
    # on every GET /auth/me call after login → 500 → frontend stuck on login page.
    # The runtime migration in ensure_user_profile_columns() already adds the DB
    # column; this line registers it with SQLAlchemy's ORM so attribute access works.
    national_id = Column(String(50),  nullable=True)

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
    # ✅ FIX MODEL-13: No default= here. nullable=True is sufficient.
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