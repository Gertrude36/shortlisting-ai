"""
backend/database.py  ·  v2.0.0
────────────────────────────────────────────────────────────────
Supports PostgreSQL (Render production) and SQLite (local dev).

FIXES IN v2.0.0:

  ✅ FIX-DB-1 — REMOVED sys.exit(1) on connection failure.
     The old code called sys.exit(1) if the DB was unreachable at
     import time. On Render, the DB may not be ready for 10–30s after
     the web service starts (cold boot race). sys.exit() killed the
     process before uvicorn ever bound the port, putting the service
     into a crash loop that Render could never recover from.
     Now: we log a warning and let the app start. FastAPI's lifespan
     and endpoint handlers will surface DB errors naturally.

  ✅ FIX-DB-2 — Pool size reduced to stay under Render free PostgreSQL
     connection limit (~10 connections max on free tier).
     Old: pool_size=5, max_overflow=10  → up to 15 connections → crashes.
     New: pool_size=3, max_overflow=5   → up to 8 connections → safe.

  ✅ FIX-DB-3 — pool_pre_ping=True retained (detects dead connections).

  ✅ FIX-DB-4 — pool_recycle=300 retained (avoids stale connection errors).

  ✅ FIX-DB-5 — SQLite WAL mode retained for local dev.

  ✅ FIX-DB-6 — _check_db_connection() now returns a bool instead of
     calling sys.exit(), so main.py can decide how to handle it.
"""

from __future__ import annotations

import os
import sys
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# ── Resolve database URL ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(BASE_DIR, 'capstone.db')}"
)

# Render still issues postgres:// URLs in some cases.
# SQLAlchemy 1.4+ requires postgresql:// — fix it silently.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

print(f"[database] Using {'SQLite (local dev)' if _is_sqlite else 'PostgreSQL (production)'}")

# ── Engine ────────────────────────────────────────────────────────────────────
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

# ✅ FIX-DB-2: Render free PostgreSQL allows ~10 connections total.
# pool_size=3 + max_overflow=5 = 8 max → safely under the limit.
# Old values (5 + 10 = 15) exceeded the limit and caused connection errors.
_pool_kwargs: dict = (
    {}
    if _is_sqlite
    else {
        "pool_size":     3,
        "max_overflow":  5,
        "pool_pre_ping": True,   # ✅ FIX-DB-3: detects dead connections before use
        "pool_recycle":  300,    # ✅ FIX-DB-4: recycle every 5 min — avoids stale conn errors
        "pool_timeout":  30,
    }
)

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)

# ✅ FIX-DB-5: Enable WAL mode for SQLite to prevent locking issues in local dev
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


# ✅ FIX-DB-6: Returns bool instead of calling sys.exit().
# Render's free DB can take 10–30s to become reachable after a cold boot.
# Crashing the web service with sys.exit() here prevents it from ever
# registering as healthy, creating an unrecoverable crash loop.
def _check_db_connection() -> bool:
    """
    Verify DB is reachable. Returns True if OK, False if not.
    Logs the result either way. Does NOT call sys.exit().
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
                "           instance may need 10–30s to wake up. The app will keep\n"
                "           running; individual requests will retry the connection.\n"
                "           If this persists, check DATABASE_URL in:\n"
                "           Render Dashboard → your service → Environment"
            )
        return False


_check_db_connection()  # Log result at startup, but never exit

# ── Session ───────────────────────────────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Base ──────────────────────────────────────────────────────────────────────
Base = declarative_base()


# ── Dependency ────────────────────────────────────────────────────────────────
def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()