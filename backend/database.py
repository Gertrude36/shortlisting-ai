"""
backend/database.py  ·  v3.0.0
────────────────────────────────────────────────────────────────
Supports PostgreSQL (Render production) and SQLite (local dev).

ALL PREVIOUS FIXES RETAINED (FIX-DB-1 through FIX-DB-6).

NEW FIXES IN v3.0.0:

  ✅ FIX-DB-7 — Added connect_timeout=10 to PostgreSQL connection args.
     Without this, a cold-boot DB takes 30s (pool_timeout) to fail,
     hanging the request and triggering Render's 30s gateway timeout → 500.
     With connect_timeout=10, each attempt fails fast and pool_pre_ping
     can recover gracefully on the next request.

  ✅ FIX-DB-8 — Added sslmode='require' to PostgreSQL connection args.
     Render PostgreSQL requires SSL. Without it, connections silently fail
     on the first request after a cold boot, returning 500 with no useful
     error message in logs.

  ✅ FIX-DB-9 — Reduced pool_timeout from 30s → 10s.
     The old 30s timeout caused requests to hang until Render's upstream
     gateway cut them off with a 502/504 anyway. 10s fails fast so the
     client gets a proper JSON 503 instead of a silent gateway timeout.

  ✅ FIX-DB-10 — get_db() now catches OperationalError and raises HTTP 503
     instead of letting SQLAlchemy's raw exception bubble up as a 500.
     This gives the frontend a retryable status code and a clear message.
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
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(BASE_DIR, 'capstone.db')}"
)

# Render still issues postgres:// URLs in some cases.
# SQLAlchemy 1.4+ requires postgresql:// — fix it silently.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite: bool = DATABASE_URL.startswith("sqlite")

print(f"[database] Using {'SQLite (local dev)' if _is_sqlite else 'PostgreSQL (production)'}")

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
                "           Required env vars: DATABASE_URL (must start with postgresql://)"
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