"""
backend/main.py  ·  v6.4.0
────────────────────────────────────────────────────────────────
ALL PREVIOUS FIXES RETAINED (FIX-CORE-1 through FIX-MIGRATE-1).

NEW FIXES IN v6.4.0:

  ✅ FIX-ROUTE-1 — /applications/my MOVED above /applications/{application_id}
     FastAPI matches routes in registration order. When /applications/my was
     registered AFTER /applications/{application_id}, FastAPI treated "my"
     as an integer path parameter, causing a 422 validation error that
     the CORS wrapper re-raised as a 500. Fix: register the static path
     /applications/my FIRST.

  ✅ FIX-MIGRATE-2 — Migrations now run INSIDE lifespan, AFTER
     Base.metadata.create_all(), not at module import time.
     The old code called ensure_application_columns() at the top-level
     of main.py (module scope), which ran before the tables existed on
     a fresh database. inspect(engine).get_columns("applications") raised
     OperationalError: no such table: applications — crashing the import
     and returning 500 on every endpoint.
     Fix: all migrations are now called in the lifespan startup block,
     after create_all() has guaranteed the tables exist.

  ✅ FIX-STARTUP-1 — create_all() also moved into lifespan so table
     creation and migrations are sequenced correctly and errors are
     caught and logged rather than crashing the import.

  All previous fixes (FIX-CORE-1 through FIX-MIGRATE-1, FIX-UNPACK-1
  through FIX-UNPACK-4, FIX-DISPLAY-1) are retained.
"""

import os
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_VERBOSITY", "error")

import asyncio
import concurrent.futures
import json
import re
import shutil
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Callable, List, Optional

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
from sqlalchemy import inspect, text, or_, desc
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
)
from email_utils import send_reset_email, send_hr_invite_email

# ✅ FIX-STARTUP-1: Do NOT call Base.metadata.create_all() here at module scope.
# It is now called inside lifespan() so that:
#   (a) errors are caught and logged, not silently swallowed
#   (b) migrations run AFTER tables are guaranteed to exist
# (Moved to lifespan below)


# ─────────────────────────────────────────────────────────────────────────────
# Timeout configuration
# ─────────────────────────────────────────────────────────────────────────────

CANDIDATE_TIMEOUT_SECONDS    = 150
OCR_TIMEOUT_SECONDS          = 20
OCR_CANDIDATE_BUDGET_SECONDS = 60


# ─────────────────────────────────────────────────────────────────────────────
# In-memory job processing status
# ─────────────────────────────────────────────────────────────────────────────

_JOB_STATUS: dict[int, dict] = {}
_JOB_STATUS_LOCK = threading.Lock()


def _set_job_status(job_id: int, **kwargs) -> None:
    with _JOB_STATUS_LOCK:
        current = _JOB_STATUS.get(job_id, {})
        current.update(kwargs)
        _JOB_STATUS[job_id] = current


def _get_job_status(job_id: int) -> dict:
    with _JOB_STATUS_LOCK:
        return dict(_JOB_STATUS.get(job_id, {}))


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
_ML_LOAD_ERROR: "str | None" = None


def _load_ml_modules() -> None:
    global _predict, _verify_documents, _pre_submission_check, _extract_document_text
    global _ML_LOAD_ERROR
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
        from ocr_utils import extract_document_text as _edt
        _extract_document_text = _edt
        print("[ml_loader] ✅ ocr_utils loaded.")
    except Exception as exc:
        print(f"[ml_loader] ⚠️  ocr_utils import failed: {exc!r}")


def _call_predict(app_obj, job, doc_texts=None, document_paths=None, declared_types=None):
    if _predict is None:
        raise HTTPException(
            status_code=503,
            detail="AI shortlisting engine is still loading. Please retry in a few seconds."
        )
    return _predict(
        app_obj,
        job,
        doc_texts=doc_texts,
        document_paths=document_paths,
        declared_types=declared_types,
    )


def _call_verify_documents(**kwargs):
    if _verify_documents is None:
        return True, False, "Document verification module loading — accepted."
    return _verify_documents(**kwargs)


def _call_pre_submission_check(**kwargs):
    if _pre_submission_check is None:
        return True, "✓ Document accepted. Your application will be processed automatically."
    return _pre_submission_check(**kwargs)


def _extract_all_doc_texts(
    docs: list,
    budget_seconds: float = OCR_CANDIDATE_BUDGET_SECONDS,
) -> dict[str, str]:
    doc_texts: dict[str, str] = {}
    ocr_start = time.monotonic()

    for d in docs:
        doc_type = _doc_type_value(d)

        if not os.path.exists(d.file_path):
            doc_texts.setdefault(doc_type, "")
            continue

        elapsed   = time.monotonic() - ocr_start
        remaining = budget_seconds - elapsed

        if remaining <= 2:
            if doc_type not in doc_texts:
                doc_texts[doc_type] = ""
                print(
                    f"[ocr_budget] ⚠️  OCR budget ({budget_seconds}s) exhausted — "
                    f"skipping {doc_type}"
                )
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
                print(f"[ocr_timeout] ⚠️  OCR timed out for {doc_type} ({d.file_path})")
                text_result = ""
            except Exception as exc:
                print(f"[ocr_error] ⚠️  OCR failed for {doc_type}: {exc!r}")
                text_result = ""

        doc_texts[doc_type] = text_result

    return doc_texts


# ─────────────────────────────────────────────────────────────────────────────
# Readiness flag
# ─────────────────────────────────────────────────────────────────────────────

_APP_READY      = False
_SERVER_BORN_AT = datetime.now(timezone.utc).isoformat()

_ML_THREAD_POOL = concurrent.futures.ThreadPoolExecutor(
    max_workers=2,
    thread_name_prefix="ml_worker",
)

_CANDIDATE_POOL = concurrent.futures.ThreadPoolExecutor(
    max_workers=6,
    thread_name_prefix="candidate_worker",
)


# ─────────────────────────────────────────────────────────────────────────────
# Database migrations
# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX-MIGRATE-2: These functions are ONLY called from inside lifespan(),
# AFTER Base.metadata.create_all() has run. Do NOT call them at module scope.
# Calling inspect(engine).get_columns("applications") before the table exists
# raises OperationalError and crashes the entire app import.

def _is_sqlite_db() -> bool:
    return str(engine.url).startswith("sqlite")


def ensure_job_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("jobs")]
        with engine.connect() as conn:
            for col, coltype in [
                ("job_level",        "VARCHAR"),
                ("number_of_posts",  "INTEGER"),
                ("deadline",         "DATETIME"),
            ]:
                if col not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col} {coltype}"))
                        conn.commit()
                    except Exception as exc:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        print(f"[migration] Note: could not add jobs.{col}: {exc}")
            try:
                conn.execute(text(
                    "UPDATE jobs SET job_level = 'Mid-Level' WHERE job_level IS NULL"
                ))
                conn.execute(text(
                    "UPDATE jobs SET number_of_posts = 1 WHERE number_of_posts IS NULL"
                ))
                if _is_sqlite_db():
                    conn.execute(text(
                        "UPDATE jobs SET deadline = date('now', '+30 days') WHERE deadline IS NULL"
                    ))
                else:
                    conn.execute(text(
                        "UPDATE jobs SET deadline = NOW() + INTERVAL '30 days' WHERE deadline IS NULL"
                    ))
                conn.commit()
            except Exception as exc:
                try:
                    conn.rollback()
                except Exception:
                    pass
                print(f"[ensure_job_columns] Backfill warning: {exc}")
    except Exception as exc:
        print(f"[ensure_job_columns] ⚠️  Skipped: {exc}")


def ensure_user_profile_columns():
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("users")]
        with engine.connect() as conn:
            for col in ["phone", "address"]:
                if col not in existing_columns:
                    coltype = "VARCHAR(50)" if col == "phone" else "VARCHAR(255)"
                    try:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {coltype}"))
                        conn.commit()
                        print(f"[migration] ✅ Added 'users.{col}' column")
                    except Exception as exc:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        print(f"[migration] ⚠️  Could not add 'users.{col}': {exc}")
    except Exception as exc:
        print(f"[ensure_user_profile_columns] ⚠️  Skipped: {exc}")


def ensure_application_columns():
    """
    Add any new columns to the applications table that are missing.
    Safe to run on every startup — skips columns that already exist.

    ✅ FIX-MIGRATE-1: Adds doc_advisory column for existing databases.
    ✅ FIX-MIGRATE-2: Must only be called AFTER Base.metadata.create_all().
    """
    try:
        inspector        = inspect(engine)
        existing_columns = [col["name"] for col in inspector.get_columns("applications")]
        with engine.connect() as conn:
            new_cols = [
                ("doc_advisory", "BOOLEAN DEFAULT 0"),
            ]
            for col, coldef in new_cols:
                if col not in existing_columns:
                    try:
                        conn.execute(text(
                            f"ALTER TABLE applications ADD COLUMN {col} {coldef}"
                        ))
                        conn.commit()
                        print(f"[migration] ✅ Added 'applications.{col}' column")
                    except Exception as exc:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        print(f"[migration] ⚠️  Could not add 'applications.{col}': {exc}")

            try:
                conn.execute(text(
                    "UPDATE applications SET doc_advisory = 0 WHERE doc_advisory IS NULL"
                ))
                conn.commit()
            except Exception as exc:
                try:
                    conn.rollback()
                except Exception:
                    pass
                print(f"[ensure_application_columns] Backfill warning: {exc}")
    except Exception as exc:
        print(f"[ensure_application_columns] ⚠️  Skipped: {exc}")


