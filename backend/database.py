"""
backend/database.py
────────────────────────────────────────────────────────────────
SQLAlchemy engine + session factory.

FIXES APPLIED:
  ✅ FIX 1 — declarative_base import moved to sqlalchemy.orm
     (sqlalchemy.ext.declarative is removed in SQLAlchemy 2.x).

  ✅ FIX 2 — PostgreSQL support added via DATABASE_URL env var.
     On Render, set DATABASE_URL to your Postgres connection string.
     Falls back to SQLite for local development when DATABASE_URL
     is not set.

  ✅ FIX 3 — WAL mode + pragmas applied only for SQLite connections.
     PostgreSQL does not need or support these pragmas.

  ✅ FIX 4 — autoflush=True (SQLAlchemy default) retained so pending
     ORM writes are flushed before queries in the same session.
"""

import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# ── Database URL ──────────────────────────────────────────────────────────────
# On Render: set DATABASE_URL as an environment variable pointing to
# your Render PostgreSQL instance, e.g.:
#   postgresql://user:password@host/dbname
#
# Locally: leave DATABASE_URL unset and SQLite will be used automatically.

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./capstone.db")

# Render gives Postgres URLs starting with "postgres://" but SQLAlchemy
# requires "postgresql://" — fix it transparently.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

# ── Engine ────────────────────────────────────────────────────────────────────

if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite + FastAPI
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # drops stale connections before use
        pool_size=5,          # keep up to 5 connections open
        max_overflow=10,      # allow up to 10 extra connections under load
    )


# ✅ SQLite-only pragmas (WAL mode + safe sync)
if IS_SQLITE:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


# ── Session + Base ────────────────────────────────────────────────────────────

SessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()