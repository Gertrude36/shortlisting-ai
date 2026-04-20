"""
backend/ocr_utils.py
────────────────────────────────────────────────────────────────
FIXED VERSION — Robust local OCR, no API key, no microservice needed.

ROOT CAUSE OF THE WARNING:
────────────────────────────────────────────────────────────────
  Your ID card PDF is a SCANNED image PDF (no text layer).
  pdfplumber returns "" → PyMuPDF tries OCR → but OCR was only
  run in English ("eng"), missing French and Kinyarwanda text
  present on Rwanda National IDs. The extracted text contained
  no matching English keywords → score 0 → "unknown" → advisory.

FIXES IN THIS VERSION:
────────────────────────────────────────────────────────────────
  ✅ FIX 1 — Multi-language OCR (eng+fra).
     Rwanda National IDs contain text in both English and French
     (e.g. "AGENCE NATIONALE D'IDENTIFICATION", "DATE DE
     NAISSANCE", "NOM DE FAMILLE"). Adding French ("fra") to the
     Tesseract language string dramatically improves keyword
     extraction from these documents. Install with:
       Linux:   sudo apt install tesseract-ocr-fra
       Windows: re-run the Tesseract installer and select French

  ✅ FIX 2 — OCR microservice check is NON-BLOCKING (retained).
     If the service is not running, returns False in <1 s.

  ✅ FIX 3 — PyMuPDF rendering at 3× zoom ≈ 450 dpi (retained).
     Better for small ID card text.

  ✅ FIX 4 — Preprocessing before pytesseract (retained).
     Grayscale + contrast boost + sharpening.

  ✅ FIX 5 — Multiple pytesseract PSM modes tried (retained).
     PSM 6 → PSM 3 → PSM 11, best result returned.

  ✅ FIX 6 — pdfplumber text extraction hardened (retained).
     Secondary extract_words() pass for edge-case PDFs.

  ✅ FIX 7 — Language auto-detection with graceful fallback.
     Tries "eng+fra" first; if Tesseract doesn't have the French
     data installed, silently falls back to "eng" only so the
     service keeps working.

INSTALLATION (run once in your backend folder):
────────────────────────────────────────────────
  pip install pymupdf pdfplumber pytesseract pillow

  Tesseract binary (FREE, required):
  → Windows: https://github.com/UB-Mannheim/tesseract/wiki
    Default install path: C:\\Program Files\\Tesseract-OCR\\tesseract.exe
    During install: tick "French" under "Additional language data"
  → Linux:   sudo apt install tesseract-ocr tesseract-ocr-fra
  → Mac:     brew install tesseract tesseract-lang
"""

from __future__ import annotations
import io
import logging
import os

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Capability flags — detected once at import time
# ─────────────────────────────────────────────────────────────────────────────

# ── pytesseract ───────────────────────────────────────────────────────────────
try:
    import pytesseract
    from PIL import Image as PILImage, ImageEnhance, ImageFilter, ImageOps

    _win_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(_win_path):
        pytesseract.pytesseract.tesseract_cmd = _win_path

    pytesseract.get_tesseract_version()
    OCR_AVAILABLE = True
    logger.info("✓ pytesseract OCR available")
except Exception as _e:
    OCR_AVAILABLE = False
    logger.warning(
        "⚠ pytesseract not available (%s). "
        "Install Tesseract binary + 'pip install pytesseract pillow'. "
        "Scanned documents will be accepted for manual review.", _e
    )

# ── pdfplumber ────────────────────────────────────────────────────────────────
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
    logger.info("✓ pdfplumber available")
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    logger.warning("⚠ pdfplumber not installed. Run: pip install pdfplumber")

# ── PyMuPDF / fitz ────────────────────────────────────────────────────────────
try:
    import fitz  # pip install pymupdf
    PYMUPDF_AVAILABLE = True
    logger.info("✓ PyMuPDF (fitz) available — scanned PDF OCR enabled")
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning(
        "⚠ PyMuPDF not installed. Scanned/image PDFs cannot be OCR'd. "
        "Fix: pip install pymupdf"
    )

