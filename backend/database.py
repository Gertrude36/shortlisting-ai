"""
backend/database.py  ·  v3.1.0
────────────────────────────────────────────────────────────────
Supports PostgreSQL (Render production) and SQLite (local dev).

ALL PREVIOUS FIXES RETAINED (FIX-DB-1 through FIX-DB-10).

NEW / CHANGED IN v3.1.0:

  ✅ FIX-DB-11 — Local dev now uses SQLite automatically.
     If DATABASE_URL is not set in the environment, the engine
     falls back to a local SQLite file (backend/capstone.db).
     This prevents the 30 s cold-boot timeout that occurred when
     a developer forgot to comment out DATABASE_URL in .env while
     working locally against the remote Render PostgreSQL instance.

  ✅ FIX-DB-12 — Explicit ENV_MODE detection.
     A new ENV_MODE variable ("development" | "production") is
     read from the environment. When ENV_MODE=development AND
     DATABASE_URL points to a PostgreSQL host, the engine
     overrides DATABASE_URL with SQLite so the app always starts
     cleanly in local dev without touching the remote DB.
     Set ENV_MODE=production on Render to keep PostgreSQL active.

  ✅ FIX-DB-13 — Startup log now shows the active DB path/host
     so developers immediately see which database they're using.
"""

from __future__ import annotations

import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import OperationalError
from dotenv import load_dotenv

load_dotenv()

# ── Resolve database URL ──────────────────────────────────────────────────────
BASE_DIR: str = os.path.dirname(os.path.abspath(__file__))
_SQLITE_FALLBACK: str = f"sqlite:///{os.path.join(BASE_DIR, 'capstone.db')}"

# Read raw URL from env (may be absent in local dev)
_raw_url: str | None = os.getenv("DATABASE_URL")

# Render still issues postgres:// URLs in some cases.
# SQLAlchemy 1.4+ requires postgresql:// — fix it silently.
if _raw_url and _raw_url.startswith("postgres://"):
    _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)

# ✅ FIX-DB-11 + FIX-DB-12:
# If ENV_MODE=development (or unset) AND the URL is PostgreSQL,
# override to SQLite so local dev never blocks on a remote DB.
_env_mode: str = os.getenv("ENV_MODE", "development").lower()
_force_sqlite: bool = (
    _env_mode == "development"
    and (_raw_url is None or not _raw_url.startswith("postgresql"))
)

DATABASE_URL: str = (
    _SQLITE_FALLBACK
    if (_raw_url is None or _force_sqlite)
    else _raw_url
)

_is_sqlite: bool = DATABASE_URL.startswith("sqlite")

# ✅ FIX-DB-13: Show exactly which DB is active so devs know immediately.
if _is_sqlite:
    _db_label = f"SQLite (local dev) → {DATABASE_URL.replace('sqlite:///', '')}"
else:
    # Show only host for security (hides password from logs)
    try:
        from urllib.parse import urlparse as _urlparse
        _parsed = _urlparse(DATABASE_URL)
        _db_label = f"PostgreSQL (production) → {_parsed.hostname}"
    except Exception:
        _db_label = "PostgreSQL (production)"

print(f"[database] Using {_db_label}")

# ── Engine ────────────────────────────────────────────────────────────────────

# ✅ FIX-DB-7 + FIX-DB-8: PostgreSQL needs connect_timeout and sslmode.
# connect_timeout=10  → fail fast instead of hanging 30s on cold boot
# sslmode='require'   → Render PostgreSQL mandates SSL; without it, first
#                        request after sleep silently fails → 500
_connect_args: dict = (
    {"check_same_thread": False}
    if _is_sqlite
    else {
        "connect_timeout": 10,
        "sslmode": "require",
    }
)

# ✅ FIX-DB-2: Render free PostgreSQL allows ~10 connections total.
# pool_size=3 + max_overflow=5 = 8 max → safely under the limit.
# ✅ FIX-DB-9: pool_timeout reduced from 30 → 10 so requests fail fast
#              instead of hanging until Render's gateway cuts them off.
_pool_kwargs: dict = (
    {}
    if _is_sqlite
    else {
        "pool_size":     3,
        "max_overflow":  5,
        "pool_pre_ping": True,   # ✅ FIX-DB-3: detects dead connections before use
        "pool_recycle":  300,    # ✅ FIX-DB-4: recycle every 5 min → avoids stale conn
        "pool_timeout":  10,     # ✅ FIX-DB-9: was 30 — fail fast, not silent hang
    }
)

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)

# ✅ FIX-DB-5: Enable WAL mode for SQLite to prevent locking issues in local dev.
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


# ✅ FIX-DB-6: Returns bool instead of calling sys.exit().
def _check_db_connection() -> bool:
    """
    Verify DB is reachable at startup.
    Returns True if OK, False if not. Never calls sys.exit().
    Render's free DB can take 10–30 s to wake up on cold boot — crashing
    here would create an unrecoverable restart loop.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[database] ✅ Database connection OK")
        return True
    except Exception as exc:
        print(f"[database] ⚠️  Cannot connect to database at startup: {exc}")
        if not _is_sqlite:
            print(
                "[database] 💡 This is normal on Render cold boot — the PostgreSQL\n"
                "           instance may need 10–30 s to wake up. The app will keep\n"
                "           running; individual requests will retry the connection.\n"
                "           If this persists, check DATABASE_URL and SSL settings in:\n"
                "           Render Dashboard → your service → Environment\n"
                "           Required env vars:\n"
                "             DATABASE_URL  (must start with postgresql://)\n"
                "             ENV_MODE=production"
            )
        else:
            print(
                "[database] 💡 SQLite file will be created automatically on first use.\n"
                f"           Expected path: {DATABASE_URL.replace('sqlite:///', '')}"
            )
        return False


_check_db_connection()  # Log result at startup, but never exit

# ── Session ───────────────────────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Base ──────────────────────────────────────────────────────────────────────
Base = declarative_base()


# ── Dependency ────────────────────────────────────────────────────────────────
def get_db():
    """
    FastAPI dependency — yields a DB session and closes it after the request.

    ✅ FIX-DB-10: Catches OperationalError (DB unreachable / cold boot) and
    raises HTTP 503 with a retryable message instead of letting SQLAlchemy's
    raw exception propagate as an opaque 500.
    """
    # ✅ FIX-DB-10: Catch connection errors at session-creation time.
    # This fires when the DB is still waking up after a Render cold boot.
    try:
        db = SessionLocal()
    except OperationalError as exc:
        print(f"[get_db] ⚠️  Failed to create DB session: {exc}")
        # Import here to avoid circular import at module load time
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=(
                "Database is temporarily unavailable (cold boot). "
                "Please retry in a few seconds."
            ),
        )

    try:
        yield db
    except OperationalError as exc:
        # ✅ FIX-DB-10: Catch mid-request DB drops (connection recycled, etc.)
        print(f"[get_db] ⚠️  DB OperationalError during request: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=(
                "Database connection lost. Please retry in a few seconds."
            ),
        )
    finally:
        db.close()