def ensure_document_type_enum():
    if _is_sqlite_db():
        return
    try:
        with engine.connect() as conn:
            type_exists = conn.execute(
                text("SELECT 1 FROM pg_type WHERE typname = 'documenttype'")
            ).fetchone()
            if not type_exists:
                return
            already_has = conn.execute(text(
                "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
                "WHERE t.typname = 'documenttype' AND e.enumlabel = 'experience'"
            )).fetchone()
            if already_has:
                return
            conn.execute(text(
                "ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'experience'"
            ))
            conn.commit()
            print("[migration] ✅ Added 'experience' to documenttype PG enum")
    except Exception as exc:
        print(f"[migration] documenttype enum migration warning: {exc}")


def ensure_pending_decision_default():
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE applications SET decision = 'pending' WHERE decision IS NULL"
            ))
            conn.commit()
            print("[migration] ✅ Backfilled NULL decisions → 'pending'")
    except Exception as exc:
        print(f"[migration] decision backfill warning: {exc}")


def _run_all_migrations():
    """
    Run all DB migrations in the correct order.
    Called from lifespan() AFTER Base.metadata.create_all().
    """
    ensure_job_columns()
    ensure_user_profile_columns()
    ensure_application_columns()
    ensure_document_type_enum()
    ensure_pending_decision_default()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _APP_READY
    print("[lifespan] Server bound — initialising …")

    # ✅ FIX-STARTUP-1 + FIX-MIGRATE-2: create tables first, THEN migrate.
    # Both steps are inside lifespan so errors are caught and logged.
    try:
        Base.metadata.create_all(bind=engine)
        print("[lifespan] ✅ Database tables created / verified.")
    except Exception as exc:
        print(f"[lifespan] ⚠️  create_all() failed: {exc!r}")

    try:
        _run_all_migrations()
        print("[lifespan] ✅ Migrations complete.")
    except Exception as exc:
        print(f"[lifespan] ⚠️  Migrations failed (non-fatal): {exc!r}")

    print("[lifespan] Starting ML background load …")
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        try:
            await asyncio.wait_for(
                loop.run_in_executor(pool, _load_ml_modules),
                timeout=120.0,
            )
        except asyncio.TimeoutError:
            print("[lifespan] ⚠️  ML load timed out after 120s — degraded mode.")
        except Exception as exc:
            print(f"[lifespan] ⚠️  ML load error: {exc!r}")

    _APP_READY = True
    print("[lifespan] ✅ Application ready.")
    yield
    _APP_READY = False
    _ML_THREAD_POOL.shutdown(wait=False)
    _CANDIDATE_POOL.shutdown(wait=False)


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
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
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
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": _cors_preflight_headers(origin),
                })
            else:
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-length", b"0")],
                })
            await send({"type": "http.response.body", "body": b""})
            return

        path = scope.get("path", "")
        if not _APP_READY and not any(path.startswith(p) for p in self._ALWAYS_PASS):
            body = json.dumps({
                "detail": "Server is starting up, please retry in a few seconds.",
                "status": "starting",
            }).encode()
            cors = _cors_headers(origin) if origin else []
            await send({
                "type": "http.response.start",
                "status": 503,
                "headers": [
                    (b"content-type",    b"application/json"),
                    (b"content-length",  str(len(body)).encode()),
                    (b"retry-after",     b"5"),
                    *cors,
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return

        if not _is_origin_allowed(origin):
            await self._inner(scope, receive, send)
            return

        headers_sent = False

        async def send_with_cors(message: dict) -> None:
            nonlocal headers_sent
            if message["type"] == "http.response.start" and not headers_sent:
                headers_sent  = True
                raw_headers   = list(message.get("headers", []))
                existing      = {name.lower() for name, _ in raw_headers}
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
                await send({
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type",   b"application/json"),
                        (b"content-length", str(len(err_body)).encode()),
                        *_cors_headers(origin),
                    ],
                })
                await send({"type": "http.response.body", "body": err_body})


class _CORSFallbackMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next: Callable) -> Response:
        origin = request.headers.get("origin", "")
        if request.method == "OPTIONS" and _is_origin_allowed(origin):
            return Response(content="", status_code=200, headers={
                "Access-Control-Allow-Origin":      origin,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods":     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Authorization, Content-Type, Accept, Origin, X-Requested-With",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            })
        try:
            response = await call_next(request)
        except Exception as exc:
            print(f"[CORSFallback] exception: {exc!r}")
            response = Response(
                content=json.dumps({"detail": "Internal server error"}),
                status_code=500,
                media_type="application/json",
            )
        if (
            _is_origin_allowed(origin)
            and "access-control-allow-origin" not in response.headers
        ):
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"]                             = "Origin"
        return response


# ─────────────────────────────────────────────────────────────────────────────
# Build the FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

_app = FastAPI(
    title       = "Applicant Shortlisting API",
    version     = "6.4.0",
    description = "AI-powered applicant shortlisting with full audit logging",
    lifespan    = lifespan,
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
    return JSONResponse(
        status_code=200 if _APP_READY else 202,
        content={
            "status":   "awake" if _APP_READY else "starting",
            "ready":    _APP_READY,
            "born_at":  _SERVER_BORN_AT,
            "now":      datetime.now(timezone.utc).isoformat(),
            "ml_error": _ML_LOAD_ERROR,
        },
    )


@_app.api_route("/", methods=["GET", "HEAD"], tags=["health"])
def root():
    return {"status": "ok", "message": "Shortlisting API is running"}


@_app.api_route("/health", methods=["GET", "HEAD"], tags=["health"])
def health():
    return JSONResponse(status_code=200, content={
        "status":   "ok",
        "ready":    _APP_READY,
        "born_at":  _SERVER_BORN_AT,
        "ml_error": _ML_LOAD_ERROR,
    })


@_app.get("/hybridaction/{path:path}", tags=["health"])
async def ignore_tracker(path: str):
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Upload directory + static files
# ─────────────────────────────────────────────────────────────────────────────

_default_upload_dir = "/tmp/uploads" if not _is_sqlite_db() else "uploads"
UPLOAD_DIR = os.getenv("UPLOAD_DIR", _default_upload_dir)
os.makedirs(UPLOAD_DIR, exist_ok=True)
_app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_MB   = 5
ALLOWED_DOC_TYPES  = {"id_card", "cv", "diploma", "certificate", "experience"}
REQUIRED_DOC_TYPES = {"id_card", "cv", "diploma"}
DOC_TYPE_LABELS    = {
    "id_card":     "National ID / Passport",
    "cv":          "CV / Resume",
    "diploma":     "Academic Diploma / Degree Certificate",
    "certificate": "Professional Certificate (optional)",
    "experience":  "Experience Document (Employment / Reference Letter / Work Certificate) — optional",
}
DOC_TYPE_LABELS_REQUIRED = {
    "id_card": "National ID / Passport",
    "cv":      "CV / Resume",
    "diploma": "Academic Diploma / Degree Certificate",
}
DOC_VERIFY_TIMEOUT_SECONDS = 90


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
        content={"detail": detail},
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


_BLOCKING_SIGNALS = [
    "identity mismatch",
    "type mismatch",
    "field mismatch",
    "education level mismatch",
    "document rejected",
    "possible use of another person",
    "wrong document",
    "✗ type mismatch",
    "declared=",
    "id document rejected",
]

_ADVISORY_SIGNALS = [
    "ocr tools not available",
    "ocr skipped",
    "text extraction limited",
    "text extraction skipped",
    "text could not be fully extracted",
    "scan quality limited",
    "partially readable",
    "low ocr confidence",
    "not enough text to classify",
    "insufficient readable",
    "limited — accepted",
    "accepted without checks",
    "accepted for manual review",
    "will be processed automatically",
    "processed automatically",
    "document accepted",
    "✓ documents accepted",
    "✓ type confirmed",
    "missing required documents: certificate",
    "missing: certificate",
]


def _is_blocking_doc_failure(doc_detail: str) -> bool:
    detail_lower = doc_detail.lower()
    for signal in _ADVISORY_SIGNALS:
        if signal.lower() in detail_lower:
            return False
    for signal in _BLOCKING_SIGNALS:
        if signal.lower() in detail_lower:
            return True
    failure_content = detail_lower
    match = re.search(r"verification failed[^—]*—\s*(.+)", detail_lower, re.DOTALL)
    if match:
        failure_content = match.group(1)
    segments = [s.strip() for s in failure_content.split("|") if s.strip()]
    blocking_segments = []
    for seg in segments:
        if any(signal.lower() in seg for signal in _ADVISORY_SIGNALS):
            continue
        if len(seg.replace(" ", "")) < 5:
            continue
        if re.match(r"missing required documents:\s*certificate\s*$", seg):
            continue
        blocking_segments.append(seg)
    return len(blocking_segments) > 0


def _rank_candidates(candidates: list[dict]) -> list[dict]:
    shortlisted     = sorted(
        [c for c in candidates if c["decision"] == "shortlisted"],
        key=lambda c: c["ai_score"] or 0, reverse=True,
    )
    not_shortlisted = sorted(
        [c for c in candidates if c["decision"] == "not_shortlisted"],
        key=lambda c: c["ai_score"] or 0, reverse=True,
    )
    pending = [c for c in candidates if c["decision"] == "pending"]

    ranked = []
    for i, c in enumerate(shortlisted, start=1):
        ranked.append({**c, "rank": i})
    for i, c in enumerate(not_shortlisted, start=len(shortlisted) + 1):
        ranked.append({**c, "rank": i})
    for i, c in enumerate(
        pending, start=len(shortlisted) + len(not_shortlisted) + 1
    ):
        ranked.append({**c, "rank": i})
    return ranked


def _parse_reason_data(app_obj) -> dict:
    raw = (app_obj.ai_reason or "").strip()

    if not raw:
        decision = _decision_value(app_obj)
        score    = app_obj.ai_score

        if decision == "pending" or score is None:
            return {
                "criteria_met":      [],
                "criteria_failed":   [],
                "criteria_warnings": [],
                "summary": (
                    "Awaiting AI evaluation — click 'Automate Shortlisting' to process."
                ),
                "ml_confidence": None,
                "ml_note":       "",
            }

        label = "shortlisted" if decision == "shortlisted" else "not shortlisted"
        return {
            "criteria_met":      [],
            "criteria_failed":   [],
            "criteria_warnings": [
                "Detailed breakdown was not saved during the previous processing run. "
                "Use 'Re-shortlist' on this candidate to regenerate the full breakdown."
            ],
            "summary": (
                f"Candidate was {label} (score: {score * 100:.1f}%) but the detailed "
                "breakdown was not recorded. Re-shortlist this candidate to regenerate it."
            ),
            "ml_confidence": None,
            "ml_note":       "",
        }

    if not raw.startswith("{"):
        return {
            "criteria_met":      [],
            "criteria_failed":   [],
            "criteria_warnings": [],
            "summary":           raw,
            "ml_confidence":     None,
            "ml_note":           "",
        }

    try:
        data = json.loads(raw)
        data.setdefault("criteria_met",      [])
        data.setdefault("criteria_failed",   [])
        data.setdefault("criteria_warnings", [])
        data.setdefault(
            "summary",
            f"Score: {(app_obj.ai_score or 0) * 100:.1f}%",
        )
        data.setdefault("ml_confidence", None)
        data.setdefault("ml_note",       "")
        return data
    except Exception:
        return {
            "criteria_met":      [],
            "criteria_failed":   [],
            "criteria_warnings": [
                "Breakdown data could not be read. Re-shortlist to regenerate."
            ],
            "summary": "Breakdown data corrupted — use Re-shortlist to regenerate.",
            "ml_confidence": None,
            "ml_note":       "",
        }


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

@_app.post("/auth/register", response_model=TokenResponse, tags=["auth"])
def register(
    payload: RegisterRequest, request: Request, db: Session = Depends(get_db)
):
    ip = _ip(request)
    if payload.role == "hr":
        hr_invite_code = os.getenv("HR_INVITE_CODE", "").strip()
        if not hr_invite_code:
            _log(db, "REGISTER_FAILED", user_email=payload.email, user_role="hr",
                 detail="HR registration disabled", ip=ip, status="failure")
            raise HTTPException(
                status_code=403,
                detail="HR account registration is currently disabled.",
            )
        if not payload.hr_code or payload.hr_code.strip() != hr_invite_code:
            _log(db, "REGISTER_FAILED", user_email=payload.email, user_role="hr",
                 detail="Invalid HR invite code", ip=ip, status="failure")
            raise HTTPException(
                status_code=403,
                detail="Invalid HR invite code. Please check the code and try again.",
            )

    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        _log(db, "REGISTER_FAILED", user_email=email, user_role=payload.role,
             detail="Duplicate email", ip=ip, status="failure")
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please sign in instead.",
        )

    user = User(
        full_name       = payload.full_name.strip(),
        email           = email,
        hashed_password = hash_password(payload.password),
        role            = UserRole(payload.role),
    )
    db.add(user); db.commit(); db.refresh(user)
    _log(db, "REGISTER", user=user,
         detail=f"New {payload.role} account registered", ip=ip)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name,
    )


