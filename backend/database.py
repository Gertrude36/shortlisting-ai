"""
backend/database.py
────────────────────────────────────────────────────────────────
SQLAlchemy engine + session factory.
Every other module imports `get_db` and `Base` from here.

FIXES APPLIED:
  ✅ FIX 1 — declarative_base import moved from
     sqlalchemy.ext.declarative (deprecated/removed in SQLAlchemy 2.x)
     to sqlalchemy.orm.

  ✅ FIX 2 (NEW) — WAL journal mode enabled via connection event.
     SQLite's default journal mode causes readers in a new session to
     sometimes get a stale snapshot of rows committed by a previous
     session. WAL (Write-Ahead Logging) fixes this: readers always see
     the latest committed data without blocking writers.

  ✅ FIX 3 (NEW) — autoflush=True (restored to SQLAlchemy default).
     autoflush=False was preventing pending ORM writes from being
     flushed before queries in the same session, making newly-added
     Documents invisible to the finalize query.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./capstone.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite with FastAPI
)


# ✅ FIX 2: Enable WAL mode on every new SQLite connection.
# This ensures that a session opened in /finalize always reads the rows
# committed by the /documents upload sessions, eliminating the stale-
# snapshot race condition that caused "docs found=0" in the logs.
@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")   # readers never block writers
    cursor.execute("PRAGMA synchronous=NORMAL") # safe + fast for WAL mode
    cursor.close()


# ✅ FIX 3: autoflush=True so ORM objects are flushed before queries.
SessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()