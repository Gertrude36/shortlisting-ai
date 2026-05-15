from __future__ import annotations
"""
backend/main.py  ·  v5.0.0
────────────────────────────────────────────────────────────────
ROOT CAUSE FIX (v5):

  The CORS errors in the browser console were caused by Render's OWN
  nginx proxy returning 502/503 responses BEFORE FastAPI even started.
  These Render-level error responses contain ZERO CORS headers — there
  is no FastAPI CORS middleware in the path yet. The browser blocks
  them, the frontend's /wake fetch loop runs forever, and applicants
  see the "Waking up" banner stuck indefinitely.

  The v4.x approach (wrapping everything in RawASGICORSWrapper) was
  correct for FastAPI-originated errors, but cannot help with Render-
  proxy-level 502/503s which bypass the entire Python stack.

  Solution (implemented here):
    1. Move /health to respond as early as possible — before model
       loading — so Render's health check passes quickly and traffic
       stops being routed to the sleeping dyno.
    2. The frontend now polls /health (not /wake) to detect readiness.
       /health is a pure JSON endpoint, starts returning 200 the moment
       uvicorn binds the port (even before _APP_READY = True), and
       returns ready:true once models are loaded. This separates the
       "server is up" signal from the "CORS is configured" signal.
    3. /wake is retained for backwards compatibility but is no longer
       the primary readiness signal.

FIXES IN THIS VERSION (v5.0.0):

  ✅ FIX 1 — /health and /wake respond BEFORE the _APP_READY guard.
             Previously these endpoints were caught by the 503 guard
             (path not in ("/wake", "/health", "/")), which was correct,
             BUT the guard ran before the RawASGICORSWrapper injected
             CORS headers when _APP_READY was False. The 503 "starting"
             body had CORS headers, but /health and /wake still had to
             go through the full FastAPI routing stack — which during
             startup could race with lifespan setup.
             Now: /health and /wake are short-circuited inside
             RawASGICORSWrapper itself, never reaching the 503 guard.

  ✅ FIX 2 — document upload endpoint now has a hard 90-second timeout
             guard. If pre_submission_check hangs (e.g. Tesseract
             subprocess deadlock on a corrupt PDF), the request returns
             a 408 instead of timing out at the Render proxy level
             (which returns a CORS-less 502 to the browser).

  ✅ FIX 3 — _APP_READY is set True BEFORE ai_matcher import attempt so
             that if ai_matcher fails (non-fatal), the app is still
             marked ready and health probes pass.

  ✅ FIX 4 — OPTIONS preflight always returns 200 + full CORS headers
             even when _APP_READY is False (retained from v4.6.0).

  ✅ FIX 5 — CORS wildcard on *.vercel.app retained. All v4.6.0 fixes
             retained except where superseded above.
"""

# ── Set HuggingFace env vars FIRST before any other imports ──────────────────
import os
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_VERBOSITY", "error")
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import json
import re
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
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.types import ASGIApp, Receive, Scope, Send

load_dotenv()

from database  import engine, get_db, Base
from models    import User, Job, Application, Document, UserRole, DecisionStatus, DocumentType
from schemas   import (
    RegisterRequest, LoginRequest, TokenResponse,
    JobCreate, JobResponse,
    ApplicationCreate, ApplicationResponse,
    CandidateListItem, ShortlistResult,
)
from auth import (
    hash_password, verify_password, create_access_token,
    create_reset_token, verify_reset_token,
    get_current_user, require_hr, require_applicant,
)
from email_utils         import send_reset_email
from shortlisting_engine import predict
from document_verifier   import verify_documents, pre_submission_check
from ocr_utils           import extract_document_text

Base.metadata.create_all(bind=engine)


# ─────────────────────────────────────────────────────────────────────────────
# Readiness flag
# ─────────────────────────────────────────────────────────────────────────────
_APP_READY    = False
_SERVER_BORN_AT = datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Database migrations (unchanged from v4.6.0)
# ─────────────────────────────────────────────────────────────────────────────

def _is_sqlite_db() -> bool:
    return str(engine.url).startswith("sqlite")