@_app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
def login(
    payload: LoginRequest, request: Request, db: Session = Depends(get_db)
):
    ip    = _ip(request)
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        _log(db, "LOGIN_FAILED", user_email=email,
             user_role=user.role.value if user else None,
             detail="Invalid email or password", ip=ip, status="failure")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _log(db, "LOGIN", user=user, detail="Successful login", ip=ip)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name,
    )


@_app.get("/auth/me", tags=["auth"])
def me(current_user: User = Depends(get_current_user)):
    return {
        "id":        current_user.id,
        "full_name": current_user.full_name,
        "email":     current_user.email,
        "role":      current_user.role.value,
        "phone":     current_user.phone   or "",
        "address":   current_user.address or "",
    }


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str


@_app.post("/auth/forgot-password", tags=["auth"])
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    ip    = _ip(request)
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if user:
        reset_token  = create_reset_token(user.email)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link   = f"{frontend_url}/reset-password?token={reset_token}"
        sent = send_reset_email(
            to_name=user.full_name, to_email=user.email, reset_link=reset_link
        )
        _log(db, "FORGOT_PASSWORD", user=user,
             detail=f"Password reset email {'sent' if sent else 'FAILED to send'}",
             ip=ip, status="success" if sent else "warning")
    else:
        _log(db, "FORGOT_PASSWORD", user_email=email,
             detail="No account found", ip=ip, status="warning")
    return {
        "message": (
            "If an account with that email exists, "
            "a password reset link has been sent."
        )
    }


@_app.post("/auth/reset-password", tags=["auth"])
def reset_password(
    payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)
):
    ip    = _ip(request)
    token = payload.token.strip()
    if token.count(".") != 2:
        raise HTTPException(
            status_code=400,
            detail="This reset link appears to be malformed.",
        )
    email = verify_reset_token(token)
    if not email:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired.",
        )
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="No account found for this reset link.",
        )
    unmet = _validate_password_strength(payload.new_password)
    if unmet:
        raise HTTPException(
            status_code=422,
            detail="Password must contain: " + ", ".join(unmet),
        )
    user.hashed_password = hash_password(payload.new_password)
    db.add(user); db.commit()
    _log(db, "PASSWORD_RESET", user=user,
         detail="Password reset successfully", ip=ip)
    return {
        "message": "Your password has been reset successfully. You can now sign in."
    }


class RequestHRInviteRequest(BaseModel):
    full_name: str
    email:     EmailStr


@_app.post("/auth/request-hr-invite", tags=["auth"])
def request_hr_invite(
    payload: RequestHRInviteRequest, request: Request, db: Session = Depends(get_db)
):
    ip             = _ip(request)
    hr_invite_code = os.getenv("HR_INVITE_CODE", "").strip()
    if not hr_invite_code:
        raise HTTPException(
            status_code=403,
            detail="HR account registration is currently disabled.",
        )
    to_name  = payload.full_name.strip() or "HR Applicant"
    to_email = payload.email.lower().strip()
    sent     = send_hr_invite_email(
        to_name=to_name, to_email=to_email, invite_code=hr_invite_code
    )
    _log(db, "HR_INVITE_REQUESTED", user_email=to_email,
         detail=f"HR invite requested by {to_name}",
         ip=ip, status="success" if sent else "warning")
    return {
        "message": f"Your HR invite code has been sent to {to_email}.",
        "sent": sent,
    }


# ═══════════════════════════════════════════════════════════════
# JOBS
# ═══════════════════════════════════════════════════════════════

