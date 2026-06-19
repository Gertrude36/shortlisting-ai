"""
document_extractor.py
=====================
Extracts structured text from uploaded candidate documents.
Supports: PDF, PNG/JPG (ID cards, scanned docs), DOCX.

Uses pdfplumber + pytesseract for local extraction, then sends
clean text (or raw image) to OpenRouter for structured parsing.

FIXES applied:
- FIX-EXT-1: vision_completion response now parsed safely with
  a dedicated helper that handles markdown fences and bare JSON.
- FIX-EXT-2: _ai_extract_from_image passes the system prompt to
  the vision model so structured output is consistent.
- FIX-EXT-3: extract_document always attaches raw_text so
  downstream name-matching in document_verifier can use it.
- FIX-EXT-4: Added applicant_name parameter so the AI knows
  whose name to look for (used by document_verifier).
"""

import os
import io
import base64
import json
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

# Determine if OpenRouter API key is present; allow local-only mode when absent
AI_ENABLED = bool(os.environ.get("OPENROUTER_API_KEY"))
# -- Constants ----------------------------------------------------------------

SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}
SUPPORTED_PDF_TYPES   = {".pdf"}
SUPPORTED_DOCX_TYPES  = {".docx", ".doc"}

MEDIA_TYPE_MAP = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".bmp":  "image/bmp",
    ".tiff": "image/tiff",
}

EXTRACTION_SYSTEM_PROMPT = """You are a document parser for a recruitment system.
Given raw text or an image of a candidate document, extract all relevant information
and return ONLY a JSON object with no extra text, no markdown fences.

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
Return ONLY the JSON object. No explanation. No markdown.
"""


# -- JSON parsing helper (FIX-EXT-1) -----------------------------------------

def _parse_json_response(raw: str) -> dict:
    """
    Safely parse a JSON string that may or may not be wrapped in markdown fences.
    Returns parsed dict or raises ValueError.
    """
    if not raw or not raw.strip():
        raise ValueError("Empty response from AI")

    clean = raw.strip()

    # Strip ```json ... ``` or ``` ... ```
    if clean.startswith("```"):
        lines = clean.split("\n")
        # Remove opening fence
        lines = lines[1:]
        # Remove closing fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        clean = "\n".join(lines).strip()

    # Find first { and last } to extract JSON object
    start = clean.find("{")
    end   = clean.rfind("}")
    if start != -1 and end != -1 and end > start:
        clean = clean[start:end + 1]

    return json.loads(clean)


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
    text  = pytesseract.image_to_string(image, lang="eng+fra")
    return text.strip()


def _extract_text_from_docx(file_path: str) -> str:
    """Extract raw text from DOCX using python-docx."""
    if not DOCX_AVAILABLE:
        raise RuntimeError("python-docx is not installed.")
    doc        = DocxDocument(file_path)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def _image_to_base64(file_path: str) -> tuple[str, str]:
    """Convert image file to (base64_string, media_type)."""
    ext        = Path(file_path).suffix.lower()
    media_type = MEDIA_TYPE_MAP.get(ext, "image/jpeg")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return b64, media_type


def _ai_extract_from_text(
    raw_text:         str,
    hint:             Optional[str] = None,
    applicant_name:   Optional[str] = None,
) -> dict:
    """Send raw text to OpenRouter for structured extraction."""
    user_msg = f"Extract information from this document text:\n\n{raw_text}"
    if hint:
        user_msg = f"This appears to be a {hint}.\n\n" + user_msg
    if applicant_name:
        user_msg += f"\n\nThe applicant's name is: {applicant_name}"

    result = chat_completion_json(
        messages=[{"role": "user", "content": user_msg}],
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        temperature=0.1,
        max_tokens=2048,
    )
    return result


