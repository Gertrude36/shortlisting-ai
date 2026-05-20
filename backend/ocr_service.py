"""
backend/ocr_service.py  ·  v6.1.0
────────────────────────────────────────────────────────────────
CHANGES IN v6.1.0:

  ✅ DEPLOY-FIX — ENABLE_OCR environment variable toggle.
     Set ENABLE_OCR=false in your hosting environment to disable
     all OCR processing without removing any code.
     Set ENABLE_OCR=true to re-enable when ready.

     When disabled:
       • /health     → reports ocr_enabled: false (still returns 200)
       • /ocr        → returns success:true with empty text and a notice
       • /ocr/batch  → same per-file behaviour as above

     All v6.0.0 fixes retained (preprocessing pipeline, multi-strategy,
     multi-PSM, multi-language, PDF support, health check).
"""

import os
import io
import traceback
import logging

import numpy as np
from flask import Flask, request, jsonify
from PIL import Image, ImageEnhance, ImageOps
import pytesseract

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# ✅ DEPLOY-FIX — OCR master toggle
# Set ENABLE_OCR=false in your .env / hosting env vars to disable OCR.
# ─────────────────────────────────────────────────────────────────────────────

OCR_ENABLED = os.getenv("ENABLE_OCR", "true").lower() == "true"

if not OCR_ENABLED:
    print("[ocr_service] ⚠️  OCR is DISABLED via ENABLE_OCR=false. "
          "All OCR endpoints will return empty text until re-enabled.")

# ─────────────────────────────────────────────────────────────────────────────
# Windows Tesseract path
# ─────────────────────────────────────────────────────────────────────────────
_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(_WIN_PATH):
    pytesseract.pytesseract.tesseract_cmd = _WIN_PATH

# ─────────────────────────────────────────────────────────────────────────────
# Optional OpenCV
# ─────────────────────────────────────────────────────────────────────────────
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[WARN] opencv-python not installed — advanced preprocessing disabled. "
          "Run: pip install opencv-python")

# ─────────────────────────────────────────────────────────────────────────────
# Optional PDF support
# ─────────────────────────────────────────────────────────────────────────────
try:
    from pdf2image import convert_from_bytes
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("[WARN] pdf2image not installed — PDF OCR disabled. "
          "Run: pip install pdf2image")


# ─────────────────────────────────────────────────────────────────────────────
# Language detection
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_ocr_language() -> str:
    if not OCR_ENABLED:
        return "eng"
    try:
        available = pytesseract.get_languages()
        if "fra" in available:
            logger.info("✓ OCR language: eng+fra (French data available)")
            return "eng+fra"
        logger.warning(
            "⚠ French Tesseract data not installed — using 'eng' only. "
            "Linux fix: sudo apt install tesseract-ocr-fra"
        )
        return "eng"
    except Exception:
        return "eng"


OCR_LANG = _resolve_ocr_language()

app = Flask(__name__)

MAX_FILE_SIZE_MB   = 20
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp", "pdf"}
_PSM_MODES         = (11, 6, 3, 4)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ─────────────────────────────────────────────────────────────────────────────
# OpenCV preprocessing helpers (unchanged from v6.0.0)
# ─────────────────────────────────────────────────────────────────────────────