@_app.get("/jobs", response_model=List[JobResponse], tags=["jobs"])
def list_jobs(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    return (
        db.query(Job)
        .filter(Job.is_active == True, or_(Job.deadline == None, Job.deadline > now))
        .all()
    )


@_app.get("/jobs/{job_id}", response_model=JobResponse, tags=["jobs"])
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@_app.post("/jobs", response_model=JobResponse, tags=["jobs"])
def create_job(
    payload: JobCreate, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    job = Job(**payload.model_dump(), created_by=hr.id)
    db.add(job); db.commit(); db.refresh(job)
    _log(db, "JOB_CREATED", user=hr, target=f"job:{job.id}",
         detail=f"Created job '{job.title}'", ip=_ip(request))
    return job


@_app.delete("/jobs/{job_id}", tags=["jobs"])
def delete_job(
    job_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    title      = job.title
    file_paths = [
        doc.file_path
        for app_obj in job.applications
        for doc in app_obj.documents
    ]
    db.delete(job); db.commit()
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass
    _log(db, "JOB_DELETED", user=hr, target=f"job:{job_id}",
         detail=f"Deleted job '{title}'", ip=_ip(request))
    return {
        "detail": (
            "Job and all associated applications and documents "
            "have been permanently deleted"
        )
    }


# ═══════════════════════════════════════════════════════════════
# APPLICATIONS
# ═══════════════════════════════════════════════════════════════

@_app.post("/applications", response_model=ApplicationResponse, tags=["applications"])
def submit_application(
    payload: ApplicationCreate, request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    job = db.query(Job).filter(
        Job.id == payload.job_id, Job.is_active == True
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or no longer active")

    existing = db.query(Application).filter(
        Application.applicant_id == current_user.id,
        Application.job_id       == payload.job_id,
        Application.submitted_at != None,
    ).first()
    if existing:
        existing_docs  = db.query(Document).filter(
            Document.application_id == existing.id
        ).all()
        uploaded_types = {_doc_type_value(d) for d in existing_docs}
        missing        = sorted(REQUIRED_DOC_TYPES - uploaded_types)
        if not missing:
            raise HTTPException(
                status_code=400, detail="You have already applied for this job"
            )
        return existing

    old_draft = db.query(Application).filter(
        Application.applicant_id == current_user.id,
        Application.job_id       == payload.job_id,
        Application.submitted_at == None,
    ).first()
    if old_draft:
        old_docs = db.query(Document).filter(
            Document.application_id == old_draft.id
        ).all()
        for doc in old_docs:
            try:
                if os.path.exists(doc.file_path):
                    os.remove(doc.file_path)
            except OSError:
                pass
            db.delete(doc)
        db.delete(old_draft); db.commit()

    app_data = payload.model_dump()
    if not app_data.get("phone") and current_user.phone:
        app_data["phone"] = current_user.phone
    if not app_data.get("address") and current_user.address:
        app_data["address"] = current_user.address

    app_obj = Application(applicant_id=current_user.id, submitted_at=None, **app_data)
    db.add(app_obj); db.commit(); db.refresh(app_obj)

    _log(db, "APPLICATION_STARTED", user=current_user,
         target=f"application:{app_obj.id}",
         detail=f"Started application for '{job.title}'", ip=_ip(request))
    return app_obj


# ✅ FIX-ROUTE-1: /applications/my MUST be registered BEFORE
# /applications/{application_id}. FastAPI matches routes in registration
# order. If the parameterised route comes first, "my" is parsed as an
# integer → validation fails → 422/500. Static paths must come first.
@_app.get("/applications/my", response_model=List[ApplicationResponse], tags=["applications"])
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    return db.query(Application).filter(
        Application.applicant_id == current_user.id,
        Application.submitted_at != None,
    ).all()


@_app.get("/applications/{application_id}", response_model=ApplicationResponse, tags=["applications"])
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if (
        current_user.role == UserRole.applicant
        and app_obj.applicant_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not authorized")
    return app_obj


@_app.delete("/applications/{application_id}", tags=["applications"])
def delete_draft_application(
    application_id: int, request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
        Application.submitted_at == None,
    ).first()
    if not app_obj:
        return {"ok": True, "detail": "Draft not found or already removed."}
    docs = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    for doc in docs:
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except OSError:
            pass
        db.delete(doc)
    db.delete(app_obj); db.commit()
    _log(db, "APPLICATION_DRAFT_DELETED", user=current_user,
         target=f"application:{application_id}",
         detail="Deleted draft application", ip=_ip(request))
    return {"ok": True, "detail": "Draft application and uploaded files removed."}


@_app.post("/applications/{application_id}/finalize", tags=["applications"])
def finalize_application(
    application_id: int, request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app_obj.submitted_at is not None:
        raise HTTPException(
            status_code=400, detail="This application has already been submitted."
        )

    db.expire_all()
    docs           = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    uploaded_types = {_doc_type_value(d) for d in docs}
    missing        = sorted(REQUIRED_DOC_TYPES - uploaded_types)

    if missing:
        missing_labels = [DOC_TYPE_LABELS_REQUIRED.get(m, m) for m in missing]
        _log(db, "APPLICATION_SUBMIT_FAILED", user=current_user,
             target=f"application:{application_id}",
             detail=f"Missing docs: {', '.join(missing)}",
             ip=_ip(request), status="failure")
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot submit — {len(missing)} required document(s) missing: "
                f"{', '.join(missing_labels)}."
            ),
        )

    app_obj.submitted_at = datetime.now(timezone.utc)
    db.add(app_obj); db.commit()

    job = db.query(Job).filter(Job.id == app_obj.job_id).first()
    _log(db, "APPLICATION_SUBMITTED", user=current_user,
         target=f"application:{application_id}",
         detail=f"Submitted application for '{job.title if job else app_obj.job_id}'",
         ip=_ip(request))

    has_exp = "experience" in uploaded_types
    return {
        "success":          True,
        "application_id":   application_id,
        "message": (
            "✅ All required documents verified. "
            "Your application has been submitted successfully! "
            + (
                "Experience document included — this will be evaluated during shortlisting."
                if has_exp else
                "Tip: uploading an experience document can strengthen your application."
            )
        ),
        "uploaded_types":  sorted(uploaded_types),
        "documents_count": len(docs),
    }


# ═══════════════════════════════════════════════════════════════
# PROFILE
# ═══════════════════════════════════════════════════════════════

class ProfileUpdateRequest(BaseModel):
    phone:   Optional[str] = None
    address: Optional[str] = None


def _build_profile_response(current_user: User) -> dict:
    phone   = current_user.phone   or ""
    address = current_user.address or ""
    missing = []
    if not phone:   missing.append("Phone number")
    if not address: missing.append("Location / Address")
    return {
        "user_id":          current_user.id,
        "full_name":        current_user.full_name,
        "email":            current_user.email,
        "phone":            phone,
        "address":          address,
        "profile_complete": len(missing) == 0,
        "missing_fields":   missing,
    }


@_app.get("/profile", tags=["profile"])
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    return _build_profile_response(current_user)


@_app.put("/profile", tags=["profile"])
def update_profile(
    payload: ProfileUpdateRequest, request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    updated = []
    if payload.phone is not None:
        current_user.phone = payload.phone.strip() or None
        updated.append("phone")
    if payload.address is not None:
        current_user.address = payload.address.strip() or None
        updated.append("address")
    if updated:
        db.add(current_user); db.commit(); db.refresh(current_user)
    _log(db, "PROFILE_UPDATED", user=current_user,
         target=f"user:{current_user.id}",
         detail=(
             f"Updated profile fields: {', '.join(updated)}"
             if updated else "No fields changed"
         ),
         ip=_ip(request))
    response          = _build_profile_response(current_user)
    response["updated"] = updated
    response["message"] = (
        f"✓ Profile updated ({', '.join(updated)})."
        if updated else "No fields were changed."
    )
    return response


# ═══════════════════════════════════════════════════════════════
# PROFILE DOCUMENTS
# ═══════════════════════════════════════════════════════════════

@_app.get("/profile/documents", tags=["profile"])
def get_profile_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    seen_types:   set[str]   = set()
    profile_docs: list[dict] = []

    direct_docs = (
        db.query(ProfileDocument)
        .filter(ProfileDocument.user_id == current_user.id)
        .order_by(ProfileDocument.uploaded_at.desc())
        .all()
    )
    for doc in direct_docs:
        dtype = _doc_type_value(doc)
        if dtype in seen_types:
            continue
        if not os.path.exists(doc.file_path):
            continue
        seen_types.add(dtype)
        profile_docs.append({
            "id":             doc.id,
            "doc_type":       dtype,
            "doc_label":      DOC_TYPE_LABELS.get(dtype, dtype),
            "original_name":  doc.original_name or doc.filename,
            "file_name":      doc.original_name or doc.filename,
            "uploaded_at":    doc.uploaded_at.isoformat() if doc.uploaded_at else None,
            "application_id": None,
            "source":         "profile",
        })

    if len(seen_types) < len(ALLOWED_DOC_TYPES):
        apps = (
            db.query(Application)
            .filter(
                Application.applicant_id == current_user.id,
                Application.submitted_at != None,
            )
            .order_by(Application.submitted_at.desc())
            .all()
        )
        for app_obj in apps:
            docs = (
                db.query(Document)
                .filter(Document.application_id == app_obj.id)
                .order_by(Document.uploaded_at.desc())
                .all()
            )
            for doc in docs:
                dtype = _doc_type_value(doc)
                if dtype in seen_types:
                    continue
                if not os.path.exists(doc.file_path):
                    continue
                seen_types.add(dtype)
                profile_docs.append({
                    "id":             doc.id,
                    "doc_type":       dtype,
                    "doc_label":      DOC_TYPE_LABELS.get(dtype, dtype),
                    "original_name":  doc.original_name or doc.filename,
                    "file_name":      doc.original_name or doc.filename,
                    "uploaded_at":    doc.uploaded_at.isoformat() if doc.uploaded_at else None,
                    "application_id": app_obj.id,
                    "source":         "application",
                })

    return {"documents": profile_docs}


@_app.post("/profile/documents", tags=["profile"])
async def upload_profile_document(
    request: Request,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid document type '{doc_type}'."
        )
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' is not allowed. Use PDF, PNG, JPG, or JPEG.",
        )
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds the {MAX_FILE_SIZE_MB} MB limit.",
        )

    existing = db.query(ProfileDocument).filter(
        ProfileDocument.user_id  == current_user.id,
        ProfileDocument.doc_type == DocumentType(doc_type),
    ).first()
    if existing:
        try:
            if os.path.exists(existing.file_path):
                os.remove(existing.file_path)
        except OSError:
            pass
        db.delete(existing); db.commit()

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = os.path.join(UPLOAD_DIR, unique_name)
    with open(save_path, "wb") as f:
        f.write(content)

    prof_doc = ProfileDocument(
        user_id=current_user.id,
        doc_type=DocumentType(doc_type),
        filename=unique_name,
        original_name=file.filename,
        file_path=save_path,
    )
    db.add(prof_doc); db.commit(); db.refresh(prof_doc)
    _log(db, "PROFILE_DOCUMENT_UPLOADED", user=current_user,
         target=f"profile_doc:{prof_doc.id}",
         detail=f"Uploaded profile doc '{doc_type}': {file.filename}",
         ip=_ip(request))
    return {
        "id":            prof_doc.id,
        "doc_type":      doc_type,
        "doc_label":     DOC_TYPE_LABELS.get(doc_type, doc_type),
        "original_name": file.filename,
        "file_name":     file.filename,
        "uploaded_at":   prof_doc.uploaded_at.isoformat() if prof_doc.uploaded_at else None,
        "source":        "profile",
        "message":       f"✓ '{DOC_TYPE_LABELS.get(doc_type, doc_type)}' saved to your profile.",
    }


class AttachProfileDocRequest(BaseModel):
    profile_doc_id: int
    doc_type:       str
    source:         str = "application"


@_app.post("/applications/{application_id}/documents/attach-profile", tags=["documents"])
def attach_profile_document(
    application_id: int,
    payload: AttachProfileDocRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if app_obj.submitted_at is not None:
        raise HTTPException(
            status_code=400, detail="Cannot modify a submitted application."
        )

    doc_type = payload.doc_type
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid document type '{doc_type}'."
        )

    db.expire_all()
    existing_docs = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    for d in existing_docs:
        if _doc_type_value(d) == doc_type:
            return {
                "id":            d.id,
                "doc_type":      _doc_type_value(d),
                "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                "original_name": d.original_name,
                "message":       "Document already present on this application.",
            }

    source_file_path = None
    source_original  = None
    source_filename  = None

    if payload.source == "profile":
        prof_doc = db.query(ProfileDocument).filter(
            ProfileDocument.id      == payload.profile_doc_id,
            ProfileDocument.user_id == current_user.id,
        ).first()
        if prof_doc:
            source_file_path = prof_doc.file_path
            source_original  = prof_doc.original_name
            source_filename  = prof_doc.filename

    if source_file_path is None:
        source_doc = db.query(Document).filter(
            Document.id == payload.profile_doc_id
        ).first()
        if not source_doc:
            raise HTTPException(
                status_code=404,
                detail="Profile document not found. Please upload a new file.",
            )
        source_app = db.query(Application).filter(
            Application.id           == source_doc.application_id,
            Application.applicant_id == current_user.id,
        ).first()
        if not source_app:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to use this document.",
            )
        source_file_path = source_doc.file_path
        source_original  = source_doc.original_name
        source_filename  = source_doc.filename

    if not os.path.exists(source_file_path):
        raise HTTPException(
            status_code=410,
            detail="The original file no longer exists. Please upload a new file.",
        )

    _, ext        = os.path.splitext(source_filename)
    new_filename  = f"{uuid.uuid4().hex}{ext}"
    new_file_path = os.path.join(UPLOAD_DIR, new_filename)
    try:
        shutil.copy2(source_file_path, new_file_path)
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to copy document file: {exc}"
        )

    new_doc = Document(
        application_id=application_id,
        doc_type=DocumentType(doc_type),
        filename=new_filename,
        original_name=source_original,
        file_path=new_file_path,
    )
    db.add(new_doc); db.commit(); db.refresh(new_doc)
    _log(db, "DOCUMENT_ATTACHED_FROM_PROFILE", user=current_user,
         target=f"application:{application_id}",
         detail=(
             f"Attached profile doc '{doc_type}' "
             f"(source={payload.source}, id={payload.profile_doc_id})"
         ),
         ip=_ip(request))
    return {
        "id":            new_doc.id,
        "doc_type":      doc_type,
        "doc_label":     DOC_TYPE_LABELS.get(doc_type, doc_type),
        "original_name": new_doc.original_name,
        "message":       f"✓ '{DOC_TYPE_LABELS.get(doc_type, doc_type)}' attached from your profile.",
    }


# ═══════════════════════════════════════════════════════════════
# DOCUMENT UPLOAD
# ═══════════════════════════════════════════════════════════════

@_app.post("/applications/{application_id}/documents", tags=["documents"])
async def upload_document(
    application_id: int,
    request: Request,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found.")
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Invalid document type '{doc_type}'."
        )

    db.expire_all()
    existing_docs = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    for d in existing_docs:
        if _doc_type_value(d) == doc_type:
            raise HTTPException(
                status_code=400,
                detail=f"A '{DOC_TYPE_LABELS[doc_type]}' is already uploaded.",
            )

    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail=f"File type '{ext}' not allowed."
        )
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail=f"File exceeds {MAX_FILE_SIZE_MB} MB limit."
        )

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = os.path.join(UPLOAD_DIR, unique_name)
    with open(save_path, "wb") as f:
        f.write(content)

    if doc_type == "experience":
        check_passed  = True
        check_message = "✓ Experience document accepted."
    else:
        try:
            loop = asyncio.get_running_loop()
            check_passed, check_message = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: _call_pre_submission_check(
                        file_path=save_path,
                        declared_type=doc_type,
                        applicant_name=current_user.full_name,
                        field_of_study=app_obj.field_of_study or "",
                        education_level=app_obj.education_level or "",
                    ),
                ),
                timeout=DOC_VERIFY_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            try:
                os.remove(save_path)
            except OSError:
                pass
            _log(db, "DOCUMENT_UPLOAD_FAILED", user=current_user,
                 target=f"application:{application_id}",
                 detail=f"Pre-check timed out for {doc_type}",
                 ip=_ip(request), status="failure")
            raise HTTPException(
                status_code=408,
                detail="Document verification timed out. Please try again.",
            )
        except HTTPException:
            raise
        except Exception:
            try:
                os.remove(save_path)
            except OSError:
                pass
            raise HTTPException(
                status_code=400,
                detail="Document verification service unavailable.",
            )

    if not check_passed:
        try:
            os.remove(save_path)
        except OSError:
            pass
        _log(db, "DOCUMENT_REJECTED", user=current_user,
             target=f"application:{application_id}",
             detail=f"Doc type '{doc_type}' rejected: {check_message[:200]}",
             ip=_ip(request), status="failure")
        raise HTTPException(status_code=400, detail=check_message)

    doc = Document(
        application_id=application_id,
        doc_type=DocumentType(doc_type),
        filename=unique_name,
        original_name=file.filename,
        file_path=save_path,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    _log(db, "DOCUMENT_UPLOADED", user=current_user,
         target=f"application:{application_id}",
         detail=f"Uploaded {doc_type}: {file.filename}", ip=_ip(request))

    db.expire_all()
    all_docs     = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    uploaded_set = {_doc_type_value(d) for d in all_docs}
    missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)

    return {
        "id":                   doc.id,
        "doc_type":             doc_type,
        "doc_label":            DOC_TYPE_LABELS[doc_type],
        "original_name":        file.filename,
        "validation_message":   check_message,
        "uploaded_types":       sorted(uploaded_set),
        "missing_types":        missing,
        "all_required_uploaded": len(missing) == 0,
        "message": (
            "✅ All required documents uploaded! "
            "Click 'Submit Application' to finalise."
            if len(missing) == 0 else
            f"Document uploaded. Still needed: "
            f"{', '.join(DOC_TYPE_LABELS_REQUIRED.get(m, m) for m in missing)}."
        ),
    }


