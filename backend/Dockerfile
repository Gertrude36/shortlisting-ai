FROM python:3.11-slim

RUN apt-get update -y && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-fra \
    poppler-utils \
    libglib2.0-0 \
    libgl1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN tesseract --version && tesseract --list-langs

WORKDIR /app

RUN pip install --no-cache-dir torch==2.3.1+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /tmp/uploads

EXPOSE 10000

# ── 1 worker only — Render free tier (512 MB RAM) can't fit more ─────────────
# The AI model (sentence-transformers all-MiniLM-L6-v2) uses ~180 MB per
# worker. Even 2 workers = ~360 MB+ → OOM → child processes die on startup.
#
# FastAPI is fully async with 1 worker — it handles many concurrent
# connections without blocking, because the event loop processes I/O
# (file reads, DB queries, HTTP) concurrently even in a single process.
# Sync route handlers (like document upload) are automatically run in
# FastAPI's threadpool so they don't block the event loop either.
#
# --timeout-keep-alive 75 : keeps HTTP/2 connections alive longer on
#   Render's reverse proxy, reducing reconnect overhead between requests.
CMD uvicorn main:app \
    --host 0.0.0.0 \
    --port ${PORT:-10000} \
    --workers 1 \
    --timeout-keep-alive 75