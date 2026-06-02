import os
import io
import re
import traceback
import logging

import numpy as np
from flask import Flask, request, jsonify
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import pytesseract

logger = logging.getLogger(__name__)


def _ocr_enabled() -> bool:
    return os.getenv("ENABLE_OCR", "true").strip().lower() == "true"


_WIN_TESSERACT = r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
if os.path.exists(_WIN_TESSERACT):
    pytesseract.pytesseract.tesseract_cmd = _WIN_TESSERACT

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_POPPLER_WIN_PATH: "str | None" = None

for _candidate in [
    os.path.join(_SCRIPT_DIR, "poppler-25.12.0", "Library", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler-25.12.0", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler", "Library", "bin"),
    os.path.join(_SCRIPT_DIR, "poppler", "bin"),
]:
    if os.path.isdir(_candidate):
        _POPPLER_WIN_PATH = _candidate
        break

if _POPPLER_WIN_PATH:
    print(f"[OCR] ✅ Found bundled poppler at: {_POPPLER_WIN_PATH}")
else:
    print("[OCR] ℹ️  Bundled poppler not found — will rely on PATH or PyMuPDF fallback.")

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[WARN] opencv-python not installed — advanced preprocessing disabled.")

EASYOCR_AVAILABLE = False
_easyocr_reader   = None

if os.getenv("ENABLE_EASYOCR", "false").strip().lower() == "true":
    try:
        import easyocr as _easyocr_mod
        _easyocr_reader   = _easyocr_mod.Reader(["en"], gpu=False)
        EASYOCR_AVAILABLE = True
        print("[OCR] ✅ EasyOCR fallback enabled.")
    except Exception as _e:
        print(f"[OCR] ⚠ EasyOCR requested but failed to load: {_e}")


def _easyocr_fallback(pil_image: Image.Image) -> str:
    if not EASYOCR_AVAILABLE or _easyocr_reader is None:
        return ""
    try:
        import numpy as _np
        arr     = _np.array(pil_image.convert("RGB"))
        results = _easyocr_reader.readtext(arr)
        return " ".join(r[1] for r in results if r[2] > 0.2)
    except Exception as exc:
        logger.debug("EasyOCR fallback failed: %s", exc)
        return ""


try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

try:
    import fitz
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

PDF_SUPPORT = PDF2IMAGE_AVAILABLE or PYMUPDF_AVAILABLE or PDFPLUMBER_AVAILABLE


def _resolve_ocr_language() -> str:
    try:
        available = pytesseract.get_languages()
        langs = ["eng"]
        if "fra" in available:
            langs.append("fra")
        if "kin" in available:
            langs.append("kin")
        result = "+".join(langs)
        logger.info("✓ OCR language string: %s", result)
        return result
    except Exception:
        return "eng"


try:
    OCR_LANG = _resolve_ocr_language()
except Exception:
    OCR_LANG = "eng"

app = Flask(__name__)

MAX_FILE_SIZE_MB   = 20
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "pdf"}

_PSM_MODES_FULL = (6, 11, 3, 4, 7)
_PSM_MODES_FAST = (6, 11)
_EARLY_EXIT_CHARS = 400

_PDF_TEXT_MIN_CHARS = 40

_BLUR_THRESHOLD_HARD     = 40
_BLUR_THRESHOLD_HARD_PDF = 20
_BLUR_THRESHOLD_WARN     = 80
_MIN_RESOLUTION          = 150

_MIN_ALPHA_CHARS         = 30
_MIN_ALPHA_CHARS_PDF     = 40

_BRIGHTNESS_TOO_DARK    = 40
_BRIGHTNESS_TOO_BRIGHT  = 230


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _is_pdf_bytes(file_bytes: bytes) -> bool:
    return file_bytes[:4] == b"%PDF"


def _compute_blur_score(grey: np.ndarray) -> float:
    try:
        return float(cv2.Laplacian(grey, cv2.CV_64F).var())
    except Exception:
        return 999.0


def _count_readable_chars_ocr(text: str) -> int:
    return sum(1 for c in text if c.isalpha())


# ─────────────────────────────────────────────────────────────────────────────
# Yellow/gold background detection (Rwanda ID hologram)
# ─────────────────────────────────────────────────────────────────────────────

def _detect_yellow_background(bgr: np.ndarray) -> bool:
    if not CV2_AVAILABLE:
        return False
    try:
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h_channel = hsv[:, :, 0]
        s_channel = hsv[:, :, 1]
        yellow_mask = (h_channel >= 15) & (h_channel <= 35) & (s_channel > 80)
        yellow_ratio = float(np.sum(yellow_mask)) / yellow_mask.size
        return yellow_ratio > 0.15
    except Exception:
        return False


def _yellow_aware_grayscale(bgr: np.ndarray) -> np.ndarray:
    try:
        b = bgr[:, :, 0].astype(np.float32)
        g = bgr[:, :, 1].astype(np.float32)
        r = bgr[:, :, 2].astype(np.float32)
        grey = np.clip(r * 0.15 + g * 0.35 + b * 0.85, 0, 255).astype(np.uint8)
        return grey
    except Exception:
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


# ─────────────────────────────────────────────────────────────────────────────
# Strict quality assessment
# ─────────────────────────────────────────────────────────────────────────────

