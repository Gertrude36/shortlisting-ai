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

SETUP (one-time, takes 2 minutes):
  The render.yaml in this project already creates a free PostgreSQL
  database and links it automatically via the DATABASE_URL env var.
  Just push to GitHub and Render will do the rest.

LOCAL DEV:
  DATABASE_URL is not set → falls back to SQLite (capstone.db) as before.
  No changes needed locally.
"""

from __future__ import annotations

import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# ── Resolve database URL ──────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./capstone.db")

# Render still issues postgres:// URLs in some cases.
# SQLAlchemy 1.4+ requires postgresql:// — fix it silently.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── Engine ────────────────────────────────────────────────────────────────────
_is_sqlite    = DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

# Keep pool small on Render free tier (max 25 connections)
_pool_kwargs: dict = (
    {}
    if _is_sqlite
    else {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,
        "pool_recycle": 300,   # ✅ FIX: recycle connections every 5 min to avoid stale connections
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