@_app.get("/applications/{application_id}/documents", tags=["documents"])
def list_documents(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if (
        current_user.role == UserRole.applicant
        and app_obj.applicant_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not authorized")
    db.expire_all()
    docs         = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    uploaded_set = {_doc_type_value(d) for d in docs}
    missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)
    return {
        "documents": [{
            "id":            d.id,
            "doc_type":      _doc_type_value(d),
            "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
            "original_name": d.original_name,
            "uploaded_at":   d.uploaded_at,
            "url":           f"/uploads/{d.filename}",
        } for d in docs],
        "uploaded_types":       sorted(uploaded_set),
        "missing_types":        missing,
        "all_required_uploaded": len(missing) == 0,
    }


@_app.delete("/applications/{application_id}/documents/{doc_id}", tags=["documents"])
def delete_document(
    application_id: int, doc_id: int, request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    doc = db.query(Document).filter(
        Document.id             == doc_id,
        Document.application_id == application_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=403, detail="Not authorized")
    doc_type_str = _doc_type_value(doc)
    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except OSError:
        pass
    db.delete(doc); db.commit()
    _log(db, "DOCUMENT_DELETED", user=current_user,
         target=f"application:{application_id}",
         detail=f"Deleted document '{doc_type_str}'", ip=_ip(request))
    return {"detail": f"Document '{doc_type_str}' deleted. You can now re-upload."}


# ═══════════════════════════════════════════════════════════════
# HR — USER MANAGEMENT
# ═══════════════════════════════════════════════════════════════

class CreateUserRequest(BaseModel):
    full_name: str
    email:     EmailStr
    password:  str
    role:      str = "applicant"


@_app.get("/hr/users", tags=["hr"])
def list_users(db: Session = Depends(get_db), hr: User = Depends(require_hr)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [{
        "id":         u.id,
        "full_name":  u.full_name,
        "email":      u.email,
        "role":       u.role.value,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


@_app.post("/hr/users", status_code=201, tags=["hr"])
def create_user_as_hr(
    payload: CreateUserRequest, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    if payload.role not in ("applicant", "hr"):
        raise HTTPException(
            status_code=400, detail="role must be 'applicant' or 'hr'"
        )
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=400, detail="An account with this email already exists."
        )
    unmet = _validate_password_strength(payload.password)
    if unmet:
        raise HTTPException(
            status_code=422, detail="Password must contain: " + ", ".join(unmet)
        )
    new_user = User(
        full_name=payload.full_name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
    )
    db.add(new_user); db.commit(); db.refresh(new_user)
    _log(db, "HR_CREATED_USER", user=hr, target=f"user:{new_user.id}",
         detail=f"HR created {payload.role} account for {email}", ip=_ip(request))
    return {
        "id":         new_user.id,
        "full_name":  new_user.full_name,
        "email":      new_user.email,
        "role":       new_user.role.value,
        "created_at": new_user.created_at.isoformat() if new_user.created_at else None,
    }


@_app.delete("/hr/users/{user_id}", tags=["hr"])
def delete_user_as_hr(
    user_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    if user_id == hr.id:
        raise HTTPException(
            status_code=400, detail="You cannot delete your own account."
        )
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    deleted_name  = target.full_name
    deleted_email = target.email
    applications  = db.query(Application).filter(
        Application.applicant_id == user_id
    ).all()
    for app_obj in applications:
        docs = db.query(Document).filter(
            Document.application_id == app_obj.id
        ).all()
        for doc in docs:
            try:
                if os.path.exists(doc.file_path):
                    os.remove(doc.file_path)
            except OSError:
                pass
            db.delete(doc)
        db.delete(app_obj)
    prof_docs = db.query(ProfileDocument).filter(
        ProfileDocument.user_id == user_id
    ).all()
    for pd in prof_docs:
        try:
            if os.path.exists(pd.file_path):
                os.remove(pd.file_path)
        except OSError:
            pass
        db.delete(pd)
    db.delete(target); db.commit()
    _log(db, "HR_DELETED_USER", user=hr, target=f"user:{user_id}",
         detail=f"HR deleted user '{deleted_name}' ({deleted_email})", ip=_ip(request))
    return {
        "detail": (
            f"User '{deleted_name}' and all associated data "
            "have been permanently deleted."
        )
    }


# ═══════════════════════════════════════════════════════════════
# HR — JOBS
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/jobs", response_model=List[JobResponse], tags=["hr"])
def list_all_jobs_hr(
    db: Session = Depends(get_db), hr: User = Depends(require_hr)
):
    return db.query(Job).filter(Job.is_active == True).all()


# ═══════════════════════════════════════════════════════════════
# HR — SYSTEM LOGS
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/logs", tags=["hr"])
def get_system_logs(
    user_id:       Optional[int] = None,
    action:        Optional[str] = None,
    status_filter: Optional[str] = None,
    search:        Optional[str] = None,
    limit:  int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    hr: User    = Depends(require_hr),
):
    query = db.query(SystemLog)
    if user_id:       query = query.filter(SystemLog.user_id == user_id)
    if action:        query = query.filter(SystemLog.action == action.upper())
    if status_filter: query = query.filter(SystemLog.status == status_filter.lower())
    if search:
        like  = f"%{search}%"
        query = query.filter(or_(
            SystemLog.user_email.ilike(like),
            SystemLog.detail.ilike(like),
            SystemLog.action.ilike(like),
            SystemLog.target.ilike(like),
        ))
    total = query.count()
    logs  = query.order_by(desc(SystemLog.created_at)).offset(offset).limit(limit).all()
    return {
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "logs": [{
            "id":           log.id,
            "user_id":      log.user_id,
            "user_email":   log.user_email,
            "user_role":    log.user_role,
            "action":       log.action,
            "target":       log.target,
            "detail":       log.detail,
            "ip_address":   log.ip_address,
            "status":       log.status,
            "created_at":   log.created_at.isoformat() if log.created_at else None,
        } for log in logs],
    }


@_app.delete("/hr/logs", tags=["hr"])
def clear_old_logs(
    older_than_days: int = 30,
    db: Session = Depends(get_db),
    hr: User    = Depends(require_hr),
):
    from datetime import timedelta
    cutoff  = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    deleted = db.query(SystemLog).filter(SystemLog.created_at < cutoff).delete()
    db.commit()
    _log(db, "LOGS_CLEARED", user=hr,
         detail=f"HR cleared {deleted} log entries older than {older_than_days} days")
    return {
        "deleted": deleted,
        "message": f"Cleared {deleted} log entries older than {older_than_days} days.",
    }


# ═══════════════════════════════════════════════════════════════
# HR document download endpoints
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/documents/{doc_id}/download", tags=["hr"])
def hr_download_document(
    doc_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(
            status_code=410, detail="File no longer exists on the server"
        )
    filename  = doc.original_name or doc.filename
    _, ext    = os.path.splitext(filename)
    media_map = {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    media_type = media_map.get(ext.lower(), "application/octet-stream")
    _log(db, "HR_DOCUMENT_DOWNLOAD", user=hr, target=f"document:{doc_id}",
         detail=(
             f"HR downloaded document '{filename}' "
             f"for application:{doc.application_id}"
         ),
         ip=_ip(request))
    return FileResponse(
        path=doc.file_path,
        filename=filename,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@_app.get("/hr/applications/{application_id}/documents", tags=["hr"])
def hr_list_application_documents(
    application_id: int,
    db: Session = Depends(get_db),
    hr: User    = Depends(require_hr),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    docs = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    return {
        "application_id": application_id,
        "documents": [{
            "id":            d.id,
            "doc_type":      _doc_type_value(d),
            "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
            "original_name": d.original_name or d.filename,
            "uploaded_at":   d.uploaded_at.isoformat() if d.uploaded_at else None,
            "file_url":      f"/uploads/{d.filename}",
            "download_url":  f"/hr/documents/{d.id}/download",
            "exists":        os.path.exists(d.file_path),
        } for d in docs],
    }


# ═══════════════════════════════════════════════════════════════
# HR DASHBOARD
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/candidates", tags=["hr"])
def get_all_candidates(
    job_id: Optional[int] = None,
    db: Session = Depends(get_db),
    hr: User    = Depends(require_hr),
):
    query = (
        db.query(Application, User, Job)
        .join(User, Application.applicant_id == User.id)
        .join(Job,  Application.job_id       == Job.id)
        .filter(Application.submitted_at != None)
    )
    if job_id:
        query = query.filter(Application.job_id == job_id)

    rows = []
    for app, user, job in query.all():
        docs = db.query(Document).filter(
            Document.application_id == app.id
        ).all()
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
            "documents": [{
                "id":            d.id,
                "doc_type":      _doc_type_value(d),
                "original_name": d.original_name or d.filename,
                "uploaded_at":   d.uploaded_at,
                "download_url":  f"/hr/documents/{d.id}/download",
            } for d in docs],
        })

    return _rank_candidates(rows)


# ═══════════════════════════════════════════════════════════════
# HR REPORT
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/report/{job_id}", tags=["hr"])
def get_job_report(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User    = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows = (
        db.query(Application, User)
        .join(User, Application.applicant_id == User.id)
        .filter(
            Application.job_id       == job_id,
            Application.submitted_at != None,
        )
        .all()
    )

    candidates = []
    for app_obj, user in rows:
        reason_data = _parse_reason_data(app_obj)
        docs        = db.query(Document).filter(
            Document.application_id == app_obj.id
        ).all()
        candidates.append({
            "application_id":    app_obj.id,
            "full_name":         user.full_name,
            "email":             user.email,
            "gender":            app_obj.gender,
            "education_level":   app_obj.education_level,
            "field_of_study":    app_obj.field_of_study,
            "graduation_year":   app_obj.graduation_year,
            "experience_years":  app_obj.experience_years,
            "skills":            app_obj.skills,
            "certifications":    app_obj.certifications,
            "decision":          _decision_value(app_obj),
            "ai_score":          app_obj.ai_score,
            "ai_reason":         app_obj.ai_reason,
            "doc_verified":      app_obj.doc_verified,
            "doc_advisory":      getattr(app_obj, "doc_advisory", False),
            "submitted_at":      app_obj.submitted_at.isoformat()   if app_obj.submitted_at   else None,
            "shortlisted_at":    app_obj.shortlisted_at.isoformat() if app_obj.shortlisted_at else None,
            "criteria_met":      reason_data.get("criteria_met",      []),
            "criteria_failed":   reason_data.get("criteria_failed",   []),
            "criteria_warnings": reason_data.get("criteria_warnings", []),
            "summary":           reason_data.get("summary",           ""),
            "ml_confidence":     reason_data.get("ml_confidence"),
            "ml_note":           reason_data.get("ml_note",           ""),
            "documents_count":   len(docs),
            "documents": [{
                "doc_type":      _doc_type_value(d),
                "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                "original_name": d.original_name,
                "download_url":  f"/hr/documents/{d.id}/download",
            } for d in docs],
        })

    ranked = _rank_candidates(candidates)
    rank_counter = 1
    for c in ranked:
        if c["decision"] == "shortlisted":
            c["shortlist_rank"] = rank_counter
            rank_counter += 1
        else:
            c["shortlist_rank"] = None

    total         = len(ranked)
    shortlisted_n = sum(1 for c in ranked if c["decision"] == "shortlisted")
    rejected_n    = sum(1 for c in ranked if c["decision"] == "not_shortlisted")
    pending_n     = sum(1 for c in ranked if c["decision"] == "pending")
    scored        = [c["ai_score"] for c in ranked if c["ai_score"] is not None]

    return {
        "job": {
            "id":                       job.id,
            "title":                    job.title,
            "description":              job.description,
            "location":                 job.location,
            "employment_type":          job.employment_type,
            "job_level":                job.job_level,
            "number_of_posts":          job.number_of_posts,
            "deadline":                 job.deadline.isoformat() if job.deadline else None,
            "required_education_levels": job.required_education_levels,
            "required_fields":          job.required_fields,
            "required_min_experience":  job.required_min_experience,
            "required_max_experience":  job.required_max_experience,
            "required_skills":          job.required_skills,
            "required_certifications":  job.required_certifications,
            "preferred_qualifications": job.preferred_qualifications,
            "responsibilities":         job.responsibilities,
            "created_at":               job.created_at.isoformat() if job.created_at else None,
        },
        "summary": {
            "total_applicants": total,
            "shortlisted":      shortlisted_n,
            "not_shortlisted":  rejected_n,
            "pending":          pending_n,
            "average_score":    round(sum(scored) / len(scored), 4) if scored else None,
            "top_score":        round(max(scored), 4)               if scored else None,
            "shortlist_rate":   round(shortlisted_n / total, 4)     if total  else 0,
        },
        "candidates":   ranked,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════
# SHORTLISTING — core worker
# ═══════════════════════════════════════════════════════════════

def _run_verification_and_prediction(app_obj, job, user, docs, db):
    try:
        try:
            from ai_matcher import _m as _ai_model_ref
            _ai_model_ref()
        except Exception:
            pass

        doc_paths  = [d.file_path        for d in docs]
        doc_types  = [_doc_type_value(d) for d in docs]

        VERIFIABLE   = {"id_card", "cv", "diploma", "certificate"}
        verify_paths = [p for p, t in zip(doc_paths, doc_types) if t in VERIFIABLE]
        verify_types = [t for t in doc_types if t in VERIFIABLE]

        gate_verified, gate_advisory, gate_detail = _call_verify_documents(
            applicant_name  = user.full_name,
            education_level = app_obj.education_level or "",
            field_of_study  = app_obj.field_of_study  or "",
            document_paths  = verify_paths,
            declared_types  = verify_types,
        )
        identity_match = "Identity: ✓" in gate_detail

        doc_texts = _extract_all_doc_texts(docs, budget_seconds=OCR_CANDIDATE_BUDGET_SECONDS)

        try:
            decision_str, score, reason_json, doc_result = _call_predict(
                app_obj,
                job,
                doc_texts      = doc_texts,
                document_paths = verify_paths,
                declared_types = verify_types,
            )
        except HTTPException as he:
            if he.status_code == 503:
                decision_str = "not_shortlisted"
                score        = 0.0
                reason_json  = json.dumps({
                    "decision":          "not_shortlisted",
                    "score":             0.0,
                    "ml_confidence":     0.0,
                    "ml_note":           "ML engine temporarily unavailable.",
                    "criteria_met":      [],
                    "criteria_warnings": [],
                    "criteria_failed": [
                        f"AI shortlisting engine unavailable: {he.detail}. "
                        "HR must review this candidate manually."
                    ],
                    "summary": f"Engine unavailable: {he.detail}",
                }, ensure_ascii=False)
                doc_result = {
                    "verified": gate_verified,
                    "advisory": gate_advisory,
                    "summary":  gate_detail,
                }
            else:
                raise

        is_blocking = (not gate_verified) and _is_blocking_doc_failure(gate_detail)
        if is_blocking:
            decision_str = "not_shortlisted"
            try:
                reason_obj = json.loads(reason_json)
            except Exception:
                reason_obj = {
                    "criteria_met":      [],
                    "criteria_failed":   [],
                    "criteria_warnings": [],
                    "summary":           reason_json,
                }
            reason_obj["decision"] = "not_shortlisted"
            reason_obj.setdefault("criteria_failed", []).insert(
                0, f"Document verification failed: {gate_detail}"
            )
            reason_obj["summary"] = (
                f"Document verification failed. {reason_obj.get('summary', '')}"
            )
            reason_json = json.dumps(reason_obj, ensure_ascii=False)

        app_obj.decision       = DecisionStatus(decision_str)
        app_obj.ai_score       = round(float(score), 4)
        app_obj.ai_reason      = reason_json
        app_obj.doc_verified   = doc_result.get("verified", gate_verified)
        app_obj.doc_advisory   = doc_result.get("advisory", gate_advisory)
        app_obj.shortlisted_at = datetime.now(timezone.utc)
        db.add(app_obj)
        db.commit()

        return {
            "application_id": app_obj.id,
            "applicant":      user.full_name,
            "decision":       decision_str,
            "score":          round(float(score), 4),
            "doc_verified":   doc_result.get("verified", gate_verified),
            "doc_advisory":   doc_result.get("advisory", gate_advisory),
            "identity_match": identity_match,
            "reason":         reason_json,
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            f"[shortlist] ⚠️  Error processing application {app_obj.id} "
            f"for '{user.full_name}': {exc!r}"
        )
        error_reason = json.dumps({
            "decision":          "not_shortlisted",
            "score":             0.0,
            "ml_confidence":     0.0,
            "ml_note":           "Processing error — see criteria_failed for details.",
            "criteria_met":      [],
            "criteria_warnings": [],
            "criteria_failed": [
                f"Automated processing encountered an error: "
                f"{type(exc).__name__}: {exc}."
            ],
            "summary": f"Could not process automatically due to an error: {exc}",
        }, ensure_ascii=False)

        app_obj.decision       = DecisionStatus("not_shortlisted")
        app_obj.ai_score       = 0.0
        app_obj.ai_reason      = error_reason
        app_obj.doc_verified   = False
        app_obj.doc_advisory   = False
        app_obj.shortlisted_at = datetime.now(timezone.utc)
        db.add(app_obj)
        try:
            db.commit()
        except Exception as commit_err:
            print(
                f"[shortlist] ⚠️  Failed to commit error state "
                f"for app {app_obj.id}: {commit_err!r}"
            )
            try:
                db.rollback()
            except Exception:
                pass

        return {
            "application_id": app_obj.id,
            "applicant":      user.full_name,
            "decision":       "not_shortlisted",
            "score":          0.0,
            "doc_verified":   False,
            "doc_advisory":   False,
            "identity_match": False,
            "reason":         error_reason,
            "error":          str(exc),
        }


@_app.post("/hr/shortlist/{application_id}", response_model=ShortlistResult, tags=["hr"])
def shortlist_application(
    application_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    job    = db.query(Job).filter(Job.id == app_obj.job_id).first()
    user   = db.query(User).filter(User.id == app_obj.applicant_id).first()
    docs   = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    result = _run_verification_and_prediction(app_obj, job, user, docs, db)
    db.refresh(app_obj)
    _log(db, "SHORTLIST", user=hr, target=f"application:{application_id}",
         detail=(
             f"Shortlisted '{user.full_name}' for '{job.title}' → "
             f"{result['decision']} (score={result['score']})"
         ),
         ip=_ip(request))
    return ShortlistResult(
        application_id=application_id,
        applicant_name=user.full_name,
        job_title=job.title,
        decision=result["decision"],
        ai_score=result["score"],
        doc_verified=result["doc_verified"],
        identity_match=result["identity_match"],
        reason=result["reason"],
    )


# ═══════════════════════════════════════════════════════════════
# Fire-and-forget shortlist-all
# ═══════════════════════════════════════════════════════════════

def _process_one_candidate(app_id: int, hr_id: int, job_id: int) -> dict:
    if SessionLocal is None:
        return {
            "application_id": app_id,
            "applicant":      "unknown",
            "decision":       "not_shortlisted",
            "score":          0.0,
            "doc_verified":   False,
            "doc_advisory":   False,
            "identity_match": False,
            "reason":         "{}",
            "error":          "SessionLocal not available",
        }

    db = SessionLocal()
    try:
        app_obj = db.query(Application).filter(Application.id == app_id).first()
        if not app_obj:
            return {
                "application_id": app_id,
                "error":    "not found",
                "decision": "not_shortlisted",
                "score":    0.0,
            }

        job  = db.query(Job).filter(Job.id == app_obj.job_id).first()
        user = db.query(User).filter(User.id == app_obj.applicant_id).first()
        docs = db.query(Document).filter(
            Document.application_id == app_obj.id
        ).all()

        if not docs:
            no_doc_reason = json.dumps({
                "decision":          "not_shortlisted",
                "score":             0.0,
                "ml_confidence":     0.0,
                "ml_note":           "No documents found for this application.",
                "criteria_met":      [],
                "criteria_warnings": [],
                "criteria_failed": [
                    "No documents were found for this application. "
                    "The candidate may have submitted without uploading files. "
                    "HR must review manually."
                ],
                "summary": "No documents found — manual HR review required.",
            }, ensure_ascii=False)
            try:
                app_obj.decision       = DecisionStatus("not_shortlisted")
                app_obj.ai_score       = 0.0
                app_obj.ai_reason      = no_doc_reason
                app_obj.doc_verified   = False
                app_obj.doc_advisory   = False
                app_obj.shortlisted_at = datetime.now(timezone.utc)
                db.add(app_obj)
                db.commit()
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass
            full_name = user.full_name if user else "unknown"
            return {
                "application_id": app_id,
                "applicant":      full_name,
                "decision":       "not_shortlisted",
                "score":          0.0,
                "doc_verified":   False,
                "doc_advisory":   False,
                "identity_match": False,
                "reason":         no_doc_reason,
            }

        return _run_verification_and_prediction(app_obj, job, user, docs, db)

    except Exception as exc:
        print(
            f"[shortlist_all] ⚠️  Unhandled error for app_id={app_id}: {exc!r}"
        )
        return {
            "application_id": app_id,
            "applicant":      "unknown",
            "decision":       "not_shortlisted",
            "score":          0.0,
            "doc_verified":   False,
            "doc_advisory":   False,
            "identity_match": False,
            "reason":         "{}",
            "error":          str(exc),
        }
    finally:
        db.close()


def _make_timeout_reason(app_id: int) -> str:
    return json.dumps({
        "decision":          "not_shortlisted",
        "score":             0.0,
        "ml_confidence":     0.0,
        "ml_note":           "Processing timed out.",
        "criteria_met":      [],
        "criteria_warnings": [],
        "criteria_failed": [
            f"Processing timed out after {CANDIDATE_TIMEOUT_SECONDS}s. "
            "HR review required. Try re-shortlisting this candidate individually."
        ],
        "summary": (
            "Automated processing timed out. "
            "Please re-shortlist this candidate individually."
        ),
    }, ensure_ascii=False)


def _write_timeout_to_db(app_id: int, reason_json: str) -> None:
    if SessionLocal is None:
        return
    _db = SessionLocal()
    try:
        app_obj = _db.query(Application).filter(Application.id == app_id).first()
        if app_obj:
            app_obj.decision       = DecisionStatus("not_shortlisted")
            app_obj.ai_score       = 0.0
            app_obj.ai_reason      = reason_json
            app_obj.doc_verified   = False
            app_obj.doc_advisory   = False
            app_obj.shortlisted_at = datetime.now(timezone.utc)
            _db.add(app_obj)
            _db.commit()
    except Exception as dbe:
        print(
            f"[shortlist_all] ⚠️  Failed to write timeout result "
            f"for app_id={app_id}: {dbe!r}"
        )
        try:
            _db.rollback()
        except Exception:
            pass
    finally:
        _db.close()


def _run_all_in_thread(app_ids: list[int], hr_id: int, job_id: int) -> None:
    total             = len(app_ids)
    done              = 0
    shortlisted_count = 0
    error_count       = 0

    _set_job_status(
        job_id,
        processing=True, total=total,
        done=0, shortlisted=0, not_shortlisted=0, errors=0,
    )

    future_to_app_id: dict[concurrent.futures.Future, int] = {}
    for app_id in app_ids:
        fut = _CANDIDATE_POOL.submit(_process_one_candidate, app_id, hr_id, job_id)
        future_to_app_id[fut] = app_id

    for fut in concurrent.futures.as_completed(future_to_app_id, timeout=None):
        app_id = future_to_app_id[fut]
        try:
            result = fut.result(timeout=CANDIDATE_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            fut.cancel()
            print(
                f"[shortlist_all] ⏱ Timeout processing app_id={app_id} "
                f"after {CANDIDATE_TIMEOUT_SECONDS}s"
            )
            reason_json = _make_timeout_reason(app_id)
            _write_timeout_to_db(app_id, reason_json)
            result = {
                "application_id": app_id,
                "applicant":      "unknown",
                "decision":       "not_shortlisted",
                "score":          0.0,
                "doc_verified":   False,
                "doc_advisory":   False,
                "identity_match": False,
                "reason":         reason_json,
                "error":          "timeout",
            }
            error_count += 1
        except Exception as exc:
            print(
                f"[shortlist_all] ⚠️  Future raised for app_id={app_id}: {exc!r}"
            )
            result      = {
                "application_id": app_id,
                "error":    str(exc),
                "decision": "not_shortlisted",
            }
            error_count += 1

        done += 1
        if result.get("decision") == "shortlisted":
            shortlisted_count += 1

        _set_job_status(
            job_id,
            done=done,
            shortlisted=shortlisted_count,
            not_shortlisted=done - shortlisted_count,
            errors=error_count,
        )

    if SessionLocal is not None:
        _db = SessionLocal()
        try:
            hr      = _db.query(User).filter(User.id == hr_id).first()
            job_obj = _db.query(Job).filter(Job.id == job_id).first()
            if hr and job_obj:
                _log(
                    _db, "SHORTLIST_ALL", user=hr, target=f"job:{job_id}",
                    detail=(
                        f"Bulk shortlisted {done} for '{job_obj.title}' — "
                        f"{shortlisted_count} shortlisted, {error_count} errors"
                    ),
                )
        except Exception as exc:
            print(f"[shortlist_all] ⚠️  Audit log failed: {exc!r}")
        finally:
            _db.close()

    _set_job_status(job_id, processing=False, done=done, total=total)


@_app.get("/hr/shortlist-status/{job_id}", tags=["hr"])
def shortlist_status(job_id: int, hr: User = Depends(require_hr)):
    s = _get_job_status(job_id)
    if not s:
        return {
            "processing":      False,
            "total":           0,
            "done":            0,
            "shortlisted":     0,
            "not_shortlisted": 0,
            "errors":          0,
        }
    return {
        "processing":      s.get("processing",      False),
        "total":           s.get("total",           0),
        "done":            s.get("done",            0),
        "shortlisted":     s.get("shortlisted",     0),
        "not_shortlisted": s.get("not_shortlisted", 0),
        "errors":          s.get("errors",          0),
        "batch_error":     s.get("batch_error"),
    }


@_app.post("/hr/shortlist-all/{job_id}", tags=["hr"])
async def shortlist_all_for_job(
    job_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    if _predict is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI shortlisting engine is still loading. "
                "Please wait 30–60 seconds and try again. "
                f"ML load error: {_ML_LOAD_ERROR or 'none'}"
            ),
        )

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current = _get_job_status(job_id)
    if current.get("processing"):
        return JSONResponse(status_code=202, content={
            "message":    "Shortlisting already in progress for this job.",
            "processing": True,
            **current,
        })

    same_title_ids = [j.id for j in db.query(Job).filter(Job.title == job.title).all()]

    all_apps = db.query(Application).filter(
        Application.job_id.in_(same_title_ids),
        Application.submitted_at != None,
        or_(
            Application.decision == None,
            Application.decision == DecisionStatus.pending,
            Application.ai_reason == None,
            Application.ai_reason == "",
        ),
    ).all()

    if not all_apps:
        total_apps = db.query(Application).filter(
            Application.job_id.in_(same_title_ids),
            Application.submitted_at != None,
        ).count()
        if total_apps > 0:
            return JSONResponse(status_code=200, content={
                "message": (
                    f"All {total_apps} candidate(s) for '{job.title}' have already "
                    "been evaluated. Use 'Re-shortlist All' to re-run the AI on all candidates."
                ),
                "processing":        False,
                "processed":         0,
                "shortlisted":       0,
                "not_shortlisted":   0,
                "already_processed": total_apps,
            })
        return JSONResponse(status_code=200, content={
            "message":       "No submitted applications found for this position.",
            "processing":    False,
            "processed":     0,
            "shortlisted":   0,
            "not_shortlisted": 0,
        })

    hr_id   = hr.id
    app_ids = [a.id for a in all_apps]
    count   = len(app_ids)

    _set_job_status(
        job_id,
        processing=True, total=count,
        done=0, shortlisted=0, not_shortlisted=0, errors=0,
    )

    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        _ML_THREAD_POOL,
        lambda: _run_all_in_thread(app_ids, hr_id, job_id),
    )

    _log(db, "SHORTLIST_ALL_STARTED", user=hr, target=f"job:{job_id}",
         detail=(
             f"Bulk shortlisting started for '{job.title}' — "
             f"{count} pending application(s)"
         ),
         ip=_ip(request))

    return JSONResponse(status_code=202, content={
        "message": (
            f"Shortlisting started for {count} pending candidate(s). "
            f"Poll /hr/shortlist-status/{job_id} for progress."
        ),
        "processing": True,
        "total":      count,
        "job_id":     job_id,
    })


@_app.post(
    "/hr/reshortlist/{application_id}",
    response_model=ShortlistResult,
    tags=["hr"],
)
def reshortlist_application(
    application_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    job    = db.query(Job).filter(Job.id == app_obj.job_id).first()
    user   = db.query(User).filter(User.id == app_obj.applicant_id).first()
    docs   = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    result = _run_verification_and_prediction(app_obj, job, user, docs, db)
    db.refresh(app_obj)
    _log(db, "RESHORTLIST", user=hr, target=f"application:{application_id}",
         detail=(
             f"Re-shortlisted '{user.full_name}' → "
             f"{result['decision']} (score={result['score']})"
         ),
         ip=_ip(request))
    return ShortlistResult(
        application_id=application_id,
        applicant_name=user.full_name,
        job_title=job.title,
        decision=result["decision"],
        ai_score=result["score"],
        doc_verified=result["doc_verified"],
        identity_match=result["identity_match"],
        reason=result["reason"],
    )


@_app.post("/hr/reshortlist-all/{job_id}", tags=["hr"])
async def reshortlist_all_for_job(
    job_id: int, request: Request,
    db: Session = Depends(get_db), hr: User = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current = _get_job_status(job_id)
    if current.get("processing"):
        return JSONResponse(status_code=202, content={
            "message":    "Processing already in progress for this job.",
            "processing": True,
            **current,
        })

    same_title_ids = [
        j.id for j in db.query(Job).filter(Job.title == job.title).all()
    ]
    all_apps = db.query(Application).filter(
        Application.job_id.in_(same_title_ids),
        Application.submitted_at != None,
    ).all()

    if not all_apps:
        return JSONResponse(status_code=200, content={
            "message":       "No applications found",
            "processing":    False,
            "processed":     0,
            "shortlisted":   0,
            "not_shortlisted": 0,
        })

    hr_id   = hr.id
    app_ids = [a.id for a in all_apps]
    count   = len(app_ids)

    _set_job_status(
        job_id,
        processing=True, total=count,
        done=0, shortlisted=0, not_shortlisted=0, errors=0,
    )

    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        _ML_THREAD_POOL,
        lambda: _run_all_in_thread(app_ids, hr_id, job_id),
    )

    _log(db, "RESHORTLIST_ALL_STARTED", user=hr, target=f"job:{job_id}",
         detail=(
             f"Bulk re-shortlisting started for '{job.title}' — "
             f"{count} application(s)"
         ),
         ip=_ip(request))

    return JSONResponse(status_code=202, content={
        "message": (
            f"Re-shortlisting started for {count} candidate(s). "
            f"Poll /hr/shortlist-status/{job_id} for progress."
        ),
        "processing": True,
        "total":      count,
        "job_id":     job_id,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)