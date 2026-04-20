"""
backend/ocr_service.py
────────────────────────────────────────────────────────────────
WHAT WAS FIXED IN THIS VERSION:

  ✅ FIX 1 — Multi-language OCR (eng+fra)
  ───────────────────────────────────────────────────────────────
  Previously: OCR_LANG was hardcoded to "eng" only.
  Rwanda National IDs contain French text ("AGENCE NATIONALE
  D'IDENTIFICATION", "DATE DE NAISSANCE", "NOM DE FAMILLE").
  English-only OCR missed all of this, causing keyword misses
  in document_verifier.py's id_card classifier.

  Now: Attempts "eng+fra" first, falls back to "eng" if the
  French language pack is not installed.

  Install French language pack:
    Linux:   sudo apt install tesseract-ocr-fra
    Windows: re-run Tesseract installer → tick "French"
    Mac:     brew install tesseract-lang

  ✅ FIX 2 — Multiple PSM modes tried per image
  ───────────────────────────────────────────────────────────────
  Previously: OCR_CONFIG = "--psm 6" only (assume uniform text block).
  This fails on ID cards with grid/table layouts.

  Now: Tries PSM 6, PSM 3, and PSM 11 for each image, returns
  whichever yields the most extracted text.

  ✅ FIX 3 — Image pre-processing before OCR
  ───────────────────────────────────────────────────────────────
  Added grayscale conversion, auto-contrast, and sharpening
  before passing images to Tesseract — dramatically improves
  accuracy on photos of ID cards and low-quality scans.

  ✅ RETAINED — All previous functionality (Flask routes, PDF
  support, batch endpoint, file size limits, etc.)
"""

import os
import io
import traceback
import logging

from flask import Flask, request, jsonify
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import pytesseract

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Windows Tesseract path
# ─────────────────────────────────────────────────────────────────────────────

_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(_WIN_PATH):
    pytesseract.pytesseract.tesseract_cmd = _WIN_PATH

# ─────────────────────────────────────────────────────────────────────────────
# Optional PDF support
# ─────────────────────────────────────────────────────────────────────────────

try:
    from pdf2image import convert_from_bytes
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("[WARN] pdf2image not installed — PDF OCR disabled. Run: pip install pdf2image")


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 1 — Determine best available language string
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_ocr_language() -> str:
    """
    Try to use eng+fra (for Rwanda IDs with French text).
    Falls back to eng-only if French Tesseract data is not installed.
    """
    try:
        available = pytesseract.get_languages()
        if "fra" in available:
            logger.info("✓ OCR language: eng+fra (French data available)")
            return "eng+fra"
        logger.warning(
            "⚠ French Tesseract data not installed — using 'eng' only. "
            "Rwanda IDs may not be fully read. "
            "Linux fix: sudo apt install tesseract-ocr-fra"
        )
        return "eng"
    except Exception:
        return "eng"


OCR_LANG = _resolve_ocr_language()

app = Flask(__name__)

MAX_FILE_SIZE_MB    = 20
ALLOWED_EXTENSIONS  = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp", "pdf"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 3 — Image pre-processing for better OCR accuracy
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess(img: Image.Image) -> Image.Image:
    """
    Prepare an image for Tesseract:
      1. Convert to grayscale (reduces colour noise)
      2. Auto-contrast (handles uneven lighting on photos of ID cards)
      3. Sharpen (improves edge definition for OCR)
      4. Boost contrast (makes text stand out from background)
    """
    img = img.convert("L")                          # grayscale
    img = ImageOps.autocontrast(img, cutoff=2)      # auto-levels
    img = ImageEnhance.Sharpness(img).enhance(2.0)  # sharpen
    img = ImageEnhance.Contrast(img).enhance(1.5)   # boost contrast
    return img


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 2 — Try multiple PSM modes, return best result
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_best_psm(img: Image.Image) -> str:
    """
    Run Tesseract with PSM 6, 3, and 11, return the result with most text.

    PSM 6  = assume a uniform block of text
    PSM 3  = fully automatic page segmentation (general purpose)
    PSM 11 = sparse text — find as much text as possible (best for ID cards)

    Uses the resolved multi-language string (eng+fra or eng).
    """
    best = ""
    for psm in (6, 3, 11):
        try:
            result = pytesseract.image_to_string(
                img, lang=OCR_LANG, config=f"--psm {psm}"
            ).strip()
            if len(result) > len(best):
                best = result
        except Exception as exc:
            logger.debug("PSM %d failed: %s", psm, exc)
    return best