def _local_parse_text(raw_text: str) -> dict:
    """Basic rule-based parsing for resumes/diplomas to extract skills, education, certifications.
    This is intentionally simple but works reasonably for common CV formats and headings.
    Returns a dict similar to the AI output with keys: skills (list), education (list of dicts), certifications (list).
    """
    out = {}
    txt = raw_text or ""
    if not txt.strip():
        return out

    import re

    # Normalize
    norm = re.sub(r"\r\n", "\n", txt)

    # Skills: look for a 'skills' heading
    skills = []
    m = re.search(r"(?im)^\s*skills?\s*[:\-]?\s*(.+)$", norm)
    if m:
        # capture rest of line; if many skills separated by commas or newlines
        rest = m.group(1)
        # if rest short, try capture following lines until blank line
        if len(rest) < 40:
            after = norm[m.end():]
            block = rest + "\n" + "\n".join(after.splitlines()[:6])
        else:
            block = rest
        parts = re.split(r"[,;\n\|\\/]+", block)
        skills = [p.strip() for p in parts if len(p.strip()) > 1]

    # Certifications
    certs = []
    m2 = re.search(r"(?im)certificat(?:e|ions)[:\-]?\s*(.+)$", norm)
    if m2:
        block = m2.group(1)
        parts = re.split(r"[,;\n\|]+", block)
        certs = [p.strip() for p in parts if p.strip()]

    # Education: find 'education' heading and parse following lines
    education = []
    em = re.search(r"(?im)^\s*education\s*$", norm)
    if em:
        after = norm[em.end():]
        lines = [l.strip() for l in after.splitlines() if l.strip()][:8]
        for ln in lines:
            # try to find degree and year
            year = None
            y = re.search(r"(19|20)\d{2}", ln)
            if y:
                year = y.group(0)
            deg = None
            # Prioritise more-specific degree strings (e.g. 'Advanced Diploma')
            for d in ["Advanced Diploma", "Bachelor", "BSc", "BA", "Master", "MSc", "MBA", "PhD", "Doctor", "Diploma", "HND", "Certificate"]:
                if re.search(re.escape(d), ln, re.I):
                    deg = d
                    break
            # attempt to capture field after 'in'
            field = None
            mfield = re.search(r" in ([A-Za-z &+-]{2,40})", ln)
            if mfield:
                field = mfield.group(1).strip()
            if deg or field or year:
                education.append({"degree": deg or "", "field": field or "", "year": year or "", "raw": ln})

    if skills:
        out["skills"] = skills
    if certs:
        out["certifications"] = certs
    if education:
        out["education"] = education

    return out


def _ai_extract_from_image(
    file_path:       str,
    hint:            Optional[str] = None,
    applicant_name:  Optional[str] = None,
) -> dict:
    """
    Send image directly to OpenRouter vision model for extraction.
    Used as fallback when OCR quality is poor (e.g. Rwandan IDs).
    FIX-EXT-2: system prompt now passed; FIX-EXT-1: safe JSON parsing.
    """
    b64, media_type = _image_to_base64(file_path)

    prompt = "Extract all information from this document and return a JSON object as instructed."
    if hint:
        prompt = f"This document appears to be a {hint}. " + prompt
    if applicant_name:
        prompt += f" The applicant's name is: {applicant_name}."

    raw = vision_completion(
        image_base64=b64,
        media_type=media_type,
        prompt=prompt,
        max_tokens=1024,
    )

    # FIX-EXT-1: use safe parser
    return _parse_json_response(raw)


def _render_pdf_page_to_base64(file_path: str) -> tuple[str, str] | tuple[None, None]:
    """Render first PDF page to PNG via PyMuPDF, return (base64, media_type)."""
    try:
        import fitz
        doc = fitz.open(file_path)
        if not doc:
            return None, None
        mat = fitz.Matrix(2.0, 2.0)
        pix = doc[0].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("png")
        doc.close()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        return b64, "image/png"
    except Exception as exc:
        logger.warning("_render_pdf_page_to_base64 failed: %s", exc)
        return None, None


# -- Public API ----------------------------------------------------------------