# Keep alias for backward compat with document_verifier.py / main.py
POPPLER_AVAILABLE = PYMUPDF_AVAILABLE

# ── Remote OCR microservice (OPTIONAL — skip cleanly if not running) ──────────
OCR_SERVICE_URL       = os.getenv("OCR_SERVICE_URL", "http://localhost:5050")
OCR_SERVICE_AVAILABLE = False   # default off; checked lazily below


def _check_ocr_service() -> bool:
    """
    Non-blocking check with 1-second timeout.
    If the microservice is not running, returns False in <1 s.
    """
    try:
        import requests
        r = requests.get(f"{OCR_SERVICE_URL}/health", timeout=1)
        return r.status_code == 200
    except Exception:
        return False


try:
    import requests as _requests_mod
    _REQUESTS_AVAILABLE = True
    OCR_SERVICE_AVAILABLE = _check_ocr_service()
    if OCR_SERVICE_AVAILABLE:
        logger.info("✓ OCR microservice detected at %s", OCR_SERVICE_URL)
    else:
        logger.info("○ OCR microservice not running — using local OCR pipeline")
except ImportError:
    _REQUESTS_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 1 — Multi-language OCR configuration
# ─────────────────────────────────────────────────────────────────────────────

def _get_ocr_languages() -> str:
    """
    ✅ FIX 7: Determine the best available Tesseract language string.

    Rwanda National IDs contain English AND French text, so "eng+fra"
    extracts far more usable text than "eng" alone.

    Falls back to "eng" if French data is not installed, so the
    system keeps working even without the extra language pack.
    """
    if not OCR_AVAILABLE:
        return "eng"
    try:
        available = pytesseract.get_languages()
        if "fra" in available:
            logger.debug("Tesseract: using eng+fra (French data available)")
            return "eng+fra"
        else:
            logger.debug(
                "Tesseract: French language data not installed — using 'eng' only. "
                "Install with: sudo apt install tesseract-ocr-fra  "
                "(or tick 'French' in the Windows Tesseract installer)"
            )
            return "eng"
    except Exception:
        return "eng"


# Resolved once at startup
_OCR_LANG = _get_ocr_languages() if OCR_AVAILABLE else "eng"
logger.info("OCR language string: %s", _OCR_LANG)


# ─────────────────────────────────────────────────────────────────────────────
# Image pre-processing for better OCR accuracy
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_for_ocr(img: "PILImage.Image") -> "PILImage.Image":
    """
    Convert to grayscale and boost contrast before OCR.
    Dramatically improves recognition on:
      - Photos of ID cards (uneven lighting)
      - Low-contrast scans
      - Coloured backgrounds (e.g. Rwanda National ID blue/green tones)
    """
    img = img.convert("L")                          # grayscale
    img = ImageOps.autocontrast(img, cutoff=2)      # auto-levels
    img = ImageEnhance.Sharpness(img).enhance(2.0)  # sharpen
    img = ImageEnhance.Contrast(img).enhance(1.5)   # boost contrast
    return img


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 5 — Try multiple PSM modes and return best result
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_with_best_psm(img: "PILImage.Image", lang: str | None = None) -> str:
    """
    Try pytesseract with PSM 6, 3, and 11.
    Return whichever yields the most text (by character count).

    PSM 6  = assume uniform block of text (good for clean docs)
    PSM 3  = fully automatic page segmentation (good for mixed layouts)
    PSM 11 = sparse text — find as much text as possible (good for IDs)

    ✅ FIX 1: Uses the resolved multi-language string by default.
    """
    ocr_lang = lang or _OCR_LANG
    best = ""
    for psm in (6, 3, 11):
        try:
            result = pytesseract.image_to_string(
                img, lang=ocr_lang, config=f"--psm {psm}"
            ).strip()
            if len(result) > len(best):
                best = result
        except Exception as exc:
            logger.debug("PSM %d (lang=%s) failed: %s", psm, ocr_lang, exc)
    return best


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_via_service(file_path: str) -> str:
    """Send file to the optional OCR microservice. Returns text or ''."""
    if not _REQUESTS_AVAILABLE:
        return ""
    try:
        import requests
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        ext   = os.path.splitext(file_path)[1].lower().lstrip(".")
        mime  = "application/pdf" if ext == "pdf" else f"image/{ext}"
        files = {"file": (os.path.basename(file_path), file_bytes, mime)}
        r     = requests.post(f"{OCR_SERVICE_URL}/ocr", files=files, timeout=30)
        if r.status_code == 200:
            data = r.json()
            return data.get("text", "") if data.get("success") else ""
        return ""
    except Exception as exc:
        logger.debug("OCR service error for %s: %s", file_path, exc)
        return ""


