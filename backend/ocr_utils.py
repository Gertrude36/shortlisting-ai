"""
backend/ocr_utils.py  ·  v9.2.0
────────────────────────────────────────────────────────────────
CHANGES IN v9.2.0 — FIXES 500 ERRORS ON /applications ROUTES:

  ✅ FIX-500-1 — ENABLE_OCR environment variable added.
     Set ENABLE_OCR=false in your Render environment variables to
     disable all OCR processing. extract_document_text() and
     extract_documents_batch() will return "" immediately (no crash,
     no 500). Applicants can upload and submit documents normally.
     Set ENABLE_OCR=true when Tesseract is properly installed.

  ✅ FIX-500-2 — All OCR imports are now fully guarded.
     If pytesseract/PIL/PyMuPDF/pdfplumber are missing and
     ENABLE_OCR=false, the module loads cleanly without ImportError.

All v9.1.0 fixes retained:
  ✅ FIX CRITICAL — `from __future__ import annotations` at line 1.
  🚀 FIX PERF-1 — bilateralFilter instead of fastNlMeansDenoising
  🚀 FIX PERF-2 — PyMuPDF render DPI 2.5× (was 4.0×)
  🚀 FIX PERF-3 — min_width 1200 (was 1600)
  🚀 FIX PERF-4 — Early-exit threshold 400 chars (was 800)
  🚀 FIX PERF-5 — PSM modes (11,6,3) — was (11,6,4,3,1)
  🚀 FIX PERF-6 — Batch extraction runs in parallel
  🚀 FIX PERF-7 — 3 primary strategies; C+D last-resort only
"""

# ✅ FIX CRITICAL: This MUST be the first statement in the file.
from __future__ import annotations

import concurrent.futures
import logging
import os
import threading

import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX-500-1 — Master OCR toggle
# Add ENABLE_OCR=false to your Render environment variables to stop all
# OCR processing. extract_document_text() returns "" immediately — no crash,
# no 500, applicants can still upload and submit their documents.
# ─────────────────────────────────────────────────────────────────────────────

OCR_ENABLED = os.getenv("ENABLE_OCR", "true").strip().lower() == "true"

if not OCR_ENABLED:
    logger.warning(
        "⚠ OCR is DISABLED via ENABLE_OCR=false. "
        "All extract_document_text() calls will return '' immediately. "
        "Set ENABLE_OCR=true once Tesseract is installed on the server."
    )

# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX-500-2 — Guard every OCR import so missing binaries don't crash startup
# ─────────────────────────────────────────────────────────────────────────────

# Optional OpenCV
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    if OCR_ENABLED:
        logger.warning("⚠ opencv-python not installed — advanced preprocessing disabled. "
                       "Run: pip install opencv-python")

# pytesseract + Pillow
OCR_AVAILABLE = False
PILImage = None  # will be set below if available

if OCR_ENABLED:
    try:
        import pytesseract
        from PIL import Image as _PILImage, ImageEnhance, ImageFilter, ImageOps
        PILImage = _PILImage

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
            "Scanned documents will be accepted without text extraction.", _e
        )
else:
    # Still try to import PIL for non-OCR uses (e.g. image validation)
    try:
        from PIL import Image as _PILImage, ImageEnhance, ImageFilter, ImageOps
        PILImage = _PILImage
    except ImportError:
        pass

# pdfplumber
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
    if OCR_ENABLED:
        logger.info("✓ pdfplumber available")
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    if OCR_ENABLED:
        logger.warning("⚠ pdfplumber not installed. Run: pip install pdfplumber")

# PyMuPDF
try:
    import fitz
    PYMUPDF_AVAILABLE = True
    if OCR_ENABLED:
        logger.info("✓ PyMuPDF (fitz) available")
except ImportError:
    PYMUPDF_AVAILABLE = False
    if OCR_ENABLED:
        logger.warning("⚠ PyMuPDF not installed. Run: pip install pymupdf")

POPPLER_AVAILABLE = PYMUPDF_AVAILABLE

OCR_SERVICE_URL       = os.getenv("OCR_SERVICE_URL", "http://localhost:5050")
OCR_SERVICE_AVAILABLE = False


