#!/usr/bin/env bash
set -e

# ── System dependencies ───────────────────────────────────────
# Install Tesseract OCR + English + French language packs
apt-get update -y
apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra

# ── Python dependencies ───────────────────────────────────────
# Install CPU-only torch FIRST (avoids downloading the huge CUDA build ~2.5GB)
pip install torch==2.3.1+cpu --extra-index-url https://download.pytorch.org/whl/cpu

# Install all other dependencies
pip install -r requirements.txt