"""
backend/database.py

Supports PostgreSQL (Render production) and SQLite (local dev).

WHY DATA WAS LOST ON DEPLOY:
  SQLite stores data in a local file (capstone.db). Render's free tier
  has an ephemeral filesystem — it resets on every deploy/restart,
  wiping all users, jobs, and applications.

SOLUTION:
  Use PostgreSQL on Render. Data lives in a persistent managed database
  that survives all deploys and restarts.

SETUP (one-time):
  The render.yaml in this project creates a free PostgreSQL database and
  links it automatically via the DATABASE_URL env var.
  Just push to GitHub and Render does the rest.

LOCAL DEV:
  DATABASE_URL is not set → falls back to SQLite (capstone.db) as before.
  No changes needed locally.

FIXES APPLIED:
  ✅ FIX 1 — postgres:// → postgresql:// URL rewrite (Render compatibility)
  ✅ FIX 2 — Pool settings tuned for Render free tier (max 25 connections)
  ✅ FIX 3 — pool_pre_ping=True prevents stale connection errors after sleep
  ✅ FIX 4 — pool_recycle=300 avoids "server closed connection" after idle
  ✅ FIX 5 — SQLite WAL mode prevents locking in local dev
  ✅ FIX 6 — Startup DB connectivity check with clear error message
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

# Keep pool small on Render free tier (max 25 connections total)
_pool_kwargs: dict = (
    {}
    if _is_sqlite
    else {
        "pool_size":     5,
        "max_overflow":  10,
        "pool_pre_ping": True,   # ✅ FIX: detects dead connections before use
        "pool_recycle":  300,    # ✅ FIX: recycle every 5 min — avoids stale conn errors
        "pool_timeout":  30,
    }
)

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)

# ✅ FIX: Enable WAL mode for SQLite to prevent locking issues in local dev
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

# ✅ FIX: Verify DB is reachable at startup — fail fast with a clear message
def _check_db_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[database] ✅ Database connection OK")
    except Exception as exc:
        print(f"[database] ❌ Cannot connect to database: {exc}")
        if not _is_sqlite:
            print(
                "[database] 💡 Make sure DATABASE_URL is set correctly in Render.\n"
                "           Go to: Render Dashboard → your service → Environment\n"
                "           The DATABASE_URL should be auto-linked from your PostgreSQL db."
            )
        sys.exit(1)   # Hard fail so Render marks deploy as failed, not silently broken

_check_db_connection()

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