def _assess_image_quality(image_bytes: bytes, is_pdf_page: bool = False) -> dict:
    """
    FIX-SVC-50: Added yellow-background detection before the 'too bright'
    brightness gate. Rwanda ID cards have a holographic gold/yellow laminate
    that pushes mean brightness above the 230 threshold on correctly-exposed
    photos, causing valid IDs to be hard-rejected before OCR even runs.
    """
    blur_hard = _BLUR_THRESHOLD_HARD_PDF if is_pdf_page else _BLUR_THRESHOLD_HARD

    result = {
        "blur_score":         999.0,
        "is_blurry":          False,
        "is_dark":            False,
        "is_washed_out":      False,
        "width":              0,
        "height":             0,
        "mean_brightness":    128.0,
        "warnings":           [],
        "hard_reject":        False,
        "hard_reject_reason": "",
    }
    if not CV2_AVAILABLE:
        return result
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        bgr   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if bgr is None:
            result["hard_reject"] = True
            result["hard_reject_reason"] = (
                "The uploaded file could not be read as an image. "
                "Please upload a valid JPG, PNG, or PDF document."
            )
            return result

        h, w  = bgr.shape[:2]
        grey  = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        result["width"]  = w
        result["height"] = h

        blur             = _compute_blur_score(grey)
        mean_brightness  = float(np.mean(grey))
        result["blur_score"]       = round(blur, 2)
        result["mean_brightness"]  = round(mean_brightness, 1)
        result["is_blurry"]        = blur < _BLUR_THRESHOLD_WARN
        result["is_dark"]          = mean_brightness < 127
        result["is_washed_out"]    = mean_brightness > _BRIGHTNESS_TOO_BRIGHT

        if mean_brightness < _BRIGHTNESS_TOO_DARK:
            result["hard_reject"] = True
            result["hard_reject_reason"] = (
                f"The document image is too dark (brightness: {mean_brightness:.0f}/255). "
                "Please retake the photo with better lighting — ensure the document "
                "is well-lit and there are no shadows covering the text."
            )
            return result

        # FIX-SVC-50: Detect Rwanda ID yellow/gold holographic background.
        # These cards legitimately produce high mean brightness (often 210-245)
        # due to the gold laminate. Skipping the hard-reject gate for them
        # allows the OCR pipeline to proceed and extract name/ID keywords.
        has_yellow_bg = _detect_yellow_background(bgr)
        if mean_brightness > _BRIGHTNESS_TOO_BRIGHT and not has_yellow_bg:
            result["hard_reject"] = True
            result["hard_reject_reason"] = (
                f"The document image appears blank or overexposed "
                f"(brightness: {mean_brightness:.0f}/255). "
                "Please check that you selected the correct file and that the document "
                "is fully visible. Avoid photographing against bright light sources."
            )
            return result

        if blur < blur_hard:
            result["hard_reject"] = True
            result["hard_reject_reason"] = (
                f"The document image is too blurry (sharpness score: {blur:.0f}). "
                "Please retake the photo:\n"
                "• Hold the camera steady and tap the screen to focus on the document\n"
                "• Ensure the entire document is flat and within the frame\n"
                "• Use good lighting and avoid glare or shadows\n"
                "• Hold the camera directly above the document, not at an angle"
            )
            return result

        if w < _MIN_RESOLUTION or h < _MIN_RESOLUTION:
            result["hard_reject"] = True
            result["hard_reject_reason"] = (
                f"The document image resolution is too low ({w}×{h} pixels). "
                f"Minimum required: {_MIN_RESOLUTION}×{_MIN_RESOLUTION} px. "
                "Please upload a higher-resolution photo or scan (at least 300 DPI recommended)."
            )
            return result

        if blur < _BLUR_THRESHOLD_WARN:
            result["warnings"].append(
                f"Image sharpness is borderline (score: {blur:.0f}). "
                "OCR results may be less accurate — a clearer scan is recommended."
            )
        if result["is_dark"] and mean_brightness >= _BRIGHTNESS_TOO_DARK:
            result["warnings"].append(
                "Document appears to have a dark background. "
                "Auto-inversion will be applied."
            )
        if has_yellow_bg and mean_brightness > _BRIGHTNESS_TOO_BRIGHT:
            result["warnings"].append(
                "Rwanda ID holographic background detected — applying specialised preprocessing."
            )

    except Exception as exc:
        logger.debug("Quality assessment failed: %s", exc)
    return result


