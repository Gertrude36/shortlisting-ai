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
    admin     = "admin"


class DecisionStatus(str, enum.Enum):
    pending         = "pending"
    shortlisted     = "shortlisted"
    not_shortlisted = "not_shortlisted"
    manual_review   = "manual_review"   # ✅ FIX MODEL-19


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

    phone       = Column(String(50),  nullable=True)
    address     = Column(String(255), nullable=True)
    national_id = Column(String(50),  nullable=True)

    role = Column(
        SAEnum(UserRole, native_enum=False),
        nullable=False,
        default=UserRole.applicant,
        server_default="applicant",
    )
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # ✅ FIX MODEL-23: foreign_keys explicitly set to resolve ambiguity.
    # Application has TWO FKs to users (applicant_id + hr_reviewed_by),
    # so SQLAlchemy needs to be told which one this relationship uses.
    applications = relationship(
        "Application",
        back_populates="applicant",
        foreign_keys="[Application.applicant_id]",
    )

    # HR officer who reviewed applications — back-ref for hr_reviewed_by FK.
    # primaryjoin clarifies this is the OTHER FK path.
    reviewed_applications = relationship(
        "Application",
        foreign_keys="[Application.hr_reviewed_by]",
        back_populates="hr_reviewer",
    )

    logs              = relationship(
        "SystemLog",
        back_populates="user",
        foreign_keys="[SystemLog.user_id]",
    )
    profile_documents = relationship(
        "ProfileDocument",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"


class Job(Base):
    __tablename__ = "jobs"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)

    location         = Column(Text,        nullable=True)
    employment_type  = Column(String(100), nullable=True)
    salary_range     = Column(String(100), nullable=True)
    responsibilities = Column(Text,        nullable=True)
    preferred_qualifications = Column(Text, nullable=True)
    about_role               = Column(Text, nullable=True)

    required_education_levels = Column(Text, nullable=False, default="Bachelor's",  server_default="Bachelor's")
    required_fields           = Column(Text, nullable=False, default="",            server_default="")

    required_min_experience = Column(Integer, default=0,  server_default="0")
    required_max_experience = Column(Integer, default=20, server_default="20")
    required_skills         = Column(Text, nullable=False, default="", server_default="")
    required_certifications = Column(Text, nullable=True)

    job_level       = Column(String(100), nullable=True)
    number_of_posts = Column(Integer,     nullable=True)
    deadline        = Column(DateTime(timezone=True), nullable=True)

    is_active  = Column(Boolean, default=True, server_default="1")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    applications = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id} title={self.title!r}>"


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)

    applicant_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    job_id       = Column(Integer, ForeignKey("jobs.id"),  nullable=False, index=True)

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

    decision = Column(
        SAEnum(DecisionStatus, native_enum=False),
        default=DecisionStatus.pending,
        server_default="pending",
        nullable=False,
    )
    ai_score  = Column(Float, nullable=True)
    ai_reason = Column(Text,  nullable=True)

    doc_verified = Column(Boolean, default=False, server_default="0")
    doc_advisory = Column(Boolean, default=False, server_default="0")

    # ✅ FIX MODEL-17: OCR confidence flag
    ocr_confidence_flag = Column(Boolean, default=False, server_default="0", nullable=False)

    # ✅ FIX MODEL-18: Average OCR quality score (0–100)
    ocr_quality_score = Column(Float, nullable=True)

    # ✅ FIX MODEL-20/21/22: HR manual review fields
    hr_review_note  = Column(Text,    nullable=True)
    hr_reviewed_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    hr_reviewed_at  = Column(DateTime(timezone=True), nullable=True)

    submitted_at   = Column(DateTime(timezone=True), nullable=True)
    shortlisted_at = Column(DateTime(timezone=True), nullable=True)

    # Cached OCR result JSON
    ocr_result = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_applications_submitted_at", "submitted_at"),
        Index("ix_applications_decision",     "decision"),
    )

    # ✅ FIX MODEL-23: explicit foreign_keys on BOTH sides of each relationship.
    # applicant_id path:
    applicant = relationship(
        "User",
        back_populates="applications",
        foreign_keys=[applicant_id],
    )
    # hr_reviewed_by path:
    hr_reviewer = relationship(
        "User",
        back_populates="reviewed_applications",
        foreign_keys=[hr_reviewed_by],
    )

    job = relationship("Job", back_populates="applications")
    documents = relationship(
        "Document", back_populates="application", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Application id={self.id} applicant_id={self.applicant_id} "
            f"job_id={self.job_id} decision={self.decision}>"
        )


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)
    doc_type       = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename       = Column(String(255), nullable=False)
    original_name  = Column(String(255), nullable=True)
    file_path      = Column(String(512), nullable=False)

    uploaded_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    # ✅ FIX MODEL-24: Suppress SAWarning when a concurrent DELETE already
    # removed the row before this session's DELETE executes.
    # This is safe because the DELETE endpoint checks existence first (404 guard).
    __mapper_args__ = {"confirm_deleted_rows": False}

    application = relationship("Application", back_populates="documents")

    def __repr__(self) -> str:
        return f"<Document id={self.id} type={self.doc_type} app={self.application_id}>"


class ProfileDocument(Base):
    __tablename__ = "profile_documents"

    id = Column(Integer, primary_key=True, index=True)

    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doc_type      = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename      = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    file_path     = Column(String(512), nullable=False)

    uploaded_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=None,
    )

    user = relationship("User", back_populates="profile_documents")

    def __repr__(self) -> str:
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

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user = relationship(
        "User",
        back_populates="logs",
        foreign_keys=[user_id],
    )

    def __repr__(self) -> str:
        return f"<SystemLog id={self.id} action={self.action!r} user={self.user_email!r}>"