def _pdfplumber_text(file_path: str) -> str:
    """
    ✅ FIX 6: Extract text layer from PDF using pdfplumber.
    Tries extract_words() as a secondary pass when extract_text()
    returns empty — catches some edge-case PDF structures.
    """
    if not PDFPLUMBER_AVAILABLE:
        return ""
    try:
        parts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if not txt.strip():
                    words = page.extract_words()
                    txt = " ".join(w["text"] for w in words) if words else ""
                parts.append(txt)
        combined = "\n".join(parts).strip()
        if combined:
            logger.debug(
                "pdfplumber extracted %d chars from %s", len(combined), file_path
            )
        return combined
    except Exception as exc:
        logger.debug("pdfplumber error for %s: %s", file_path, exc)
        return ""


def _pymupdf_ocr(file_path: str) -> str:
    """
    ✅ FIX 1, 3, 4, 5: Render PDF pages with PyMuPDF at 3× zoom,
    preprocess each image, then OCR with multi-language + multiple PSM modes.

    Handles scanned / image-based PDFs (ID cards, diplomas) that
    have no extractable text layer.
    """
    if not PYMUPDF_AVAILABLE or not OCR_AVAILABLE:
        logger.debug(
            "_pymupdf_ocr skipped for %s: PyMuPDF=%s OCR=%s",
            file_path, PYMUPDF_AVAILABLE, OCR_AVAILABLE,
        )
        return ""
    try:
        doc   = fitz.open(file_path)
        parts: list[str] = []

        for page_num, page in enumerate(doc):
            # 3× zoom ≈ 450 dpi — better for small ID card text
            mat = fitz.Matrix(3.0, 3.0)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = PILImage.frombytes("RGB", (pix.width, pix.height), pix.samples)

            # Preprocess before OCR
            img_processed = _preprocess_for_ocr(img)

            # ✅ FIX 1: Multi-language OCR (eng+fra)
            text = _ocr_with_best_psm(img_processed)

            # If preprocessed result is poor, also try raw colour image
            if len(text) < 20:
                raw_text = _ocr_with_best_psm(img)
                if len(raw_text) > len(text):
                    text = raw_text

            parts.append(text)
            logger.debug(
                "PyMuPDF+tesseract page %d of %s: %d chars (lang=%s)",
                page_num + 1, os.path.basename(file_path), len(text), _OCR_LANG,
            )

        doc.close()
        result = "\n\n".join(parts).strip()
        logger.info(
            "PyMuPDF OCR total: %d chars from %s (%d pages)",
            len(result), os.path.basename(file_path), len(parts),
        )
        return result
    except Exception as exc:
        logger.warning("PyMuPDF OCR error for %s: %s", file_path, exc)
        return ""