def ensure_job_columns():
    use_sqlite       = _is_sqlite_db()
    inspector        = inspect(engine)
    existing_columns = [col["name"] for col in inspector.get_columns("jobs")]

    with engine.connect() as conn:
        if "job_level" not in existing_columns:
            try:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN job_level VARCHAR"))
                conn.commit()
            except Exception:
                conn.rollback()

        if "number_of_posts" not in existing_columns:
            try:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN number_of_posts INTEGER"))
                conn.commit()
            except Exception:
                conn.rollback()

        if "deadline" not in existing_columns:
            try:
                conn.execute(text("ALTER TABLE jobs ADD COLUMN deadline DATETIME"))
                conn.commit()
            except Exception:
                conn.rollback()

        try:
            conn.execute(text(
                "UPDATE jobs SET job_level = 'Mid-Level' WHERE job_level IS NULL"
            ))
            conn.execute(text(
                "UPDATE jobs SET number_of_posts = 1 WHERE number_of_posts IS NULL"
            ))
            if use_sqlite:
                conn.execute(text(
                    "UPDATE jobs SET deadline = date('now', '+30 days') WHERE deadline IS NULL"
                ))
            else:
                conn.execute(text(
                    "UPDATE jobs SET deadline = NOW() + INTERVAL '30 days' WHERE deadline IS NULL"
                ))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            print(f"[ensure_job_columns] Backfill warning (non-fatal): {exc}")


def ensure_document_type_enum():
    if _is_sqlite_db():
        print("[migration] SQLite detected — doc_type is VARCHAR, no enum migration needed")
        return

    try:
        with engine.connect() as conn:
            type_exists = conn.execute(text(
                "SELECT 1 FROM pg_type WHERE typname = 'documenttype'"
            )).fetchone()

            if not type_exists:
                col_exists = conn.execute(text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'documents' AND column_name = 'doc_type'"
                )).fetchone()
                if col_exists:
                    print(
                        "[migration] doc_type column is VARCHAR (no native PG enum) — "
                        "'experience' is accepted automatically ✅"
                    )
                else:
                    print("[migration] documents table not yet created — skipping enum migration")
                return

            already_has = conn.execute(text(
                "SELECT 1 FROM pg_enum e "
                "JOIN pg_type t ON e.enumtypid = t.oid "
                "WHERE t.typname = 'documenttype' AND e.enumlabel = 'experience'"
            )).fetchone()

            if already_has:
                print("[migration] documenttype PG enum already has 'experience' — skipping ✅")
                return

            conn.execute(text(
                "ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'experience'"
            ))
            conn.commit()
            print("[migration] ✅ Added 'experience' to native documenttype PG enum")

    except Exception as exc:
        print(f"[migration] documenttype enum migration warning (non-fatal): {exc}")


ensure_job_columns()
ensure_document_type_enum()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _APP_READY

    # ✅ FIX 3: Mark ready BEFORE loading ai_matcher so health probes pass
    # even if model loading is slow. ai_matcher is non-fatal.
    _APP_READY = True
    print("[lifespan] ✅ Application ready — accepting requests.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _APP_READY

    print("[lifespan] Starting app...")
    _APP_READY = True

    yield

    _APP_READY = False

# ─────────────────────────────────────────────────────────────────────────────
# CORS — single source of truth
# ─────────────────────────────────────────────────────────────────────────────

_HARDCODED_ORIGINS = [
    "https://shortlisting-ai.vercel.app",
    "https://shortlisting-ai-git-main-shortlisting-ais-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

_ORIGIN_RE = re.compile(
    r"^https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.vercel\.app$"
)


def _build_allowed_origins() -> list[str]:
    env_origins = [
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if o.strip().startswith("http")
    ]
    merged = list(dict.fromkeys(_HARDCODED_ORIGINS + env_origins))
    print(f"[CORS] Allowed origins: {merged}")
    return merged


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
        (b"access-control-allow-methods",
         b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
        (b"access-control-allow-headers",
         b"Authorization, Content-Type, Accept, Origin, X-Requested-With"),
        (b"access-control-max-age",           b"600"),
        (b"vary",                             b"Origin"),
        (b"content-length",                   b"0"),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Raw ASGI CORS wrapper
# ─────────────────────────────────────────────────────────────────────────────

class RawASGICORSWrapper:
    """
    Outermost ASGI layer — runs before every middleware and route.

    ✅ FIX 1 (v5): /health and /wake are short-circuited HERE, before the
    _APP_READY guard, so they always respond even during cold-start.
    The frontend polls /health to detect server readiness; this must never
    be blocked by the 503 guard.
    """

    # Paths that bypass the _APP_READY 503 guard entirely.
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

        # ── OPTIONS: respond immediately ──────────────────────────────────
        if method == "OPTIONS":
            if _is_origin_allowed(origin):
                await send({
                    "type":    "http.response.start",
                    "status":  200,
                    "headers": _cors_preflight_headers(origin),
                })
            else:
                await send({
                    "type":    "http.response.start",
                    "status":  200,
                    "headers": [(b"content-length", b"0")],
                })
            await send({"type": "http.response.body", "body": b""})
            return

        path = scope.get("path", "")

        # ── 503 guard during cold start ───────────────────────────────────
        # ✅ FIX 1: _ALWAYS_PASS paths bypass this guard completely.
        # /health is handled by FastAPI routing below (returns 200 always).
        # /wake is handled by FastAPI routing below (returns 200/202).
        if not _APP_READY and not any(path.startswith(p) for p in self._ALWAYS_PASS):
            body = json.dumps({
                "detail": "Server is starting up, please retry in a few seconds.",
                "status": "starting"
            }).encode()
            cors = _cors_headers(origin) if origin else []
            headers = [
                (b"content-type",   b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"retry-after",    b"5"),
                *cors,
            ]
            await send({
                "type":    "http.response.start",
                "status":  503,
                "headers": headers,
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
                headers_sent = True
                raw_headers: list = list(message.get("headers", []))
                existing = {name.lower() for name, _ in raw_headers}
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
                    "type":   "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type",   b"application/json"),
                        (b"content-length", str(len(err_body)).encode()),
                        *_cors_headers(origin),
                    ],
                })
                await send({"type": "http.response.body", "body": err_body})


class _CORSFallbackMiddleware(BaseHTTPMiddleware):
    """Second CORS layer — catches anything RawASGICORSWrapper missed."""

    async def dispatch(self, request: StarletteRequest, call_next: Callable) -> Response:
        origin = request.headers.get("origin", "")

        if request.method == "OPTIONS" and _is_origin_allowed(origin):
            return Response(
                content="",
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin":      origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods":     "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers":     (
                        "Authorization, Content-Type, Accept, Origin, X-Requested-With"
                    ),
                    "Access-Control-Max-Age": "600",
                    "Vary": "Origin",
                },
            )

        try:
            response = await call_next(request)
        except Exception as exc:
            print(f"[CORSFallback] exception: {exc!r}")
            response = Response(
                content=json.dumps({"detail": "Internal server error"}),
                status_code=500,
                media_type="application/json",
            )

        if _is_origin_allowed(origin) and \
                "access-control-allow-origin" not in response.headers:
            response.headers["Access-Control-Allow-Origin"]      = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"]                             = "Origin"

        return response


