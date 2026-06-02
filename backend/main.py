from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from datetime import datetime, timezone, timedelta
from typing import Tuple, Optional, List, Callable
import uuid
import shutil
import threading
import concurrent.futures
import time
import os
from contextlib import asynccontextmanager

from fastapi import (
    FastAPI, Depends, HTTPException, status,
    UploadFile, File, Form, Request
)
from fastapi.middleware.cors import CORSMiddleware as FastAPICORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text, or_, desc, func
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.types import ASGIApp, Receive, Scope, Send

load_dotenv()

from database import engine, get_db, Base

try:
    from database import SessionLocal
except ImportError:
    SessionLocal = None
    print("[main] ⚠️  Could not import SessionLocal — shortlist-all will fail.")

from models import (
    User, Job, Application, Document, ProfileDocument,
    SystemLog, UserRole, DecisionStatus, DocumentType,
)
from schemas import (
    RegisterRequest, LoginRequest, TokenResponse,
    JobCreate, JobResponse,
    ApplicationCreate, ApplicationResponse,
    CandidateListItem, ShortlistResult,
    DocumentOut,
)
from auth import (
    hash_password, verify_password, create_access_token,
    create_reset_token, verify_reset_token,
    get_current_user, require_hr, require_applicant,
    require_admin, require_hr_or_admin,
)
from email_utils import send_reset_email, send_hr_invite_email


# ─────────────────────────────────────────────────────────────────────────────
# Timeout / feature flags
# ─────────────────────────────────────────────────────────────────────────────

CANDIDATE_TIMEOUT_SECONDS    = 150
OCR_TIMEOUT_SECONDS          = 20
OCR_CANDIDATE_BUDGET_SECONDS = 60
UPLOAD_OCR_TIMEOUT_SECONDS   = int(os.getenv("UPLOAD_OCR_TIMEOUT", "120"))

OCR_ENABLED     = os.getenv("ENABLE_OCR", "true").lower() == "true"
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5050")

def _ocr_is_enabled() -> bool:
    return True   # OCR service is running

if not OCR_ENABLED:
    print("[main] ⚠️  OCR is DISABLED via ENABLE_OCR=false.")


# ─────────────────────────────────────────────────────────────────────────────
# In-memory job-processing status
# ─────────────────────────────────────────────────────────────────────────────

_JOB_STATUS: dict[int, dict] = {}
_JOB_STATUS_LOCK = threading.Lock()

_JOB_LOCKS: dict[int, threading.Lock] = {}
_JOB_LOCKS_LOCK = threading.Lock()

def _get_job_lock(job_id: int) -> threading.Lock:
    with _JOB_LOCKS_LOCK:
        if job_id not in _JOB_LOCKS:
            _JOB_LOCKS[job_id] = threading.Lock()
        return _JOB_LOCKS[job_id]

_APP_OCR_STATUS: dict[int, dict] = {}
_APP_OCR_LOCK = threading.Lock()


def _set_job_status(job_id: int, **kwargs) -> None:
    with _JOB_STATUS_LOCK:
        current = _JOB_STATUS.get(job_id, {})
        current.update(kwargs)
        _JOB_STATUS[job_id] = current


def _get_job_status(job_id: int) -> dict:
    with _JOB_STATUS_LOCK:
        return dict(_JOB_STATUS.get(job_id, {}))


def _set_app_ocr_status(app_id: int, **kwargs) -> None:
    with _APP_OCR_LOCK:
        current = _APP_OCR_STATUS.get(app_id, {})
        current.update(kwargs)
        _APP_OCR_STATUS[app_id] = current


def _get_app_ocr_status(app_id: int) -> dict:
    with _APP_OCR_LOCK:
        return dict(_APP_OCR_STATUS.get(app_id, {}))


# ─────────────────────────────────────────────────────────────────────────────
# Audit log helper
# ─────────────────────────────────────────────────────────────────────────────