def _check_ocr_service() -> bool:
    try:
        import requests
        r = requests.get(f"{OCR_SERVICE_URL}/health", timeout=1)
        return r.status_code == 200
    except Exception:
        return False


try:
    import requests as _requests_mod
    _REQUESTS_AVAILABLE = True
    if OCR_ENABLED:
        OCR_SERVICE_AVAILABLE = _check_ocr_service()
        if OCR_SERVICE_AVAILABLE:
            logger.info("✓ OCR microservice detected at %s", OCR_SERVICE_URL)
        else:
            logger.info("○ OCR microservice not running — using local OCR pipeline")
except ImportError:
    _REQUESTS_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────────
# In-memory OCR result cache
# ─────────────────────────────────────────────────────────────────────────────

_OCR_CACHE: dict[tuple, str] = {}
_OCR_CACHE_LOCK = threading.Lock()
_OCR_CACHE_MAX  = 512


def _cache_key(file_path: str) -> tuple | None:
    try:
        st = os.stat(file_path)
        return (file_path, st.st_mtime, st.st_size)
    except OSError:
        return None


def _cache_get(file_path: str) -> str | None:
    key = _cache_key(file_path)
    if key is None:
        return None
    with _OCR_CACHE_LOCK:
        return _OCR_CACHE.get(key)