def extract_document(
    file_path:            str,
    document_type_hint:   Optional[str] = None,
    force_vision:         bool = False,
    applicant_name:       Optional[str] = None,   # FIX-EXT-4
) -> dict:
    """
    Main extraction function. Auto-detects file type and extracts structured data.

    Args:
        file_path:            Absolute or relative path to the uploaded file.
        document_type_hint:   Optional hint ("cv", "national_id", "diploma", etc.)
        force_vision:         If True, always use vision model for images (skip OCR).
        applicant_name:       Optional name hint passed to AI for better name extraction.

    Returns:
        dict with extracted fields + metadata including raw_text (FIX-EXT-3).
    """
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}", "document_type": "unknown"}

    ext       = path.suffix.lower()
    file_name = path.name
    result: dict            = {}
    extraction_method: str  = "unknown"
    raw_text_captured: str  = ""

    try:
        # -- PDF --------------------------------------------------------------
        if ext in SUPPORTED_PDF_TYPES:
            raw_text = ""

            # Layer 1: pdfplumber
            if PDF_AVAILABLE:
                try:
                    raw_text = _extract_text_from_pdf(file_path)
                    raw_text_captured = raw_text
                except Exception as e:
                    logger.warning("pdfplumber failed for %s: %s", file_name, e)

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
                        raw_text_captured = raw_text
                except Exception:
                    pass

            if len(raw_text.strip()) >= 30:
                # Try local parsing first
                local = _local_parse_text(raw_text)
                if local:
                    result = local
                    result["raw_text"] = raw_text
                    extraction_method = "pdfplumber+local"
                elif AI_ENABLED:
                    result = _ai_extract_from_text(raw_text, hint=document_type_hint,
                                                   applicant_name=applicant_name)
                    extraction_method = "pdfplumber+ai"
                else:
                    # No AI available and local parse empty: return raw_text only
                    result = {"document_type": document_type_hint or "unknown", "raw_text": raw_text}
                    extraction_method = "pdfplumber_raw"

            elif raw_text.strip():
                local = _local_parse_text(raw_text)
                if local:
                    result = local
                    result["raw_text"] = raw_text
                    extraction_method = "pdfplumber_sparse+local"
                elif AI_ENABLED:
                    result = _ai_extract_from_text(raw_text, hint=document_type_hint,
                                                   applicant_name=applicant_name)
                    extraction_method = "pdfplumber_sparse+ai"
                else:
                    result = {"document_type": document_type_hint or "unknown", "raw_text": raw_text}
                    extraction_method = "pdfplumber_sparse_raw"

            else:
                # Scanned PDF -- render to image and send to vision AI
                logger.info("PDF has no extractable text: %s -- trying vision AI or local render+OCR", file_name)
                b64, media_type = _render_pdf_page_to_base64(file_path)
                if b64:
                        # If AI is enabled, prefer vision model
                        if AI_ENABLED:
                            prompt = (
                                "Extract all information from this document and return a JSON object as instructed."
                            )
                            if document_type_hint:
                                prompt = f"This document appears to be a {document_type_hint}. " + prompt
                            if applicant_name:
                                prompt += f" The applicant's name is: {applicant_name}."
                            raw = vision_completion(
                                image_base64=b64,
                                media_type=media_type,
                                prompt=prompt,
                                max_tokens=1024,
                            )
                            result = _parse_json_response(raw)   # FIX-EXT-1
                            extraction_method = "pymupdf_vision"
                        else:
                            # Local render -> OCR via pytesseract if available
                            try:
                                import fitz
                                from PIL import Image
                                pix = fitz.open(file_path)[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), colorspace=fitz.csRGB)
                                img_bytes = pix.tobytes("png")
                                img = Image.open(io.BytesIO(img_bytes))
                                if OCR_AVAILABLE:
                                    ocr_text = pytesseract.image_to_string(img, lang="eng+fra")
                                    local = _local_parse_text(ocr_text)
                                    if local:
                                        result = local
                                        result["raw_text"] = ocr_text
                                        extraction_method = "pymupdf_local_ocr"
                                    else:
                                        result = {"document_type": document_type_hint or "unknown", "raw_text": ocr_text}
                                        extraction_method = "pymupdf_local_ocr_raw"
                                else:
                                    result = {"document_type": document_type_hint or "unknown", "raw_text": "", "error": "No local OCR available"}
                                    extraction_method = "pymupdf_failed_no_ocr"
                            except Exception as ve2:
                                logger.warning("Local render+OCR failed for %s: %s", file_name, ve2)
                                result = {
                                    "document_type": document_type_hint or "unknown",
                                    "raw_text": "",
                                    "error": "PDF has no extractable text. Local render failed.",
                                }
                                extraction_method = "failed"
                else:
                    result = {
                        "document_type": document_type_hint or "unknown",
                        "raw_text": "",
                        "error": "PDF has no extractable text and could not be rendered.",
                    }
                    extraction_method = "failed"

        # -- Images (ID cards, scanned docs) ----------------------------------
        elif ext in SUPPORTED_IMAGE_TYPES:
            if force_vision or not OCR_AVAILABLE:
                result = _ai_extract_from_image(file_path, hint=document_type_hint,
                                                applicant_name=applicant_name)
                extraction_method = "vision"
            else:
                try:
                    ocr_text = _extract_text_from_image_ocr(file_path)
                    raw_text_captured = ocr_text
                except Exception as e:
                    logger.warning("OCR failed for %s: %s", file_name, e)
                    ocr_text = ""

                if len(ocr_text.strip()) > 30:
                    local = _local_parse_text(ocr_text)
                    if local:
                        result = local
                        result["raw_text"] = ocr_text
                        extraction_method = "ocr+local"
                    elif AI_ENABLED:
                        result = _ai_extract_from_text(ocr_text, hint=document_type_hint,
                                                       applicant_name=applicant_name)
                        extraction_method = "ocr+ai"
                    else:
                        result = {"document_type": document_type_hint or "unknown", "raw_text": ocr_text}
                        extraction_method = "ocr_raw"
                else:
                    # Poor OCR quality -> fall back to vision or local render
                    logger.info("Low OCR confidence for %s, falling back to vision/local", file_name)
                    if AI_ENABLED:
                        result = _ai_extract_from_image(file_path, hint=document_type_hint,
                                                        applicant_name=applicant_name)
                        extraction_method = "vision_fallback"
                    else:
                        # Try local vision OCR (same as render path)
                        try:
                            import fitz
                            from PIL import Image
                            pix = fitz.open(file_path)[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), colorspace=fitz.csRGB)
                            img_bytes = pix.tobytes("png")
                            img = Image.open(io.BytesIO(img_bytes))
                            if OCR_AVAILABLE:
                                ocr_text2 = pytesseract.image_to_string(img, lang="eng+fra")
                                local2 = _local_parse_text(ocr_text2)
                                if local2:
                                    result = local2
                                    result["raw_text"] = ocr_text2
                                    extraction_method = "vision_local_ocr"
                                else:
                                    result = {"document_type": document_type_hint or "unknown", "raw_text": ocr_text2}
                                    extraction_method = "vision_local_ocr_raw"
                            else:
                                result = {"document_type": document_type_hint or "unknown", "raw_text": "", "error": "No local OCR available"}
                                extraction_method = "vision_failed_no_ocr"
                        except Exception:
                            result = {"document_type": document_type_hint or "unknown", "raw_text": "", "error": "Vision/local OCR failed"}
                            extraction_method = "vision_failed"

        # -- DOCX -------------------------------------------------------------
        elif ext in SUPPORTED_DOCX_TYPES:
            if DOCX_AVAILABLE:
                raw_text = _extract_text_from_docx(file_path)
                raw_text_captured = raw_text
                result = _ai_extract_from_text(raw_text, hint=document_type_hint,
                                               applicant_name=applicant_name)
                extraction_method = "docx+ai"
            else:
                result = {"error": "python-docx not available", "document_type": "unknown"}

        else:
            result = {"error": f"Unsupported file type: {ext}", "document_type": "unknown"}

    except OpenRouterError as e:
        logger.error("OpenRouter error during extraction of %s: %s", file_name, e)
        result = {"error": str(e), "document_type": "unknown"}
    except Exception as e:
        logger.error("Unexpected error extracting %s: %s", file_name, e)
        result = {"error": str(e), "document_type": "unknown"}

    # FIX-EXT-3: Always ensure raw_text is present so downstream verification
    # (document_verifier.py) can do name-matching without re-running OCR.
    if "raw_text" not in result or not result.get("raw_text"):
        result["raw_text"] = raw_text_captured

    # Attach metadata
    result["file_name"]          = file_name
    result["extraction_method"]  = extraction_method
    if "document_type" not in result:
        result["document_type"] = document_type_hint or "unknown"

    return result


def extract_multiple_documents(
    documents: list[dict],
    applicant_name: Optional[str] = None,
) -> dict:
    """
    Extract text from multiple candidate documents and merge into one profile.

    Args:
        documents:      List of {"file_path": str, "document_type_hint": str}
        applicant_name: The candidate's name (passed to AI for better extraction).

    Returns:
        {
            "candidate_name": str | None,
            "documents": [extracted_doc, ...],
            "merged_profile": { cv fields + id fields + ... }
        }
    """
    extracted = []
    merged    = {}

    for doc in documents:
        result = extract_document(
            file_path=doc["file_path"],
            document_type_hint=doc.get("document_type_hint"),
            applicant_name=applicant_name,
        )
        extracted.append(result)

        # Merge non-error, non-metadata fields into profile
        for key, value in result.items():
            if key in ("file_name", "extraction_method", "error"):
                continue
            if key not in merged and value:
                merged[key] = value

    candidate_name = merged.get("full_name") or applicant_name

    return {
        "candidate_name":  candidate_name,
        "documents":       extracted,
        "merged_profile":  merged,
    }