def _log(
    db,
    action:      str,
    *,
    user         = None,
    user_id      = None,
    user_email   = None,
    user_role    = None,
    target       = None,
    detail       = None,
    ip           = None,
    status: str  = "success",
):
    try:
        uid   = user.id    if user else user_id
        email = user.email if user else user_email
        role  = user.role.value if user else user_role
        entry = SystemLog(
            user_id=uid, user_email=email, user_role=role,
            action=action, target=target, detail=detail,
            ip_address=ip, status=status,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        print(f"[audit_log] ⚠️  Failed to write log ({action}): {exc!r}")


def _ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─────────────────────────────────────────────────────────────────────────────
# Lazy ML module references
# ─────────────────────────────────────────────────────────────────────────────

_predict               = None
_verify_documents      = None
_pre_submission_check  = None
_extract_document_text = None
_check_image_quality_strict = None
_ML_LOAD_ERROR: "str | None" = None


def _load_ml_modules() -> None:
    global _predict, _verify_documents, _pre_submission_check, _extract_document_text
    global _ML_LOAD_ERROR, _check_image_quality_strict
    try:
        from shortlisting_engine import predict as _p
        _predict = _p
        print("[ml_loader] ✅ shortlisting_engine loaded.")
    except Exception as exc:
        _ML_LOAD_ERROR = str(exc)
        print(f"[ml_loader] ⚠️  shortlisting_engine import failed: {exc!r}")
    try:
        from document_verifier import verify_documents as _vd, pre_submission_check as _psc
        _verify_documents     = _vd
        _pre_submission_check = _psc
        print("[ml_loader] ✅ document_verifier loaded.")
    except Exception as exc:
        if not _ML_LOAD_ERROR:
            _ML_LOAD_ERROR = str(exc)
        print(f"[ml_loader] ⚠️  document_verifier import failed: {exc!r}")
    try:
        from ocr_utils import extract_document_text as _edt, check_image_quality_strict as _ciq
        _extract_document_text      = _edt
        _check_image_quality_strict = _ciq
        print("[ml_loader] ✅ ocr_utils loaded.")
    except Exception as exc:
        print(f"[ml_loader] ⚠️  ocr_utils import failed: {exc!r}")


def _call_predict(app_obj, job, doc_texts=None, document_paths=None, declared_types=None,
                  ocr_quality_score=None):
    if _predict is None:
        raise HTTPException(
            status_code=503,
            detail="AI shortlisting engine is still loading. Please retry in a few seconds."
        )
    return _predict(
        app_obj, job,
        doc_texts=doc_texts,
        document_paths=document_paths,
        declared_types=declared_types,
        ocr_quality_score=ocr_quality_score,
    )


def _call_verify_documents(cached_doc_texts: dict | None = None, **kwargs):
    if _verify_documents is None:
        return True, False, "Document verification module loading — accepted."
    return _verify_documents(cached_doc_texts=cached_doc_texts, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# Document rejection classifier
# ─────────────────────────────────────────────────────────────────────────────

def _classify_rejection(message: str) -> str:
    lower = message.lower()
    _TYPE_MISMATCH_PHRASES = ["you declared this as", "declared this as"]
    is_type_mismatch = any(phrase in lower for phrase in _TYPE_MISMATCH_PHRASES)
    _ID_SECURITY_PHRASES = [
        "image is blurred", "some words are not being detected",
        "no national id or passport keywords", "upload a clear photo or scan of your national id",
        "upload your actual national id", "unknown_non_id", "no id keywords",
        "id card does not appear",
    ]
    is_id_security_reject = any(phrase in lower for phrase in _ID_SECURITY_PHRASES)
    if is_type_mismatch and not is_id_security_reject:
        return "type_mismatch"
    _NAME_MISMATCH_PHRASES = [
        "name could not be found", "name not found", "does not belong to you",
        "identity mismatch", "identity verification failed",
        "this cv does not appear to belong to you", "this id card does not appear to belong to you",
        "this diploma does not appear to belong to you", "your name could not be found",
        "not found in this document", "not found in any readable document",
        "possible use of another person", "cv rejected:", "diploma rejected:",
    ]
    if any(phrase in lower for phrase in _NAME_MISMATCH_PHRASES):
        return "name_mismatch_soft"
    _FIELD_MISMATCH_PHRASES = [
        "field mismatch", "field of study", "diploma does not appear to confirm this field",
        "upload the correct degree certificate",
    ]
    if any(phrase in lower for phrase in _FIELD_MISMATCH_PHRASES):
        return "field_mismatch"
    _EDU_MISMATCH_PHRASES = [
        "education level mismatch", "uploaded diploma as",
        "upload the certificate matching your declared qualification",
    ]
    if any(phrase in lower for phrase in _EDU_MISMATCH_PHRASES):
        return "edu_mismatch"
    _QUALITY_PHRASES = [
        "blurry", "too dark", "overexposed", "low resolution", "unreadable",
        "could not be read clearly", "sharpness score", "brightness:",
        "readable characters were extracted", "minimum required:", "scan quality is too low",
        "resolution is too low", "appears blank",
    ]
    if any(phrase in lower for phrase in _QUALITY_PHRASES):
        return "quality"
    if is_id_security_reject:
        return "id_rejected"
    _HARD_REJECT_PHRASES = [
        "file could not be read from disk", "cv rejected", "identity verification failed",
    ]
    if any(phrase in lower for phrase in _HARD_REJECT_PHRASES):
        return "hard_reject"
    return "hard_reject"


def _run_pre_submission_check(
    file_path:       str,
    declared_type:   str,
    applicant_name:  str,
    field_of_study:  str = "",
    education_level: str = "",
) -> tuple[bool, str]:
    if not _ocr_is_enabled():
        return True, f"✓ '{declared_type}' uploaded (OCR disabled)."
    if _pre_submission_check is None:
        return True, f"✓ '{declared_type}' uploaded (verifier loading)."
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(
                _pre_submission_check,
                file_path, declared_type, applicant_name,
                field_of_study, education_level,
                False,
            )
            accepted, message = fut.result(timeout=UPLOAD_OCR_TIMEOUT_SECONDS)
        if accepted:
            return True, message
        rejection_type = _classify_rejection(message)
        print(f"[upload_verify] Rejection type='{rejection_type}': {message}")
        if rejection_type == "name_mismatch_soft":
            return True, (
                f"✓ '{declared_type}' accepted – name will be re-checked during shortlisting. "
                f"(Note: {message})"
            )
        elif rejection_type == "type_mismatch":
            return True, (
                f"✓ '{declared_type}' received. "
                "Document type will be verified during shortlisting."
            )
        elif rejection_type in ("field_mismatch", "edu_mismatch"):
            return True, (
                f"✓ '{declared_type}' received. "
                "Field of study and education level will be fully verified during shortlisting."
            )
        else:
            return False, message
    except concurrent.futures.TimeoutError:
        return True, f"✓ '{declared_type}' received – OCR taking longer, will complete in background."
    except Exception as exc:
        print(f"[upload_verify] ⚠️  pre_submission_check error: {exc!r}")
        return True, f"✓ '{declared_type}' received – verification encountered an issue and will be retried."


def _run_pre_submission_check_with_cached_text(
    file_path:       str,
    declared_type:   str,
    applicant_name:  str,
    cached_ocr_text: str,
    field_of_study:  str = "",
    education_level: str = "",
) -> tuple[bool, str]:
    if not cached_ocr_text or not cached_ocr_text.strip():
        return _run_pre_submission_check(
            file_path, declared_type, applicant_name, field_of_study, education_level,
        )
    if not _ocr_is_enabled():
        return True, f"✓ '{declared_type}' validated (OCR disabled)."
    if _pre_submission_check is None:
        return _quick_check_with_text(
            cached_ocr_text, declared_type, applicant_name, field_of_study, education_level,
        )
    try:
        import document_verifier as _dv
        import ocr_utils as _ou
        original_extract = getattr(_ou, "extract_document_text", None)
        text_to_return   = cached_ocr_text
        def _cached_extractor(path: str, fast_mode: bool = False, declared_type: str = "") -> str:
            return text_to_return
        _ou.extract_document_text = _cached_extractor
        _dv_original = getattr(_dv, "extract_document_text", None)
        if hasattr(_dv, "extract_document_text"):
            _dv.extract_document_text = _cached_extractor
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                fut = ex.submit(
                    _pre_submission_check,
                    file_path, declared_type, applicant_name,
                    field_of_study, education_level,
                    False,
                )
                accepted, message = fut.result(timeout=30)
                if not accepted:
                    rejection_type = _classify_rejection(message)
                    if rejection_type == "name_mismatch_soft":
                        return True, f"✓ '{declared_type}' attached – name will be re-checked later."
                    elif rejection_type == "type_mismatch":
                        return True, f"✓ '{declared_type}' attached. Document type will be verified during shortlisting."
                    elif rejection_type in ("field_mismatch", "edu_mismatch"):
                        return True, f"✓ '{declared_type}' attached. Field and education level will be verified during shortlisting."
                    else:
                        return False, message
                return True, message
        finally:
            if original_extract is not None:
                _ou.extract_document_text = original_extract
            if _dv_original is not None and hasattr(_dv, "extract_document_text"):
                _dv.extract_document_text = _dv_original
    except concurrent.futures.TimeoutError:
        return True, f"✓ '{declared_type}' attached from profile (verification in background)."
    except Exception as exc:
        print(f"[attach_verify] ⚠️  Cached-text check error: {exc!r}")
        return _run_pre_submission_check(
            file_path, declared_type, applicant_name, field_of_study, education_level,
        )


def _quick_check_with_text(
    ocr_text: str, declared_type: str, applicant_name: str,
    field_of_study: str, education_level: str,
) -> tuple[bool, str]:
    if not ocr_text.strip():
        return True, f"Your '{declared_type}' document could not be read fully, but it has been accepted for background verification."
    readable = len(re.sub(r"[\s|_\-~`^\\]", "", ocr_text))
    if readable < 40:
        return True, f"Your '{declared_type}' document appears to have low text quality ({readable} chars), but it has been accepted."
    return True, f"✓ '{declared_type}' validated (basic check passed)."


# ─────────────────────────────────────────────────────────────────────────────
# Background OCR helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_profile_doc_and_cache(profile_doc_id: int) -> None:
    if SessionLocal is None or not _ocr_is_enabled():
        return
    db = SessionLocal()
    try:
        prof_doc = db.query(ProfileDocument).filter(ProfileDocument.id == profile_doc_id).first()
        if not prof_doc or not os.path.exists(prof_doc.file_path):
            return
        if prof_doc.ocr_text and prof_doc.ocr_text.strip():
            return
        doc_type = str(prof_doc.doc_type.value if hasattr(prof_doc.doc_type, "value") else prof_doc.doc_type)
        print(f"[profile_ocr] Extracting text for profile doc {profile_doc_id} ({doc_type}) …")
        extracted_text = ""
        if _extract_document_text is not None:
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                    fut = ex.submit(_extract_document_text, prof_doc.file_path)
                    extracted_text = fut.result(timeout=90) or ""
            except Exception as exc:
                print(f"[profile_ocr] ⚠️  OCR error for profile doc {profile_doc_id}: {exc!r}")
        try:
            prof_doc.ocr_text = extracted_text
            db.add(prof_doc)
            db.commit()
        except Exception as exc:
            print(f"[profile_ocr] ⚠️  Failed to cache OCR text: {exc!r}")
            try: db.rollback()
            except Exception: pass
    except Exception as exc:
        print(f"[profile_ocr] ⚠️  Unhandled error for profile doc {profile_doc_id}: {exc!r}")
        try: db.rollback()
        except Exception: pass
    finally:
        db.close()


def _extract_all_doc_texts(
    docs: list,
    budget_seconds: float = OCR_CANDIDATE_BUDGET_SECONDS,
) -> dict[str, str]:
    doc_texts: dict[str, str] = {}
    ocr_start = time.monotonic()
    if not _ocr_is_enabled():
        return {_doc_type_value(d): "" for d in docs}
    for d in docs:
        doc_type  = _doc_type_value(d)
        if not os.path.exists(d.file_path):
            doc_texts.setdefault(doc_type, "")
            continue
        elapsed   = time.monotonic() - ocr_start
        remaining = budget_seconds - elapsed
        if remaining <= 2:
            doc_texts.setdefault(doc_type, "")
            continue
        if _extract_document_text is None:
            doc_texts.setdefault(doc_type, "")
            continue
        per_doc_limit = min(OCR_TIMEOUT_SECONDS, remaining)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(_extract_document_text, d.file_path)
            try:
                text_result = fut.result(timeout=per_doc_limit) or ""
            except concurrent.futures.TimeoutError:
                text_result = ""
            except Exception as exc:
                print(f"[ocr_error] ⚠️  OCR failed for {doc_type}: {exc!r}")
                text_result = ""
        doc_texts[doc_type] = text_result
    return doc_texts


def _normalize_text(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", str(t))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).lower().strip()


def _compare_form_vs_docs(
    applicant_name: str,
    education_level: str,
    field_of_study: str,
    skills: str,
    doc_texts: dict[str, str],
) -> tuple[list[str], list[str], list[str]]:
    matches: list[str] = []
    mismatches: list[str] = []
    warnings: list[str] = []
    id_text      = _normalize_text(doc_texts.get("id_card", "") or "")
    diploma_text = _normalize_text(doc_texts.get("diploma", "") or "")
    cv_text      = _normalize_text(doc_texts.get("cv", "")      or "")
    MIN_CHARS    = 80
    if id_text and len(id_text) >= MIN_CHARS:
        name_norm    = _normalize_text(applicant_name)
        name_tokens  = [t for t in name_norm.split() if len(t) > 2]
        found_tokens = sum(1 for t in name_tokens if t in id_text)
        if name_tokens:
            ratio = found_tokens / len(name_tokens)
            if ratio >= 0.5:
                matches.append(f"✅ Name '{applicant_name}' confirmed in ID card ({found_tokens}/{len(name_tokens)} tokens found).")
            else:
                mismatches.append(f"⚠️  Name mismatch: '{applicant_name}' not clearly found in ID card (only {found_tokens}/{len(name_tokens)} tokens matched).")
    else:
        warnings.append("⚠️  ID card text could not be extracted — name verification skipped.")
    if diploma_text and len(diploma_text) >= MIN_CHARS:
        edu_keywords = {
            "diploma":    ["diploma", "hnd", "hnc", "technician"],
            "bachelor's": ["bachelor", "bsc", "b.sc", "beng", "undergraduate", "honours", "hons"],
            "master's":   ["master", "msc", "m.sc", "mba", "postgrad"],
            "phd":        ["doctor of philosophy", "ph.d", "phd", "doctorate"],
        }
        edu_norm  = _normalize_text(education_level)
        kws       = edu_keywords.get(edu_norm, [edu_norm])
        found_edu = any(k in diploma_text for k in kws)
        if found_edu:
            matches.append(f"✅ Education level '{education_level}' confirmed in diploma.")
        else:
            mismatches.append(f"⚠️  Education level '{education_level}' not clearly found in diploma.")
    else:
        warnings.append("⚠️  Diploma text could not be extracted — education level verification skipped.")
    if diploma_text and len(diploma_text) >= MIN_CHARS and field_of_study:
        field_norm   = _normalize_text(field_of_study)
        field_tokens = [t for t in field_norm.split() if len(t) >= 4]
        found_field  = any(t in diploma_text for t in field_tokens) if field_tokens else (field_norm in diploma_text)
        if found_field:
            matches.append(f"✅ Field of study '{field_of_study}' confirmed in diploma.")
        else:
            mismatches.append(f"⚠️  Field of study '{field_of_study}' not clearly found in diploma.")
    if cv_text and len(cv_text) >= MIN_CHARS and skills:
        skill_list   = [_normalize_text(s) for s in re.split(r"[,\n;|]+", skills) if s.strip()]
        found_skills = [s for s in skill_list if s and s in cv_text]
        if skill_list:
            ratio = len(found_skills) / len(skill_list)
            if ratio >= 0.4:
                matches.append(f"✅ Skills verified: {len(found_skills)}/{len(skill_list)} declared skills ({ratio*100:.0f}%) found in CV.")
            else:
                mismatches.append(f"⚠️  Only {len(found_skills)}/{len(skill_list)} declared skills ({ratio*100:.0f}%) found in CV.")
    elif not cv_text or len(cv_text) < MIN_CHARS:
        warnings.append("⚠️  CV text could not be extracted — skills verification skipped.")
    return matches, mismatches, warnings


def _extract_national_id_from_text(id_text: str) -> str:
    patterns = [
        r"\b(?:NIN|ID\s*No\.?|ID\s*Number|Identification\s*Number)[:\s#]*([A-Z0-9]{6,20})\b",
        r"\b([0-9]{16})\b",
        r"\b([A-Z]{1,3}[0-9]{6,10})\b",
    ]
    for pat in patterns:
        m = re.search(pat, id_text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


def _post_submit_ocr_verify(application_id: int) -> None:
    if SessionLocal is None:
        return
    _set_app_ocr_status(application_id, running=True, done=False, result=None)
    db = SessionLocal()
    try:
        app_obj = db.query(Application).filter(Application.id == application_id).first()
        if not app_obj:
            _set_app_ocr_status(application_id, running=False, done=True, result={"error": "application not found"})
            return
        user = db.query(User).filter(User.id == app_obj.applicant_id).first()
        if not user:
            _set_app_ocr_status(application_id, running=False, done=True, result={"error": "user not found"})
            return
        docs      = db.query(Document).filter(Document.application_id == application_id).all()
        doc_texts = _extract_all_doc_texts(docs, budget_seconds=OCR_CANDIDATE_BUDGET_SECONDS)
        VERIFIABLE = {"id_card", "cv", "diploma", "certificate"}
        doc_types  = [_doc_type_value(d) for d in docs]
        doc_paths  = [d.file_path for d in docs]
        v_paths    = [p for p, t in zip(doc_paths, doc_types) if t in VERIFIABLE]
        v_types    = [t for t in doc_types if t in VERIFIABLE]
        verified   = True
        advisory   = False
        verify_summary = "OCR verification skipped."
        if _ocr_is_enabled() and _verify_documents is not None:
            try:
                verified, advisory, verify_summary = _call_verify_documents(
                    cached_doc_texts=doc_texts,
                    applicant_name=user.full_name,
                    education_level=app_obj.education_level or "",
                    field_of_study=app_obj.field_of_study or "",
                    document_paths=v_paths,
                    declared_types=v_types,
                )
            except Exception as exc:
                print(f"[ocr_verify] verify_documents error: {exc!r}")
                verified = True; advisory = True
                verify_summary = f"Verification encountered an error: {exc}"
            if _ocr_is_enabled() and v_types and not advisory:
                _empty_types = [t for t in v_types if not (doc_texts.get(t) or "").strip()]
                if len(_empty_types) == len(v_types):
                    advisory = True
                    verify_summary = (
                        "⚠ Advisory: OCR could not extract text from any uploaded document "
                        f"({', '.join(v_types)}). Please re-upload clearer scans."
                    )
        matches, mismatches, warnings_list = _compare_form_vs_docs(
            applicant_name=user.full_name,
            education_level=app_obj.education_level or "",
            field_of_study=app_obj.field_of_study or "",
            skills=app_obj.skills or "",
            doc_texts=doc_texts,
        )
        profile_updated: list[str] = []
        id_text = doc_texts.get("id_card", "") or ""
        if not user.national_id and id_text:
            extracted_nid = _extract_national_id_from_text(id_text)
            if extracted_nid:
                user.national_id = extracted_nid
                profile_updated.append(f"national_id={extracted_nid}")
        if not user.address and app_obj.address:
            user.address = app_obj.address
            profile_updated.append(f"address={app_obj.address}")
        if not user.phone and app_obj.phone:
            user.phone = app_obj.phone
            profile_updated.append(f"phone={app_obj.phone}")
        if profile_updated:
            db.add(user)
        storable_texts = {k: v for k, v in doc_texts.items() if v and v.strip()}
        ocr_result = {
            "ocr_done": True, "verified": verified, "advisory": advisory,
            "verify_summary": verify_summary, "matches": matches,
            "mismatches": mismatches, "warnings": warnings_list,
            "profile_updated": profile_updated,
            "doc_texts": storable_texts,
            "doc_texts_len": {k: len(v) for k, v in doc_texts.items()},
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            app_obj.ocr_result = json.dumps(ocr_result, ensure_ascii=False)
        except AttributeError:
            pass
        app_obj.doc_verified = verified
        app_obj.doc_advisory = advisory
        db.add(app_obj)
        db.commit()
        _set_app_ocr_status(application_id, running=False, done=True, result=ocr_result)
        print(f"[ocr_verify] ✅ app={application_id} verified={verified} advisory={advisory} matches={len(matches)} mismatches={len(mismatches)}")
    except Exception as exc:
        print(f"[ocr_verify] ⚠️  Unhandled error for app {application_id}: {exc!r}")
        _set_app_ocr_status(application_id, running=False, done=True, result={"error": str(exc)})
        try: db.rollback()
        except Exception: pass
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Background shortlisting worker
# ─────────────────────────────────────────────────────────────────────────────

_STEP_LOADING_OCR = "loading_ocr"
_STEP_RUNNING_AI  = "running_ai"
_STEP_SAVING      = "saving"
_STEP_DONE        = "done"


def _process_one_candidate(application_id: int, job_id: int) -> dict:
    if SessionLocal is None:
        return {"application_id": application_id, "error": "SessionLocal unavailable"}
    db = SessionLocal()
    try:
        app_obj = db.query(Application).filter(Application.id == application_id).first()
        if not app_obj:
            return {"application_id": application_id, "error": "Application not found"}
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"application_id": application_id, "error": "Job not found"}

        doc_texts: dict[str, str] = {}
        ocr_already_done = False
        stored_ocr_quality: float | None = None

        raw_ocr = getattr(app_obj, "ocr_result", None)
        if raw_ocr:
            try:
                ocr_data = json.loads(raw_ocr)
                stored_texts = ocr_data.get("doc_texts", {}) or {}
                ocr_already_done = ocr_data.get("ocr_done", False)
                stored_ocr_quality = ocr_data.get("ocr_quality_score", None)
                has_real_text = any(isinstance(v, str) and v.strip() for v in stored_texts.values())
                if has_real_text:
                    doc_texts = stored_texts
                else:
                    ocr_already_done = False
                    doc_texts = {}
            except Exception as exc:
                print(f"[shortlist_worker] app={application_id} failed to parse ocr_result: {exc!r}")
                doc_texts = {}
                ocr_already_done = False

        if not doc_texts:
            docs      = db.query(Document).filter(Document.application_id == application_id).all()
            doc_texts = _extract_all_doc_texts(docs, budget_seconds=OCR_CANDIDATE_BUDGET_SECONDS)

        if ocr_already_done:
            decision, score, reason_json, doc_result = _call_predict(
                app_obj, job,
                doc_texts=doc_texts if doc_texts else None,
                document_paths=None,
                declared_types=None,
                ocr_quality_score=stored_ocr_quality,
            )
        else:
            VERIFIABLE = {"id_card", "cv", "diploma", "certificate"}
            docs_all   = db.query(Document).filter(Document.application_id == application_id).all()
            doc_types  = [_doc_type_value(d) for d in docs_all]
            doc_paths  = [d.file_path for d in docs_all]
            v_paths    = [p for p, t in zip(doc_paths, doc_types) if t in VERIFIABLE]
            v_types    = [t for t in doc_types if t in VERIFIABLE]
            decision, score, reason_json, doc_result = _call_predict(
                app_obj, job,
                doc_texts=doc_texts if doc_texts else None,
                document_paths=v_paths if v_paths else None,
                declared_types=v_types if v_types else None,
                ocr_quality_score=stored_ocr_quality,
            )

        app_obj.decision       = DecisionStatus(decision)
        app_obj.ai_score       = round(score, 4) if score is not None else None
        app_obj.ai_reason      = reason_json
        app_obj.doc_verified   = doc_result.get("verified", False)
        app_obj.doc_advisory   = doc_result.get("advisory", False)
        app_obj.shortlisted_at = datetime.now(timezone.utc)
        db.add(app_obj)
        db.commit()

        score_str = f"{score:.3f}" if score is not None else "N/A"
        print(f"[shortlist_worker] app={application_id} → {decision} score={score_str}")
        return {
            "application_id": application_id,
            "decision":       decision,
            "score":          score,
            "doc_verified":   doc_result.get("verified", False),
            "doc_advisory":   doc_result.get("advisory", False),
        }
    except HTTPException as exc:
        try: db.rollback()
        except Exception: pass
        return {"application_id": application_id, "error": exc.detail}
    except Exception as exc:
        print(f"[shortlist_worker] ⚠️  app={application_id} error: {exc!r}")
        try: db.rollback()
        except Exception: pass
        return {"application_id": application_id, "error": str(exc)}
    finally:
        db.close()


def _process_one_candidate_with_badges(
    application_id: int,
    job_id: int,
    candidate_name: str,
) -> dict:
    _set_job_status(job_id, current_step=_STEP_RUNNING_AI, current_candidate_name=candidate_name)
    result = _process_one_candidate(application_id, job_id)
    _set_job_status(job_id, current_step=_STEP_SAVING, current_candidate_name=candidate_name)
    return result


def _run_shortlist_all(job_id: int) -> None:
    if SessionLocal is None:
        _set_job_status(job_id, running=False, done=True, error="SessionLocal unavailable")
        return
    try:
        db = SessionLocal()
        try:
            rows = (
                db.query(Application.id, User.full_name)
                .join(User, Application.applicant_id == User.id)
                .filter(
                    Application.job_id == job_id,
                    Application.submitted_at.isnot(None),
                )
                .all()
            )
            app_id_name_pairs = [(row[0], row[1]) for row in rows]
        finally:
            db.close()
    except Exception as exc:
        print(f"[shortlist_all] ⚠️  Failed to fetch application list for job={job_id}: {exc!r}")
        _set_job_status(job_id, running=False, done=True, error=str(exc))
        return

    total = len(app_id_name_pairs)
    _set_job_status(
        job_id,
        running=True,
        done=False,
        total=total,
        processed=0,
        done_count=0,
        shortlisted=0,
        not_shortlisted=0,
        errors=0,
        current_step=_STEP_LOADING_OCR,
        current_candidate_name="",
        results=[],
    )
    results = []
    shortlisted_count   = 0
    not_shortlisted_count = 0
    error_count         = 0

    for i, (app_id, candidate_name) in enumerate(app_id_name_pairs):
        _set_job_status(
            job_id,
            current_step=_STEP_LOADING_OCR,
            current_candidate_name=candidate_name or f"Candidate #{i+1}",
            processed=i,
            done_count=i,
        )
        result = _process_one_candidate_with_badges(app_id, job_id, candidate_name or f"Candidate #{i+1}")
        results.append(result)
        if "error" in result:
            error_count += 1
        elif result.get("decision") == "shortlisted":
            shortlisted_count += 1
        else:
            not_shortlisted_count += 1

        _set_job_status(
            job_id,
            processed=i + 1,
            done_count=i + 1,
            shortlisted=shortlisted_count,
            not_shortlisted=not_shortlisted_count,
            errors=error_count,
            current_step=_STEP_DONE if i + 1 == total else _STEP_LOADING_OCR,
            results=results,
        )

    _set_job_status(
        job_id,
        running=False,
        done=True,
        processed=total,
        done_count=total,
        total=total,
        shortlisted=shortlisted_count,
        not_shortlisted=not_shortlisted_count,
        errors=error_count,
        current_step=_STEP_DONE,
        current_candidate_name="",
        results=results,
    )
    print(f"[shortlist_all] ✅ job={job_id} processed={total} shortlisted={shortlisted_count} rejected={not_shortlisted_count} errors={error_count}")


# ─────────────────────────────────────────────────────────────────────────────
# Readiness / thread pools
# ─────────────────────────────────────────────────────────────────────────────

_APP_READY      = False
_SERVER_BORN_AT = datetime.now(timezone.utc).isoformat()

_ML_THREAD_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2,  thread_name_prefix="ml_worker")
_CANDIDATE_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6,  thread_name_prefix="candidate_worker")
_OCR_POOL       = concurrent.futures.ThreadPoolExecutor(max_workers=4,  thread_name_prefix="ocr_worker")


# ─────────────────────────────────────────────────────────────────────────────
# Database migrations
# ─────────────────────────────────────────────────────────────────────────────

def _is_sqlite_db() -> bool:
    return str(engine.url).startswith("sqlite")


def ensure_job_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("jobs")]
        if not _is_sqlite_db():
            with engine.connect() as conn:
                for col in ("required_fields", "required_education_levels", "location"):
                    try:
                        conn.execute(text(f"ALTER TABLE jobs ALTER COLUMN {col} TYPE TEXT"))
                        conn.commit()
                    except Exception:
                        try: conn.rollback()
                        except Exception: pass
        with engine.connect() as conn:
            for col, coltype in [
                ("job_level", "VARCHAR"), ("number_of_posts", "INTEGER"), ("deadline", "DATETIME"),
            ]:
                if col not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col} {coltype}"))
                        conn.commit()
                    except Exception:
                        try: conn.rollback()
                        except Exception: pass
            try:
                conn.execute(text("UPDATE jobs SET job_level = 'Mid-Level' WHERE job_level IS NULL"))
                conn.execute(text("UPDATE jobs SET number_of_posts = 1 WHERE number_of_posts IS NULL"))
                if _is_sqlite_db():
                    conn.execute(text("UPDATE jobs SET deadline = date('now', '+30 days') WHERE deadline IS NULL"))
                else:
                    conn.execute(text("UPDATE jobs SET deadline = NOW() + INTERVAL '30 days' WHERE deadline IS NULL"))
                conn.commit()
            except Exception:
                try: conn.rollback()
                except Exception: pass
    except Exception as exc:
        print(f"[ensure_job_columns] ⚠️  Skipped: {exc}")