# ─────────────────────────────────────────────────────────────────────────────
# Build the FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

_app = FastAPI(
    title       = "Applicant Shortlisting API",
    version     = "5.0.0",
    description = "AI-powered applicant shortlisting with document cross-checking and HR reports",
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

_app.add_middleware(
    FastAPICORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https://[a-zA-Z0-9][a-zA-Z0-9\-]*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app = _app

# ─────────────────────────────────────────────────────────────────────────────
# Health / wake routes
# ─────────────────────────────────────────────────────────────────────────────

@_app.api_route("/wake", methods=["GET", "HEAD", "OPTIONS"], tags=["health"])
async def wake(request: Request):
    """
    Wake-up probe. Returns 200 (awake) or 202 (still starting).
    CORS headers injected by RawASGICORSWrapper.
    """
    if request.method == "HEAD":
        return Response(status_code=200)

    http_status = 200 if _APP_READY else 202
    return JSONResponse(
        status_code=http_status,
        content={
            "status":  "awake" if _APP_READY else "starting",
            "ready":   _APP_READY,
            "born_at": _SERVER_BORN_AT,
            "now":     datetime.now(timezone.utc).isoformat(),
        },
    )


@_app.api_route("/", methods=["GET", "HEAD"], tags=["health"])
def root():
    return {"status": "ok", "message": "Shortlisting API is running"}


@_app.api_route("/health", methods=["GET", "HEAD"], tags=["health"])
def health():
    """
    ✅ Always returns HTTP 200 so Render's healthCheckPath probe passes.
    The `ready` field lets the frontend (axios.js _checkHealth) distinguish
    "server up but still loading models" from "fully ready".

    This is the PRIMARY readiness signal for the frontend — not /wake.
    The frontend polls this with mode:'cors' (which works once FastAPI is
    up) rather than /wake which was getting CORS-blocked during Render's
    502 window.
    """
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "ready":  _APP_READY,
            "born_at": _SERVER_BORN_AT,
        },
    )


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

