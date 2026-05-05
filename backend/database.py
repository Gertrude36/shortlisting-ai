"""
backend/database.py

FIX: Supports both PostgreSQL (Render production) and SQLite (local dev).

WHY THIS WAS BROKEN:
  SQLite writes to a local file (capstone.db). On Render's free tier the
  filesystem is ephemeral — it resets on every deploy, making the production
  database permanently empty (no jobs, no users, nothing).

HOW TO FIX ON RENDER:
  1. Add a free PostgreSQL database on Render:
       Render dashboard → New → PostgreSQL → Free plan → Create
  2. Copy the "Internal Database URL" and add it as an env var on your
     backend service:
       Key:   DATABASE_URL
       Value: postgresql://user:pass@host/dbname   ← paste Render's URL
  3. Redeploy. The backend will auto-create all tables in PostgreSQL.

LOCAL DEV (no change needed):
  DATABASE_URL is not set → falls back to SQLite (capstone.db) as before.
"""

from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# ── Resolve database URL ──────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./capstone.db")

# Render (and some older services) still issue postgres:// URLs.
# SQLAlchemy 1.4+ requires postgresql:// — fix it silently.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── Engine ────────────────────────────────────────────────────────────────────
_is_sqlite     = DATABASE_URL.startswith("sqlite")
_connect_args  = {"check_same_thread": False} if _is_sqlite else {}

# For PostgreSQL on Render's free tier, keep the pool small so we don't
# exhaust the 25-connection limit of a free Postgres instance.
_pool_kwargs: dict = (
    {}
    if _is_sqlite
    else {"pool_size": 5, "max_overflow": 10, "pool_pre_ping": True}
)

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)

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