def ensure_user_profile_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("users")]
        with engine.connect() as conn:
            for col, coltype in [
                ("phone", "VARCHAR(50)"), ("address", "VARCHAR(255)"), ("national_id", "VARCHAR(50)"),
            ]:
                if col not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {coltype}"))
                        conn.commit()
                    except Exception:
                        try: conn.rollback()
                        except Exception: pass
    except Exception as exc:
        print(f"[ensure_user_profile_columns] ⚠️  Skipped: {exc}")


def ensure_application_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("applications")]
        with engine.connect() as conn:
            for col, coldef in [
                ("doc_advisory",        "BOOLEAN DEFAULT FALSE"),
                ("ocr_result",          "TEXT"),
                ("ocr_confidence_flag", "BOOLEAN DEFAULT FALSE"),
                ("ocr_quality_score",   "REAL"),
                ("hr_review_note",      "TEXT"),
                ("hr_reviewed_by",      "INTEGER"),
                ("hr_reviewed_at",      "DATETIME"),
            ]:
                if col not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col} {coldef}"))
                        conn.commit()
                        print(f"[migration] ✅ Added 'applications.{col}'")
                    except Exception:
                        try: conn.rollback()
                        except Exception: pass
            try:
                conn.execute(text("UPDATE applications SET doc_advisory = FALSE WHERE doc_advisory IS NULL"))
                conn.commit()
            except Exception:
                try: conn.rollback()
                except Exception: pass
    except Exception as exc:
        print(f"[ensure_application_columns] ⚠️  Skipped: {exc}")


def ensure_profile_document_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("profile_documents")]
        with engine.connect() as conn:
            if "ocr_text" not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE profile_documents ADD COLUMN ocr_text TEXT"))
                    conn.commit()
                    print("[migration] ✅ Added 'profile_documents.ocr_text' column")
                except Exception:
                    try: conn.rollback()
                    except Exception: pass
    except Exception as exc:
        print(f"[ensure_profile_document_columns] ⚠️  Skipped: {exc}")


def ensure_document_type_enum():
    print("[migration] ✅ ensure_document_type_enum: skipped (native_enum=False)")


def ensure_pending_decision_default():
    try:
        with engine.connect() as conn:
            conn.execute(text("UPDATE applications SET decision = 'pending' WHERE decision IS NULL"))
            conn.commit()
    except Exception as exc:
        print(f"[migration] decision backfill warning: {exc}")