def _image_ocr(file_path: str) -> str:
    """
    ✅ FIX 1, 4, 5: OCR a standalone image file with multi-language support,
    preprocessing, and multiple PSM modes.
    """
    if not OCR_AVAILABLE:
        return ""
    try:
        img           = PILImage.open(file_path).convert("RGB")
        img_processed = _preprocess_for_ocr(img)

        # Try preprocessed first (multi-language)
        text = _ocr_with_best_psm(img_processed)

        # If poor result, also try original
        if len(text) < 20:
            raw_text = _ocr_with_best_psm(img)
            if len(raw_text) > len(text):
                text = raw_text

        result = text.strip()
        logger.debug(
            "pytesseract extracted %d chars from image %s (lang=%s)",
            len(result), os.path.basename(file_path), _OCR_LANG,
        )
        return result
    except Exception as exc:
        logger.debug("pytesseract image error for %s: %s", file_path, exc)
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def extract_document_text(file_path: str) -> str:
    """
    Extract text from a document using the best available local method.

    Order for PDFs:
      1. Remote OCR microservice (ONLY if running — non-blocking check)
      2. pdfplumber  → text-layer extraction (fast, text PDFs)
      3. PyMuPDF + pytesseract → render + OCR (scanned/image PDFs)

    Order for images (.png, .jpg, etc.):
      1. Remote OCR microservice (if running)
      2. pytesseract with multi-language, preprocessing + multi-PSM

    NEVER raises. Always returns str (possibly "").
    """
    if not file_path or not os.path.exists(file_path):
        logger.debug("extract_document_text: file not found: %s", file_path)
        return ""

    ext = os.path.splitext(file_path)[1].lower()

    try:
        # ── Priority 1: Remote OCR microservice (only if running) ─────────────
        if OCR_SERVICE_AVAILABLE:
            text = _extract_via_service(file_path)
            if text.strip():
                return text
            logger.debug(
                "OCR service returned empty for %s — trying local fallbacks",
                file_path,
            )

        # ── Priority 2 & 3: Local extraction ──────────────────────────────────
        if ext == ".pdf":
            # Try text layer first (fast — works for text-based PDFs)
            text = _pdfplumber_text(file_path)
            if text.strip():
                return text

            # Empty text layer → scanned/image PDF → OCR it
            logger.debug(
                "pdfplumber found no text in %s — attempting PyMuPDF+OCR",
                os.path.basename(file_path),
            )
            return _pymupdf_ocr(file_path)

        elif ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"):
            return _image_ocr(file_path)

        else:
            logger.debug(
                "extract_document_text: unsupported extension '%s'", ext
            )
            return ""

    except Exception as exc:
        logger.warning(
            "extract_document_text unexpected error for %s: %s", file_path, exc
        )
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Startup diagnostics
# ─────────────────────────────────────────────────────────────────────────────

def _print_ocr_status() -> None:
    fra_installed = "fra" in _OCR_LANG if OCR_AVAILABLE else False
    lines = [
        "",
        "── OCR Status ─────────────────────────────────────────────────────────",
        f"  pytesseract (image OCR)    : {'✓ available' if OCR_AVAILABLE else '✗ NOT FOUND — pip install pytesseract  +  install Tesseract binary'}",
        f"  OCR language(s)            : {_OCR_LANG}" + (" ✓ French ready" if fra_installed else " ⚠ French not installed — Rwanda IDs may not fully validate"),
        f"  pdfplumber  (text PDFs)    : {'✓ available' if PDFPLUMBER_AVAILABLE else '✗ NOT FOUND — pip install pdfplumber'}",
        f"  PyMuPDF     (scanned PDFs) : {'✓ available' if PYMUPDF_AVAILABLE else '✗ NOT FOUND — pip install pymupdf   ← required for ID card PDFs'}",
        f"  OCR microservice           : {'✓ running at ' + OCR_SERVICE_URL if OCR_SERVICE_AVAILABLE else '○ not running (optional)'}",
        "───────────────────────────────────────────────────────────────────────",
    ]
    if not OCR_AVAILABLE:
        lines.append("  ⚠ pytesseract missing — scanned images/PDFs cannot be read.")
        lines.append("    1. pip install pytesseract pillow pymupdf")
        lines.append("    2. Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki")
    elif not PYMUPDF_AVAILABLE:
        lines.append("  ⚠ PyMuPDF missing — scanned PDFs (ID cards etc.) cannot be OCR'd.")
        lines.append("    Fix: pip install pymupdf")
    elif not fra_installed:
        lines.append("  ⚠ French OCR not available. Rwanda IDs may partially fail keyword detection.")
        lines.append("    Linux fix:   sudo apt install tesseract-ocr-fra")
        lines.append("    Windows fix: re-run Tesseract installer → tick 'French' language")
        lines.append("    Mac fix:     brew install tesseract-lang")
    else:
        lines.append("  ✓ Full local OCR pipeline ready (eng+fra, no API key needed)")
    lines.append("")
    print("\n".join(lines))


_print_ocr_status()