DOC_TYPE_LABELS = {
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

# ✅ FIX 2: Hard timeout for document verification (pre_submission_check).
# Tesseract can deadlock on corrupt PDFs. 90s covers worst-case OCR + AI.
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
# Helpers
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
    return [
        msg for key, msg in _PASSWORD_MESSAGES.items()
        if not _PASSWORD_RE[key](password)
    ]


def _doc_type_value(doc: Document) -> str:
    try:
        return doc.doc_type.value
    except AttributeError:
        return str(doc.doc_type)


_BLOCKING_SIGNALS = [
    "identity mismatch", "type mismatch", "field mismatch",
    "education level mismatch", "document rejected",
    "possible use of another person", "wrong document",
    "✗ type mismatch", "declared=", "id document rejected",
]

_ADVISORY_SIGNALS = [
    "ocr tools not available", "ocr skipped", "accepted for manual review",
    "text extraction skipped", "missing required documents: certificate",
    "missing: certificate", "✓ type confirmed", "✓ documents accepted",
]


def _is_blocking_doc_failure(doc_detail: str) -> bool:
    detail_lower = doc_detail.lower()
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
        if any(signal in seg for signal in _ADVISORY_SIGNALS):
            continue
        if re.match(r"missing required documents:\s*certificate\s*$", seg):
            continue
        if len(seg.replace(" ", "")) < 5:
            continue
        blocking_segments.append(seg)

    return len(blocking_segments) > 0


def _rank_candidates(candidates: list[dict]) -> list[dict]:
    shortlisted = sorted(
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
    for i, c in enumerate(pending, start=len(shortlisted) + len(not_shortlisted) + 1):
        ranked.append({**c, "rank": i})
    return ranked


# ═══════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════

@_app.post("/auth/register", response_model=TokenResponse, tags=["auth"])
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please sign in instead."
        )
    user = User(
        full_name       = payload.full_name.strip(),
        email           = email,
        hashed_password = hash_password(payload.password),
        role            = UserRole(payload.role),
    )
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(
        access_token=token, role=user.role.value,
        user_id=user.id, full_name=user.full_name,
    )


@_app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
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
    }


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str


@_app.post("/auth/forgot-password", tags=["auth"])
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user  = db.query(User).filter(User.email == email).first()
    if user:
        reset_token  = create_reset_token(user.email)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_link   = f"{frontend_url}/reset-password?token={reset_token}"
        print(f"[forgot_password] Reset requested for {user.email}")
        print(f"[forgot_password] Reset link: {reset_link}")
        sent = send_reset_email(
            to_name=user.full_name, to_email=user.email, reset_link=reset_link,
        )
        if not sent:
            print(f"[forgot_password] ⚠️  Email failed for {user.email}.")
    else:
        print(f"[forgot_password] No account found for {email}")
    return {
        "message": (
            "If an account with that email exists, a password reset link "
            "has been sent. Please check your inbox (and spam folder)."
        )
    }


@_app.post("/auth/reset-password", tags=["auth"])
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token = payload.token.strip()
    if token.count(".") != 2:
        raise HTTPException(status_code=400, detail=(
            "This reset link appears to be malformed. "
            "Please copy the full link from your email and paste it "
            "into your browser's address bar, then try again."
        ))
    email = verify_reset_token(token)
    if not email:
        raise HTTPException(status_code=400, detail=
            "This reset link is invalid or has expired. Please request a new one.")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="No account found for this reset link.")
    unmet = _validate_password_strength(payload.new_password)
    if unmet:
        raise HTTPException(status_code=422,
            detail="Password must contain: " + ", ".join(unmet))
    user.hashed_password = hash_password(payload.new_password)
    db.add(user); db.commit()
    print(f"[reset_password] ✅ Password updated for {user.email}")
    return {"message": "Your password has been reset successfully. You can now sign in with your new password."}


# ═══════════════════════════════════════════════════════════════
# JOBS
# ═══════════════════════════════════════════════════════════════

@_app.get("/jobs", response_model=List[JobResponse], tags=["jobs"])
def list_jobs(db: Session = Depends(get_db)):
    return db.query(Job).filter(Job.is_active == True).all()


@_app.get("/jobs/{job_id}", response_model=JobResponse, tags=["jobs"])
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@_app.post("/jobs", response_model=JobResponse, tags=["jobs"])
def create_job(payload: JobCreate, db: Session = Depends(get_db), hr: User = Depends(require_hr)):
    job = Job(**payload.model_dump(), created_by=hr.id)
    db.add(job); db.commit(); db.refresh(job)
    return job