def _pil_to_cv2(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _cv2_to_pil(arr: np.ndarray) -> Image.Image:
    if len(arr.shape) == 2:
        return Image.fromarray(arr)
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


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
        return cv2.warpAffine(grey, M, (w, h),
                              flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    except Exception:
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
        _, binary = cv2.threshold(grey, 0, 255,
                                  cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
    except Exception:
        return grey


def _binarise_adaptive(grey: np.ndarray, block_size: int = 31) -> np.ndarray:
    try:
        return cv2.adaptiveThreshold(grey, 255,
                                     cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, block_size, 10)
    except Exception:
        return grey


def _morph_clean(binary: np.ndarray) -> np.ndarray:
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
        table = np.array([
            (i / 255.0) ** inv_gamma * 255
            for i in range(256)
        ], dtype=np.uint8)
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


def _image_quality_score(grey: np.ndarray) -> int:
    try:
        contrast  = min(float(np.std(grey)) / 128.0 * 50, 50)
        lap_var   = cv2.Laplacian(grey, cv2.CV_64F).var()
        sharpness = min(float(lap_var) / 500.0 * 30, 30)
        _, binary = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text_density = float(np.sum(binary == 0)) / binary.size
        density_score = min(max(text_density * 500, 0), 20)
        return int(contrast + sharpness + density_score)
    except Exception:
        return 50


def _detect_dark_background(grey: np.ndarray) -> bool:
    try:
        return bool(float(np.mean(grey)) < 127)
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


# ─────────────────────────────────────────────────────────────────────────────
# Rwanda ID card specific preprocessing (FIX-SVC-31/34)
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_id_card_image(img: Image.Image) -> "list[Image.Image]":
    if not CV2_AVAILABLE:
        return []

    variants: list[Image.Image] = []

    try:
        bgr = _pil_to_cv2(img)
        is_yellow = _detect_yellow_background(bgr)

        if is_yellow:
            logger.debug("_preprocess_id_card_image: yellow background detected")
            try:
                grey = _yellow_aware_grayscale(bgr)
                grey = _upscale_if_small(grey, min_width=1600)
                grey = _deskew(grey)
                grey = _clahe(grey, clip=5.0, tile=6)
                grey = _sharpen(grey)
                grey = _binarise_adaptive(grey, block_size=21)
                grey = _morph_clean(grey)
                variants.append(Image.fromarray(grey).convert("RGB"))
            except Exception as exc:
                logger.debug("Yellow-suppress variant failed: %s", exc)

            try:
                grey2 = _yellow_aware_grayscale(bgr)
                grey2 = _upscale_if_small(grey2, min_width=2000)
                grey2 = _gamma_correction(grey2, gamma=1.4)
                grey2 = _clahe(grey2, clip=6.0, tile=4)
                grey2 = _denoise(grey2)
                grey2 = _binarise_otsu(grey2)
                grey2 = _morph_clean(grey2)
                variants.append(Image.fromarray(grey2).convert("RGB"))
            except Exception as exc:
                logger.debug("Yellow-suppress variant 2 failed: %s", exc)

        try:
            grey_std = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            grey_std = _upscale_if_small(grey_std, min_width=1600)
            grey_std = _deskew(grey_std)
            grey_std = _clahe(grey_std, clip=4.0, tile=6)
            grey_std = _sharpen(grey_std)
            grey_std = _binarise_adaptive(grey_std, block_size=21)
            grey_std = _morph_clean(grey_std)
            variants.append(Image.fromarray(grey_std).convert("RGB"))
        except Exception as exc:
            logger.debug("Standard ID variant failed: %s", exc)

        try:
            grey_inv = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            grey_inv = cv2.bitwise_not(grey_inv)
            grey_inv = _upscale_if_small(grey_inv, min_width=1600)
            grey_inv = _clahe(grey_inv, clip=4.0, tile=6)
            grey_inv = _binarise_adaptive(grey_inv, block_size=21)
            grey_inv = _morph_clean(grey_inv)
            variants.append(Image.fromarray(grey_inv).convert("RGB"))
        except Exception as exc:
            logger.debug("Inverted ID variant failed: %s", exc)

    except Exception as exc:
        logger.debug("_preprocess_id_card_image outer failed: %s", exc)

    return variants


# ─────────────────────────────────────────────────────────────────────────────
# Multi-scale OCR (FIX-SVC-32)
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_multi_scale(img: Image.Image, fast_mode: bool = False) -> str:
    scales = [1.0, 1.5, 2.0] if not fast_mode else [1.0, 1.5]
    best = ""
    for scale in scales:
        try:
            if scale != 1.0:
                w, h = img.size
                scaled = img.resize(
                    (int(w * scale), int(h * scale)),
                    Image.LANCZOS
                )
            else:
                scaled = img
            text = _ocr_one(scaled, fast_mode=fast_mode)
            alpha = _count_readable_chars_ocr(text)
            if alpha > _count_readable_chars_ocr(best):
                best = text
                if alpha >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("_ocr_multi_scale scale=%.1f failed: %s", scale, exc)
    return best


def _preprocess_pdf_page_image(img: Image.Image) -> Image.Image:
    if not CV2_AVAILABLE:
        return img
    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _upscale_if_small(grey, min_width=1400)

        mean_brightness = float(np.mean(grey))
        if mean_brightness < 30:
            grey = cv2.bitwise_not(grey)
            grey = _clahe(grey, clip=4.0, tile=4)
            grey = _gamma_correction(grey, gamma=1.5)
            grey = _denoise(grey)
            grey = _binarise_adaptive(grey)
            grey = _morph_clean(grey)
            return Image.fromarray(grey).convert("RGB")

        orig_clahe = _clahe(grey.copy())
        orig_score = _contrast_score(orig_clahe)
        inv        = cv2.bitwise_not(grey)
        inv_clahe  = _clahe(inv)
        inv_score  = _contrast_score(inv_clahe)

        if inv_score > orig_score * 1.10:
            chosen = inv_clahe
        else:
            chosen = orig_clahe

        base_quality = _image_quality_score(chosen)
        if base_quality < 35:
            try:
                aggressive = grey.copy()
                aggressive = _upscale_if_small(aggressive, min_width=1800)
                aggressive = _invert_if_dark(aggressive)
                aggressive = _gamma_correction(aggressive, gamma=1.6)
                aggressive = _clahe(aggressive, clip=4.0, tile=4)
                aggressive = _binarise_otsu(aggressive)
                aggressive = _morph_clean(aggressive)
                agg_quality = _image_quality_score(aggressive)
                if agg_quality > base_quality:
                    return Image.fromarray(aggressive).convert("RGB")
            except Exception as exc:
                logger.debug("Aggressive PDF path failed: %s", exc)

        return Image.fromarray(chosen).convert("RGB")
    except Exception as exc:
        logger.debug("PDF page preprocessing failed: %s", exc)
        return img


def _high_dpi_variant(img: Image.Image) -> "Image.Image | None":
    if not CV2_AVAILABLE:
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
        grey = _morph_clean(grey)
        return _cv2_to_pil(grey)
    except Exception as exc:
        logger.debug("High-DPI variant failed: %s", exc)
        return None


def _colour_variant(img: Image.Image) -> "Image.Image | None":
    try:
        pil = img.copy()
        pil = ImageEnhance.Sharpness(pil).enhance(2.0)
        pil = ImageEnhance.Contrast(pil).enhance(1.5)
        return pil
    except Exception:
        return None


def _build_blurry_recovery_variants(img: Image.Image) -> "list[Image.Image]":
    variants: list[Image.Image] = []
    if not CV2_AVAILABLE:
        try:
            pil = img.convert("L")
            pil = ImageEnhance.Sharpness(pil).enhance(4.0)
            pil = ImageEnhance.Contrast(pil).enhance(2.0)
            variants.append(pil)
        except Exception:
            pass
        return variants

    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _invert_if_dark(grey)

        try:
            g = _upscale_if_small(grey.copy(), min_width=2000)
            g = _sharpen_strong(g)
            g = _clahe(g, clip=3.0, tile=16)
            g = _binarise_adaptive(g)
            g = _morph_clean(g)
            variants.append(_cv2_to_pil(g))
        except Exception:
            pass

        try:
            g = _upscale_if_small(grey.copy(), min_width=2800)
            g = _gamma_correction(g, gamma=1.6)
            g = _sharpen_strong(g)
            g = _sharpen(g)
            g = _clahe(g, clip=4.0, tile=4)
            g = _binarise_otsu(g)
            variants.append(_cv2_to_pil(g))
        except Exception:
            pass

        try:
            g = _upscale_if_small(grey.copy(), min_width=1800)
            g = cv2.equalizeHist(g)
            g = _sharpen_strong(g)
            g = _clahe(g, clip=2.5, tile=8)
            g = _binarise_adaptive(g)
            variants.append(_cv2_to_pil(g))
        except Exception:
            pass

        try:
            g = _upscale_if_small(grey.copy(), min_width=1600)
            g = cv2.bilateralFilter(g, d=9, sigmaColor=75, sigmaSpace=75)
            g = _sharpen_strong(g)
            g = _clahe(g, clip=3.0, tile=8)
            g = _binarise_adaptive(g)
            g = _morph_clean(g)
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


def _build_variants(img: Image.Image, fast_mode: bool = False) -> "list[Image.Image]":
    variants: list[Image.Image] = []

    try:
        pil = img.convert("L")
        pil = ImageOps.autocontrast(pil, cutoff=2)
        pil = ImageEnhance.Sharpness(pil).enhance(2.5)
        pil = ImageEnhance.Contrast(pil).enhance(1.8)
        variants.append(pil)
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
                g    = _morph_clean(g)
                variants.insert(0, _cv2_to_pil(g))
            except Exception:
                pass
        return variants or [img]

    if not CV2_AVAILABLE:
        return variants or [img]

    try:
        bgr  = _pil_to_cv2(img)
        grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        grey = _border_remove(grey)
        is_dark = _detect_dark_background(grey)

        try:
            g_b = grey.copy()
            if is_dark:
                g_b = cv2.bitwise_not(g_b)
            g_b = _upscale_if_small(g_b)
            g_b = _deskew(g_b)
            g_b = _gamma_correction(g_b, gamma=1.4)
            g_b = _denoise(g_b)
            g_b = _clahe(g_b)
            g_b = _binarise_adaptive(g_b)
            g_b = _morph_clean(g_b)
            variants.insert(0, _cv2_to_pil(g_b))
        except Exception:
            pass

        try:
            g_c = grey.copy()
            if is_dark:
                g_c = cv2.bitwise_not(g_c)
            g_c = _upscale_if_small(g_c)
            g_c = _deskew(g_c)
            g_c = _denoise(g_c)
            g_c = _clahe(g_c)
            g_c = _binarise_otsu(g_c)
            variants.append(_cv2_to_pil(g_c))
        except Exception:
            pass

        hd = _high_dpi_variant(img)
        if hd is not None:
            variants.append(hd)

        col = _colour_variant(img)
        if col is not None:
            variants.append(col)

        try:
            g_f = _upscale_if_small(grey.copy())
            g_f = cv2.equalizeHist(g_f)
            g_f = _gamma_correction(g_f, gamma=1.6)
            g_f = _denoise(g_f)
            g_f = _binarise_adaptive(g_f)
            g_f = _morph_clean(g_f)
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
                g_g = _morph_clean(g_g)
                variants.insert(0, _cv2_to_pil(g_g))
            except Exception:
                pass

    except Exception:
        pass

    return variants or [img]


def _ocr_one(img: Image.Image, fast_mode: bool = False) -> str:
    psm_modes = _PSM_MODES_FAST if fast_mode else _PSM_MODES_FULL
    best = ""
    for psm in psm_modes:
        try:
            result = pytesseract.image_to_string(
                img, lang=OCR_LANG, config=f"--psm {psm} --oem 3"
            ).strip()
            usable = len(result.replace(" ", "").replace("\n", ""))
            if usable > len(best.replace(" ", "").replace("\n", "")):
                best = result
                if usable >= _EARLY_EXIT_CHARS:
                    break
        except Exception as exc:
            logger.debug("PSM %d failed: %s", psm, exc)
    return best


def _ocr_with_rotation(img: Image.Image, fast_mode: bool = False) -> str:
    best   = ""
    angles = [0] if fast_mode else [0, 90, 180, 270]
    for angle in angles:
        try:
            rotated = img.rotate(angle, expand=True) if angle != 0 else img
            for variant in _build_variants(rotated, fast_mode=fast_mode):
                text   = _ocr_one(variant, fast_mode=fast_mode)
                usable = len(text.replace(" ", "").replace("\n", ""))
                if usable > len(best.replace(" ", "").replace("\n", "")):
                    best = text
                    if usable >= _EARLY_EXIT_CHARS:
                        return best
        except Exception as exc:
            logger.debug("Rotation %d° failed: %s", angle, exc)
    return best


def _adjust_quality_by_alpha(base_score: int, alpha_chars: int) -> int:
    if alpha_chars >= 300:
        return max(base_score, 75)
    elif alpha_chars >= 150:
        return max(base_score, 55)
    elif alpha_chars >= 60:
        return max(base_score, 40)
    elif alpha_chars < 30:
        return min(base_score, 25)
    return base_score


def ocr_image(image: Image.Image, fast_mode: bool = False) -> "tuple[str, int]":
    quality_score = 50
    blur_score    = 999.0
    is_blurry     = False

    if CV2_AVAILABLE:
        try:
            bgr  = _pil_to_cv2(image)
            grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            quality_score = _image_quality_score(grey)
            blur_score    = _compute_blur_score(grey)
            is_blurry     = blur_score < _BLUR_THRESHOLD_WARN

            id_variants = _preprocess_id_card_image(image)
            if id_variants:
                best_id = ""
                for variant in id_variants:
                    text = _ocr_multi_scale(variant, fast_mode=fast_mode)
                    if not text:
                        text = _ocr_one(variant, fast_mode=fast_mode)
                    alpha = _count_readable_chars_ocr(text)
                    if alpha > _count_readable_chars_ocr(best_id):
                        best_id = text
                        if alpha >= _EARLY_EXIT_CHARS:
                            break

                # FIX-SVC-51: For ID cards, accept any result with >= 10 alpha chars.
                # Rwanda laminated IDs legitimately yield very few characters due to
                # holographic glare. The verifier handles the advisory/sparse path;
                # we must not discard whatever little text was successfully extracted.
                # Old threshold was _MIN_ALPHA_CHARS (30) — too strict for Rwanda NIDs.
                _id_card_min_alpha = 10
                if _count_readable_chars_ocr(best_id) >= _id_card_min_alpha:
                    alpha = _count_readable_chars_ocr(best_id)
                    quality_score = _adjust_quality_by_alpha(quality_score, alpha)
                    return best_id, quality_score

            if _detect_dark_background(grey):
                inv_grey = cv2.bitwise_not(grey)
                inv_pil  = Image.fromarray(inv_grey).convert("RGB")
                inv_text = ""
                for variant in _build_variants(inv_pil, fast_mode=fast_mode):
                    t      = _ocr_one(variant, fast_mode=fast_mode)
                    usable = len(t.replace(" ", "").replace("\n", ""))
                    if usable > len(inv_text.replace(" ", "").replace("\n", "")):
                        inv_text = t
                        if usable >= _EARLY_EXIT_CHARS:
                            break
                if len(inv_text.replace(" ", "").replace("\n", "")) >= 30:
                    alpha = _count_readable_chars_ocr(inv_text)
                    quality_score = _adjust_quality_by_alpha(quality_score, alpha)
                    return inv_text, quality_score
        except Exception:
            pass

    if is_blurry and not fast_mode:
        recovery_variants = _build_blurry_recovery_variants(image)
        best_recovery     = ""
        for variant in recovery_variants:
            text   = _ocr_one(variant, fast_mode=False)
            usable = len(text.replace(" ", "").replace("\n", ""))
            if usable > len(best_recovery.replace(" ", "").replace("\n", "")):
                best_recovery = text
                if usable >= _EARLY_EXIT_CHARS:
                    alpha = _count_readable_chars_ocr(best_recovery)
                    quality_score = _adjust_quality_by_alpha(quality_score, alpha)
                    return best_recovery, quality_score
        if len(best_recovery.replace(" ", "").replace("\n", "")) >= 20:
            alpha = _count_readable_chars_ocr(best_recovery)
            quality_score = _adjust_quality_by_alpha(quality_score, alpha)
            return best_recovery, quality_score

    best = ""
    for variant in _build_variants(image, fast_mode=fast_mode):
        text   = _ocr_one(variant, fast_mode=fast_mode)
        usable = len(text.replace(" ", "").replace("\n", ""))
        if usable > len(best.replace(" ", "").replace("\n", "")):
            best = text
            if usable >= _EARLY_EXIT_CHARS and fast_mode:
                alpha = _count_readable_chars_ocr(best)
                quality_score = _adjust_quality_by_alpha(quality_score, alpha)
                return best, quality_score

    if not fast_mode and len(best.replace(" ", "").replace("\n", "")) < 50:
        rotated = _ocr_with_rotation(image, fast_mode=False)
        if len(rotated.replace(" ", "")) > len(best.replace(" ", "")):
            best = rotated

    if not fast_mode and _count_readable_chars_ocr(best) < 80:
        multi = _ocr_multi_scale(image, fast_mode=False)
        if _count_readable_chars_ocr(multi) > _count_readable_chars_ocr(best):
            best = multi

    if len(best.replace(" ", "").replace("\n", "")) < 20 and EASYOCR_AVAILABLE:
        easy_text = _easyocr_fallback(image)
        if len(easy_text.replace(" ", "")) > len(best.replace(" ", "")):
            best = easy_text

    alpha = _count_readable_chars_ocr(best)
    quality_score = _adjust_quality_by_alpha(quality_score, alpha)

    return best, quality_score


def _try_pdfplumber_text(file_bytes: bytes) -> str:
    if not PDFPLUMBER_AVAILABLE:
        return ""
    try:
        parts: list[str] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = ""
                txt = page.extract_text() or ""
                if txt.strip():
                    page_text = txt
                else:
                    try:
                        txt = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                        if txt.strip():
                            page_text = txt
                    except Exception:
                        pass
                try:
                    words = page.extract_words()
                    if words:
                        word_text = " ".join(w["text"] for w in words)
                        if len(word_text) > len(page_text):
                            page_text = word_text
                except Exception:
                    pass
                if page_text.strip():
                    parts.append(page_text)

        combined = "\n".join(parts).strip()
        alpha_chars = _count_readable_chars_ocr(combined)
        if alpha_chars >= _MIN_ALPHA_CHARS_PDF:
            return combined
        return combined if combined.strip() else ""
    except Exception as exc:
        logger.debug("pdfplumber failed: %s", exc)
        return ""


def _ocr_pdf_via_pdf2image(file_bytes: bytes, fast_mode: bool = False, dpi: int = 0) -> "list[tuple[str,int]] | None":
    if not PDF2IMAGE_AVAILABLE:
        return None
    if dpi == 0:
        dpi = 200 if fast_mode else 300
    try:
        kwargs: dict = {"dpi": dpi}
        if _POPPLER_WIN_PATH:
            kwargs["poppler_path"] = _POPPLER_WIN_PATH
        pages = convert_from_bytes(file_bytes, **kwargs)
        results = []
        for page in pages:
            page = _preprocess_pdf_page_image(page)
            text, quality = ocr_image(page, fast_mode=fast_mode)
            results.append((text, quality))
        return results
    except Exception as exc:
        logger.warning("pdf2image OCR failed (%s) — trying PyMuPDF fallback", exc)
        return None


def _ocr_pdf_via_pymupdf(file_bytes: bytes, fast_mode: bool = False, scale: float = 0.0) -> "list[tuple[str,int]] | None":
    if not PYMUPDF_AVAILABLE:
        return None
    try:
        if scale == 0.0:
            scale = 1.5 if fast_mode else 3.0
        doc   = fitz.open(stream=file_bytes, filetype="pdf")
        results = []
        for page in doc:
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            img = _preprocess_pdf_page_image(img)
            text, quality = ocr_image(img, fast_mode=fast_mode)
            results.append((text, quality))
        doc.close()
        return results
    except Exception as exc:
        logger.warning("PyMuPDF OCR failed: %s", exc)
        return None


def ocr_pdf(file_bytes: bytes, fast_mode: bool = False) -> "tuple[str, int]":
    plumber_text = _try_pdfplumber_text(file_bytes)
    plumber_alpha = _count_readable_chars_ocr(plumber_text) if plumber_text else 0

    _PLUMBER_CONFIDENT_THRESHOLD = _MIN_ALPHA_CHARS_PDF * 2  # 80
    if plumber_text.strip() and plumber_alpha >= _PLUMBER_CONFIDENT_THRESHOLD:
        return plumber_text, 90

    results = _ocr_pdf_via_pdf2image(file_bytes, fast_mode=fast_mode)
    if results is None:
        results = _ocr_pdf_via_pymupdf(file_bytes, fast_mode=fast_mode)

    if results is not None:
        img_text = "\n\n--- Page Break ---\n\n".join(t for t, _ in results)
        img_alpha = _count_readable_chars_ocr(img_text)

        if img_alpha < _MIN_ALPHA_CHARS_PDF and not fast_mode:
            retry_results = _ocr_pdf_via_pdf2image(file_bytes, fast_mode=False, dpi=400)
            if retry_results is None:
                retry_results = _ocr_pdf_via_pymupdf(file_bytes, fast_mode=False, scale=4.0)
            if retry_results is not None:
                retry_text  = "\n\n--- Page Break ---\n\n".join(t for t, _ in retry_results)
                retry_alpha = _count_readable_chars_ocr(retry_text)
                if retry_alpha > img_alpha:
                    results = retry_results

    if results is None:
        if plumber_text.strip():
            return plumber_text, 50
        return "[ERROR] PDF OCR not available — install pdf2image+poppler or pymupdf.", 0

    parts     = [text for text, _ in results]
    qualities = [q for _, q in results]
    avg_quality = int(sum(qualities) / len(qualities)) if qualities else 0
    combined = "\n\n--- Page Break ---\n\n".join(parts)

    if plumber_text.strip() and plumber_alpha > _count_readable_chars_ocr(combined):
        return plumber_text, max(avg_quality, 50)

    return combined, avg_quality


def _get_pdf_first_page_image(file_bytes: bytes) -> "Image.Image | None":
    if PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if len(doc) > 0:
                mat = fitz.Matrix(2.0, 2.0)
                pix = doc[0].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                doc.close()
                return img
        except Exception:
            pass
    if PDF2IMAGE_AVAILABLE:
        try:
            kwargs: dict = {"dpi": 200, "first_page": 1, "last_page": 1}
            if _POPPLER_WIN_PATH:
                kwargs["poppler_path"] = _POPPLER_WIN_PATH
            pages = convert_from_bytes(file_bytes, **kwargs)
            if pages:
                return pages[0]
        except Exception:
            pass
    return None


@app.route("/health", methods=["GET"])
def health():
    ocr_enabled = _ocr_enabled()
    if not ocr_enabled:
        return jsonify({
            "status":      "ok",
            "ocr_enabled": False,
            "notice":      "OCR is disabled via ENABLE_OCR=false.",
        })
    try:
        version = pytesseract.get_tesseract_version().version
    except Exception as e:
        return jsonify({"status": "error", "error": f"Tesseract not found: {e}"}), 500
    return jsonify({
        "status":                    "ok",
        "version":                   "7.8.0",
        "ocr_enabled":               True,
        "ocr_engine":                "tesseract",
        "ocr_lang":                  OCR_LANG,
        "pdf2image_support":         PDF2IMAGE_AVAILABLE,
        "pymupdf_support":           PYMUPDF_AVAILABLE,
        "pdfplumber_support":        PDFPLUMBER_AVAILABLE,
        "pdf_support":               PDF_SUPPORT,
        "cv2_available":             CV2_AVAILABLE,
        "blur_threshold_hard":       _BLUR_THRESHOLD_HARD,
        "blur_threshold_hard_pdf":   _BLUR_THRESHOLD_HARD_PDF,
        "blur_threshold_warn":       _BLUR_THRESHOLD_WARN,
        "min_resolution_px":         _MIN_RESOLUTION,
        "min_alpha_chars_image":     _MIN_ALPHA_CHARS,
        "min_alpha_chars_pdf":       _MIN_ALPHA_CHARS_PDF,
        "brightness_too_dark":       _BRIGHTNESS_TOO_DARK,
        "brightness_too_bright":     _BRIGHTNESS_TOO_BRIGHT,
        "id_card_sparse_ocr":        "advisory path (FIX-SVC-40)",
        "classify_endpoint":         "available at POST /classify",
        "fixes":                     "FIX-SVC-50: yellow-bg brightness bypass | FIX-SVC-51: id_card alpha min=10",
    })


@app.route("/ocr/quality", methods=["POST"])
def quality_check():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    ext = uploaded.filename.rsplit(".", 1)[-1].lower() if "." in uploaded.filename else ""

    file_bytes = uploaded.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        return jsonify({"error": f"File too large (max {MAX_FILE_SIZE_MB} MB)"}), 413

    if ext == "pdf" or _is_pdf_bytes(file_bytes):
        return jsonify({
            "acceptable":  True,
            "warnings":    ["PDF quality is assessed after OCR processing."],
            "blur_score":  999.0,
            "is_dark":     False,
            "hard_reject": False,
        })

    assessment = _assess_image_quality(file_bytes, is_pdf_page=False)

    return jsonify({
        "acceptable":         not assessment["hard_reject"],
        "warnings":           assessment["warnings"],
        "blur_score":         assessment["blur_score"],
        "mean_brightness":    assessment.get("mean_brightness", 128.0),
        "is_dark":            assessment["is_dark"],
        "is_washed_out":      assessment.get("is_washed_out", False),
        "width":              assessment["width"],
        "height":             assessment["height"],
        "hard_reject":        assessment["hard_reject"],
        "hard_reject_reason": assessment.get("hard_reject_reason", ""),
    })


@app.route("/ocr", methods=["POST"])
def ocr_endpoint():
    ocr_enabled = _ocr_enabled()

    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file provided — use key 'file'"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"success": False, "error": "Empty filename"}), 400
    if not allowed_file(uploaded.filename):
        return jsonify({"success": False, "error": "Unsupported file type"}), 415

    file_bytes = uploaded.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        return jsonify({"success": False, "error": f"File too large (max {MAX_FILE_SIZE_MB} MB)"}), 413

    fast_mode = (
        request.args.get("fast", "false").lower() == "true"
        or request.form.get("fast_mode", "false").lower() == "true"
    )

    declared_doc_type = (
        request.args.get("doc_type", "")
        or request.form.get("doc_type", "")
    ).strip().lower()

    ext = uploaded.filename.rsplit(".", 1)[1].lower() if "." in uploaded.filename else ""
    is_pdf = (ext == "pdf") or _is_pdf_bytes(file_bytes)

    if CV2_AVAILABLE and not is_pdf:
        assessment = _assess_image_quality(file_bytes, is_pdf_page=False)
        if assessment["hard_reject"]:
            return jsonify({
                "success":           False,
                "error":             assessment["hard_reject_reason"],
                "blur_score":        assessment["blur_score"],
                "mean_brightness":   assessment.get("mean_brightness", 128.0),
                "quality_warnings":  assessment["warnings"],
                "hard_reject":       True,
                "reupload_required": True,
            }), 422

    if not ocr_enabled:
        return jsonify({
            "success":         True,
            "filename":        uploaded.filename,
            "pages":           1,
            "lang":            OCR_LANG,
            "text":            "",
            "quality_score":   0,
            "ocr_alpha_chars": 0,
            "ocr_enabled":     False,
            "notice":          "OCR is currently disabled for deployment.",
        })

    try:
        if is_pdf:
            text, quality  = ocr_pdf(file_bytes, fast_mode=fast_mode)
            pages = text.count("--- Page Break ---") + 1
        else:
            image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            text, quality  = ocr_image(image, fast_mode=fast_mode)
            pages = 1

        quality_warnings: list[str] = []
        if CV2_AVAILABLE and not is_pdf:
            assessment = _assess_image_quality(file_bytes, is_pdf_page=False)
            quality_warnings = assessment.get("warnings", [])

        alpha_chars = _count_readable_chars_ocr(text)
        min_alpha = _MIN_ALPHA_CHARS_PDF if is_pdf else _MIN_ALPHA_CHARS

        if alpha_chars < min_alpha:
            is_id_card = declared_doc_type == "id_card"
            if is_id_card and not is_pdf:
                # FIX-SVC-40 (retained): Advisory path for sparse ID card results
                logger.info(
                    "ocr_endpoint [FIX-SVC-40]: id_card image alpha=%d < %d "
                    "— returning sparse result (advisory, not reject)",
                    alpha_chars, min_alpha,
                )
                return jsonify({
                    "success":           True,
                    "filename":          uploaded.filename,
                    "pages":             pages,
                    "lang":              OCR_LANG,
                    "text":              text.strip(),
                    "quality_score":     quality,
                    "ocr_alpha_chars":   alpha_chars,
                    "ocr_enabled":       True,
                    "fast_mode":         fast_mode,
                    "quality_warnings":  quality_warnings + [
                        f"OCR extracted only {alpha_chars} alpha characters from this ID card image. "
                        "Verification will complete automatically during shortlisting."
                    ],
                    "ocr_sparse":        True,
                })
            elif alpha_chars < 10:
                # FIX-SVC-41 (retained): Truly empty — hard reject
                return jsonify({
                    "success":           False,
                    "error": (
                        "The document appears to be blank or unreadable. "
                        "Please upload a clear scan of the document."
                    ),
                    "ocr_alpha_chars":   alpha_chars,
                    "quality_score":     quality,
                    "quality_warnings":  quality_warnings,
                    "hard_reject":       True,
                    "reupload_required": True,
                }), 422
            else:
                return jsonify({
                    "success":           False,
                    "error": (
                        f"The document was processed but only {alpha_chars} readable characters "
                        f"were extracted (minimum required: {min_alpha}). "
                        "The document may still be too blurry, at an angle, or have low contrast. "
                        "Please upload a clearer, flat, well-lit scan of the document."
                    ),
                    "ocr_alpha_chars":   alpha_chars,
                    "quality_score":     quality,
                    "quality_warnings":  quality_warnings,
                    "hard_reject":       True,
                    "reupload_required": True,
                }), 422

        return jsonify({
            "success":           True,
            "filename":          uploaded.filename,
            "pages":             pages,
            "lang":              OCR_LANG,
            "text":              text.strip(),
            "quality_score":     quality,
            "ocr_alpha_chars":   alpha_chars,
            "ocr_enabled":       True,
            "fast_mode":         fast_mode,
            "quality_warnings":  quality_warnings,
            "ocr_sparse":        False,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/ocr/batch", methods=["POST"])
def ocr_batch():
    ocr_enabled = _ocr_enabled()
    fast_mode   = request.args.get("fast", "false").lower() == "true"

    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files provided — use key 'files[]'"}), 400

    results = []
    for uploaded in files:
        if not allowed_file(uploaded.filename):
            results.append({"filename": uploaded.filename,
                            "success": False, "error": "Unsupported file type"})
            continue

        if not ocr_enabled:
            results.append({
                "filename":        uploaded.filename,
                "success":         True,
                "pages":           1,
                "lang":            OCR_LANG,
                "text":            "",
                "quality_score":   0,
                "ocr_alpha_chars": 0,
                "ocr_enabled":     False,
                "notice":          "OCR disabled for deployment.",
            })
            continue

        try:
            file_bytes = uploaded.read()
            ext        = uploaded.filename.rsplit(".", 1)[1].lower() if "." in uploaded.filename else ""
            is_pdf = (ext == "pdf") or _is_pdf_bytes(file_bytes)

            quality_warnings: list[str] = []
            if CV2_AVAILABLE and not is_pdf:
                assessment = _assess_image_quality(file_bytes, is_pdf_page=False)
                quality_warnings = assessment.get("warnings", [])
                if assessment["hard_reject"]:
                    results.append({
                        "filename":          uploaded.filename,
                        "success":           False,
                        "error":             assessment["hard_reject_reason"],
                        "blur_score":        assessment["blur_score"],
                        "quality_warnings":  quality_warnings,
                        "hard_reject":       True,
                        "reupload_required": True,
                    })
                    continue

            if is_pdf:
                text, quality  = ocr_pdf(file_bytes, fast_mode=fast_mode)
                pages = text.count("--- Page Break ---") + 1
            else:
                image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
                text, quality  = ocr_image(image, fast_mode=fast_mode)
                pages = 1

            alpha_chars = _count_readable_chars_ocr(text)
            min_alpha = _MIN_ALPHA_CHARS_PDF if is_pdf else _MIN_ALPHA_CHARS
            if alpha_chars < min_alpha:
                results.append({
                    "filename":          uploaded.filename,
                    "success":           False,
                    "error": (
                        f"Only {alpha_chars} readable characters extracted "
                        f"(minimum: {min_alpha}). Please upload a clearer scan."
                    ),
                    "ocr_alpha_chars":   alpha_chars,
                    "hard_reject":       True,
                    "reupload_required": True,
                })
                continue

            results.append({
                "filename":          uploaded.filename,
                "success":           True,
                "pages":             pages,
                "lang":              OCR_LANG,
                "text":              text.strip(),
                "quality_score":     quality,
                "ocr_alpha_chars":   alpha_chars,
                "ocr_enabled":       True,
                "quality_warnings":  quality_warnings,
            })
        except Exception as e:
            results.append({"filename": uploaded.filename,
                            "success": False, "error": str(e)})

    return jsonify({"results": results})


# =============================================================================
# Document classification endpoint
# =============================================================================

def _classify_document_type(text: str) -> dict:
    text_lower = text.lower()
    alpha = sum(1 for c in text if c.isalpha())
    if alpha < 20:
        return {"type": "unknown", "confidence": 0.0}

    diploma_kw = ["bachelor", "master", "phd", "doctorate", "degree", "diploma",
                  "university", "college", "graduat", "b.sc", "m.sc", "b.a", "m.a"]
    id_kw = ["national id", "identity card", "identification card", "id no",
             "indangamuntu", "date of birth", "sex:", "nid", "national identity"]
    cv_kw = ["experience", "skills", "employment", "work history", "curriculum vitae",
             "resume", "technical skills", "certifications"]
    cert_kw = ["certificate", "certification", "credential", "accredited",
               "professional certificate", "completion", "course", "training"]

    def score(kw_list):
        return sum(1 for kw in kw_list if kw in text_lower)

    scores = {
        "diploma": score(diploma_kw),
        "id_card": score(id_kw),
        "cv": score(cv_kw),
        "certificate": score(cert_kw)
    }
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    conf = scores[best] / total if total > 0 else 0.0
    return {"type": best, "confidence": round(conf, 2)}


@app.route("/classify", methods=["POST"])
def classify_document():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    file_bytes = uploaded.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        return jsonify({"error": f"File too large (max {MAX_FILE_SIZE_MB} MB)"}), 413

    ext = uploaded.filename.rsplit(".", 1)[1].lower() if "." in uploaded.filename else ""
    is_pdf = (ext == "pdf") or _is_pdf_bytes(file_bytes)

    try:
        if is_pdf:
            text, _ = ocr_pdf(file_bytes, fast_mode=False)
        else:
            image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            text, _ = ocr_image(image, fast_mode=False)

        classification = _classify_document_type(text)
        return jsonify({
            "success": True,
            "type": classification["type"],
            "confidence": classification["confidence"],
            "preview": text[:500] + ("…" if len(text) > 500 else "")
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", 5050))
    ocr_enabled = _ocr_enabled()
    print(f"\n✅  OCR Service v7.8.0 on http://localhost:{port}")
    print(f"    OCR enabled             : {'YES' if ocr_enabled else 'NO (ENABLE_OCR=false)'}")
    print(f"    OCR language            : {OCR_LANG}")
    print(f"    ── New Fixes (v7.8.0) ───────────────────────────────────")
    print(f"    FIX-SVC-50: yellow-bg bypasses brightness hard-reject")
    print(f"    FIX-SVC-51: id_card pipeline min alpha = 10 (was 30)")
    print(f"    ── Security Fixes (retained) ────────────────────────────")
    print(f"    FIX-SVC-40: id_card sparse OCR → advisory (not reject)")
    print(f"    FIX-SVC-41: truly blank docs hard-rejected at alpha < 10")
    print(f"    ── Quality Gate ─────────────────────────────────────────")
    print(f"    Blur hard-reject (image): score < {_BLUR_THRESHOLD_HARD}")
    print(f"    Blur hard-reject (PDF)  : DISABLED")
    print(f"    Blur warn               : score < {_BLUR_THRESHOLD_WARN}")
    print(f"    Min resolution          : {_MIN_RESOLUTION} px")
    print(f"    Brightness too dark     : mean < {_BRIGHTNESS_TOO_DARK}")
    print(f"    Brightness washed out   : mean > {_BRIGHTNESS_TOO_BRIGHT} (skipped for yellow-bg ID)")
    print(f"    Post-OCR alpha min(img) : {_MIN_ALPHA_CHARS} chars")
    print(f"    Post-OCR alpha min(PDF) : {_MIN_ALPHA_CHARS_PDF} chars")
    print(f"    ── Rwanda ID Fixes ──────────────────────────────────────")
    print(f"    Yellow BG detection     : ENABLED (FIX-SVC-34)")
    print(f"    ID-specific preprocessing: ENABLED (FIX-SVC-31)")
    print(f"    Multi-scale OCR         : ENABLED (FIX-SVC-32)")
    print(f"    PSM order               : 6,11,3,4,7 (FIX-SVC-33)")
    print(f"    ── Libraries ────────────────────────────────────────────")
    print(f"    OpenCV                  : {'enabled' if CV2_AVAILABLE else 'disabled'}")
    print(f"    EasyOCR fallback        : {'ENABLED' if EASYOCR_AVAILABLE else 'disabled'}")
    print(f"    pdf2image               : {'enabled' if PDF2IMAGE_AVAILABLE else 'disabled'}")
    print(f"    PyMuPDF fallback        : {'enabled' if PYMUPDF_AVAILABLE else 'disabled'}")
    print(f"    pdfplumber              : {'enabled' if PDFPLUMBER_AVAILABLE else 'disabled'}")
    print(f"    Poppler path            : {_POPPLER_WIN_PATH or 'system PATH'}\n")
    app.run(host="0.0.0.0", port=port, debug=False)