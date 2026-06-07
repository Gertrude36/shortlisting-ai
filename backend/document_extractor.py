"""
document_extractor.py
Extracts structured text from uploaded candidate documents.
Supports: PDF, PNG/JPG (ID cards, scanned docs), DOCX.
Uses pdfplumber + pytesseract for local extraction, then sends
clean text (or raw image) to OpenRouter for structured parsing.
"""

import os
import io
import base64
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# -- Optional heavy dependencies (graceful degradation) ----------------------
try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logger.warning("pdfplumber not installed. PDF extraction unavailable.")

try:
    from PIL import Image
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    logger.warning("Pillow/pytesseract not installed. Image OCR unavailable.")

try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    logger.warning("python-docx not installed. DOCX extraction unavailable.")

from openrouter_client import chat_completion_json, vision_completion, OpenRouterError

# -- Constants ----------------------------------------------------------------

SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
SUPPORTED_PDF_TYPES = {".pdf"}
SUPPORTED_DOCX_TYPES = {".docx", ".doc"}

MEDIA_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
}

# System prompt for AI-based structured extraction
EXTRACTION_SYSTEM_PROMPT = """You are a document parser for a recruitment system.
Given raw text or an image of a candidate document, extract all relevant information
and return ONLY a JSON object with no extra text.

For CVs/Resumes, extract:
  full_name, email, phone, location, summary, skills (list),
  education (list of {institution, degree, field, year}),
  experience (list of {company, title, duration, description}),
  certifications (list), languages (list)

For National ID cards, extract:
  full_name, id_number, date_of_birth, gender, nationality, expiry_date

For Diplomas/Certificates, extract:
  full_name, institution, degree, field_of_study, graduation_date, honors

For Experience Letters, extract:
  full_name, company, job_title, start_date, end_date, responsibilities (list)

For unknown documents, return: { "raw_text": "<all text you can read>" }

Always include: { "document_type": "<cv|national_id|diploma|certificate|experience_letter|unknown>" }
"""


# -- Core extraction functions -------------------------------------------------

def _extract_text_from_pdf(file_path: str) -> str:
    """Extract raw text from PDF using pdfplumber."""
    if not PDF_AVAILABLE:
        raise RuntimeError("pdfplumber is not installed.")
    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text.strip())
    return "\n\n".join(text_parts)


def _extract_text_from_image_ocr(file_path: str) -> str:
    """Extract text from image using pytesseract OCR."""
    if not OCR_AVAILABLE:
        raise RuntimeError("pytesseract/Pillow is not installed.")
    image = Image.open(file_path)
    # Try multiple languages including Kinyarwanda-adjacent (Latin script)
    text = pytesseract.image_to_string(image, lang="eng+fra")
    return text.strip()


def _extract_text_from_docx(file_path: str) -> str:
    """Extract raw text from DOCX using python-docx."""
    if not DOCX_AVAILABLE:
        raise RuntimeError("python-docx is not installed.")
    doc = DocxDocument(file_path)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def _image_to_base64(file_path: str) -> tuple[str, str]:
    """
    Convert image file to base64 string.
    Returns (base64_string, media_type).
    """
    ext = Path(file_path).suffix.lower()
    media_type = MEDIA_TYPE_MAP.get(ext, "image/jpeg")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return b64, media_type


def _ai_extract_from_text(raw_text: str, hint: Optional[str] = None) -> dict:
    """
    Send raw text to OpenRouter for structured extraction.
    hint: optional document type hint e.g. "cv", "national_id"
    """
    user_msg = f"Extract information from this document text:\n\n{raw_text}"
    if hint:
        user_msg = f"This appears to be a {hint}.\n\n" + user_msg

    result = chat_completion_json(
        messages=[{"role": "user", "content": user_msg}],
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        temperature=0.1,
        max_tokens=2048,
    )
    return result


def _ai_extract_from_image(file_path: str, hint: Optional[str] = None) -> dict:
    """
    Send image directly to OpenRouter vision model for extraction.
    Used as fallback when OCR quality is poor (e.g. Rwandan IDs).
    """
    b64, media_type = _image_to_base64(file_path)
    prompt = EXTRACTION_SYSTEM_PROMPT
    if hint:
        prompt += f"\n\nThis document appears to be a {hint}."

    raw = vision_completion(
        image_base64=b64,
        media_type=media_type,
        prompt="Extract all information from this document and return structured JSON as instructed.",
        max_tokens=1024,
    )

    # Parse JSON from vision response
    import json
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
        clean = clean.strip()
    return json.loads(clean)


# -- Public API ----------------------------------------------------------------

