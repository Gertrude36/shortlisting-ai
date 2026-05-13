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

# ── FIX: 4 workers so concurrent uploads don't block each other ──────────────
# With 1 worker (the default), a slow OCR/AI document upload holds the entire
# server hostage — new TCP connections queue up and time out, which the browser
# misreports as a CORS error ("No Access-Control-Allow-Origin header present").
# 4 workers means up to 4 simultaneous requests can be processed in parallel.
#
# NOTE: sentence-transformers loads the AI model once per worker (~90 MB each).
# On Render free tier (512 MB RAM) 4 workers × ~120 MB = ~480 MB — just fits.
# If you see OOM errors, drop to --workers 2.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 4