def ocr_image(image: Image.Image) -> str:
    """
    OCR a single PIL image with preprocessing and multi-PSM.
    Tries preprocessed version first; if poor result also tries raw.
    """
    processed = _preprocess(image)
    text = _ocr_best_psm(processed)

    # If preprocessing gave poor result, also try the original colour image
    if len(text) < 20:
        raw_text = _ocr_best_psm(image)
        if len(raw_text) > len(text):
            text = raw_text

    return text


def ocr_pdf(file_bytes: bytes) -> str:
    """
    Convert PDF pages to images, OCR each page with preprocessing.
    Renders at 300 DPI for good quality.
    """
    if not PDF_SUPPORT:
        return "[ERROR] PDF OCR not available — install pdf2image and poppler."
    pages = convert_from_bytes(file_bytes, dpi=300)
    texts = [ocr_image(page) for page in pages]
    return "\n\n--- Page Break ---\n\n".join(texts)


# ─────────────────────────────────────────────────────────────────────────────
# Flask routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    try:
        version = pytesseract.get_tesseract_version().version
    except Exception as e:
        return jsonify({"status": "error", "error": f"Tesseract not found: {str(e)}"}), 500
    return jsonify({
        "status":      "ok",
        "ocr_engine":  "tesseract",
        "ocr_lang":    OCR_LANG,
        "pdf_support": PDF_SUPPORT,
        "version":     version,
    })


@app.route("/ocr", methods=["POST"])
def ocr_endpoint():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file provided — use key 'file'"}), 400

    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify({"success": False, "error": "Empty filename"}), 400
    if not allowed_file(uploaded.filename):
        return jsonify({"success": False, "error": "Unsupported file type"}), 415

    file_bytes = uploaded.read()
    if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
        return jsonify({"success": False, "error": f"File too large (max {MAX_FILE_SIZE_MB} MB)"}), 413

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
            "success":  True,
            "filename": uploaded.filename,
            "pages":    pages,
            "lang":     OCR_LANG,
            "text":     text.strip(),
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
            results.append({"filename": uploaded.filename, "success": False, "error": "Unsupported file type"})
            continue
        try:
            file_bytes = uploaded.read()
            ext = uploaded.filename.rsplit(".", 1)[1].lower()
            if ext == "pdf":
                text  = ocr_pdf(file_bytes)
                pages = text.count("--- Page Break ---") + 1
            else:
                image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
                text  = ocr_image(image)
                pages = 1
            results.append({
                "filename": uploaded.filename,
                "success":  True,
                "pages":    pages,
                "lang":     OCR_LANG,
                "text":     text.strip(),
            })
        except Exception as e:
            results.append({"filename": uploaded.filename, "success": False, "error": str(e)})

    return jsonify({"results": results})


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", 5050))
    print(f"\n✅  TalentScreen OCR Service running on http://localhost:{port}")
    print(f"    OCR language : {OCR_LANG}")
    print(f"    PDF support  : {'enabled' if PDF_SUPPORT else 'disabled (pip install pdf2image)'}")
    print(f"    PSM modes    : 6, 3, 11 (tries all, returns best)")
    print(f"    Preprocessing: grayscale + auto-contrast + sharpening\n")
    app.run(host="0.0.0.0", port=port, debug=False)