def extract_document(
    file_path: str,
    document_type_hint: Optional[str] = None,
    force_vision: bool = False,
) -> dict:
    """
    Main extraction function. Auto-detects file type and extracts structured data.

    Args:
        file_path: Absolute or relative path to the uploaded file.
        document_type_hint: Optional hint ("cv", "national_id", "diploma", etc.)
        force_vision: If True, always use vision model for images (skip OCR).

    Returns:
        dict with extracted fields + metadata:
        {
            "document_type": str,
            "extraction_method": str,
            "file_name": str,
            ... (document-specific fields)
        }
    """
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}", "document_type": "unknown"}

    ext = path.suffix.lower()
    file_name = path.name
    result = {}
    extraction_method = "unknown"

    try:
        # -- PDF --------------------------------------------------------------
        if ext in SUPPORTED_PDF_TYPES:
            raw_text = ""
            # Layer 1: pdfplumber (no Poppler needed, best layout extraction)
            if PDF_AVAILABLE:
                try:
                    raw_text = _extract_text_from_pdf(file_path)
                except Exception as e:
                    logger.warning(f"pdfplumber failed for {file_name}: {e}")

            # Layer 2: pypdf fallback
            if len(raw_text.strip()) < 50:
                try:
                    from pypdf import PdfReader
                    pages = []
                    for page in PdfReader(file_path).pages:
                        txt = page.extract_text()
                        if txt:
                            pages.append(txt)
                    pypdf_text = "\n\n".join(pages).strip()
                    if len(pypdf_text) > len(raw_text):
                        raw_text = pypdf_text
                except Exception:
                    pass

            if len(raw_text.strip()) >= 30:
                # Good text -- send to AI for structured extraction
                result = _ai_extract_from_text(raw_text, hint=document_type_hint)
                extraction_method = "pdfplumber+ai"
                # Always store raw_text so name matching can use it
                if "raw_text" not in result or not result["raw_text"]:
                    result["raw_text"] = raw_text
            elif raw_text.strip():
                # Some text but sparse (scanned PDF) -- still use what we have
                result = _ai_extract_from_text(raw_text, hint=document_type_hint)
                extraction_method = "pdfplumber_sparse+ai"
                result["raw_text"] = raw_text
            else:
                # Scanned PDF -- no text. Convert first page to image and send to vision AI.
                logger.info(f"PDF has no extractable text: {file_name} -- trying vision AI on rendered page")
                vision_result = None
                try:
                    import fitz  # PyMuPDF
                    doc = fitz.open(file_path)
                    if len(doc) > 0:
                        page = doc[0]
                        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom = ~144 DPI
                        pix = page.get_pixmap(matrix=mat)
                        img_bytes = pix.tobytes("png")
                        import base64
                        b64 = base64.b64encode(img_bytes).decode("utf-8")
                        from openrouter_client import vision_completion
                        import json as _json
                        raw = vision_completion(
                            image_base64=b64,
                            media_type="image/png",
                            prompt="Extract all information from this document and return structured JSON as instructed.",
                            max_tokens=1024,
                        )
                        clean = raw.strip()
                        if clean.startswith("```"):
                            clean = clean.split("```")[1]
                            if clean.startswith("json"):
                                clean = clean[4:]
                            clean = clean.strip()
                        vision_result = _json.loads(clean)
                        extraction_method = "pymupdf_vision"
                except Exception as ve:
                    logger.warning(f"Vision AI fallback failed for {file_name}: {ve}")

                if vision_result and not vision_result.get("error"):
                    result = vision_result
                else:
                    result = {
                        "document_type": document_type_hint or "unknown",
                        "raw_text": "",
                        "error": "PDF has no extractable text. Please upload a text-based PDF or a clear image scan.",
                    }
                    extraction_method = "failed"

        # -- Images (ID cards, scanned docs) ----------------------------------
        elif ext in SUPPORTED_IMAGE_TYPES:
            if force_vision or not OCR_AVAILABLE:
                result = _ai_extract_from_image(file_path, hint=document_type_hint)
                extraction_method = "vision"
            else:
                ocr_text = _extract_text_from_image_ocr(file_path)
                if len(ocr_text.strip()) > 30:
                    result = _ai_extract_from_text(ocr_text, hint=document_type_hint)
                    extraction_method = "ocr+ai"
                else:
                    # Poor OCR quality -> fall back to vision (handles Rwandan IDs well)
                    logger.info(f"Low OCR confidence for {file_name}, falling back to vision")
                    result = _ai_extract_from_image(file_path, hint=document_type_hint)
                    extraction_method = "vision_fallback"

        # -- DOCX -------------------------------------------------------------
        elif ext in SUPPORTED_DOCX_TYPES:
            if DOCX_AVAILABLE:
                raw_text = _extract_text_from_docx(file_path)
                result = _ai_extract_from_text(raw_text, hint=document_type_hint)
                extraction_method = "docx+ai"
            else:
                result = {"error": "python-docx not available", "document_type": "unknown"}

        else:
            result = {"error": f"Unsupported file type: {ext}", "document_type": "unknown"}

    except OpenRouterError as e:
        logger.error(f"OpenRouter error during extraction of {file_name}: {e}")
        result = {"error": str(e), "document_type": "unknown"}
    except Exception as e:
        logger.error(f"Unexpected error extracting {file_name}: {e}")
        result = {"error": str(e), "document_type": "unknown"}

    # Attach metadata
    result["file_name"] = file_name
    result["extraction_method"] = extraction_method
    if "document_type" not in result:
        result["document_type"] = document_type_hint or "unknown"

    return result


def extract_multiple_documents(documents: list[dict]) -> dict:
    """
    Extract text from multiple candidate documents and merge into one profile.

    Args:
        documents: List of {"file_path": str, "document_type_hint": str}

    Returns:
        {
            "candidate_name": str | None,
            "documents": [extracted_doc, ...],
            "merged_profile": { cv fields + id fields + ... }
        }
    """
    extracted = []
    merged = {}

    for doc in documents:
        result = extract_document(
            file_path=doc["file_path"],
            document_type_hint=doc.get("document_type_hint"),
        )
        extracted.append(result)

        # Merge non-error, non-metadata fields into profile
        for key, value in result.items():
            if key in ("file_name", "extraction_method", "error"):
                continue
            if key not in merged and value:
                merged[key] = value

    candidate_name = merged.get("full_name")

    return {
        "candidate_name": candidate_name,
        "documents": extracted,
        "merged_profile": merged,
    }