def _cache_set(file_path: str, text: str) -> None:
    key = _cache_key(file_path)
    if key is None:
        return
    with _OCR_CACHE_LOCK:
        if len(_OCR_CACHE) >= _OCR_CACHE_MAX:
            keys_to_drop = list(_OCR_CACHE.keys())[: _OCR_CACHE_MAX // 4]
            for k in keys_to_drop:
                _OCR_CACHE.pop(k, None)
        _OCR_CACHE[key] = text


def clear_ocr_cache() -> int:
    with _OCR_CACHE_LOCK:
        n = len(_OCR_CACHE)
        _OCR_CACHE.clear()
        return n


# ─────────────────────────────────────────────────────────────────────────────
# Language detection
# ─────────────────────────────────────────────────────────────────────────────

def _get_ocr_languages() -> str:
    if not OCR_AVAILABLE:
        return "eng"
    try:
        available = pytesseract.get_languages()
        if "fra" in available:
            logger.debug("Tesseract: using eng+fra")
            return "eng+fra"
        logger.debug("Tesseract: French data not installed — using 'eng' only")
        return "eng"
    except Exception:
        return "eng"


_OCR_LANG = _get_ocr_languages() if OCR_AVAILABLE else "eng"
if OCR_ENABLED:
    logger.info("OCR language string: %s", _OCR_LANG)


# ─────────────────────────────────────────────────────────────────────────────
# OpenCV preprocessing helpers
# ─────────────────────────────────────────────────────────────────────────────

def _pil_to_cv2(img):
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _cv2_to_pil(arr):
    if len(arr.shape) == 2:
        return PILImage.fromarray(arr)
    return PILImage.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def _deskew(grey: np.ndarray) -> np.ndarray:
    try:
        edges = cv2.Canny(grey, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80,
                                minLineLength=grey.shape[1] // 4,
                                maxLineGap=20)
        if lines is None or len(lines) == 0:
            return grey
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 != x1:
                angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                if abs(angle) < 20:
                    angles.append(angle)
        if not angles:
            return grey
        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return grey
        h, w = grey.shape
        M = cv2.getRotationMatrix2D((w // 2, h // 2), median_angle, 1.0)
        return cv2.warpAffine(grey, M, (w, h),
                              flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    except Exception as exc:
        logger.debug("Deskew failed: %s", exc)
        return grey


def _upscale_if_small(grey: np.ndarray, min_width: int = 1200) -> np.ndarray:
    # 🚀 FIX PERF-3: min_width=1200 (was 1600)
    h, w = grey.shape
    if w < min_width:
        scale = min_width / w
        grey  = cv2.resize(grey, (int(w * scale), int(h * scale)),
                           interpolation=cv2.INTER_CUBIC)
    return grey


def _denoise(grey: np.ndarray) -> np.ndarray:
    # 🚀 FIX PERF-1: bilateralFilter (< 0.5 s) instead of fastNlMeansDenoising (10-30 s)
    try:
        return cv2.bilateralFilter(grey, d=5, sigmaColor=30, sigmaSpace=30)
    except Exception:
        return grey


def _clahe(grey: np.ndarray) -> np.ndarray:
    try:
        return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(grey)
    except Exception:
        return grey


def _binarise_otsu(grey: np.ndarray) -> np.ndarray:
    try:
        _, binary = cv2.threshold(grey, 0, 255,
                                  cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
    except Exception:
        return grey


def _binarise_adaptive(grey: np.ndarray) -> np.ndarray:
    try:
        return cv2.adaptiveThreshold(grey, 255,
                                     cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 31, 10)
    except Exception:
        return grey


def _morphological_clean(binary: np.ndarray) -> np.ndarray:
    try:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    except Exception:
        return binary


def _sharpen(grey: np.ndarray) -> np.ndarray:
    """Unsharp mask sharpening for blurry documents."""
    try:
        blurred = cv2.GaussianBlur(grey, (0, 0), 3)
        return cv2.addWeighted(grey, 1.5, blurred, -0.5, 0)
    except Exception:
        return grey


# ─────────────────────────────────────────────────────────────────────────────
# 🚀 FIX PERF-7: 3 primary strategies (A, B, E). C+D are last-resort only.
# ─────────────────────────────────────────────────────────────────────────────

def _build_preprocessing_variants(img) -> list:
    variants: list = []

    try:
        pil_grey = img.convert("L")
        pil_grey = ImageOps.autocontrast(pil_grey, cutoff=2)
        pil_grey = ImageEnhance.Sharpness(pil_grey).enhance(2.5)
        pil_grey = ImageEnhance.Contrast(pil_grey).enhance(1.8)
        variants.append(pil_grey)
    except Exception as exc:
        logger.debug("PIL-only preprocessing failed: %s", exc)

    if not CV2_AVAILABLE:
        return variants

    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Strategy A: CLAHE + adaptive (best for phone photos)
        try:
            g_a = _upscale_if_small(grey.copy())
            g_a = _deskew(g_a)
            g_a = _denoise(g_a)
            g_a = _clahe(g_a)
            g_a = _binarise_adaptive(g_a)
            g_a = _morphological_clean(g_a)
            variants.insert(0, _cv2_to_pil(g_a))
        except Exception as exc:
            logger.debug("Strategy A failed: %s", exc)

        # Strategy B: CLAHE + Otsu (best for clean scans)
        try:
            g_b = _upscale_if_small(grey.copy())
            g_b = _deskew(g_b)
            g_b = _denoise(g_b)
            g_b = _clahe(g_b)
            g_b = _binarise_otsu(g_b)
            variants.append(_cv2_to_pil(g_b))
        except Exception as exc:
            logger.debug("Strategy B failed: %s", exc)

    except Exception as exc:
        logger.debug("OpenCV preprocessing block failed: %s", exc)

    return variants or [img]


def _build_last_resort_variants(img) -> list:
    variants: list = []
    if not CV2_AVAILABLE:
        return variants
    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

        # Strategy C — histogram equalisation for dark/faded docs
        try:
            g_c = _upscale_if_small(grey.copy())
            g_c = cv2.equalizeHist(g_c)
            g_c = _denoise(g_c)
            g_c = _binarise_adaptive(g_c)
            g_c = _morphological_clean(g_c)
            variants.append(_cv2_to_pil(g_c))
        except Exception as exc:
            logger.debug("Strategy C failed: %s", exc)

        # Strategy D — sharpening + Otsu for blurry documents
        try:
            g_d = _upscale_if_small(grey.copy())
            g_d = _sharpen(g_d)
            g_d = _denoise(g_d)
            g_d = _binarise_otsu(g_d)
            variants.append(_cv2_to_pil(g_d))
        except Exception as exc:
            logger.debug("Strategy D failed: %s", exc)

    except Exception as exc:
        logger.debug("Last-resort preprocessing block failed: %s", exc)
    return variants


# 🚀 FIX PERF-5: 3 PSM modes (was 5). PSM 4 and 1 dropped.
_PSM_MODES = (11, 6, 3)

# 🚀 FIX PERF-4: Early-exit threshold 400 chars (was 800).
_EARLY_EXIT_CHARS = 400


def _ocr_one_image(img, lang: str | None = None) -> str:
    ocr_lang = lang or _OCR_LANG
    best     = ""
    for psm in _PSM_MODES:
        try:
            result = pytesseract.image_to_string(
                img, lang=ocr_lang,
                config=f"--psm {psm} --oem 3"
            ).strip()
            usable = len(result.replace(" ", "").replace("\n", ""))
            if usable > len(best.replace(" ", "").replace("\n", "")):
                best = result
                # 🚀 FIX PERF-5: Per-PSM early exit
                if usable >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("PSM %d (lang=%s) failed: %s", psm, ocr_lang, exc)
    return best


def _ocr_best_strategy(img) -> str:
    variants = _build_preprocessing_variants(img)
    best     = ""
    for i, variant in enumerate(variants):
        text        = _ocr_one_image(variant)
        usable      = len(text.replace(" ", "").replace("\n", ""))
        best_usable = len(best.replace(" ", "").replace("\n", ""))
        if usable > best_usable:
            best = text
            logger.debug("Strategy %d: %d chars (new best)", i, usable)
            if usable >= _EARLY_EXIT_CHARS:
                logger.debug("Early exit after strategy %d (%d chars)", i, usable)
                return best

    best_usable = len(best.replace(" ", "").replace("\n", ""))
    if best_usable < 50:
        for i, variant in enumerate(_build_last_resort_variants(img)):
            text   = _ocr_one_image(variant)
            usable = len(text.replace(" ", "").replace("\n", ""))
            if usable > best_usable:
                best        = text
                best_usable = usable
                logger.debug("Last-resort strategy %d: %d chars (new best)", i, usable)
                if usable >= _EARLY_EXIT_CHARS:
                    break

    return best


# ─────────────────────────────────────────────────────────────────────────────
# Rotation attempts for landscape / upside-down scans
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_with_rotation(img) -> str:
    best = ""
    for angle in (0, 90, 180, 270):
        try:
            rotated = img.rotate(angle, expand=True) if angle != 0 else img
            text    = _ocr_best_strategy(rotated)
            usable  = len(text.replace(" ", "").replace("\n", ""))
            if usable > len(best.replace(" ", "").replace("\n", "")):
                best = text
                logger.debug("Rotation %d°: %d chars", angle, usable)
                if usable >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("Rotation %d° failed: %s", angle, exc)
    return best


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_via_service(file_path: str) -> str:
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
    if not PDFPLUMBER_AVAILABLE:
        return ""
    try:
        parts: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if not txt.strip():
                    try:
                        txt = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    except Exception:
                        pass
                if not txt.strip():
                    words = page.extract_words()
                    txt   = " ".join(w["text"] for w in words) if words else ""
                parts.append(txt)
        combined = "\n".join(parts).strip()
        if combined:
            logger.debug("pdfplumber extracted %d chars from %s",
                         len(combined), file_path)
        return combined
    except Exception as exc:
        logger.debug("pdfplumber error for %s: %s", file_path, exc)
        return ""


def _pymupdf_ocr(file_path: str) -> str:
    """
    🚀 FIX PERF-2: Render at 2.5× DPI (was 4.0×).
    """
    if not PYMUPDF_AVAILABLE or not OCR_AVAILABLE:
        return ""
    try:
        doc   = fitz.open(file_path)
        parts: list[str] = []
        for page_num, page in enumerate(doc):
            mat = fitz.Matrix(2.5, 2.5)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = PILImage.frombytes("RGB", (pix.width, pix.height), pix.samples)
            text = _ocr_best_strategy(img)
            if len(text.replace(" ", "").replace("\n", "")) < 50:
                logger.debug("Page %d of %s: low char count, trying rotations",
                             page_num + 1, os.path.basename(file_path))
                rotated_text = _ocr_with_rotation(img)
                if len(rotated_text.replace(" ", "")) > len(text.replace(" ", "")):
                    text = rotated_text
            parts.append(text)
            logger.debug(
                "PyMuPDF+tesseract page %d of %s: %d chars",
                page_num + 1, os.path.basename(file_path), len(text),
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
    if not OCR_AVAILABLE:
        return ""
    try:
        img    = PILImage.open(file_path).convert("RGB")
        result = _ocr_best_strategy(img)
        if len(result.replace(" ", "").replace("\n", "")) < 50:
            logger.debug("%s: low char count, trying rotations",
                         os.path.basename(file_path))
            rotated = _ocr_with_rotation(img)
            if len(rotated.replace(" ", "")) > len(result.replace(" ", "")):
                result = rotated
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
    NEVER raises. Always returns str (possibly "").

    ✅ FIX-500: Returns "" immediately when ENABLE_OCR=false.
    This prevents 500 errors on /applications routes when Tesseract
    is not installed on the server.

    Cache: results keyed by (path, mtime, size).

    Pipeline for PDFs:
      1. ENABLE_OCR check — return "" immediately if disabled
      2. Cache lookup (instant)
      3. Remote OCR microservice (if running)
      4. pdfplumber  — text-layer PDFs (fast)
      5. PyMuPDF + multi-strategy OCR @ 2.5× DPI — scanned / image PDFs

    Pipeline for images:
      1. ENABLE_OCR check — return "" immediately if disabled
      2. Cache lookup (instant)
      3. Remote OCR microservice (if running)
      4. Multi-strategy OpenCV preprocessing + multi-PSM with early exit
      5. Rotation fallback if < 50 chars extracted
    """
    # ✅ FIX-500-1: Bail out immediately — no processing, no crash, no 500.
    if not OCR_ENABLED:
        logger.debug("OCR disabled (ENABLE_OCR=false) — skipping extraction for %s",
                     file_path)
        return ""

    if not file_path or not os.path.exists(file_path):
        logger.debug("extract_document_text: file not found: %s", file_path)
        return ""

    cached = _cache_get(file_path)
    if cached is not None:
        logger.debug("OCR cache HIT for %s (%d chars)",
                     os.path.basename(file_path), len(cached))
        return cached

    ext = os.path.splitext(file_path)[1].lower()

    try:
        # Priority 1: Remote OCR microservice
        if OCR_SERVICE_AVAILABLE:
            text = _extract_via_service(file_path)
            if text.strip():
                _cache_set(file_path, text)
                return text
            logger.debug("OCR service returned empty for %s — trying local", file_path)

        # Priority 2/3: Local extraction
        if ext == ".pdf":
            text = _pdfplumber_text(file_path)
            if text.strip():
                _cache_set(file_path, text)
                return text
            logger.debug("pdfplumber found no text in %s — attempting PyMuPDF+OCR",
                         os.path.basename(file_path))
            text = _pymupdf_ocr(file_path)
            _cache_set(file_path, text)
            return text

        elif ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"):
            text = _image_ocr(file_path)
            _cache_set(file_path, text)
            return text

        else:
            logger.debug("extract_document_text: unsupported extension '%s'", ext)
            return ""

    except Exception as exc:
        logger.warning("extract_document_text unexpected error for %s: %s",
                       file_path, exc)
        return ""


def extract_documents_batch(
    file_paths: list[str],
) -> dict[str, str]:
    """
    🚀 FIX PERF-6: Extract text from multiple files IN PARALLEL.
    Returns {file_path: text} dict.

    ✅ FIX-500: Returns {"path": ""} for all files when ENABLE_OCR=false.
    """
    if not file_paths:
        return {}

    # ✅ FIX-500-1: Fast-path when OCR is disabled — return empty strings for all
    if not OCR_ENABLED:
        logger.debug("OCR disabled — batch extraction returning empty strings for %d files",
                     len(file_paths))
        return {fp: "" for fp in file_paths}

    results: dict[str, str] = {}
    uncached: list[str] = []
    for fp in file_paths:
        cached = _cache_get(fp)
        if cached is not None:
            results[fp] = cached
        else:
            uncached.append(fp)

    if not uncached:
        return results

    max_workers = min(4, len(uncached))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_to_path = {pool.submit(extract_document_text, fp): fp for fp in uncached}
        for fut in concurrent.futures.as_completed(future_to_path):
            fp = future_to_path[fut]
            try:
                results[fp] = fut.result()
            except Exception as exc:
                logger.warning("Parallel OCR failed for %s: %s", fp, exc)
                results[fp] = ""

    return results


# ─────────────────────────────────────────────────────────