def _pil_to_cv2(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _cv2_to_pil(arr: np.ndarray) -> Image.Image:
    if len(arr.shape) == 2:
        return Image.fromarray(arr)
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def _deskew(grey: np.ndarray) -> np.ndarray:
    try:
        edges = cv2.Canny(grey, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180, threshold=80,
            minLineLength=grey.shape[1] // 4, maxLineGap=20
        )
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


def _upscale_if_small(grey: np.ndarray, min_width: int = 1200) -> np.ndarray:
    h, w = grey.shape
    if w < min_width:
        scale = min_width / w
        grey  = cv2.resize(grey, (int(w * scale), int(h * scale)),
                           interpolation=cv2.INTER_CUBIC)
    return grey


def _denoise(grey: np.ndarray) -> np.ndarray:
    try:
        return cv2.fastNlMeansDenoising(grey, None, h=10,
                                        templateWindowSize=7,
                                        searchWindowSize=21)
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


def _morph_clean(binary: np.ndarray) -> np.ndarray:
    try:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    except Exception:
        return binary


def _build_variants(img: Image.Image) -> list[Image.Image]:
    variants: list[Image.Image] = []

    try:
        pil = img.convert("L")
        pil = ImageOps.autocontrast(pil, cutoff=2)
        pil = ImageEnhance.Sharpness(pil).enhance(2.5)
        pil = ImageEnhance.Contrast(pil).enhance(1.8)
        variants.append(pil)
    except Exception:
        pass

    if not CV2_AVAILABLE:
        return variants or [img]

    try:
        grey = cv2.cvtColor(_pil_to_cv2(img), cv2.COLOR_BGR2GRAY)

        try:
            g = _morph_clean(_binarise_adaptive(_clahe(_denoise(_deskew(_upscale_if_small(grey.copy()))))))
            variants.insert(0, _cv2_to_pil(g))
        except Exception:
            pass

        try:
            g = _binarise_otsu(_clahe(_denoise(_deskew(_upscale_if_small(grey.copy())))))
            variants.append(_cv2_to_pil(g))
        except Exception:
            pass

        try:
            g = _upscale_if_small(grey.copy(), min_width=2400)
            variants.append(_cv2_to_pil(g))
        except Exception:
            pass

    except Exception:
        pass

    return variants or [img]


def _ocr_one(img: Image.Image) -> str:
    best = ""
    for psm in _PSM_MODES:
        try:
            result = pytesseract.image_to_string(
                img, lang=OCR_LANG, config=f"--psm {psm} --oem 3"
            ).strip()
            if len(result.replace(" ", "").replace("\n", "")) > \
               len(best.replace(" ", "").replace("\n", "")):
                best = result
        except Exception as exc:
            logger.debug("PSM %d failed: %s", psm, exc)
    return best


def ocr_image(image: Image.Image) -> str:
    """OCR with all preprocessing strategies; return best result."""
    best = ""
    for variant in _build_variants(image):
        text = _ocr_one(variant)
        if len(text.replace(" ", "").replace("\n", "")) > \
           len(best.replace(" ", "").replace("\n", "")):
            best = text
    return best


def ocr_pdf(file_bytes: bytes) -> str:
    if not PDF_SUPPORT:
        return "[ERROR] PDF OCR not available — install pdf2image and poppler."
    pages = convert_from_bytes(file_bytes, dpi=300)
    return "\n\n--- Page Break ---\n\n".join(ocr_image(p) for p in pages)


# ─────────────────────────────────────────────────────────────────────────────
# Flask routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    # ✅ DEPLOY-FIX: health always succeeds; reports ocr_enabled status
    if not OCR_ENABLED:
        return jsonify({
            "status":      "ok",
            "ocr_enabled": False,
            "notice":      "OCR is disabled via ENABLE_OCR=false. Set ENABLE_OCR=true to re-enable.",
        })
    try:
        version = pytesseract.get_tesseract_version().version
    except Exception as e:
        return jsonify({"status": "error", "error": f"Tesseract not found: {e}"}), 500
    return jsonify({
        "status":        "ok",
        "ocr_enabled":   True,
        "ocr_engine":    "tesseract",
        "ocr_lang":      OCR_LANG,
        "pdf_support":   PDF_SUPPORT,
        "cv2_available": CV2_AVAILABLE,
        "version":       version,
    })


@app.route("/ocr", methods=["POST"])
def ocr_endpoint():
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

    # ✅ DEPLOY-FIX: skip OCR processing when disabled; still return success
    # so document uploads don't fail with 500. Text will be empty/null.
    if not OCR_ENABLED:
        ext   = uploaded.filename.rsplit(".", 1)[1].lower()
        pages = 1
        return jsonify({
            "success":     True,
            "filename":    uploaded.filename,
            "pages":       pages,
            "lang":        OCR_LANG,
            "text":        "",
            "ocr_enabled": False,
            "notice":      "OCR is currently disabled for deployment. "
                           "The file has been received and stored. "
                           "OCR will be re-enabled later.",
        })

    ext = uploaded.filename.rsplit(".", 1)[1].lower()

    try:
        if ext == "pdf":
            text  = ocr_pdf(file_bytes)
            pages = text.count("--- Page Break ---") + 1
        else:
            image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            text  = ocr_image(image)
            pages = 1

        return jsonify({
            "success":     True,
            "filename":    uploaded.filename,
            "pages":       pages,
            "lang":        OCR_LANG,
            "text":        text.strip(),
            "ocr_enabled": True,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/ocr/batch", methods=["POST"])
def ocr_batch():
    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files provided — use key 'files[]'"}), 400

    results = []
    for uploaded in files:
        if not allowed_file(uploaded.filename):
            results.append({"filename": uploaded.filename,
                            "success": False, "error": "Unsupported file type"})
            continue

        # ✅ DEPLOY-FIX: return empty text without error when OCR is disabled
        if not OCR_ENABLED:
            results.append({
                "filename":    uploaded.filename,
                "success":     True,
                "pages":       1,
                "lang":        OCR_LANG,
                "text":        "",
                "ocr_enabled": False,
                "notice":      "OCR disabled for deployment.",
            })
            continue

        try:
            file_bytes = uploaded.read()
            ext        = uploaded.filename.rsplit(".", 1)[1].lower()
            if ext == "pdf":
                text  = ocr_pdf(file_bytes)
                pages = text.count("--- Page Break ---") + 1
            else:
                image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
                text  = ocr_image(image)
                pages = 1
            results.append({
                "filename":    uploaded.filename,
                "success":     True,
                "pages":       pages,
                "lang":        OCR_LANG,
                "text":        text.strip(),
                "ocr_enabled": True,
            })
        except Exception as e:
            results.append({"filename": uploaded.filename,
                            "success": False, "error": str(e)})

    return jsonify({"results": results})


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", 5050))
    print(f"\n✅  OCR Service v6.1.0 on http://localhost:{port}")
    print(f"    OCR enabled   : {'YES' if OCR_ENABLED else 'NO (ENABLE_OCR=false)'}")
    print(f"    OCR language  : {OCR_LANG}")
    print(f"    PDF support   : {'enabled' if PDF_SUPPORT else 'disabled'}")
    print(f"    OpenCV        : {'enabled — advanced preprocessing' if CV2_AVAILABLE else 'disabled — pip install opencv-python'}")
    print(f"    PSM modes     : {_PSM_MODES}")
    print(f"    Preprocessing : deskew + denoise + CLAHE + adaptive/Otsu\n")
    app.run(host="0.0.0.0", port=port, debug=False)
