from __future__ import annotations

import concurrent.futures
import io
import logging
import os
import threading
import time

import numpy as np

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# OCR toggle
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_enabled() -> bool:
    return True  # Always enabled


_OCR_ENABLED_AT_IMPORT = True

# ─────────────────────────────────────────────────────────────────────────────
# Optional OpenCV
# ─────────────────────────────────────────────────────────────────────────────

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("opencv-python not installed — advanced preprocessing disabled.")

# ─────────────────────────────────────────────────────────────────────────────
# pytesseract + Pillow
# ─────────────────────────────────────────────────────────────────────────────

OCR_AVAILABLE = False
PILImage      = None

try:
    import pytesseract
    from PIL import Image as _PILImage, ImageEnhance, ImageFilter, ImageOps
    PILImage = _PILImage

    _win_path = r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
    if os.path.exists(_win_path):
        pytesseract.pytesseract.tesseract_cmd = _win_path

    pytesseract.get_tesseract_version()
    OCR_AVAILABLE = True
    logger.info("✓ pytesseract available")
except Exception as _e:
    OCR_AVAILABLE = False
    logger.warning("pytesseract not available (%s). Install Tesseract + pip install pytesseract pillow.", _e)

# ─────────────────────────────────────────────────────────────────────────────
# Bundled poppler (Windows)
# ─────────────────────────────────────────────────────────────────────────────

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_POPPLER_WIN_PATH: str | None = None