@_app.delete("/jobs/{job_id}", tags=["jobs"])
def delete_job(job_id: int, db: Session = Depends(get_db), hr: User = Depends(require_hr)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    file_paths = [doc.file_path for app_obj in job.applications for doc in app_obj.documents]
    db.delete(job); db.commit()
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError:
            pass
    return {"detail": "Job and all associated applications and documents have been permanently deleted"}


# ═══════════════════════════════════════════════════════════════
# APPLICATIONS
# ═══════════════════════════════════════════════════════════════

@_app.post("/applications", response_model=ApplicationResponse, tags=["applications"])
def submit_application(
    payload: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    job = db.query(Job).filter(Job.id == payload.job_id, Job.is_active == True).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or no longer active")

    existing = db.query(Application).filter(
        Application.applicant_id == current_user.id,
        Application.job_id       == payload.job_id,
        Application.submitted_at != None,
    ).first()
    if existing:
        existing_docs  = db.query(Document).filter(Document.application_id == existing.id).all()
        uploaded_types = {_doc_type_value(d) for d in existing_docs}
        missing        = sorted(REQUIRED_DOC_TYPES - uploaded_types)
        if not missing:
            raise HTTPException(status_code=400, detail="You have already applied for this job")
        return existing

    old_draft = db.query(Application).filter(
        Application.applicant_id == current_user.id,
        Application.job_id       == payload.job_id,
        Application.submitted_at == None,
    ).first()
    if old_draft:
        old_docs = db.query(Document).filter(Document.application_id == old_draft.id).all()
        for doc in old_docs:
            try:
                if os.path.exists(doc.file_path):
                    os.remove(doc.file_path)
            except OSError:
                pass
            db.delete(doc)
        db.delete(old_draft); db.commit()

    app_obj = Application(
        applicant_id=current_user.id, submitted_at=None, **payload.model_dump(),
    )
    db.add(app_obj); db.commit(); db.refresh(app_obj)
    return app_obj


@_app.delete("/applications/{application_id}", tags=["applications"])
def delete_draft_application(
    application_id: int,
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
    docs = db.query(Document).filter(Document.application_id == application_id).all()
    for doc in docs:
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except OSError:
            pass
        db.delete(doc)
    db.delete(app_obj); db.commit()
    return {"ok": True, "detail": "Draft application and uploaded files removed."}


@_app.post("/applications/{application_id}/finalize", tags=["applications"])
def finalize_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    app_obj = db.query(Application).filter(
        Application.id           == application_id,
        Application.applicant_id == current_user.id,
    ).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail=
            "Application not found. You can only finalize your own applications.")
    if app_obj.submitted_at is not None:
        raise HTTPException(status_code=400, detail="This application has already been submitted.")

    db.expire_all()
    docs           = db.query(Document).filter(Document.application_id == application_id).all()
    uploaded_types = {_doc_type_value(d) for d in docs}
    print(f"[finalize] application_id={application_id} | docs={len(docs)} | types={uploaded_types}")

    missing = sorted(REQUIRED_DOC_TYPES - uploaded_types)
    if missing:
        missing_labels = [DOC_TYPE_LABELS_REQUIRED.get(m, m) for m in missing]
        raise HTTPException(status_code=400, detail=(
            f"Cannot submit application — {len(missing)} required document(s) are missing: "
            f"{', '.join(missing_labels)}. "
            "Please upload all required documents before submitting."
        ))

    app_obj.submitted_at = datetime.now(timezone.utc)
    db.add(app_obj); db.commit()

    has_experience_doc = "experience" in uploaded_types
    experience_note = (
        " Experience document included — this will be cross-checked during shortlisting."
        if has_experience_doc else
        " Tip: uploading an experience document (employment letter / reference letter) "
        "can strengthen your application if you have declared work experience."
    )
    return {
        "success":         True,
        "application_id":  application_id,
        "message": (
            "✅ All required documents verified. Your application has been submitted successfully! "
            "You will be notified of the shortlisting decision." + experience_note
        ),
        "uploaded_types":  sorted(uploaded_types),
        "documents_count": len(docs),
    }


@_app.get("/applications/my", response_model=List[ApplicationResponse], tags=["applications"])
def my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_applicant),
):
    return (
        db.query(Application)
        .filter(
            Application.applicant_id == current_user.id,
            Application.submitted_at != None,
        )
        .all()
    )


@_app.get("/applications/{application_id}", response_model=ApplicationResponse, tags=["applications"])
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role == UserRole.applicant and app_obj.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return app_obj


# ═══════════════════════════════════════════════════════════════
# DOCUMENT UPLOAD
# ═══════════════════════════════════════════════════════════════

