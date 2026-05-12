#!/usr/bin/env bash
set -e

# ── System dependencies ───────────────────────────────────────
# Install Tesseract OCR + English + French language packs
# French is required for Rwanda ID validation
apt-get update -y
apt-get install -y \
  tesseract-ocr \
  tesseract-ocr-eng \
  tesseract-ocr-fra \
  poppler-utils

# Confirm Tesseract installed and show available languages
echo "── Tesseract version ──────────────────────────────────────"
tesseract --version
echo "── Installed languages ────────────────────────────────────"
tesseract --list-langs

# ── Python dependencies ───────────────────────────────────────
# Install CPU-only torch FIRST (avoids downloading the huge CUDA build ~2.5GB)
pip install torch==2.3.1+cpu --extra-index-url https://download.pytorch.org/whl/cpu

# Install all other dependencies
pip install -r requirements.txt

echo "── Build complete ─────────────────────────────────────────"