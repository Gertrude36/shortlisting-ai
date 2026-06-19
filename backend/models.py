from __future__ import annotations

import enum
from datetime import datetime, timezone
import logging

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    DateTime, ForeignKey, Enum as SAEnum, Index,
)
from sqlalchemy.orm import relationship
from database import Base

logger = logging.getLogger(__name__)


# -- Enumerations --------------------------------------------------------------

class UserRole(str, enum.Enum):
    applicant = "applicant"
    hr        = "hr"
    admin     = "admin"


class DecisionStatus(str, enum.Enum):
    pending         = "pending"
    shortlisted     = "shortlisted"
    not_shortlisted = "not_shortlisted"
    manual_review   = "manual_review"


class DocumentType(str, enum.Enum):
    id_card     = "id_card"
    cv          = "cv"
    diploma     = "diploma"
    certificate = "certificate"
    experience  = "experience"


# -- Auto-migration helper -----------------------------------------------------

def _ensure_is_active_column():
    """
    Automatically add is_active column to users table if it doesn't exist.
    This runs when the module is loaded.
    """
    try:
        from sqlalchemy import inspect, text
        from database import engine

        inspector = inspect(engine)

        if not inspector.has_table("users"):
            return

        columns = [col['name'] for col in inspector.get_columns("users")]

        if 'is_active' not in columns:
            logger.info("[migration] Adding is_active column to users table...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                conn.commit()
                logger.info("[migration] is_active column added successfully")
                conn.execute(text("UPDATE users SET is_active = 1 WHERE is_active IS NULL"))
                conn.commit()
                logger.info("[migration] All existing users set to active")
        else:
            logger.debug("[migration] is_active column already exists")

    except Exception as e:
        logger.warning(f"[migration] Could not add is_active column: {e}")


# -- Models --------------------------------------------------------------------

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

    is_active = Column(Boolean, default=True, server_default="1")

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    applications = relationship(
        "Application",
        back_populates="applicant",
        foreign_keys="[Application.applicant_id]",
    )

    reviewed_applications = relationship(
        "Application",
        foreign_keys="[Application.hr_reviewed_by]",
        back_populates="hr_reviewer",
    )

    logs = relationship("SystemLog", back_populates="user", foreign_keys="[SystemLog.user_id]")
    profile_documents = relationship("ProfileDocument", back_populates="user", cascade="all, delete-orphan")

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

    required_education_levels = Column(Text, nullable=False, default="Bachelor's", server_default="Bachelor's")
    required_fields           = Column(Text, nullable=False, default="", server_default="")

    required_min_experience = Column(Integer, default=0,  server_default="0")
    required_max_experience = Column(Integer, default=20, server_default="20")
    required_skills         = Column(Text, nullable=False, default="", server_default="")
    required_certifications = Column(Text, nullable=True)

    job_level       = Column(String(100), nullable=True)
    number_of_posts = Column(Integer,     nullable=True)
    deadline        = Column(DateTime(timezone=True), nullable=True)

    is_active  = Column(Boolean, default=True, server_default="1")
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")

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
    ocr_confidence_flag = Column(Boolean, default=False, server_default="0", nullable=False)
    ocr_quality_score = Column(Float, nullable=True)

    hr_review_note  = Column(Text,    nullable=True)
    hr_reviewed_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    hr_reviewed_at  = Column(DateTime(timezone=True), nullable=True)

    submitted_at   = Column(DateTime(timezone=True), nullable=True)
    shortlisted_at = Column(DateTime(timezone=True), nullable=True)
    published_at   = Column(DateTime(timezone=True), nullable=True)
    ocr_result     = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_applications_submitted_at", "submitted_at"),
        Index("ix_applications_decision",     "decision"),
    )

    applicant   = relationship("User", back_populates="applications",          foreign_keys=[applicant_id])
    hr_reviewer = relationship("User", back_populates="reviewed_applications",  foreign_keys=[hr_reviewed_by])
    job         = relationship("Job",  back_populates="applications")
    documents   = relationship("Document", back_populates="application", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Application id={self.id} applicant_id={self.applicant_id} job_id={self.job_id} decision={self.decision}>"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False, index=True)
    doc_type       = Column(SAEnum(DocumentType, native_enum=False), nullable=False)
    filename       = Column(String(255), nullable=False)
    original_name  = Column(String(255), nullable=True)
    file_path      = Column(String(512), nullable=False)

    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

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

    # FIX-BUG5: ocr_text was added to the DB via migration (ensure_profile_document_columns)
    # but was missing from the ORM model definition, causing AttributeError whenever
    # code did `getattr(prof_doc, "ocr_text", None)` on a freshly-queried instance.
    # Adding it here makes SQLAlchemy aware of the column so reads/writes work correctly.
    ocr_text = Column(Text, nullable=True)

    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="profile_documents")

    def __repr__(self) -> str:
        return f"<ProfileDocument id={self.id} type={self.doc_type} user={self.user_id}>"


class SystemLog(Base):
    __tablename__ = "system_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String(255), nullable=True)
    user_role  = Column(String(50),  nullable=True)

    action     = Column(String(100), nullable=False, index=True)
    target     = Column(String(255), nullable=True)
    detail     = Column(Text,        nullable=True)
    ip_address = Column(String(64),  nullable=True)
    status     = Column(String(20), nullable=False, default="success", server_default="success", index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User", back_populates="logs", foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<SystemLog id={self.id} action={self.action!r} user={self.user_email!r}>"


# -- Run auto-migration on module load -----------------------------------------
_ensure_is_active_column()