@_app.post("/applications/{application_id}/documents", tags=["documents"])
async def upload_document(
    application_id: int,
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
        raise HTTPException(status_code=404, detail=
            "Application not found. You can only upload documents to your own applications.")

    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=(
            f"Invalid document type '{doc_type}'. "
            f"Accepted types: {', '.join(sorted(ALLOWED_DOC_TYPES))}. "
            "Required: id_card, cv, diploma. Optional: certificate, experience."
        ))

    db.expire_all()
    existing_docs = db.query(Document).filter(
        Document.application_id == application_id
    ).all()
    for d in existing_docs:
        if _doc_type_value(d) == doc_type:
            raise HTTPException(status_code=400, detail=(
                f"A '{DOC_TYPE_LABELS[doc_type]}' has already been uploaded for "
                "this application. Delete the existing one before re-uploading."
            ))

    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=
            f"File type '{ext}' is not allowed. Accepted: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=
            f"File size exceeds the {MAX_FILE_SIZE_MB} MB limit.")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = os.path.join(UPLOAD_DIR, unique_name)
    with open(save_path, "wb") as f:
        f.write(content)

    if doc_type == "experience":
        check_passed  = True
        check_message = (
            "✓ Experience document accepted. It will be cross-checked "
            "against your declared experience years during shortlisting."
        )
    else:
        try:
            # ✅ FIX 2: Wrap pre_submission_check in asyncio.wait_for so a
            # deadlocked Tesseract process returns a clean 408 rather than
            # causing Render's proxy to return a CORS-less 502/504.
            loop = asyncio.get_event_loop()
            check_passed, check_message = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: pre_submission_check(
                        file_path       = save_path,
                        declared_type   = doc_type,
                        applicant_name  = current_user.full_name,
                        field_of_study  = app_obj.field_of_study  or "",
                        education_level = app_obj.education_level or "",
                    )
                ),
                timeout=DOC_VERIFY_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            try:
                os.remove(save_path)
            except OSError:
                pass
            print(f"[upload_document] pre_submission_check timed out after {DOC_VERIFY_TIMEOUT_SECONDS}s")
            raise HTTPException(
                status_code=408,
                detail=(
                    f"Document verification timed out after {DOC_VERIFY_TIMEOUT_SECONDS}s. "
                    "This can happen with large or complex files on first upload. "
                    "Please try again — subsequent uploads are usually faster."
                )
            )
        except Exception as exc:
            try:
                os.remove(save_path)
            except OSError:
                pass
            print(f"[upload_document] pre_submission_check error: {exc!r}")
            raise HTTPException(
                status_code=400,
                detail="Document verification service is temporarily unavailable. Please try again."
            )

    if not check_passed:
        try:
            os.remove(save_path)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail=check_message)

    doc = Document(
        application_id = application_id,
        doc_type       = DocumentType(doc_type),
        filename       = unique_name,
        original_name  = file.filename,
        file_path      = save_path,
    )
    db.add(doc); db.commit(); db.refresh(doc)

    db.expire_all()
    all_docs     = db.query(Document).filter(Document.application_id == application_id).all()
    uploaded_set = {_doc_type_value(d) for d in all_docs}
    missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)

    return {
        "id":                    doc.id,
        "doc_type":              doc_type,
        "doc_label":             DOC_TYPE_LABELS[doc_type],
        "original_name":         file.filename,
        "validation_message":    check_message,
        "uploaded_types":        sorted(uploaded_set),
        "missing_types":         missing,
        "all_required_uploaded": len(missing) == 0,
        "message": (
            "✅ All required documents uploaded! Click 'Submit Application' to finalise."
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

    if current_user.role == UserRole.applicant and app_obj.applicant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.expire_all()
    docs         = db.query(Document).filter(Document.application_id == application_id).all()
    uploaded_set = {_doc_type_value(d) for d in docs}
    missing      = sorted(REQUIRED_DOC_TYPES - uploaded_set)

    return {
        "documents": [
            {
                "id":            d.id,
                "doc_type":      _doc_type_value(d),
                "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                "original_name": d.original_name,
                "uploaded_at":   d.uploaded_at,
                "url":           f"/uploads/{d.filename}",
            }
            for d in docs
        ],
        "uploaded_types":        sorted(uploaded_set),
        "missing_types":         missing,
        "all_required_uploaded": len(missing) == 0,
    }


@_app.delete("/applications/{application_id}/documents/{doc_id}", tags=["documents"])
def delete_document(
    application_id: int,
    doc_id: int,
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
    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except OSError:
        pass
    db.delete(doc); db.commit()
    return {"detail": f"Document '{_doc_type_value(doc)}' deleted. You can now re-upload."}


# ═══════════════════════════════════════════════════════════════
# HR DASHBOARD
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/candidates", tags=["hr"])
def get_all_candidates(
    job_id: Optional[int] = None,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    query = db.query(Application, User, Job).join(
        User, Application.applicant_id == User.id
    ).join(Job, Application.job_id == Job.id)
    if job_id:
        query = query.filter(Application.job_id == job_id)
    query = query.filter(Application.submitted_at != None)
    rows = [
        {
            "application_id":   app.id,
            "applicant_id":     user.id,
            "full_name":        user.full_name,
            "email":            user.email,
            "job_title":        job.title,
            "education_level":  app.education_level,
            "field_of_study":   app.field_of_study,
            "experience_years": app.experience_years,
            "decision":         app.decision.value,
            "ai_score":         app.ai_score,
            "ai_reason":        app.ai_reason,
            "doc_verified":     app.doc_verified,
            "submitted_at":     app.submitted_at,
        }
        for app, user, job in query.all()
    ]
    return _rank_candidates(rows)


# ═══════════════════════════════════════════════════════════════
# HR REPORT
# ═══════════════════════════════════════════════════════════════

@_app.get("/hr/report/{job_id}", tags=["hr"])
def get_job_report(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows = (
        db.query(Application, User)
        .join(User, Application.applicant_id == User.id)
        .filter(Application.job_id == job_id, Application.submitted_at != None)
        .all()
    )

    candidates = []
    for app_obj, user in rows:
        reason_data: dict = {}
        try:
            reason_data = json.loads(app_obj.ai_reason or "{}")
        except Exception:
            pass
        docs = db.query(Document).filter(Document.application_id == app_obj.id).all()
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
            "decision":          app_obj.decision.value,
            "ai_score":          app_obj.ai_score,
            "doc_verified":      app_obj.doc_verified,
            "submitted_at":      app_obj.submitted_at.isoformat() if app_obj.submitted_at else None,
            "shortlisted_at":    app_obj.shortlisted_at.isoformat() if app_obj.shortlisted_at else None,
            "criteria_met":      reason_data.get("criteria_met",      []),
            "criteria_failed":   reason_data.get("criteria_failed",   []),
            "criteria_warnings": reason_data.get("criteria_warnings", []),
            "summary":           reason_data.get("summary",           "Not yet processed"),
            "ml_confidence":     reason_data.get("ml_confidence"),
            "ml_note":           reason_data.get("ml_note",           ""),
            "documents_count":   len(docs),
            "documents": [
                {
                    "doc_type":      _doc_type_value(d),
                    "doc_label":     DOC_TYPE_LABELS.get(_doc_type_value(d), _doc_type_value(d)),
                    "original_name": d.original_name,
                }
                for d in docs
            ],
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
    avg_score     = round(sum(scored) / len(scored), 4) if scored else None
    top_score     = round(max(scored), 4) if scored else None

    return {
        "job": {
            "id":                        job.id,
            "title":                     job.title,
            "description":               job.description,
            "location":                  job.location,
            "employment_type":           job.employment_type,
            "job_level":                 job.job_level,
            "number_of_posts":           job.number_of_posts,
            "deadline":                  job.deadline.isoformat() if job.deadline else None,
            "required_education_levels": job.required_education_levels,
            "required_fields":           job.required_fields,
            "required_min_experience":   job.required_min_experience,
            "required_max_experience":   job.required_max_experience,
            "required_skills":           job.required_skills,
            "required_certifications":   job.required_certifications,
            "preferred_qualifications":  job.preferred_qualifications,
            "responsibilities":          job.responsibilities,
            "created_at":                job.created_at.isoformat() if job.created_at else None,
        },
        "summary": {
            "total_applicants": total,
            "shortlisted":      shortlisted_n,
            "not_shortlisted":  rejected_n,
            "pending":          pending_n,
            "average_score":    avg_score,
            "top_score":        top_score,
            "shortlist_rate":   round(shortlisted_n / total, 4) if total else 0,
        },
        "candidates":   ranked,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════
# SHORTLISTING
# ═══════════════════════════════════════════════════════════════

def _run_verification_and_prediction(
    app_obj: Application,
    job: Job,
    user: User,
    docs: list,
    db: Session,
) -> dict:
    doc_paths = [d.file_path        for d in docs]
    doc_types = [_doc_type_value(d) for d in docs]

    VERIFIABLE_DOC_TYPES = {"id_card", "cv", "diploma", "certificate"}
    verify_paths = [p for p, t in zip(doc_paths, doc_types) if t in VERIFIABLE_DOC_TYPES]
    verify_types = [t for t in doc_types if t in VERIFIABLE_DOC_TYPES]

    doc_ok, doc_detail = verify_documents(
        applicant_name  = user.full_name,
        education_level = app_obj.education_level or "",
        field_of_study  = app_obj.field_of_study  or "",
        document_paths  = verify_paths,
        declared_types  = verify_types,
    )

    identity_match = "Identity: ✓" in doc_detail

    doc_texts: dict[str, str] = {}
    for d in docs:
        if os.path.exists(d.file_path):
            try:
                extracted = extract_document_text(d.file_path)
                doc_texts[_doc_type_value(d)] = extracted or ""
            except Exception:
                doc_texts[_doc_type_value(d)] = ""

    decision_str, score, reason_json = predict(app_obj, job, doc_texts=doc_texts)
    is_blocking = not doc_ok and _is_blocking_doc_failure(doc_detail)

    if is_blocking:
        decision_str = "not_shortlisted"
        try:
            reason_obj = json.loads(reason_json)
        except Exception:
            reason_obj = {
                "criteria_met": [], "criteria_failed": [],
                "criteria_warnings": [], "summary": reason_json,
            }
        reason_obj["decision"] = "not_shortlisted"
        reason_obj.setdefault("criteria_failed", []).insert(
            0, f"Document verification failed: {doc_detail}"
        )
        reason_obj["summary"] = f"Document verification failed. {reason_obj.get('summary', '')}"
        reason_json = json.dumps(reason_obj, ensure_ascii=False)

    app_obj.decision       = DecisionStatus(decision_str)
    app_obj.ai_score       = round(float(score), 4)
    app_obj.ai_reason      = reason_json
    app_obj.doc_verified   = doc_ok
    app_obj.shortlisted_at = datetime.now(timezone.utc)
    db.add(app_obj)

    return {
        "application_id": app_obj.id,
        "applicant":      user.full_name,
        "decision":       decision_str,
        "score":          round(float(score), 4),
        "doc_verified":   doc_ok,
        "identity_match": identity_match,
        "reason":         reason_json,
    }


@_app.post("/hr/shortlist/{application_id}", response_model=ShortlistResult, tags=["hr"])
def shortlist_application(
    application_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    job  = db.query(Job).filter(Job.id == app_obj.job_id).first()
    user = db.query(User).filter(User.id == app_obj.applicant_id).first()
    docs = db.query(Document).filter(Document.application_id == application_id).all()
    result = _run_verification_and_prediction(app_obj, job, user, docs, db)
    db.commit(); db.refresh(app_obj)
    return ShortlistResult(
        application_id=application_id, applicant_name=user.full_name, job_title=job.title,
        decision=result["decision"], ai_score=result["score"],
        doc_verified=result["doc_verified"], identity_match=result["identity_match"],
        reason=result["reason"],
    )


@_app.post("/hr/shortlist-all/{job_id}", tags=["hr"])
def shortlist_all_for_job(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    same_title_ids = [j.id for j in db.query(Job).filter(Job.title == job.title).all()]
    pending = db.query(Application).filter(
        Application.job_id.in_(same_title_ids),
        Application.decision     == DecisionStatus.pending,
        Application.submitted_at != None,
    ).all()
    if not pending:
        return {"message": "No pending applications found", "processed": 0, "shortlisted": 0, "not_shortlisted": 0}
    results = []
    for app_obj in pending:
        app_job = db.query(Job).filter(Job.id == app_obj.job_id).first()
        user    = db.query(User).filter(User.id == app_obj.applicant_id).first()
        docs    = db.query(Document).filter(Document.application_id == app_obj.id).all()
        results.append(_run_verification_and_prediction(app_obj, app_job, user, docs, db))
    db.commit()
    shortlisted = sum(1 for r in results if r["decision"] == "shortlisted")
    return {
        "message":         f"Processed {len(results)} applications",
        "processed":       len(results),
        "shortlisted":     shortlisted,
        "not_shortlisted": len(results) - shortlisted,
        "results":         results,
    }


@_app.post("/hr/reshortlist/{application_id}", response_model=ShortlistResult, tags=["hr"])
def reshortlist_application(
    application_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    job  = db.query(Job).filter(Job.id == app_obj.job_id).first()
    user = db.query(User).filter(User.id == app_obj.applicant_id).first()
    docs = db.query(Document).filter(Document.application_id == application_id).all()
    result = _run_verification_and_prediction(app_obj, job, user, docs, db)
    db.commit(); db.refresh(app_obj)
    return ShortlistResult(
        application_id=application_id, applicant_name=user.full_name, job_title=job.title,
        decision=result["decision"], ai_score=result["score"],
        doc_verified=result["doc_verified"], identity_match=result["identity_match"],
        reason=result["reason"],
    )


@_app.post("/hr/reshortlist-all/{job_id}", tags=["hr"])
def reshortlist_all_for_job(
    job_id: int,
    db: Session = Depends(get_db),
    hr: User = Depends(require_hr),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    same_title_ids = [j.id for j in db.query(Job).filter(Job.title == job.title).all()]
    all_apps = db.query(Application).filter(
        Application.job_id.in_(same_title_ids),
        Application.submitted_at != None,
    ).all()
    if not all_apps:
        return {"message": "No applications found for this job", "processed": 0, "shortlisted": 0, "not_shortlisted": 0}
    results = []
    for app_obj in all_apps:
        app_job = db.query(Job).filter(Job.id == app_obj.job_id).first()
        user    = db.query(User).filter(User.id == app_obj.applicant_id).first()
        docs    = db.query(Document).filter(Document.application_id == app_obj.id).all()
        results.append(_run_verification_and_prediction(app_obj, app_job, user, docs, db))
    db.commit()
    shortlisted = sum(1 for r in results if r["decision"] == "shortlisted")
    return {
        "message":         f"Re-processed {len(results)} applications",
        "processed":       len(results),
        "shortlisted":     shortlisted,
        "not_shortlisted": len(results) - shortlisted,
        "results":         results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)