for _candidate in [
    os.path.join(_SCRIPT_DIR, "poppler-25.12.0", "Library", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler-25.12.0", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler", "Library", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler", "bin"),
]:
    if os.path.isdir(_candidate):
        _POPPLER_WIN_PATH = _candidate
        logger.info("✓ Bundled poppler at: %s", _POPPLER_WIN_PATH)
        break

# ─────────────────────────────────────────────────────────────────────────────
# PDF libraries
# ─────────────────────────────────────────────────────────────────────────────

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
    logger.info("✓ pdfplumber available")
except ImportError:
    PDFPLUMBER_AVAILABLE = False

try:
    import fitz
    PYMUPDF_AVAILABLE = True
    logger.info("✓ PyMuPDF (fitz) available")
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from pdf2image import convert_from_bytes as _pdf2image_convert
    PDF2IMAGE_AVAILABLE = True
    logger.info("✓ pdf2image available")
except ImportError:
    PDF2IMAGE_AVAILABLE = False

POPPLER_AVAILABLE = PYMUPDF_AVAILABLE or PDF2IMAGE_AVAILABLE

# ─────────────────────────────────────────────────────────────────────────────
# OCR microservice — silent health check, no noisy warnings
# ─────────────────────────────────────────────────────────────────────────────

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5050")

_OCR_SERVICE_AVAILABLE: bool   = False
_OCR_SERVICE_LAST_CHECK: float = 0.0
_OCR_SERVICE_CACHE_TTL         = 60.0
_OCR_SERVICE_LOCK              = threading.Lock()


def _check_ocr_service_live() -> bool:
    """
    FIX-UTIL-LOG-1: Health check is now fully silent on failure.
    Previously every failed check emitted a warning-level log that showed
    up in the UI as "OCR service unavailable — falling back to local quality check".
    Now uses DEBUG level only — the service being down is expected in local-only
    deployments and should not alarm users or clutter logs.
    """
    global _OCR_SERVICE_AVAILABLE, _OCR_SERVICE_LAST_CHECK
    now = time.monotonic()
    with _OCR_SERVICE_LOCK:
        if now - _OCR_SERVICE_LAST_CHECK < _OCR_SERVICE_CACHE_TTL:
            return _OCR_SERVICE_AVAILABLE
        try:
            import requests
            r      = requests.get(f"{OCR_SERVICE_URL}/health", timeout=2)
            result = r.status_code == 200
        except Exception:
            result = False
        prev = _OCR_SERVICE_AVAILABLE
        _OCR_SERVICE_AVAILABLE  = result
        _OCR_SERVICE_LAST_CHECK = now
        # Only log a change in status, and only at DEBUG level
        if result != prev:
            if result:
                logger.debug("OCR microservice is now reachable at %s", OCR_SERVICE_URL)
            else:
                logger.debug(
                    "OCR microservice not reachable at %s — using local OCR", OCR_SERVICE_URL
                )
        return result


try:
    import requests as _requests_mod
    _REQUESTS_AVAILABLE = True
    # FIX-UTIL-LOG-2: Startup health check at DEBUG — no console noise on import
    _check_ocr_service_live()
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
        langs = ["eng"]
        if "fra" in available:
            langs.append("fra")
        if "kin" in available:
            langs.append("kin")
        return "+".join(langs)
    except Exception:
        return "eng"


_OCR_LANG = _get_ocr_languages() if OCR_AVAILABLE else "eng"

# ─────────────────────────────────────────────────────────────────────────────
# Quality thresholds
# ─────────────────────────────────────────────────────────────────────────────

_BLUR_THRESHOLD_HARD  = 40
_BLUR_THRESHOLD_WARN  = 80
_MIN_RESOLUTION       = 150
_MIN_ALPHA_CHARS      = 15   # lowered — Rwanda IDs may yield 15-25 alpha chars
_MIN_ALPHA_CHARS_PDF  = 20
_BRIGHTNESS_TOO_DARK   = 40
_BRIGHTNESS_TOO_BRIGHT = 230
_PDF_TEXT_MIN_ALPHA    = 20

# ─────────────────────────────────────────────────────────────────────────────
# Yellow/gold background detection (Rwanda NID holographic laminate)
# ─────────────────────────────────────────────────────────────────────────────

def _detect_yellow_background_local(bgr: np.ndarray) -> bool:
    if not CV2_AVAILABLE:
        return False
    try:
        hsv       = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h_channel = hsv[:, :, 0]
        s_channel = hsv[:, :, 1]
        yellow_mask  = (h_channel >= 15) & (h_channel <= 35) & (s_channel > 60)
        yellow_ratio = float(np.sum(yellow_mask)) / yellow_mask.size
        return yellow_ratio > 0.12
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Image quality gate (pre-upload, images only)
# ─────────────────────────────────────────────────────────────────────────────

def check_image_quality_strict(file_bytes: bytes, filename: str = "") -> tuple[bool, str]:
    """
    Pre-upload quality gate for IMAGE files only. PDFs skipped — checked post-OCR.
    Returns (ok, short_user_friendly_message).
    FIX-UTIL-16: Rwanda ID yellow background bypasses brightness-too-bright gate.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf" or file_bytes[:4] == b"%PDF":
        return True, ""
    if not CV2_AVAILABLE:
        return True, ""

    try:
        nparr = np.frombuffer(file_bytes, np.uint8)
        bgr   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if bgr is None:
            return False, "This file couldn't be read as an image. Please upload a JPG, PNG, or PDF."

        h, w            = bgr.shape[:2]
        grey            = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(grey))
        blur_score      = float(cv2.Laplacian(grey, cv2.CV_64F).var())
        has_yellow_bg   = _detect_yellow_background_local(bgr)

        if mean_brightness < _BRIGHTNESS_TOO_DARK:
            return False, "The photo is too dark. Please retake it with better lighting."

        if mean_brightness > _BRIGHTNESS_TOO_BRIGHT and not has_yellow_bg:
            return False, "The photo looks overexposed or blank. Please check the file and try again."

        if blur_score < _BLUR_THRESHOLD_HARD:
            return False, (
                "The photo is too blurry. Please retake it:\n"
                "• Hold steady and tap the screen to focus\n"
                "• Keep the document flat and fully in frame\n"
                "• Use good lighting, avoid glare"
            )

        if w < _MIN_RESOLUTION or h < _MIN_RESOLUTION:
            return False, f"The image is too small ({w}×{h}px). Please upload a higher-resolution photo."

        return True, ""

    except Exception as exc:
        logger.debug("check_image_quality_strict failed for %s: %s", filename, exc)
        return True, ""  # Don't block on unexpected errors


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
                                minLineLength=grey.shape[1] // 4, maxLineGap=20)
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
        return cv2.warpAffine(grey, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    except Exception as exc:
        logger.debug("Deskew failed: %s", exc)
        return grey


def _upscale_if_small(grey: np.ndarray, min_width: int = 1400) -> np.ndarray:
    h, w = grey.shape
    if w < min_width:
        scale = min_width / w
        grey  = cv2.resize(grey, (int(w * scale), int(h * scale)),
                           interpolation=cv2.INTER_CUBIC)
    return grey


def _denoise(grey: np.ndarray) -> np.ndarray:
    try:
        return cv2.bilateralFilter(grey, d=5, sigmaColor=30, sigmaSpace=30)
    except Exception:
        return grey


def _clahe(grey: np.ndarray, clip: float = 2.0, tile: int = 8) -> np.ndarray:
    try:
        return cv2.createCLAHE(clipLimit=clip, tileGridSize=(tile, tile)).apply(grey)
    except Exception:
        return grey


def _binarise_otsu(grey: np.ndarray) -> np.ndarray:
    try:
        _, binary = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
    except Exception:
        return grey


def _binarise_adaptive(grey: np.ndarray) -> np.ndarray:
    try:
        return cv2.adaptiveThreshold(grey, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
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
    try:
        blurred = cv2.GaussianBlur(grey, (0, 0), 3)
        return cv2.addWeighted(grey, 1.5, blurred, -0.5, 0)
    except Exception:
        return grey


def _sharpen_strong(grey: np.ndarray) -> np.ndarray:
    try:
        blurred = cv2.GaussianBlur(grey, (0, 0), 5)
        return cv2.addWeighted(grey, 2.2, blurred, -1.2, 0)
    except Exception:
        return grey


def _gamma_correction(grey: np.ndarray, gamma: float = 1.5) -> np.ndarray:
    try:
        inv_gamma = 1.0 / gamma
        table = np.array([(i / 255.0) ** inv_gamma * 255 for i in range(256)], dtype=np.uint8)
        return cv2.LUT(grey, table)
    except Exception:
        return grey


def _border_remove(grey: np.ndarray, border_px: int = 10) -> np.ndarray:
    try:
        h, w = grey.shape
        if h < border_px * 4 or w < border_px * 4:
            return grey
        interior = grey[border_px:h - border_px, border_px:w - border_px]
        fill_val = int(np.median(interior))
        result = grey.copy()
        result[:border_px, :]  = fill_val
        result[-border_px:, :] = fill_val
        result[:, :border_px]  = fill_val
        result[:, -border_px:] = fill_val
        return result
    except Exception:
        return grey


def _compute_blur_score(grey: np.ndarray) -> float:
    try:
        return float(cv2.Laplacian(grey, cv2.CV_64F).var())
    except Exception:
        return 999.0


def _is_too_blurry(grey: np.ndarray) -> tuple[bool, float]:
    score = _compute_blur_score(grey)
    return score < _BLUR_THRESHOLD_HARD, score


def _detect_dark_background(grey: np.ndarray) -> bool:
    try:
        return float(np.mean(grey)) < 127
    except Exception:
        return False


def _invert_if_dark(grey: np.ndarray) -> np.ndarray:
    if not CV2_AVAILABLE:
        return grey
    try:
        if _detect_dark_background(grey):
            return cv2.bitwise_not(grey)
        return grey
    except Exception:
        return grey


def _contrast_score(grey: np.ndarray) -> float:
    try:
        return float(np.std(grey))
    except Exception:
        return 0.0


def _yellow_aware_grayscale(bgr: np.ndarray) -> np.ndarray:
    """
    Grayscale with channel weights that suppress yellow/gold Rwanda NID background.
    Weights: R*0.15, G*0.35, B*0.85 (heavy blue suppresses yellow).
    """
    try:
        b = bgr[:, :, 0].astype(np.float32)
        g = bgr[:, :, 1].astype(np.float32)
        r = bgr[:, :, 2].astype(np.float32)
        grey = np.clip(r * 0.15 + g * 0.35 + b * 0.85, 0, 255).astype(np.uint8)
        return grey
    except Exception:
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


# ─────────────────────────────────────────────────────────────────────────────
# Rwanda ID card preprocessing variants
# ─────────────────────────────────────────────────────────────────────────────

def _build_id_card_variants(img) -> list:
    if not CV2_AVAILABLE or PILImage is None:
        return []
    variants: list = []
    try:
        bgr       = _pil_to_cv2(img)
        is_yellow = _detect_yellow_background_local(bgr)

        if is_yellow:
            try:
                grey = _yellow_aware_grayscale(bgr)
                grey = _upscale_if_small(grey, min_width=1600)
                grey = _deskew(grey)
                grey = _clahe(grey, clip=5.0, tile=6)
                grey = _sharpen(grey)
                grey = cv2.adaptiveThreshold(grey, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 21, 10)
                grey = _morphological_clean(grey)
                variants.append(PILImage.fromarray(grey).convert("RGB"))
            except Exception as exc:
                logger.debug("Yellow-suppress ID variant 1 failed: %s", exc)

            try:
                grey2 = _yellow_aware_grayscale(bgr)
                grey2 = _upscale_if_small(grey2, min_width=2000)
                grey2 = _gamma_correction(grey2, gamma=1.4)
                grey2 = _clahe(grey2, clip=6.0, tile=4)
                grey2 = _denoise(grey2)
                grey2 = _binarise_otsu(grey2)
                grey2 = _morphological_clean(grey2)
                variants.append(PILImage.fromarray(grey2).convert("RGB"))
            except Exception as exc:
                logger.debug("Yellow-suppress ID variant 2 failed: %s", exc)

        try:
            grey_std = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            grey_std = _upscale_if_small(grey_std, min_width=1600)
            grey_std = _deskew(grey_std)
            grey_std = _clahe(grey_std, clip=4.0, tile=6)
            grey_std = _sharpen(grey_std)
            grey_std = cv2.adaptiveThreshold(grey_std, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 21, 10)
            grey_std = _morphological_clean(grey_std)
            variants.append(PILImage.fromarray(grey_std).convert("RGB"))
        except Exception as exc:
            logger.debug("Standard ID variant failed: %s", exc)

        try:
            grey_inv = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            grey_inv = cv2.bitwise_not(grey_inv)
            grey_inv = _upscale_if_small(grey_inv, min_width=1600)
            grey_inv = _clahe(grey_inv, clip=4.0, tile=6)
            grey_inv = cv2.adaptiveThreshold(grey_inv, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 21, 10)
            grey_inv = _morphological_clean(grey_inv)
            variants.append(PILImage.fromarray(grey_inv).convert("RGB"))
        except Exception as exc:
            logger.debug("Inverted ID variant failed: %s", exc)

    except Exception as exc:
        logger.debug("_build_id_card_variants outer failed: %s", exc)
    return variants


def _preprocess_pdf_page_image(img, is_id_card: bool = False) -> object:
    if PILImage is None:
        return img
    if is_id_card and CV2_AVAILABLE:
        try:
            bgr       = _pil_to_cv2(img)
            is_yellow = _detect_yellow_background_local(bgr)
            if is_yellow:
                grey = _yellow_aware_grayscale(bgr)
                grey = _upscale_if_small(grey, min_width=1600)
                grey = _deskew(grey)
                grey = _clahe(grey, clip=5.0, tile=6)
                grey = _sharpen(grey)
                grey = cv2.adaptiveThreshold(grey, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 21, 10)
                grey = _morphological_clean(grey)
                return PILImage.fromarray(grey).convert("RGB")
        except Exception as exc:
            logger.debug("ID card PDF yellow-aware preprocessing failed: %s", exc)
    if not CV2_AVAILABLE:
        return img
    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _upscale_if_small(grey, min_width=1400)
        orig_clahe = _clahe(grey.copy())
        inv_clahe  = _clahe(cv2.bitwise_not(grey))
        chosen = inv_clahe if _contrast_score(inv_clahe) > _contrast_score(orig_clahe) * 1.10 else orig_clahe
        return PILImage.fromarray(chosen).convert("RGB")
    except Exception as exc:
        logger.debug("PDF page preprocessing failed: %s", exc)
        return img


def _high_dpi_variant(img) -> "object | None":
    if not CV2_AVAILABLE or PILImage is None:
        return None
    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _border_remove(grey)
        grey = _invert_if_dark(grey)
        grey = _upscale_if_small(grey, min_width=2400)
        grey = _deskew(grey)
        grey = _gamma_correction(grey, gamma=1.3)
        grey = _denoise(grey)
        grey = _clahe(grey)
        grey = _sharpen(grey)
        grey = _binarise_adaptive(grey)
        grey = _morphological_clean(grey)
        return _cv2_to_pil(grey)
    except Exception as exc:
        logger.debug("High-DPI variant failed: %s", exc)
        return None


def _colour_variant(img) -> "object | None":
    if PILImage is None:
        return None
    try:
        pil = img.copy()
        pil = ImageEnhance.Sharpness(pil).enhance(2.0)
        pil = ImageEnhance.Contrast(pil).enhance(1.5)
        return pil
    except Exception:
        return None


def _build_blurry_recovery_variants(img) -> list:
    variants: list = []
    if PILImage is None:
        return variants
    if not CV2_AVAILABLE:
        try:
            pil = img.convert("L")
            pil = ImageOps.autocontrast(pil, cutoff=1)
            pil = pil.filter(ImageFilter.UnsharpMask(radius=3, percent=250, threshold=2))
            pil = pil.filter(ImageFilter.SHARPEN)
            pil = ImageEnhance.Contrast(pil).enhance(2.5)
            variants.append(pil)
        except Exception:
            pass
        return variants
    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _invert_if_dark(grey)
        for min_w, gamma, sharpen_fn, binarise_fn, clahe_kw in [
            (2000, None, _sharpen_strong, _binarise_adaptive, {"clip": 3.0, "tile": 16}),
            (2800, 1.6,  _sharpen_strong, _binarise_otsu,     {"clip": 4.0, "tile": 4}),
            (1800, None, _sharpen_strong, _binarise_adaptive, {"clip": 2.5, "tile": 8}),
            (1600, None, _sharpen_strong, _binarise_adaptive, {"clip": 3.0, "tile": 8}),
        ]:
            try:
                g = _upscale_if_small(grey.copy(), min_width=min_w)
                if gamma:
                    g = _gamma_correction(g, gamma=gamma)
                g = sharpen_fn(g)
                g = _clahe(g, **clahe_kw)
                g = binarise_fn(g)
                g = _morphological_clean(g)
                variants.append(_cv2_to_pil(g))
            except Exception:
                pass
        try:
            pil = img.convert("L")
            pil = ImageOps.autocontrast(pil, cutoff=1)
            pil = pil.filter(ImageFilter.UnsharpMask(radius=3, percent=250, threshold=2))
            pil = pil.filter(ImageFilter.SHARPEN)
            pil = ImageEnhance.Contrast(pil).enhance(2.5)
            variants.append(pil)
        except Exception:
            pass
    except Exception as exc:
        logger.debug("Blurry recovery block failed: %s", exc)
    return variants


def _build_preprocessing_variants(img, fast_mode: bool = False) -> list:
    variants: list = []
    try:
        pil_grey = img.convert("L")
        pil_grey = ImageOps.autocontrast(pil_grey, cutoff=2)
        pil_grey = ImageEnhance.Sharpness(pil_grey).enhance(2.5)
        pil_grey = ImageEnhance.Contrast(pil_grey).enhance(1.8)
        variants.append(pil_grey)
    except Exception:
        pass
    if fast_mode:
        if CV2_AVAILABLE:
            try:
                bgr  = _pil_to_cv2(img)
                grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                g    = _border_remove(grey)
                g    = _invert_if_dark(g)
                g    = _upscale_if_small(g)
                g    = _deskew(g)
                g    = _gamma_correction(g, gamma=1.4)
                g    = _denoise(g)
                g    = _clahe(g)
                g    = _binarise_adaptive(g)
                g    = _morphological_clean(g)
                variants.insert(0, _cv2_to_pil(g))
            except Exception:
                pass
        return variants or [img]
    if not CV2_AVAILABLE:
        return variants
    try:
        bgr     = _pil_to_cv2(img)
        grey    = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey    = _border_remove(grey)
        is_dark = _detect_dark_background(grey)
        for recipe in [
            lambda g: _morphological_clean(_binarise_adaptive(_clahe(
                _denoise(_gamma_correction(_deskew(_upscale_if_small(
                    cv2.bitwise_not(g) if is_dark else g
                )), gamma=1.4))))),
            lambda g: _morphological_clean(_binarise_otsu(_clahe(
                _denoise(_deskew(_upscale_if_small(
                    cv2.bitwise_not(g) if is_dark else g
                )))))),
        ]:
            try:
                variants.insert(0, _cv2_to_pil(recipe(grey.copy())))
            except Exception:
                pass
        hd = _high_dpi_variant(img)
        if hd:
            variants.append(hd)
        col = _colour_variant(img)
        if col:
            variants.append(col)
        try:
            g_f = _upscale_if_small(grey.copy())
            g_f = cv2.equalizeHist(g_f)
            g_f = _gamma_correction(g_f, gamma=1.6)
            g_f = _denoise(g_f)
            g_f = _binarise_adaptive(g_f)
            g_f = _morphological_clean(g_f)
            variants.append(_cv2_to_pil(g_f))
        except Exception:
            pass
        if is_dark:
            try:
                g_g = cv2.bitwise_not(grey.copy())
                g_g = _upscale_if_small(g_g)
                g_g = _deskew(g_g)
                g_g = _gamma_correction(g_g, gamma=1.2)
                g_g = _denoise(g_g)
                g_g = _clahe(g_g)
                g_g = _binarise_adaptive(g_g)
                g_g = _morphological_clean(g_g)
                variants.insert(0, _cv2_to_pil(g_g))
            except Exception:
                pass
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
        is_dark = _detect_dark_background(grey)
        for recipe in [
            lambda g: _morphological_clean(_binarise_adaptive(_denoise(cv2.equalizeHist(_upscale_if_small(g))))),
            lambda g: _binarise_otsu(_denoise(_sharpen(_upscale_if_small(g)))),
            lambda g: _binarise_adaptive(_clahe(_sharpen(_gamma_correction(
                cv2.GaussianBlur(_upscale_if_small(g, 1800), (3, 3), 0), 1.5)))),
        ]:
            try:
                variants.append(_cv2_to_pil(recipe(grey.copy())))
            except Exception:
                pass
        hd = _high_dpi_variant(img)
        if hd:
            variants.append(hd)
        if is_dark:
            try:
                g = cv2.bitwise_not(grey.copy())
                g = _upscale_if_small(g, min_width=1800)
                g = _gamma_correction(g, gamma=1.3)
                g = _clahe(g)
                g = _binarise_adaptive(g)
                g = _morphological_clean(g)
                variants.insert(0, _cv2_to_pil(g))
            except Exception:
                pass
    except Exception as exc:
        logger.debug("Last-resort preprocessing block failed: %s", exc)
    return variants


_PSM_MODES_FULL   = (6, 11, 3, 4, 7)
_PSM_MODES_FAST   = (6, 11)
_EARLY_EXIT_CHARS = 400


def _count_alpha(text: str) -> int:
    return sum(1 for c in text if c.isalpha())


def _ocr_one_image(img, lang: str | None = None, fast_mode: bool = False) -> str:
    ocr_lang  = lang or _OCR_LANG
    psm_modes = _PSM_MODES_FAST if fast_mode else _PSM_MODES_FULL
    best      = ""
    for psm in psm_modes:
        try:
            result = pytesseract.image_to_string(
                img, lang=ocr_lang, config=f"--psm {psm} --oem 3"
            ).strip()
            usable = len(result.replace(" ", "").replace("\n", ""))
            if usable > len(best.replace(" ", "").replace("\n", "")):
                best = result
                if usable >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("PSM %d failed: %s", psm, exc)
    return best


def _ocr_best_strategy(img, fast_mode: bool = False) -> str:
    is_blurry  = False
    if CV2_AVAILABLE and not fast_mode:
        try:
            bgr  = _pil_to_cv2(img)
            grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            is_blurry = _compute_blur_score(grey) < _BLUR_THRESHOLD_WARN
        except Exception:
            pass

    if is_blurry:
        best_recovery = ""
        best_usable   = 0
        for variant in _build_blurry_recovery_variants(img):
            text   = _ocr_one_image(variant, fast_mode=False)
            usable = len(text.replace(" ", "").replace("\n", ""))
            if usable > best_usable:
                best_recovery = text
                best_usable   = usable
                if usable >= _EARLY_EXIT_CHARS:
                    return best_recovery
        if best_usable >= 20:
            return best_recovery

    best        = ""
    best_usable = 0
    for variant in _build_preprocessing_variants(img, fast_mode=fast_mode):
        text   = _ocr_one_image(variant, fast_mode=fast_mode)
        usable = len(text.replace(" ", "").replace("\n", ""))
        if usable > best_usable:
            best        = text
            best_usable = usable
            if usable >= _EARLY_EXIT_CHARS:
                return best

    if not fast_mode and best_usable < 50:
        for variant in _build_last_resort_variants(img):
            text   = _ocr_one_image(variant, fast_mode=False)
            usable = len(text.replace(" ", "").replace("\n", ""))
            if usable > best_usable:
                best        = text
                best_usable = usable
                if usable >= _EARLY_EXIT_CHARS:
                    break
    return best


def _ocr_with_rotation(img, fast_mode: bool = False) -> str:
    best   = ""
    angles = [0] if fast_mode else [0, 90, 180, 270]
    for angle in angles:
        try:
            rotated = img.rotate(angle, expand=True) if angle != 0 else img
            text    = _ocr_best_strategy(rotated, fast_mode=fast_mode)
            usable  = len(text.replace(" ", "").replace("\n", ""))
            if usable > len(best.replace(" ", "").replace("\n", "")):
                best = text
                if usable >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("Rotation %d° failed: %s", angle, exc)
    return best


# ─────────────────────────────────────────────────────────────────────────────
# OCR microservice helper — silent fallthrough
# ─────────────────────────────────────────────────────────────────────────────

def _extract_via_service(file_path: str, fast_mode: bool = False) -> str:
    """
    FIX-UTIL-LOG-3: All service communication is at DEBUG level.
    422 quality rejections fall through to local OCR silently.
    Nothing here ever prints to the console or emits WARNING/INFO logs.
    """
    if not _REQUESTS_AVAILABLE:
        return ""
    try:
        import requests
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        ext   = os.path.splitext(file_path)[1].lower().lstrip(".")
        mime  = "application/pdf" if ext == "pdf" else f"image/{ext}"
        files = {"file": (os.path.basename(file_path), file_bytes, mime)}
        params = {"fast": "true"} if fast_mode else {}
        r = requests.post(f"{OCR_SERVICE_URL}/ocr", files=files, params=params, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if data.get("success"):
                text = data.get("text", "")
                if text.strip():
                    logger.debug("_extract_via_service: %s → %d chars",
                                 os.path.basename(file_path), len(text))
                    return text
        elif r.status_code == 422:
            logger.debug("_extract_via_service: 422 for %s — falling through to local OCR",
                         os.path.basename(file_path))
        else:
            logger.debug("_extract_via_service: status %d for %s",
                         r.status_code, os.path.basename(file_path))
        return ""
    except Exception as exc:
        logger.debug("_extract_via_service error for %s: %s", file_path, exc)
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# PDF helpers
# ─────────────────────────────────────────────────────────────────────────────

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
        return combined if _count_alpha(combined) >= _PDF_TEXT_MIN_ALPHA else ""
    except Exception as exc:
        logger.debug("pdfplumber error for %s: %s", file_path, exc)
        return ""


def _pymupdf_ocr(file_path: str, fast_mode: bool = False, is_id_card: bool = False) -> str:
    if not PYMUPDF_AVAILABLE or not OCR_AVAILABLE:
        return ""
    try:
        scale = 1.5 if fast_mode else 3.0
        doc   = fitz.open(file_path)
        parts: list[str] = []
        for page_num, page in enumerate(doc):
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = PILImage.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img = _preprocess_pdf_page_image(img, is_id_card=is_id_card)
            if is_id_card and CV2_AVAILABLE:
                id_variants = _build_id_card_variants(img)
                if id_variants:
                    best_alpha, best_text = 0, ""
                    for v in id_variants:
                        t = _ocr_one_image(v, fast_mode=fast_mode)
                        a = _count_alpha(t)
                        if a > best_alpha:
                            best_text, best_alpha = t, a
                            if a >= _EARLY_EXIT_CHARS:
                                break
                    if best_alpha >= 1:
                        parts.append(best_text)
                        continue
            text = _ocr_best_strategy(img, fast_mode=fast_mode)
            if not fast_mode and len(text.replace(" ", "").replace("\n", "")) < 80:
                mat2 = fitz.Matrix(2.5, 2.5)
                pix2 = page.get_pixmap(matrix=mat2, colorspace=fitz.csRGB)
                img2 = PILImage.frombytes("RGB", (pix2.width, pix2.height), pix2.samples)
                img2 = _preprocess_pdf_page_image(img2, is_id_card=is_id_card)
                text2 = _ocr_best_strategy(img2, fast_mode=False)
                if len(text2.replace(" ", "")) > len(text.replace(" ", "")):
                    text = text2
            if not fast_mode and len(text.replace(" ", "").replace("\n", "")) < 50:
                rotated = _ocr_with_rotation(img, fast_mode=False)
                if len(rotated.replace(" ", "")) > len(text.replace(" ", "")):
                    text = rotated
            parts.append(text)
        doc.close()
        return "\n\n".join(parts).strip()
    except Exception as exc:
        logger.warning("PyMuPDF OCR error for %s: %s", file_path, exc)
        return ""


def _pdf2image_ocr(file_path: str, fast_mode: bool = False, is_id_card: bool = False) -> str:
    if not PDF2IMAGE_AVAILABLE or not OCR_AVAILABLE:
        return ""
    try:
        dpi = 200 if fast_mode else 300
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        kwargs: dict = {"dpi": dpi}
        if _POPPLER_WIN_PATH:
            kwargs["poppler_path"] = _POPPLER_WIN_PATH
        pages = _pdf2image_convert(file_bytes, **kwargs)
        parts: list[str] = []
        for page in pages:
            page = _preprocess_pdf_page_image(page, is_id_card=is_id_card)
            if is_id_card and CV2_AVAILABLE:
                id_variants = _build_id_card_variants(page)
                if id_variants:
                    best_alpha, best_text = 0, ""
                    for v in id_variants:
                        t = _ocr_one_image(v, fast_mode=fast_mode)
                        a = _count_alpha(t)
                        if a > best_alpha:
                            best_text, best_alpha = t, a
                            if a >= _EARLY_EXIT_CHARS:
                                break
                    if best_alpha >= 1:
                        parts.append(best_text)
                        continue
            parts.append(_ocr_best_strategy(page, fast_mode=fast_mode))
        return "\n\n".join(parts).strip()
    except Exception as exc:
        logger.warning("pdf2image OCR error for %s: %s", file_path, exc)
        return ""


def _image_ocr(file_path: str, fast_mode: bool = False) -> str:
    if not OCR_AVAILABLE:
        return ""
    try:
        img = PILImage.open(file_path).convert("RGB")
        if CV2_AVAILABLE:
            id_variants = _build_id_card_variants(img)
            if id_variants:
                best_alpha, best_id = 0, ""
                for v in id_variants:
                    t = _ocr_one_image(v, fast_mode=fast_mode)
                    a = _count_alpha(t)
                    if a > best_alpha:
                        best_id, best_alpha = t, a
                        if a >= _EARLY_EXIT_CHARS:
                            break
                if best_alpha >= 1:
                    _cache_set(file_path, best_id)
                    return best_id
            try:
                bgr  = _pil_to_cv2(img)
                grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                if _detect_dark_background(grey):
                    inv_pil  = PILImage.fromarray(cv2.bitwise_not(grey)).convert("RGB")
                    inv_text = _ocr_best_strategy(inv_pil, fast_mode=fast_mode)
                    if _count_alpha(inv_text) >= _MIN_ALPHA_CHARS:
                        _cache_set(file_path, inv_text)
                        return inv_text
            except Exception as exc:
                logger.debug("Dark/blur pre-check failed for %s: %s", file_path, exc)

        result = _ocr_best_strategy(img, fast_mode=fast_mode)
        if not fast_mode and len(result.replace(" ", "").replace("\n", "")) < 50:
            rotated = _ocr_with_rotation(img, fast_mode=False)
            if len(rotated.replace(" ", "")) > len(result.replace(" ", "")):
                result = rotated

        if _count_alpha(result) < _MIN_ALPHA_CHARS:
            logger.debug("Image %s: only %d alpha chars — treating as unreadable",
                         os.path.basename(file_path), _count_alpha(result))
            return ""
        return result
    except Exception as exc:
        logger.debug("pytesseract image error for %s: %s", file_path, exc)
        return ""


def _filename_suggests_id_card(file_path: str) -> bool:
    stem = os.path.splitext(os.path.basename(file_path).lower())[0]
    for pattern in ("id", "nid", "passport", "pasiporo", "indangamuntu", "national", "identity"):
        if pattern in stem:
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def extract_document_text(
    file_path: str,
    fast_mode: bool = False,
    declared_type: str = "",
) -> str:
    """
    Extract text from a document. Never raises. Always returns str.
    FIX-UTIL-LOG-4: No WARNING/INFO logs emitted for normal service-unavailable
    fallthrough. The microservice being down is handled silently at DEBUG level.
    """
    if not _ocr_enabled():
        return ""
    if not file_path or not os.path.exists(file_path):
        return ""

    cached = _cache_get(file_path)
    if cached is not None:
        return cached

    ext          = os.path.splitext(file_path)[1].lower()
    is_id_card   = declared_type == "id_card" or _filename_suggests_id_card(file_path)

    try:
        # Step 1: OCR microservice (silent fallthrough when unavailable/empty)
        if _REQUESTS_AVAILABLE and _check_ocr_service_live():
            service_text = _extract_via_service(file_path, fast_mode=fast_mode)
            if service_text.strip():
                _cache_set(file_path, service_text)
                return service_text
            # Service returned empty — fall through silently (no log noise)

        # Step 2: PDF local chain
        if ext == ".pdf":
            text = _pdfplumber_text(file_path)
            if text.strip():
                _cache_set(file_path, text)
                return text
            text = _pymupdf_ocr(file_path, fast_mode=fast_mode, is_id_card=is_id_card)
            if text.strip():
                _cache_set(file_path, text)
                return text
            text = _pdf2image_ocr(file_path, fast_mode=fast_mode, is_id_card=is_id_card)
            _cache_set(file_path, text)
            return text

        # Step 3: Image local chain
        elif ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp", ".gif"):
            text = _image_ocr(file_path, fast_mode=fast_mode)
            if not text.strip() and OCR_AVAILABLE and PILImage is not None:
                try:
                    img          = PILImage.open(file_path).convert("RGB")
                    rotated_text = _ocr_with_rotation(img, fast_mode=False)
                    if _count_alpha(rotated_text) >= _MIN_ALPHA_CHARS:
                        text = rotated_text
                except Exception as exc:
                    logger.debug("Rotation recovery failed for %s: %s", file_path, exc)
            _cache_set(file_path, text)
            return text

        return ""

    except Exception as exc:
        logger.warning("extract_document_text error for %s: %s", file_path, exc)
        return ""


def extract_documents_batch(
    file_paths: list[str],
    fast_mode:  bool = False,
) -> dict[str, str]:
    """Extract text from multiple files in parallel. Returns {file_path: text}."""
    if not file_paths:
        return {}
    if not _ocr_enabled():
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
        future_to_path = {
            pool.submit(extract_document_text, fp, fast_mode): fp
            for fp in uncached
        }
        for fut in concurrent.futures.as_completed(future_to_path):
            fp = future_to_path[fut]
            try:
                results[fp] = fut.result()
            except Exception as exc:
                logger.warning("Parallel OCR failed for %s: %s", fp, exc)
                results[fp] = ""
    return results