def ensure_feedback_table():
    try:
        with engine.connect() as conn:
            if _is_sqlite_db():
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS system_feedback (
                        id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        admin_id   INTEGER,
                        admin_email TEXT,
                        category   VARCHAR(100) DEFAULT 'general',
                        message    TEXT NOT NULL,
                        rating     INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS system_feedback (
                        id         SERIAL PRIMARY KEY,
                        admin_id   INTEGER,
                        admin_email VARCHAR(255),
                        category   VARCHAR(100) DEFAULT 'general',
                        message    TEXT NOT NULL,
                        rating     INTEGER,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    )
                """))
            conn.commit()
            print("[migration] ✅ system_feedback table ready.")
    except Exception as exc:
        print(f"[ensure_feedback_table] ⚠️  Skipped: {exc}")


def _run_all_migrations():
    ensure_job_columns()
    ensure_user_profile_columns()
    ensure_application_columns()
    ensure_profile_document_columns()
    ensure_document_type_enum()
    ensure_pending_decision_default()
    ensure_feedback_table()


# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap admin
# ─────────────────────────────────────────────────────────────────────────────

def _bootstrap_admin():
    admin_email    = os.getenv("ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()
    admin_name     = os.getenv("ADMIN_NAME", "System Administrator").strip()
    if not admin_email or not admin_password or SessionLocal is None:
        return
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == admin_email.lower()).first()
        if existing:
            if existing.role != UserRole.admin:
                existing.role = UserRole.admin
                db.add(existing); db.commit()
            return
        admin_user = User(
            full_name=admin_name, email=admin_email.lower(),
            hashed_password=hash_password(admin_password), role=UserRole.admin,
        )
        db.add(admin_user); db.commit()
        print(f"[bootstrap] ✅ Admin account created: {admin_email}")
    except Exception as exc:
        print(f"[bootstrap] ⚠️  Failed: {exc!r}")
        try: db.rollback()
        except Exception: pass
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _APP_READY
    print("[lifespan] Server bound — initialising …")
    try:
        Base.metadata.create_all(bind=engine)
        print("[lifespan] ✅ Database tables created / verified.")
    except Exception as exc:
        print(f"[lifespan] ⚠️  create_all() failed: {exc!r}")
    try:
        _run_all_migrations()
    except Exception as exc:
        print(f"[lifespan] ⚠️  Migrations failed (non-fatal): {exc!r}")
    try:
        _bootstrap_admin()
    except Exception as exc:
        print(f"[lifespan] ⚠️  Admin bootstrap failed: {exc!r}")
    print("[lifespan] Starting ML background load …")
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        try:
            await asyncio.wait_for(loop.run_in_executor(pool, _load_ml_modules), timeout=120.0)
        except asyncio.TimeoutError:
            print("[lifespan] ⚠️  ML load timed out after 120s — degraded mode.")
        except BaseException as exc:
            print(f"[lifespan] ⚠️  ML load error: {exc!r}")
    _APP_READY = True
    print("[lifespan] ✅ Application ready.")
    yield
    _APP_READY = False
    _ML_THREAD_POOL.shutdown(wait=False)
    _CANDIDATE_POOL.shutdown(wait=False)
    _OCR_POOL.shutdown(wait=False)


# ─────────────────────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────────────────────

_HARDCODED_ORIGINS = [
    "https://shortlisting-ai.vercel.app",
    "https://shortlisting-ai-git-main-shortlisting-ais-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_ORIGIN_RE = re.compile(r"^https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.vercel\.app$")


def _build_allowed_origins() -> list[str]:
    env_origins = [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if o.strip().startswith("http")
    ]
    return list(dict.fromkeys(_HARDCODED_ORIGINS + env_origins))


ALLOWED_ORIGINS: list[str] = _build_allowed_origins()


def _is_origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    return origin in ALLOWED_ORIGINS or bool(_ORIGIN_RE.match(origin))


def _cors_headers(origin: str) -> list[tuple[bytes, bytes]]:
    effective = origin.encode() if origin else b"*"
    return [
        (b"access-control-allow-origin",      effective),
        (b"access-control-allow-credentials", b"true"),
        (b"vary",                             b"Origin"),
    ]


def _cors_preflight_headers(origin: str) -> list[tuple[bytes, bytes]]:
    effective = origin.encode() if origin else b"*"
    return [
        (b"access-control-allow-origin",      effective),
        (b"access-control-allow-credentials", b"true"),
        (b"access-control-allow-methods",     b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
        (b"access-control-allow-headers",
         b"Authorization, Content-Type, Accept, Origin, X-Requested-With"),
        (b"access-control-max-age",           b"600"),
        (b"vary",                             b"Origin"),
        (b"content-length",                   b"0"),
    ]


class RawASGICORSWrapper:
    _ALWAYS_PASS = frozenset(["/wake", "/health", "/", "/hybridaction"])

    def __init__(self, inner: ASGIApp) -> None:
        self._inner = inner

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._inner(scope, receive, send)
            return
        origin = ""
        for name, value in scope.get("headers", []):
            if name == b"origin":
                origin = value.decode("latin-1")
                break
        method = scope.get("method", "GET")
        if method == "OPTIONS":
            if _is_origin_allowed(origin):
                await send({"type": "http.response.start", "status": 200, "headers": _cors_preflight_headers(origin)})
            else:
                await send({"type": "http.response.start", "status": 200, "headers": [(b"content-length", b"0")]})
            await send({"type": "http.response.body", "body": b""})
            return
        path = scope.get("path", "")
        if not _APP_READY and not any(path.startswith(p) for p in self._ALWAYS_PASS):
            body = json.dumps({"detail": "Server is starting up, please retry in a few seconds.", "status": "starting"}).encode()
            cors = _cors_headers(origin) if origin else []
            await send({"type": "http.response.start", "status": 503, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"retry-after", b"5"), *cors]})
            await send({"type": "http.response.body", "body": body})
            return
        if not _is_origin_allowed(origin):
            await self._inner(scope, receive, send)
            return
        headers_sent = False

        async def send_with_cors(message: dict) -> None:
            nonlocal headers_sent
            if message["type"] == "http.response.start" and not headers_sent:
                headers_sent = True
                raw_headers  = list(message.get("headers", []))
                existing     = {name.lower() for name, _ in raw_headers}
                if b"access-control-allow-origin" not in existing:
                    raw_headers.extend(_cors_headers(origin))
                await send({**message, "headers": raw_headers})
            else:
                await send(message)

        try:
            await self._inner(scope, receive, send_with_cors)
        except Exception as exc:
            print(f"[RawASGICORSWrapper] unhandled exception: {exc!r}")
            if not headers_sent:
                err_body = json.dumps({"detail": "Internal server error"}).encode()
                await send({"type": "http.response.start", "status": 500, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(err_body)).encode()), *_cors_headers(origin)]})
                await send({"type": "http.response.body", "body": err_body})


class _CORSFallbackMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next: Callable) -> Response:
        origin = request.headers.get("origin", "")
        if request.method == "OPTIONS" and _is_origin_allowed(origin):
            return Response(content="", status_code=200, headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, X-Requested-With",
                "Access-Control-Max-Age": "600", "Vary": "Origin",
            })
        try:
            response = await call_next(request)
        except Exception as exc:
            print(f"[CORSFallback] exception: {exc!r}")
            response = Response(content=json.dumps({"detail": "Internal server error"}), status_code=500, media_type="application/json")
        if _is_origin_allowed(origin) and "access-control-allow-origin" not in response.headers:
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"]                             = "Origin"
        return response


# ─────────────────────────────────────────────────────────────────────────────
# Build the FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

_app = FastAPI(
    title="Applicant Shortlisting API", version="9.4.0",
    description="AI-powered applicant shortlisting", lifespan=lifespan,
)
_app.add_middleware(
    FastAPICORSMiddleware,
    allow_origins      = ALLOWED_ORIGINS,
    allow_origin_regex = r"^https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.vercel\.app$",
    allow_credentials  = True,
    allow_methods      = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers      = ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers     = ["Content-Length", "Content-Type"],
    max_age            = 600,
)
_app.add_middleware(_CORSFallbackMiddleware)
app = RawASGICORSWrapper(_app)


# ─────────────────────────────────────────────────────────────────────────────
# Health / wake
# ─────────────────────────────────────────────────────────────────────────────

@_app.api_route("/wake", methods=["GET", "HEAD", "OPTIONS"], tags=["health"])
async def wake(request: Request):
    if request.method == "HEAD":
        return Response(status_code=200)
    return JSONResponse(status_code=200 if _APP_READY else 202, content={
        "status": "awake" if _APP_READY else "starting", "ready": _APP_READY,
        "born_at": _SERVER_BORN_AT, "now": datetime.now(timezone.utc).isoformat(),
        "ml_error": _ML_LOAD_ERROR, "ocr_enabled": _ocr_is_enabled(),
        "upload_ocr_timeout_s": UPLOAD_OCR_TIMEOUT_SECONDS, "fast_mode_on_uploads": False,
    })


@_app.api_route("/", methods=["GET", "HEAD"], tags=["health"])
def root():
    return {"status": "ok", "message": "Shortlisting API is running"}


@_app.api_route("/health", methods=["GET", "HEAD"], tags=["health"])
def health():
    return JSONResponse(status_code=200, content={
        "status": "ok", "ready": _APP_READY, "born_at": _SERVER_BORN_AT,
        "ml_error": _ML_LOAD_ERROR, "ocr_enabled": _ocr_is_enabled(),
        "upload_ocr_timeout_s": UPLOAD_OCR_TIMEOUT_SECONDS, "fast_mode_on_uploads": False,
    })


@_app.get("/hybridaction/{path:path}", tags=["health"])
async def ignore_tracker(path: str):
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# /ocr/quality
# ─────────────────────────────────────────────────────────────────────────────

@_app.post("/ocr/quality", tags=["ocr"])
async def ocr_quality_check(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    content = await file.read()
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext == "pdf" or content[:4] == b"%PDF":
        return JSONResponse(content={
            "acceptable": True, "hard_reject": False, "hard_reject_reason": "",
            "warnings": ["PDF quality is assessed after OCR processing."],
            "blur_score": 999.0, "mean_brightness": 128.0,
            "is_dark": False, "is_washed_out": False, "width": 0, "height": 0,
        })
    content_type = file.content_type or "image/jpeg"
    try:
        import requests as _req
        svc_res = _req.post(
            f"{OCR_SERVICE_URL}/ocr/quality",
            files={"file": (file.filename, content, content_type)},
            timeout=30,
        )
        if svc_res.status_code == 200:
            return JSONResponse(content=svc_res.json())
    except Exception:
        print("[ocr/quality] OCR service unavailable — falling back to local quality check")
    if _check_image_quality_strict is not None:
        ok, reason = _check_image_quality_strict(content, file.filename or "")
        return JSONResponse(content={
            "acceptable": ok, "hard_reject": not ok, "hard_reject_reason": reason,
            "warnings": [], "blur_score": 999.0, "mean_brightness": 128.0,
            "is_dark": False, "is_washed_out": False, "width": 0, "height": 0,
        })
    return JSONResponse(content={
        "acceptable": True, "hard_reject": False, "hard_reject_reason": "",
        "warnings": ["Quality check unavailable — please ensure your document is clear."],
        "blur_score": 999.0, "mean_brightness": 128.0,
        "is_dark": False, "is_washed_out": False, "width": 0, "height": 0,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Upload directory
# ─────────────────────────────────────────────────────────────────────────────

_default_upload_dir = "/tmp/uploads" if not _is_sqlite_db() else "uploads"
UPLOAD_DIR = os.getenv("UPLOAD_DIR", _default_upload_dir)
os.makedirs(UPLOAD_DIR, exist_ok=True)
_app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

ALLOWED_EXTENSIONS       = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB         = 5
ALLOWED_DOC_TYPES        = {"id_card", "cv", "diploma", "certificate", "experience"}
REQUIRED_DOC_TYPES       = {"id_card", "cv", "diploma"}
DOC_TYPE_LABELS          = {
    "id_card":     "National ID / Passport",
    "cv":          "CV / Resume",
    "diploma":     "Academic Diploma / Degree Certificate",
    "certificate": "Professional Certificate (optional)",
    "experience":  "Experience Document (optional)",
}
DOC_TYPE_LABELS_REQUIRED = {
    "id_card": "National ID / Passport",
    "cv":      "CV / Resume",
    "diploma": "Academic Diploma / Degree Certificate",
}


# ─────────────────────────────────────────────────────────────────────────────
# Exception handlers
# ─────────────────────────────────────────────────────────────────────────────

@_app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors   = exc.errors()
    messages = []
    for e in errors:
        msg   = e.get("msg", "").replace("Value error, ", "")
        loc   = e.get("loc", [])
        field = str(loc[-1]) if loc else ""
        if field and field not in ("body", "__root__"):
            msg = f"{field}: {msg}"
        if msg and msg not in messages:
            messages.append(msg)
    detail = " · ".join(messages) if messages else "Invalid request data"
    return JSONResponse(
          status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
          content={"detail": detail, "code": "VALIDATION_ERROR", "retryable": False},
      )


# ─────────────────────────────────────────────────────────────────────────────
# General helpers
# ─────────────────────────────────────────────────────────────────────────────

_PASSWORD_RE = {
    "length":    lambda v: len(v) >= 8,
    "uppercase": lambda v: bool(re.search(r"[A-Z]", v)),
    "lowercase": lambda v: bool(re.search(r"[a-z]", v)),
    "digit":     lambda v: bool(re.search(r"\d", v)),
    "special":   lambda v: bool(re.search(r"[^A-Za-z0-9]", v)),
}
_PASSWORD_MESSAGES = {
    "length":    "at least 8 characters",
    "uppercase": "one uppercase letter (A–Z)",
    "lowercase": "one lowercase letter (a–z)",
    "digit":     "one number (0–9)",
    "special":   "one special character (!@#$%^&* …)",
}


def _validate_password_strength(password: str) -> list[str]:
    return [msg for key, msg in _PASSWORD_MESSAGES.items() if not _PASSWORD_RE[key](password)]


def _doc_type_value(doc) -> str:
    try:
        return doc.doc_type.value
    except AttributeError:
        return str(doc.doc_type)


def _decision_value(app_obj) -> str:
    try:
        if app_obj.decision is None:
            return "pending"
        return app_obj.decision.value
    except AttributeError:
        return str(app_obj.decision) if app_obj.decision else "pending"


def _needs_processing(app_obj) -> bool:
    decision = _decision_value(app_obj)
    return app_obj.decision is None or decision == "pending" or app_obj.ai_score is None


def _is_blocking_doc_failure(doc_detail: str) -> bool:
    if not doc_detail:
        return False
    try:
        from shortlisting_engine import _is_true_blocking_failure
        return _is_true_blocking_failure(doc_detail)
    except ImportError:
        pass
    _BLOCKING = [
        "identity mismatch", "type mismatch", "field mismatch",
        "education level mismatch", "document rejected",
        "possible use of another person", "wrong document",
    ]
    return any(sig.lower() in doc_detail.lower() for sig in _BLOCKING)


def _rank_candidates(candidates: list[dict]) -> list[dict]:
    shortlisted     = sorted([c for c in candidates if c["decision"] == "shortlisted"],     key=lambda c: c["ai_score"] or 0, reverse=True)
    not_shortlisted = sorted([c for c in candidates if c["decision"] == "not_shortlisted"], key=lambda c: c["ai_score"] or 0, reverse=True)
    manual_review   = [c for c in candidates if c["decision"] == "manual_review"]
    pending         = [c for c in candidates if c["decision"] == "pending"]
    ranked = []
    for i, c in enumerate(shortlisted, 1):
        ranked.append({**c, "rank": i})
    for i, c in enumerate(not_shortlisted, len(shortlisted) + 1):
        ranked.append({**c, "rank": i})
    for i, c in enumerate(manual_review, len(shortlisted) + len(not_shortlisted) + 1):
        ranked.append({**c, "rank": i})
    for i, c in enumerate(pending, len(shortlisted) + len(not_shortlisted) + len(manual_review) + 1):
        ranked.append({**c, "rank": i})
    return ranked


_STALE_REVIEW_PHRASES = (
    "under review", "will be reviewed", "team will verify",
    "documents have been received", "as part of the evaluation process",
    "will consider them", "being reviewed",
    "documents are currently being reviewed", "will be evaluated",
    "our team will", "hr will", "review process",
    "under consideration",
)


def _remove_stale_review_notes(data: dict) -> None:
    for field in ("points_to_note", "criteria_warnings", "advisory_notes", "warnings"):
        lst = data.get(field)
        if not isinstance(lst, list):
            continue
        data[field] = [
            item for item in lst
            if not any(phrase in item.lower() for phrase in _STALE_REVIEW_PHRASES)
        ]


def _parse_reason_data(app_obj) -> dict:
    raw = (app_obj.ai_reason or "").strip()
    if not raw:
        decision = _decision_value(app_obj)
        score    = app_obj.ai_score
        if decision == "pending" or score is None:
            return {"criteria_met": [], "criteria_failed": [], "criteria_warnings": [], "summary": "Awaiting AI evaluation.", "ml_confidence": None, "ml_note": ""}
        label = "shortlisted" if decision == "shortlisted" else "not shortlisted"
        return {"criteria_met": [], "criteria_failed": [], "criteria_warnings": ["Detailed breakdown was not saved. Use 'Re-shortlist' to regenerate."], "summary": f"Candidate was {label} (score: {score * 100:.1f}%).", "ml_confidence": None, "ml_note": ""}
    if not raw.startswith("{"):
        return {"criteria_met": [], "criteria_failed": [], "criteria_warnings": [], "summary": raw, "ml_confidence": None, "ml_note": ""}
    try:
        data = json.loads(raw)
        data.setdefault("criteria_met", [])
        data.setdefault("criteria_failed", [])
        data.setdefault("criteria_warnings", [])
        data.setdefault("summary", f"Score: {(app_obj.ai_score or 0) * 100:.1f}%")
        data.setdefault("ml_confidence", None)
        data.setdefault("ml_note", "")
        decision = _decision_value(app_obj)
        if decision in ("shortlisted", "not_shortlisted"):
            _remove_stale_review_notes(data)
        return data
    except Exception:
        return {"criteria_met": [], "criteria_failed": [], "criteria_warnings": ["Breakdown data corrupted."], "summary": "Breakdown data corrupted.", "ml_confidence": None, "ml_note": ""}


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

@_app.post("/auth/register", response_model=TokenResponse, tags=["auth"])
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    if payload.role == "admin":
        raise HTTPException(status_code=403, detail="Admin accounts cannot be self-registered.")
    if payload.role == "hr":
        hr_invite_code = os.getenv("HR_INVITE_CODE", "").strip()
        if not hr_invite_code:
            raise HTTPException(status_code=403, detail="HR account registration is currently disabled.")
        if not payload.hr_code or payload.hr_code.strip() != hr_invite_code:
            raise HTTPException(status_code=403, detail="Invalid HR invite code.")
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user = User(full_name=payload.full_name.strip(), email=email, hashed_password=hash_password(payload.password), role=UserRole(payload.role))
    db.add(user); db.commit(); db.refresh(user)
    _log(db, "REGISTER", user=user, detail=f"New {payload.role} account registered", ip=ip)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value, user_id=user.id, full_name=user.full_name)


@_app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip    = _ip(request)
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        _log(db, "LOGIN_FAILED", user_email=email, detail="Invalid credentials", ip=ip, status="failure")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _log(db, "LOGIN", user=user, detail="Successful login", ip=ip)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role.value, user_id=user.id, full_name=user.full_name)


@_app.get("/auth/me", tags=["auth"])
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "full_name": current_user.full_name, "email": current_user.email, "role": current_user.role.value, "phone": current_user.phone or "", "address": current_user.address or "", "national_id": current_user.national_id or ""}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@_app.post("/auth/forgot-password", tags=["auth"])
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip    = _ip(request)
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if user:
        reset_token  = create_reset_token(user.email)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link   = f"{frontend_url}/reset-password?token={reset_token}"
        sent = send_reset_email(to_name=user.full_name, to_email=user.email, reset_link=reset_link)
        _log(db, "FORGOT_PASSWORD", user=user, detail=f"Password reset email {'sent' if sent else 'FAILED'}", ip=ip, status="success" if sent else "warning")
    return {"message": "If an account with that email exists, a password reset link has been sent."}


@_app.post("/auth/reset-password", tags=["auth"])
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip    = _ip(request)
    token = payload.token.strip()
    if token.count(".") != 2:
        raise HTTPException(status_code=400, detail="This reset link appears to be malformed.")
    email = verify_reset_token(token)
    if not email:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="No account found for this reset link.")
    unmet = _validate_password_strength(payload.new_password)
    if unmet:
        raise HTTPException(status_code=422, detail="Password must contain: " + ", ".join(unmet))
    user.hashed_password = hash_password(payload.new_password)
    db.add(user); db.commit()
    _log(db, "PASSWORD_RESET", user=user, detail="Password reset successfully", ip=ip)
    return {"message": "Your password has been reset successfully. You can now sign in."}


class RequestHRInviteRequest(BaseModel):
    full_name: str
    email:     EmailStr

@_app.post("/auth/request-hr-invite", tags=["auth"])
def request_hr_invite(payload: RequestHRInviteRequest, request: Request, db: Session = Depends(get_db)):
    hr_invite_code = os.getenv("HR_INVITE_CODE", "").strip()
    if not hr_invite_code:
        raise HTTPException(status_code=403, detail="HR account registration is currently disabled.")
    to_name  = payload.full_name.strip() or "HR Applicant"
    to_email = payload.email.lower().strip()
    sent = send_hr_invite_email(to_name=to_name, to_email=to_email, invite_code=hr_invite_code)
    _log(db, "HR_INVITE_REQUESTED", user_email=to_email, detail=f"HR invite requested by {to_name}", ip=_ip(request), status="success" if sent else "warning")
    return {"message": f"Your HR invite code has been sent to {to_email}.", "sent": sent}


# ═══════════════════════════════════════════════════════════════
# JOBS
# ═══════════════════════════════════════════════════════════════

@_app.get("/jobs", response_model=List[JobResponse], tags=["jobs"])
def list_jobs(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    return db.query(Job).filter(Job.is_active == True, or_(Job.deadline.is_(None), Job.deadline > now)).all()


@_app.get("/jobs/{job_id}", response_model=JobResponse, tags=["jobs"])
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@_app.post("/jobs", response_model=JobResponse, tags=["jobs"])
def create_job(payload: JobCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_hr_or_admin)):
    job = Job(**payload.model_dump(), created_by=current_user.id)
    db.add(job); db.commit(); db.refresh(job)
    _log(db, "JOB_CREATED", user=current_user, target=f"job:{job.id}", detail=f"Created job '{job.title}'", ip=_ip(request))
    return job


@_app.delete("/jobs/{job_id}", tags=["jobs"])
def delete_job(job_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_hr_or_admin)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    title      = job.title
    file_paths = [doc.file_path for app_obj in job.applications for doc in app_obj.documents]
    db.delete(job); db.commit()
    for file_path in file_paths:
        try:
            if os.path.exists(file_path): os.remove(file_path)
        except OSError: pass
    _log(db, "JOB_DELETED", user=current_user, target=f"job:{job_id}", detail=f"Deleted job '{title}'", ip=_ip(request))
    return {"detail": "Job and all associated applications and documents have been permanently deleted"}


# ═══════════════════════════════════════════════════════════════
# APPLICATIONS
# ═══════════════════════════════════════════════════════════════

@_app.post("/applications", response_model=ApplicationResponse, tags=["applications"])
def submit_application(payload: ApplicationCreate, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    job = db.query(Job).filter(Job.id == payload.job_id, Job.is_active == True).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or no longer active")
    existing = db.query(Application).filter(Application.applicant_id == current_user.id, Application.job_id == payload.job_id, Application.submitted_at.isnot(None)).first()
    if existing:
        existing_docs  = db.query(Document).filter(Document.application_id == existing.id).all()
        uploaded_types = {_doc_type_value(d) for d in existing_docs}
        missing        = sorted(REQUIRED_DOC_TYPES - uploaded_types)
        if not missing:
            raise HTTPException(status_code=400, detail="You have already applied for this job")
        return existing
    old_draft = db.query(Application).filter(Application.applicant_id == current_user.id, Application.job_id == payload.job_id, Application.submitted_at.is_(None)).first()
    if old_draft:
        for doc in db.query(Document).filter(Document.application_id == old_draft.id).all():
            try:
                if os.path.exists(doc.file_path): os.remove(doc.file_path)
            except OSError: pass
            db.delete(doc)
        db.delete(old_draft); db.commit()
    app_data = payload.model_dump()
    if not app_data.get("phone") and current_user.phone:
        app_data["phone"] = current_user.phone
    if not app_data.get("address") and current_user.address:
        app_data["address"] = current_user.address
    app_obj = Application(applicant_id=current_user.id, submitted_at=None, **app_data)
    db.add(app_obj); db.commit(); db.refresh(app_obj)
    _log(db, "APPLICATION_STARTED", user=current_user, target=f"application:{app_obj.id}", detail=f"Started application for '{job.title}'", ip=_ip(request))
    return app_obj


@_app.get("/applications/my", response_model=List[ApplicationResponse], tags=["applications"])
def my_applications(db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    return db.query(Application).filter(Application.applicant_id == current_user.id, Application.submitted_at.isnot(None)).all()


@_app.get("/applications/{application_id}", response_model=ApplicationResponse, tags=["applications"])
def get_application(application_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role == UserRole.applicant and app_obj.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return app_obj


@_app.delete("/applications/{application_id}", tags=["applications"])
def delete_draft_application(application_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    app_obj = db.query(Application).filter(
        Application.id == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        return {"ok": True, "detail": "Draft not found or already removed."}
    if app_obj.submitted_at is not None:
        return {"ok": True, "detail": "Application already submitted — not deleted."}
    for doc in db.query(Document).filter(Document.application_id == application_id).all():
        try:
            if os.path.exists(doc.file_path): os.remove(doc.file_path)
        except OSError: pass
        db.delete(doc)
    db.delete(app_obj); db.commit()
    _log(db, "APPLICATION_DRAFT_DELETED", user=current_user, target=f"application:{application_id}", detail="Deleted draft", ip=_ip(request))
    return {"ok": True, "detail": "Draft application and uploaded files removed."}


@_app.post("/applications/{application_id}/finalize", tags=["applications"])
def finalize_application(application_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    app_obj = db.query(Application).filter(
        Application.id == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app_obj.submitted_at is not None:
        raise HTTPException(status_code=400, detail="This application has already been submitted.")
    db.expire(app_obj)
    app_obj = db.query(Application).filter(
        Application.id == application_id,
        Application.applicant_id == current_user.id,
        Application.submitted_at.is_(None),
    ).first()
    if not app_obj:
        raise HTTPException(status_code=400, detail="This application has already been submitted.")
    db.expire_all()
    docs           = db.query(Document).filter(Document.application_id == application_id).all()
    uploaded_types = {_doc_type_value(d) for d in docs}
    missing        = sorted(REQUIRED_DOC_TYPES - uploaded_types)
    if missing:
        missing_labels = [DOC_TYPE_LABELS_REQUIRED.get(m, m) for m in missing]
        raise HTTPException(status_code=400, detail=f"Cannot submit — {len(missing)} required document(s) missing: {', '.join(missing_labels)}.")
    app_obj.submitted_at = datetime.now(timezone.utc)
    db.add(app_obj); db.commit()
    job = db.query(Job).filter(Job.id == app_obj.job_id).first()
    _log(db, "APPLICATION_SUBMITTED", user=current_user, target=f"application:{application_id}", detail=f"Submitted application for '{job.title if job else app_obj.job_id}'", ip=_ip(request))
    _set_app_ocr_status(application_id, running=True, done=False, result=None)
    _OCR_POOL.submit(_post_submit_ocr_verify, application_id)
    has_exp = "experience" in uploaded_types
    return {
        "success": True, "application_id": application_id, "ocr_running": True,
        "message": "✅ Application submitted successfully!" + (" Experience document included." if has_exp else ""),
        "uploaded_types": sorted(uploaded_types), "documents_count": len(docs),
    }


@_app.get("/applications/{application_id}/ocr-status", tags=["applications"])
def get_ocr_status(application_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    app_obj = db.query(Application).filter(Application.id == application_id, Application.applicant_id == current_user.id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    mem_status = _get_app_ocr_status(application_id)
    if mem_status.get("done"):
        result = mem_status.get("result", {})
        return {"application_id": application_id, "ocr_done": True, "running": False, **{k: v for k, v in result.items() if k != "doc_texts"}}
    if mem_status.get("running"):
        return {"application_id": application_id, "ocr_done": False, "running": True, "message": "Document verification is still running — please check again in a few seconds."}
    ocr_result_raw = getattr(app_obj, "ocr_result", None)
    if ocr_result_raw:
        try:
            result = json.loads(ocr_result_raw)
            return {"application_id": application_id, "ocr_done": True, "running": False, **{k: v for k, v in result.items() if k != "doc_texts"}}
        except Exception:
            pass
    return {"application_id": application_id, "ocr_done": False, "running": False, "message": "Document verification has not started or results are unavailable."}


# ═══════════════════════════════════════════════════════════════
# PROFILE
# ═══════════════════════════════════════════════════════════════

class ProfileUpdateRequest(BaseModel):
    phone:       Optional[str] = None
    address:     Optional[str] = None
    national_id: Optional[str] = None


def _build_profile_response(current_user: User) -> dict:
    phone       = current_user.phone       or ""
    address     = current_user.address     or ""
    national_id = current_user.national_id or ""
    missing     = []
    if not national_id: missing.append("National ID")
    if not address:     missing.append("Location / Address")
    return {
        "user_id": current_user.id, "full_name": current_user.full_name,
        "email": current_user.email, "phone": phone, "address": address,
        "national_id": national_id, "profile_complete": len(missing) == 0,
        "missing_fields": missing,
    }


@_app.get("/profile", tags=["profile"])
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _build_profile_response(current_user)


@_app.put("/profile", tags=["profile"])
def update_profile(payload: ProfileUpdateRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    updated = []
    if payload.phone       is not None: current_user.phone       = payload.phone.strip()       or None; updated.append("phone")
    if payload.address     is not None: current_user.address     = payload.address.strip()     or None; updated.append("address")
    if payload.national_id is not None: current_user.national_id = payload.national_id.strip() or None; updated.append("national_id")
    if updated:
        db.add(current_user); db.commit(); db.refresh(current_user)
    _log(db, "PROFILE_UPDATED", user=current_user, target=f"user:{current_user.id}", detail=f"Updated: {', '.join(updated) if updated else 'nothing'}", ip=_ip(request))
    response = _build_profile_response(current_user)
    response["updated"] = updated
    response["message"] = f"✓ Profile updated ({', '.join(updated)})." if updated else "No fields were changed."
    return response


# ═══════════════════════════════════════════════════════════════
# PROFILE DOCUMENTS
# ═══════════════════════════════════════════════════════════════

@_app.get("/profile/documents", tags=["profile"])
def get_profile_documents(db: Session = Depends(get_db), current_user: User = Depends(require_applicant)):
    seen_types:   set[str]   = set()
    profile_docs: list[dict] = []
    direct_docs = db.query(ProfileDocument).filter(ProfileDocument.user_id == current_user.id).order_by(ProfileDocument.uploaded_at.desc()).all()
    for doc in direct_docs:
        dtype = _doc_type_value(doc)
        if dtype in seen_types: continue
        seen_types.add(dtype)
        ocr_text  = getattr(doc, "ocr_text", None) or ""
        ocr_ready = bool(ocr_text.strip())
        profile_docs.append({
            "id": doc.id, "doc_type": dtype, "doc_label": DOC_TYPE_LABELS.get(dtype, dtype),
            "original_name": doc.original_name or doc.filename, "file_name": doc.original_name or doc.filename,
            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
            "application_id": None, "source": "profile",
            "file_available": os.path.exists(doc.file_path), "ocr_ready": ocr_ready,
        })
    if len(seen_types) < len(ALLOWED_DOC_TYPES):
        apps = db.query(Application).filter(Application.applicant_id == current_user.id, Application.submitted_at.isnot(None)).order_by(Application.submitted_at.desc()).all()
        for app_obj in apps:
            docs = db.query(Document).filter(Document.application_id == app_obj.id).order_by(Document.uploaded_at.desc()).all()
            for doc in docs:
                dtype = _doc_type_value(doc)
                if dtype in seen_types: continue
                seen_types.add(dtype)
                profile_docs.append({
                    "id": doc.id, "doc_type": dtype, "doc_label": DOC_TYPE_LABELS.get(dtype, dtype),
                    "original_name": doc.original_name or doc.filename, "file_name": doc.original_name or doc.filename,
                    "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
                    "application_id": app_obj.id, "source": "application",
                    "file_available": os.path.exists(doc.file_path), "ocr_ready": False,
                })
    return {"documents": profile_docs}


@_app.post("/profile/documents", tags=["profile"])
async def upload_profile_document(
    request: Request, doc_type: str = Form(...), file: UploadFile = File(...),
    db: Session = Depends(get_db), current_user: User = Depends(require_applicant),
):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid document type '{doc_type}'.")
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed.")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_FILE_SIZE_MB} MB limit.")
    if ext.lower() in (".png", ".jpg", ".jpeg") and _check_image_quality_strict is not None:
        ok, reason = _check_image_quality_strict(content, file.filename or "")
        if not ok:
            raise HTTPException(status_code=422, detail=reason)
    doc_type_value = DocumentType(doc_type).value
    existing = db.query(ProfileDocument).filter(ProfileDocument.user_id == current_user.id, ProfileDocument.doc_type == doc_type_value).first()
    if existing:
        try:
            if os.path.exists(existing.file_path): os.remove(existing.file_path)
        except OSError: pass
        db.delete(existing); db.commit()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = os.path.join(UPLOAD_DIR, unique_name)
    with open(save_path, "wb") as f:
        f.write(content)
    prof_doc = ProfileDocument(
        user_id=current_user.id, doc_type=doc_type_value,
        filename=unique_name, original_name=file.filename, file_path=save_path, ocr_text=None,
    )
    db.add(prof_doc); db.commit(); db.refresh(prof_doc)
    if _ocr_is_enabled():
        _OCR_POOL.submit(_ocr_profile_doc_and_cache, prof_doc.id)
    _log(db, "PROFILE_DOCUMENT_UPLOADED", user=current_user, target=f"profile_doc:{prof_doc.id}", detail=f"Uploaded '{doc_type}'", ip=_ip(request))
    return {
        "id": prof_doc.id, "doc_type": doc_type, "doc_label": DOC_TYPE_LABELS.get(doc_type, doc_type),
        "original_name": file.filename, "file_name": file.filename,
        "uploaded_at": prof_doc.uploaded_at.isoformat() if prof_doc.uploaded_at else None,
        "source": "profile", "file_available": True, "ocr_ready": False,
        "message": f"✓ '{DOC_TYPE_LABELS.get(doc_type, doc_type)}' saved to your profile.",
    }


# ═══════════════════════════════════════════════════════════════
# DOCUMENT UPLOAD (Application)
# ═══════════════════════════════════════════════════════════════

class AttachProfileDocRequest(BaseModel):
    profile_doc_id: int
    doc_type:       str
    source:         str = "application"


@_app.post("/applications/{application_id}/documents/attach-profile", tags=["documents"])
async def attach_profile_document(
    application_id: int, payload: AttachProfileDocRequest, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(Application.id == application_id, Application.applicant_id == current_user.id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app_obj.submitted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot modify a submitted application.")
    doc_type = payload.doc_type
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid document type '{doc_type}'.")
    db.expire_all()
    existing_docs = db.query(Document).filter(Document.application_id == application_id).all()
    for d in existing_docs:
        if _doc_type_value(d) == doc_type:
            return {
                "id": d.id,
                "doc_type": _doc_type_value(d),
                "doc_label": DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                "original_name": d.original_name,
                "doc_id": d.id,
                "message": "Document already present on this application.",
            }
    source_file_path = source_original = source_filename = cached_ocr_text = None
    if payload.source == "profile":
        prof_doc = db.query(ProfileDocument).filter(ProfileDocument.id == payload.profile_doc_id, ProfileDocument.user_id == current_user.id).first()
        if prof_doc:
            source_file_path = prof_doc.file_path
            source_original  = prof_doc.original_name
            source_filename  = prof_doc.filename
            cached_ocr_text  = getattr(prof_doc, "ocr_text", None) or ""
    if source_file_path is None:
        source_doc = db.query(Document).filter(Document.id == payload.profile_doc_id).first()
        if not source_doc:
            raise HTTPException(status_code=404, detail="Profile document not found. Please re-upload.")
        source_app = db.query(Application).filter(Application.id == source_doc.application_id, Application.applicant_id == current_user.id).first()
        if not source_app:
            raise HTTPException(status_code=403, detail="Not authorized to use this document.")
        source_file_path = source_doc.file_path
        source_original  = source_doc.original_name
        source_filename  = source_doc.filename
        cached_ocr_text  = ""
    if not os.path.exists(source_file_path):
        raise HTTPException(status_code=400, detail="The original file is no longer available. Please re-upload.")
    _, ext        = os.path.splitext(source_filename)
    new_filename  = f"{uuid.uuid4().hex}{ext}"
    new_file_path = os.path.join(UPLOAD_DIR, new_filename)
    try:
        shutil.copy2(source_file_path, new_file_path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to copy document file: {exc}")
    field_of_study  = app_obj.field_of_study  or ""
    education_level = app_obj.education_level or ""
    if cached_ocr_text and cached_ocr_text.strip():
        accepted, validation_message = _run_pre_submission_check_with_cached_text(
            new_file_path, doc_type, current_user.full_name, cached_ocr_text, field_of_study, education_level,
        )
    else:
        accepted, validation_message = _run_pre_submission_check(
            new_file_path, doc_type, current_user.full_name, field_of_study, education_level,
        )
    if not accepted:
        try:
            if os.path.exists(new_file_path): os.remove(new_file_path)
        except OSError: pass
        _log(db, "DOCUMENT_REJECTED", user=current_user, target=f"application:{application_id}", detail=f"Attach-profile rejected '{doc_type}': {validation_message}", ip=_ip(request))
        raise HTTPException(status_code=422, detail=validation_message)
    new_doc = Document(application_id=application_id, doc_type=DocumentType(doc_type).value, filename=new_filename, original_name=source_original, file_path=new_file_path)
    db.add(new_doc); db.commit(); db.refresh(new_doc)
    _log(db, "DOCUMENT_ATTACHED_FROM_PROFILE", user=current_user, target=f"application:{application_id}", detail=f"Attached profile doc '{doc_type}'", ip=_ip(request))
    return {
        "id": new_doc.id,
        "doc_type": doc_type,
        "doc_label": DOC_TYPE_LABELS.get(doc_type, doc_type),
        "original_name": new_doc.original_name,
        "doc_id": new_doc.id,
        "validation_message": validation_message,
        "message": f"✓ '{DOC_TYPE_LABELS.get(doc_type, doc_type)}' attached from your profile.",
    }


@_app.post("/applications/{application_id}/documents", tags=["documents"])
async def upload_document(
    application_id: int, request: Request,
    doc_type: str = Form(...), file: UploadFile = File(...),
    db: Session = Depends(get_db), current_user: User = Depends(require_applicant),
):
    try:
        return await _upload_document_inner(application_id, request, doc_type, file, db, current_user)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[upload_document] ⚠️  Unhandled error: {exc!r}")
        raise HTTPException(status_code=500, detail="Document upload failed. Please try again.")


async def _upload_document_inner(application_id, request, doc_type, file, db, current_user):
    db.expire_all()
    app_obj = db.query(Application).filter(
        Application.id == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app_obj.submitted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot upload documents to a submitted application.")
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid document type '{doc_type}'.")
    doc_type_str = DocumentType(doc_type).value
    existing_doc = db.query(Document).filter(
        Document.application_id == application_id,
        Document.doc_type == doc_type_str,
    ).first()
    if existing_doc:
        raise HTTPException(
            status_code=400,
            detail=f"A '{DOC_TYPE_LABELS.get(doc_type, doc_type)}' is already uploaded. "
                   "Please remove it first before uploading a new one.",
        )
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed.")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_FILE_SIZE_MB} MB limit.")
    if ext.lower() in (".png", ".jpg", ".jpeg") and _check_image_quality_strict is not None:
        ok, reason = _check_image_quality_strict(content, file.filename or "")
        if not ok:
            raise HTTPException(status_code=422, detail=reason)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = os.path.join(UPLOAD_DIR, unique_name)
    with open(save_path, "wb") as f:
        f.write(content)
    accepted, validation_message = _run_pre_submission_check(
        file_path=save_path,
        declared_type=doc_type,
        applicant_name=current_user.full_name,
        field_of_study=app_obj.field_of_study or "",
        education_level=app_obj.education_level or "",
    )
    if not accepted:
        try:
            if os.path.exists(save_path): os.remove(save_path)
        except OSError: pass
        _log(db, "DOCUMENT_REJECTED", user=current_user, target=f"application:{application_id}", detail=f"Upload rejected '{doc_type}': {validation_message}", ip=_ip(request))
        raise HTTPException(status_code=422, detail=validation_message)
    doc = Document(
        application_id=application_id, doc_type=doc_type_str,
        filename=unique_name, original_name=file.filename, file_path=save_path,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    _log(db, "DOCUMENT_UPLOADED", user=current_user, target=f"application:{application_id}", detail=f"Uploaded {doc_type}: {file.filename}", ip=_ip(request))
    db.expire_all()
    all_docs     = db.query(Document).filter(Document.application_id == application_id).all()
    uploaded_set = {_doc_type_value(d) for d in all_docs}
    missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)
    return {
        "id": doc.id, "doc_type": doc_type, "doc_label": DOC_TYPE_LABELS[doc_type],
        "original_name": file.filename, "doc_id": doc.id,
        "validation_message": validation_message,
        "uploaded_types": sorted(uploaded_set), "missing_types": missing,
        "all_required_uploaded": len(missing) == 0,
        "message": (
            "✅ All required documents uploaded! Click 'Submit Application' to finalise."
            if len(missing) == 0
            else f"Document uploaded. Still needed: {', '.join(DOC_TYPE_LABELS_REQUIRED.get(m, m) for m in missing)}."
        ),
    }


@_app.get("/applications/{application_id}/documents", tags=["documents"])
def list_documents(application_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        app_obj = db.query(Application).filter(Application.id == application_id).first()
        if not app_obj:
            raise HTTPException(status_code=404, detail="Application not found")
        if current_user.role == UserRole.applicant and app_obj.applicant_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view these documents")
        db.expire_all()
        docs         = db.query(Document).filter(Document.application_id == application_id).all()
        uploaded_set = {_doc_type_value(d) for d in docs}
        missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)
        return {
            "documents": [
                {
                    "id": d.id, "doc_id": d.id,
                    "doc_type": _doc_type_value(d),
                    "doc_label": DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                    "original_name": d.original_name,
                    "uploaded_at": d.uploaded_at,
                    "url": f"/uploads/{d.filename}",
                    "file_available": os.path.exists(d.file_path),
                }
                for d in docs
            ],
            "uploaded_types": sorted(uploaded_set),
            "missing_types": missing,
            "all_required_uploaded": len(missing) == 0,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[list_documents] ⚠️  Unexpected error for app {application_id}: {exc!r}")
        raise HTTPException(status_code=500, detail="Failed to retrieve documents. Please try again.")


@_app.delete("/applications/{application_id}/documents/{doc_id}", tags=["documents"])
def delete_document(
    application_id: int, doc_id: int, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=403, detail="Not authorized or application not found")
    db.expire_all()
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.application_id == application_id,
    ).first()
    if not doc:
        return {"detail": "Document already removed."}
    doc_type_str = _doc_type_value(doc)
    file_path    = doc.file_path
    db.delete(doc); db.commit()
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError as exc:
        print(f"[delete_document] ⚠️  Could not remove file {file_path}: {exc}")
    _log(db, "DOCUMENT_DELETED", user=current_user, target=f"application:{application_id}", detail=f"Deleted document '{doc_type_str}'", ip=_ip(request))
    return {"detail": f"Document '{doc_type_str}' deleted. You can now re-upload."}


# ═══════════════════════════════════════════════════════════════
# HR — Jobs & Candidates
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/jobs", response_model=List[JobResponse], tags=["hr"])
def list_all_jobs_hr(db: Session = Depends(get_db), hr: User = Depends(require_hr)):
    return db.query(Job).filter(Job.is_active == True).all()


@_app.get("/hr/candidates", tags=["hr"])
def get_all_candidates(job_id: Optional[int] = None, db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin)):
    query = (
        db.query(Application, User, Job)
        .join(User, Application.applicant_id == User.id)
        .join(Job,  Application.job_id       == Job.id)
        .filter(Application.submitted_at.isnot(None))
    )
    if job_id:
        query = query.filter(Application.job_id == job_id)
    app_user_job_rows = query.all()
    if not app_user_job_rows:
        return []
    app_ids     = [app.id for app, _, _ in app_user_job_rows]
    all_docs    = db.query(Document).filter(Document.application_id.in_(app_ids)).all()
    docs_by_app: dict[int, list] = {}
    for doc in all_docs:
        docs_by_app.setdefault(doc.application_id, []).append(doc)
    rows = []
    for app, user, job in app_user_job_rows:
        docs       = docs_by_app.get(app.id, [])
        ocr_result = {}
        try:
            raw_ocr = getattr(app, "ocr_result", None)
            if raw_ocr:
                ocr_data   = json.loads(raw_ocr)
                ocr_result = {k: v for k, v in ocr_data.items() if k != "doc_texts"}
        except Exception:
            pass
        rows.append({
            "application_id":  app.id,
            "applicant_id":    user.id,
            "full_name":       user.full_name,
            "email":           user.email,
            "job_title":       job.title,
            "education_level": app.education_level,
            "field_of_study":  app.field_of_study,
            "graduation_year": app.graduation_year,
            "experience_years": app.experience_years,
            "skills":          app.skills,
            "certifications":  app.certifications,
            "gender":          app.gender,
            "phone":           app.phone,
            "address":         app.address,
            "date_of_birth":   app.date_of_birth,
            "decision":        _decision_value(app),
            "ai_score":        app.ai_score,
            "ai_reason":       app.ai_reason,
            "doc_verified":    app.doc_verified,
            "doc_advisory":    getattr(app, "doc_advisory", False),
            "submitted_at":    app.submitted_at,
            "ocr_matches":     ocr_result.get("matches",    []),
            "ocr_mismatches":  ocr_result.get("mismatches", []),
            "ocr_warnings":    ocr_result.get("warnings",   []),
            "ocr_done":        ocr_result.get("ocr_done",   False),
            "documents": [{"id": d.id, "doc_type": _doc_type_value(d), "original_name": d.original_name or d.filename, "uploaded_at": d.uploaded_at, "download_url": f"/hr/documents/{d.id}/download"} for d in docs],
        })
    return _rank_candidates(rows)


# ═══════════════════════════════════════════════════════════════
# HR — Shortlisting
#
# FIX-SHORTLIST-1: /hr/shortlist-all now returns `processing: true` so the
#   frontend's automateShortlist() knows to start polling. Without this the
#   frontend saw processing=undefined (falsy) and stopped immediately.
#
# FIX-SHORTLIST-2: Added /hr/shortlist-status/{job_id} endpoint — this is
#   the URL the frontend actually polls (HRDashboard.jsx line:
#   api.get(`/hr/shortlist-status/${jobId}`)). The old endpoint was only
#   /hr/job-status/{job_id} which was never called by the frontend.
#
# FIX-SHORTLIST-3: The status response uses `processing` (not `running`) to
#   match what the frontend checks: `if (!status.processing)` to detect done.
#   Also exposes `done`, `total`, `shortlisted`, `not_shortlisted`, `errors`
#   fields that HRDashboard.jsx reads from the poll response.
# ═══════════════════════════════════════════════════════════════

@_app.post("/hr/shortlist-all/{job_id}", tags=["hr"])
def shortlist_all(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr_or_admin),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    total = db.query(Application).filter(
        Application.job_id == job_id,
        Application.submitted_at.isnot(None),
    ).count()

    if total == 0:
        raise HTTPException(status_code=404, detail="No submitted applications found for this job.")

    job_lock = _get_job_lock(job_id)
    acquired = job_lock.acquire(blocking=False)

    if not acquired:
        current_status = _get_job_status(job_id)
        # ✅ FIX-SHORTLIST-1: return processing=True so frontend knows it's running
        return {
            "message":    "Shortlisting is already running for this job.",
            "job_id":     job_id,
            "processing": True,
            "total":      current_status.get("total", total),
            "status_url": f"/hr/shortlist-status/{job_id}",
        }

    try:
        current_status = _get_job_status(job_id)
        if current_status.get("running"):
            return {
                "message":    "Shortlisting is already running for this job.",
                "job_id":     job_id,
                "processing": True,  # ✅ FIX-SHORTLIST-1
                "total":      current_status.get("total", total),
                "status_url": f"/hr/shortlist-status/{job_id}",
            }
        _set_job_status(
            job_id,
            running=True,
            done=False,
            processed=0,
            done_count=0,
            total=total,
            shortlisted=0,
            not_shortlisted=0,
            errors=0,
            results=[],
            current_step=_STEP_LOADING_OCR,
            current_candidate_name="",
        )
    finally:
        job_lock.release()

    _log(
        db, "SHORTLIST_ALL_TRIGGERED",
        user=hr,
        target=f"job:{job_id}",
        detail=f"HR triggered shortlisting for '{job.title}' ({total} applicants)",
        ip=_ip(request),
    )

    _ML_THREAD_POOL.submit(_run_shortlist_all, job_id)

    # ✅ FIX-SHORTLIST-1: Include `processing: true` so frontend starts polling
    return {
        "message":    f"AI shortlisting started for '{job.title}' ({total} applicant(s)).",
        "job_id":     job_id,
        "total":      total,
        "processing": True,
        "status_url": f"/hr/shortlist-status/{job_id}",
    }


@_app.get("/hr/shortlist-status/{job_id}", tags=["hr"])
def get_shortlist_status(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr_or_admin),
):
    """
    ✅ FIX-SHORTLIST-2 + FIX-SHORTLIST-3: This is the endpoint the frontend
    polls. HRDashboard.jsx calls api.get(`/hr/shortlist-status/${jobId}`) and
    checks `!status.processing` to detect completion.

    Response fields the frontend reads:
      - processing (bool): True while running, False when done
      - done       (bool): True when finished
      - total      (int):  total candidates
      - done_count / done (int): how many processed so far
      - shortlisted      (int): shortlisted count
      - not_shortlisted  (int): rejected count
      - errors           (int): error count
    """
    mem_status = _get_job_status(job_id)

    is_running = mem_status.get("running", False)
    is_done    = mem_status.get("done", False)

    # Query live DB counts for accurate numbers
    apps = db.query(Application).filter(
        Application.job_id == job_id,
        Application.submitted_at.isnot(None),
    ).all()
    db_total         = len(apps)
    db_shortlisted   = sum(1 for a in apps if _decision_value(a) == "shortlisted")
    db_rejected      = sum(1 for a in apps if _decision_value(a) == "not_shortlisted")
    db_manual_review = sum(1 for a in apps if _decision_value(a) == "manual_review")
    db_pending       = sum(1 for a in apps if _decision_value(a) == "pending")

    total     = mem_status.get("total", db_total)
    done_count = mem_status.get("done_count", mem_status.get("processed", 0))

    return {
        # ✅ FIX-SHORTLIST-3: `processing` field is what frontend checks
        "processing":       is_running and not is_done,
        "done":             is_done,
        "running":          is_running,
        "total":            total,
        "done_count":       done_count,
        "processed":        done_count,
        "shortlisted":      mem_status.get("shortlisted", db_shortlisted),
        "not_shortlisted":  mem_status.get("not_shortlisted", db_rejected),
        "errors":           mem_status.get("errors", 0),
        "current_step":     mem_status.get("current_step", ""),
        "current_candidate_name": mem_status.get("current_candidate_name", ""),
        "error":            mem_status.get("error"),
        # Live DB summary
        "db_summary": {
            "total":           db_total,
            "shortlisted":     db_shortlisted,
            "not_shortlisted": db_rejected,
            "manual_review":   db_manual_review,
            "pending":         db_pending,
        },
    }


@_app.get("/hr/job-status/{job_id}", tags=["hr"])
def get_job_processing_status(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr_or_admin),
):
    """Legacy endpoint — kept for backward compatibility."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    mem_status = _get_job_status(job_id)
    apps = db.query(Application).filter(Application.job_id == job_id, Application.submitted_at.isnot(None)).all()
    total         = len(apps)
    shortlisted   = sum(1 for a in apps if _decision_value(a) == "shortlisted")
    rejected      = sum(1 for a in apps if _decision_value(a) == "not_shortlisted")
    manual_review = sum(1 for a in apps if _decision_value(a) == "manual_review")
    pending       = sum(1 for a in apps if _decision_value(a) == "pending")
    return {
        "job_id":                  job_id,
        "job_title":               job.title,
        "running":                 mem_status.get("running", False),
        "processing":              mem_status.get("running", False) and not mem_status.get("done", False),
        "done":                    mem_status.get("done", False),
        "processed":               mem_status.get("processed", 0),
        "total":                   mem_status.get("total", total),
        "error":                   mem_status.get("error"),
        "current_step":            mem_status.get("current_step", ""),
        "current_candidate_name":  mem_status.get("current_candidate_name", ""),
        "db_summary": {
            "total":           total,
            "shortlisted":     shortlisted,
            "not_shortlisted": rejected,
            "manual_review":   manual_review,
            "pending":         pending,
        },
    }


@_app.post("/hr/shortlist/{application_id}", tags=["hr"])
def shortlist_single(
    application_id: int,
    request: Request,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr_or_admin),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if app_obj.submitted_at is None:
        raise HTTPException(status_code=400, detail="Cannot shortlist an unsubmitted application.")
    job = db.query(Job).filter(Job.id == app_obj.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Associated job not found")
    _log(db, "SHORTLIST_SINGLE_TRIGGERED", user=hr, target=f"application:{application_id}", detail=f"HR triggered re-shortlisting for app {application_id}", ip=_ip(request))
    result = _process_one_candidate(application_id, job.id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=f"Shortlisting failed: {result['error']}")
    if SessionLocal:
        fresh_db = SessionLocal()
        try:
            updated     = fresh_db.query(Application).filter(Application.id == application_id).first()
            reason_data = _parse_reason_data(updated) if updated else {}
        finally:
            fresh_db.close()
    else:
        reason_data = {}
    return {
        "application_id": application_id,
        "decision":       result.get("decision"),
        "score":          result.get("score"),
        "doc_verified":   result.get("doc_verified", False),
        "doc_advisory":   result.get("doc_advisory", False),
        "reason":         reason_data,
        "message":        f"Shortlisting complete — decision: {result.get('decision', 'unknown')}",
    }


# ═══════════════════════════════════════════════════════════════
# HR — Manual Decision
# ═══════════════════════════════════════════════════════════════

class ManualDecisionRequest(BaseModel):
    decision: str
    note:     Optional[str] = None


@_app.post("/hr/manual-decision/{application_id}", tags=["hr"])
def manual_decision(
    application_id: int, payload: ManualDecisionRequest, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin),
):
    if payload.decision not in ("shortlisted", "not_shortlisted"):
        raise HTTPException(status_code=400, detail="Decision must be 'shortlisted' or 'not_shortlisted'.")
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    old_decision = _decision_value(app_obj)
    app_obj.decision        = DecisionStatus(payload.decision)
    app_obj.hr_review_note  = payload.note or ""
    app_obj.hr_reviewed_by  = hr.id
    app_obj.hr_reviewed_at  = datetime.now(timezone.utc)
    app_obj.shortlisted_at  = datetime.now(timezone.utc)
    db.add(app_obj); db.commit()
    _log(db, "HR_MANUAL_DECISION", user=hr, target=f"application:{application_id}", detail=f"Manual decision: {old_decision} → {payload.decision}. Note: {payload.note or 'none'}", ip=_ip(request))
    return {
        "application_id": application_id,
        "decision":       payload.decision,
        "reviewed_by":    hr.full_name,
        "reviewed_at":    app_obj.hr_reviewed_at.isoformat(),
        "note":           payload.note,
        "message":        f"✅ Manual decision recorded: {payload.decision}",
    }


# ═══════════════════════════════════════════════════════════════
# HR — Report
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/report/{job_id}", tags=["hr"])
def get_job_report(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr_or_admin),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    apps = (
        db.query(Application, User)
        .join(User, Application.applicant_id == User.id)
        .filter(Application.job_id == job_id, Application.submitted_at.isnot(None))
        .all()
    )

    candidate_rows = []
    scores_list    = []
    for app, user in apps:
        reason_data = _parse_reason_data(app)
        score = app.ai_score if app.ai_score is not None else 0.0
        scores_list.append(score)
        candidate_rows.append({
            "application_id":    app.id,
            "full_name":         user.full_name,
            "email":             user.email,
            "education_level":   app.education_level,
            "field_of_study":    app.field_of_study,
            "experience_years":  app.experience_years,
            "skills":            app.skills,
            "certifications":    app.certifications,
            "decision":          _decision_value(app),
            "ai_score":          score,
            "score_band":        reason_data.get("score_band", ""),
            "summary":           reason_data.get("summary", ""),
            "criteria_met":      reason_data.get("criteria_met", []),
            "criteria_failed":   reason_data.get("criteria_failed", []),
            "criteria_warnings": reason_data.get("criteria_warnings", []),
            "ml_note":           reason_data.get("ml_note", ""),
            "doc_verified":      app.doc_verified,
            "doc_advisory":      getattr(app, "doc_advisory", False),
            "shortlisted_at":    app.shortlisted_at,
            "documents":         [],
            "documents_count":   0,
        })

    if candidate_rows:
        app_ids    = [c["application_id"] for c in candidate_rows]
        docs_counts = db.query(Document.application_id, func.count(Document.id)).filter(Document.application_id.in_(app_ids)).group_by(Document.application_id).all()
        count_map  = {aid: cnt for aid, cnt in docs_counts}
        for c in candidate_rows:
            c["documents_count"] = count_map.get(c["application_id"], 0)

    total           = len(candidate_rows)
    shortlisted_lst = [c for c in candidate_rows if c["decision"] == "shortlisted"]
    not_slt_lst     = [c for c in candidate_rows if c["decision"] == "not_shortlisted"]
    manual_rev_lst  = [c for c in candidate_rows if c["decision"] == "manual_review"]
    pending_lst     = [c for c in candidate_rows if c["decision"] == "pending"]
    avg_score = sum(scores_list) / max(1, len(scores_list)) if scores_list else None
    top_score = max(scores_list) if scores_list else None

    shortlist_rank = 0
    for c in sorted(candidate_rows, key=lambda x: x["ai_score"] or 0, reverse=True):
        if c["decision"] == "shortlisted":
            shortlist_rank += 1
            c["shortlist_rank"] = shortlist_rank
        else:
            c["shortlist_rank"] = None

    return {
        "job": {
            "id":                        job.id,
            "title":                     job.title,
            "location":                  job.location,
            "employment_type":           job.employment_type,
            "job_level":                 job.job_level,
            "required_skills":           job.required_skills,
            "required_certifications":   job.required_certifications,
            "required_fields":           job.required_fields,
            "required_education_levels": job.required_education_levels,
            "required_min_experience":   job.required_min_experience,
            "required_max_experience":   job.required_max_experience,
            "preferred_qualifications":  job.preferred_qualifications,
            "number_of_posts":           job.number_of_posts,
            "deadline":                  job.deadline.isoformat() if job.deadline else None,
        },
        "summary": {
            "total_applicants": total,
            "shortlisted":      len(shortlisted_lst),
            "not_shortlisted":  len(not_slt_lst),
            "manual_review":    len(manual_rev_lst),
            "pending":          len(pending_lst),
            "shortlist_rate":   round(len(shortlisted_lst) / max(1, total), 4),
            "average_score":    round(avg_score, 4) if avg_score is not None else None,
            "top_score":        round(top_score, 4) if top_score is not None else None,
        },
        "candidates":    candidate_rows,
        "generated_at":  datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════
# HR — Users management
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/users", tags=["hr"])
def list_hr_users(db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id":         u.id,
            "full_name":  u.full_name,
            "email":      u.email,
            "role":       u.role.value,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


class InviteHRRequest(BaseModel):
    full_name: str
    email:     EmailStr


@_app.post("/hr/users/invite", tags=["hr"])
def invite_hr_user(
    payload: InviteHRRequest, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin),
):
    hr_invite_code = os.getenv("HR_INVITE_CODE", "").strip()
    if not hr_invite_code:
        raise HTTPException(status_code=403, detail="HR invite codes are not configured.")
    to_name  = payload.full_name.strip()
    to_email = payload.email.lower().strip()
    sent = send_hr_invite_email(to_name=to_name, to_email=to_email, invite_code=hr_invite_code)
    _log(db, "HR_USER_INVITED", user=hr, detail=f"Invited {to_name} <{to_email}>", ip=_ip(request), status="success" if sent else "warning")
    return {"message": f"HR invite sent to {to_email}.", "sent": sent}


# ═══════════════════════════════════════════════════════════════
# HR — Documents download
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/documents/{doc_id}/download", tags=["hr"])
def download_document(doc_id: int, db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk")
    return FileResponse(path=doc.file_path, filename=doc.original_name or doc.filename, media_type="application/octet-stream")


# ═══════════════════════════════════════════════════════════════
# HR — Candidate full profile
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/candidates/{application_id}/profile", tags=["hr"])
def get_candidate_profile(application_id: int, db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin)):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    user = db.query(User).filter(User.id == app_obj.applicant_id).first()
    job  = db.query(Job).filter(Job.id  == app_obj.job_id).first()
    docs = db.query(Document).filter(Document.application_id == application_id).all()
    reason_data = _parse_reason_data(app_obj)
    ocr_result: dict = {}
    try:
        raw_ocr = getattr(app_obj, "ocr_result", None)
        if raw_ocr:
            ocr_data   = json.loads(raw_ocr)
            ocr_result = {k: v for k, v in ocr_data.items() if k != "doc_texts"}
    except Exception:
        pass
    return {
        "application_id": application_id,
        "applicant": {
            "id": user.id if user else None, "full_name": user.full_name if user else "",
            "email": user.email if user else "", "phone": (user.phone or "") if user else "",
            "address": (user.address or "") if user else "", "national_id": (user.national_id or "") if user else "",
        },
        "job": {"id": job.id if job else None, "title": job.title if job else ""},
        "application": {
            "education_level": app_obj.education_level, "field_of_study": app_obj.field_of_study,
            "graduation_year": app_obj.graduation_year, "experience_years": app_obj.experience_years,
            "skills": app_obj.skills, "certifications": app_obj.certifications,
            "gender": app_obj.gender, "date_of_birth": app_obj.date_of_birth,
            "submitted_at": app_obj.submitted_at,
        },
        "decision": _decision_value(app_obj), "ai_score": app_obj.ai_score,
        "shortlisted_at": app_obj.shortlisted_at, "doc_verified": app_obj.doc_verified,
        "doc_advisory": getattr(app_obj, "doc_advisory", False),
        "hr_review_note": getattr(app_obj, "hr_review_note", None),
        "reason": reason_data, "ocr_result": ocr_result,
        "documents": [
            {
                "id": d.id, "doc_type": _doc_type_value(d),
                "original_name": d.original_name or d.filename,
                "uploaded_at": d.uploaded_at,
                "download_url": f"/hr/documents/{d.id}/download",
                "file_available": os.path.exists(d.file_path),
            }
            for d in docs
        ],
    }


# ═══════════════════════════════════════════════════════════════
# HR — Audit Logs
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/logs", tags=["hr"])
def get_audit_logs(limit: int = 100, offset: int = 0, db: Session = Depends(get_db), hr: User = Depends(require_hr_or_admin)):
    logs  = db.query(SystemLog).order_by(desc(SystemLog.created_at)).offset(offset).limit(min(limit, 500)).all()
    total = db.query(SystemLog).count()
    return {
        "total": total, "offset": offset, "limit": limit,
        "logs": [
            {
                "id": log.id, "user_email": log.user_email, "user_role": log.user_role,
                "action": log.action, "target": log.target, "detail": log.detail,
                "ip_address": log.ip_address, "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


# ═══════════════════════════════════════════════════════════════
# ADMIN — Stats & Feedback
# ═══════════════════════════════════════════════════════════════

@_app.get("/admin/stats", tags=["admin"])
def admin_stats(db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    total_users        = db.query(User).count()
    total_applicants   = db.query(User).filter(User.role == UserRole.applicant).count()
    total_hr           = db.query(User).filter(User.role == UserRole.hr).count()
    total_jobs         = db.query(Job).count()
    active_jobs        = db.query(Job).filter(Job.is_active == True).count()
    total_applications = db.query(Application).filter(Application.submitted_at.isnot(None)).count()
    shortlisted        = db.query(Application).filter(Application.decision == DecisionStatus.shortlisted).count()
    not_shortlisted    = db.query(Application).filter(Application.decision == DecisionStatus.not_shortlisted).count()
    manual_review      = db.query(Application).filter(Application.decision == DecisionStatus.manual_review).count()
    pending            = db.query(Application).filter(Application.submitted_at.isnot(None), Application.decision == DecisionStatus.pending).count()
    new_users_this_week = db.query(User).filter(User.created_at >= datetime.now(timezone.utc) - timedelta(days=7)).count()
    new_jobs_this_week  = db.query(Job).filter(Job.created_at >= datetime.now(timezone.utc) - timedelta(days=7)).count()
    total_logs          = db.query(SystemLog).count()
    ml_ready            = _predict is not None and _ML_LOAD_ERROR is None
    return {
        "users": {
            "total": total_users, "new_this_week": new_users_this_week,
            "applicants": total_applicants, "hr": total_hr,
        },
        "jobs": {"total": total_jobs, "new_this_week": new_jobs_this_week, "active": active_jobs},
        "applications": {
            "total": total_applications, "shortlisted": shortlisted,
            "not_shortlisted": not_shortlisted, "manual_review": manual_review, "pending": pending,
            "shortlist_rate": round(shortlisted / max(1, total_applications), 4),
        },
        "system": {
            "ml_ready": ml_ready, "ocr_enabled": _ocr_is_enabled(),
            "server_born_at": _SERVER_BORN_AT, "total_logs": total_logs, "ml_error": _ML_LOAD_ERROR,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


class FeedbackRequest(BaseModel):
    category: str  = "general"
    message:  str
    rating:   Optional[int] = None


@_app.post("/admin/feedback", tags=["admin"])
def submit_feedback(payload: FeedbackRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Feedback message cannot be empty.")
    rating = None
    if payload.rating is not None:
        rating = max(1, min(5, int(payload.rating)))
    try:
        db.execute(
            text("INSERT INTO system_feedback (admin_id, admin_email, category, message, rating) VALUES (:uid, :email, :cat, :msg, :rating)"),
            {"uid": current_user.id, "email": current_user.email, "cat": payload.category, "msg": payload.message.strip(), "rating": rating},
        )
        db.commit()
    except Exception as exc:
        print(f"[feedback] ⚠️  Failed to save feedback: {exc!r}")
        try: db.rollback()
        except Exception: pass
        raise HTTPException(status_code=500, detail="Failed to save feedback.")
    _log(db, "FEEDBACK_SUBMITTED", user=current_user, detail=f"Category: {payload.category}, Rating: {rating}", ip=_ip(request))
    return {"message": "✅ Thank you for your feedback!", "category": payload.category, "rating": rating}


@_app.get("/admin/feedback", tags=["admin"])
def get_feedback(limit: int = 50, offset: int = 0, db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    try:
        rows  = db.execute(text("SELECT * FROM system_feedback ORDER BY created_at DESC LIMIT :lim OFFSET :off"), {"lim": min(limit, 200), "off": offset}).fetchall()
        total = db.execute(text("SELECT COUNT(*) FROM system_feedback")).scalar() or 0
        return {"total": total, "offset": offset, "limit": limit, "feedback": [dict(row._mapping) for row in rows]}
    except Exception as exc:
        print(f"[feedback] ⚠️  Failed to retrieve feedback: {exc!r}")
        return {"total": 0, "offset": offset, "limit": limit, "feedback": []}


# ═══════════════════════════════════════════════════════════════
# ADMIN — Additional endpoints
# ═══════════════════════════════════════════════════════════════

@_app.get("/admin/jobs", tags=["admin"])
def admin_list_jobs(db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    result = []
    for job in jobs:
        applicant_count = db.query(Application).filter(Application.job_id == job.id, Application.submitted_at.isnot(None)).count()
        result.append({
            "id": job.id, "title": job.title, "location": job.location,
            "employment_type": job.employment_type,
            "deadline": job.deadline.isoformat() if job.deadline else None,
            "is_active": job.is_active, "applicant_count": applicant_count,
            "created_at": job.created_at.isoformat() if job.created_at else None,
        })
    return result


@_app.get("/admin/reports", tags=["admin"])
def admin_system_reports(db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    apps = db.query(Application).filter(Application.submitted_at.isnot(None)).all()
    total_apps          = len(apps)
    total_shortlisted   = sum(1 for a in apps if _decision_value(a) == "shortlisted")
    total_rejected      = sum(1 for a in apps if _decision_value(a) == "not_shortlisted")
    total_manual_review = sum(1 for a in apps if _decision_value(a) == "manual_review")
    total_pending       = sum(1 for a in apps if _decision_value(a) == "pending")
    jobs = db.query(Job).all()
    positions = []
    for job in jobs:
        job_apps = db.query(Application).filter(Application.job_id == job.id, Application.submitted_at.isnot(None)).all()
        if not job_apps:
            continue
        shortlisted = sum(1 for a in job_apps if _decision_value(a) == "shortlisted")
        rejected    = sum(1 for a in job_apps if _decision_value(a) == "not_shortlisted")
        manual_rev  = sum(1 for a in job_apps if _decision_value(a) == "manual_review")
        pending     = sum(1 for a in job_apps if _decision_value(a) == "pending")
        total       = len(job_apps)
        scores      = [a.ai_score for a in job_apps if a.ai_score is not None]
        avg_score   = sum(scores) / len(scores) if scores else None
        hr_user     = db.query(User).filter(User.id == job.created_by).first()
        positions.append({
            "job_id": job.id, "job_title": job.title,
            "job_location": job.location or "—",
            "hr_officer": hr_user.full_name if hr_user else "—",
            "total": total, "shortlisted": shortlisted, "rejected": rejected,
            "manual_review": manual_rev, "pending": pending,
            "shortlist_rate": round(shortlisted / total, 4) if total > 0 else 0,
            "avg_score": round(avg_score, 4) if avg_score is not None else None,
        })
    return {
        "total_applications": total_apps, "total_shortlisted": total_shortlisted,
        "total_rejected": total_rejected, "total_manual_review": total_manual_review,
        "total_pending": total_pending, "total_positions": len(positions),
        "positions": positions, "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@_app.get("/admin/logs", tags=["admin"])
def admin_list_logs(
    limit: int = 200, offset: int = 0,
    search: Optional[str] = None, action: Optional[str] = None, user_role: Optional[str] = None,
    db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin),
):
    query = db.query(SystemLog)
    if search:
        query = query.filter(or_(SystemLog.user_email.ilike(f"%{search}%"), SystemLog.action.ilike(f"%{search}%"), SystemLog.detail.ilike(f"%{search}%"), SystemLog.target.ilike(f"%{search}%")))
    if action:
        query = query.filter(SystemLog.action.ilike(f"%{action}%"))
    if user_role:
        query = query.filter(SystemLog.user_role == user_role)
    total = query.count()
    logs  = query.order_by(desc(SystemLog.created_at)).offset(offset).limit(min(limit, 500)).all()
    return {
        "total": total, "offset": offset, "limit": limit,
        "logs": [
            {
                "id": log.id, "user_email": log.user_email, "user_role": log.user_role,
                "action": log.action, "target": log.target, "detail": log.detail,
                "ip_address": log.ip_address, "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
    }


@_app.delete("/admin/logs", tags=["admin"])
def admin_clear_logs(older_than_days: int = 30, db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    cutoff  = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    deleted = db.query(SystemLog).filter(SystemLog.created_at < cutoff).delete()
    db.commit()
    return {"message": f"Deleted {deleted} log entries older than {older_than_days} days."}


@_app.get("/admin/users", tags=["admin"])
def admin_list_users(
    role: Optional[str] = None, search: Optional[str] = None,
    db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if search:
        query = query.filter(or_(User.full_name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
    users = query.order_by(User.created_at.desc()).all()
    return {"users": [{"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role.value, "created_at": u.created_at.isoformat() if u.created_at else None} for u in users]}


@_app.post("/admin/users", tags=["admin"])
def admin_create_user(payload: RegisterRequest, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already exists.")
    user = User(full_name=payload.full_name.strip(), email=email, hashed_password=hash_password(payload.password), role=UserRole(payload.role))
    db.add(user); db.commit(); db.refresh(user)
    _log(db, "ADMIN_USER_CREATED", user=admin, target=f"user:{user.id}", detail=f"Created {user.role.value} account for {user.email}", ip=_ip(request))
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role.value, "created_at": user.created_at.isoformat() if user.created_at else None}


@_app.put("/admin/users/{user_id}/role", tags=["admin"])
def admin_change_role(user_id: int, payload: dict, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    new_role = payload.get("role")
    if new_role not in ["admin", "hr", "applicant"]:
        raise HTTPException(status_code=400, detail="Invalid role.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role.")
    old_role   = user.role.value
    user.role  = UserRole(new_role)
    db.add(user); db.commit()
    _log(db, "ADMIN_ROLE_CHANGED", user=admin, target=f"user:{user_id}", detail=f"Role changed from {old_role} to {new_role}", ip=_ip(request))
    return {"role": user.role.value}


@_app.delete("/admin/users/{user_id}", tags=["admin"])
def admin_delete_user(user_id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_hr_or_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    for app in user.applications:
        for doc in app.documents:
            try:
                if os.path.exists(doc.file_path): os.remove(doc.file_path)
            except OSError: pass
            db.delete(doc)
        db.delete(app)
    for prof_doc in user.profile_documents:
        try:
            if os.path.exists(prof_doc.file_path): os.remove(prof_doc.file_path)
        except OSError: pass
        db.delete(prof_doc)
    db.delete(user); db.commit()
    _log(db, "ADMIN_USER_DELETED", user=admin, target=f"user:{user_id}", detail=f"Deleted {user.email}", ip=_ip(request))
    return {"detail": f"User {user.email} permanently deleted."}


# ═══════════════════════════════════════════════════════════════
# Public /feedback
# ═══════════════════════════════════════════════════════════════

class PublicFeedbackRequest(BaseModel):
    rating:    int
    category:  str
    message:   str
    anonymous: bool = False


@_app.post("/feedback", tags=["feedback"])
def public_feedback(payload: PublicFeedbackRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5.")
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Feedback message cannot be empty.")
    if len(payload.message.strip()) < 10:
        raise HTTPException(status_code=400, detail="Message must be at least 10 characters.")
    try:
        if payload.anonymous:
            db.execute(text("INSERT INTO system_feedback (admin_id, admin_email, category, message, rating) VALUES (NULL, NULL, :cat, :msg, :rating)"), {"cat": payload.category, "msg": payload.message.strip(), "rating": payload.rating})
        else:
            db.execute(text("INSERT INTO system_feedback (admin_id, admin_email, category, message, rating) VALUES (:uid, :email, :cat, :msg, :rating)"), {"uid": current_user.id, "email": current_user.email, "cat": payload.category, "msg": payload.message.strip(), "rating": payload.rating})
        db.commit()
    except Exception as exc:
        print(f"[public_feedback] ⚠️  Failed to save feedback: {exc!r}")
        try: db.rollback()
        except Exception: pass
        raise HTTPException(status_code=500, detail="Failed to save feedback. Please try again later.")
    _log(db, "PUBLIC_FEEDBACK_SUBMITTED", user=current_user if not payload.anonymous else None, detail=f"Category: {payload.category}, Rating: {payload.rating}, Anonymous: {payload.anonymous}", ip=_ip(request))
    return {"message": "✅ Thank you for your feedback!", "category": payload.category, "rating": payload.rating}


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)