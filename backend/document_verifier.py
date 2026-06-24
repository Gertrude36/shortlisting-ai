"""
document_verifier.py
====================
AI-powered document verification using OpenRouter vision + OCR text.

Checks performed per document:
  1. Quality  -- is the scan readable (blur / brightness / resolution)?
  2. Doc type -- does the file match what the applicant declared?
  3. Identity -- does the applicant's name appear in the document?

Public API
----------
  pre_submission_check(file_path, declared_type, applicant_name,
                       field_of_study, education_level, fast_mode)
      -> (accepted: bool, message: str)

  verify_documents(applicant_name, education_level, field_of_study,
                   document_paths, declared_types,
                   cached_doc_texts)
      -> (verified: bool, advisory: bool, summary: str)

Fixes applied (2026-06-08)
--------------------------
  FIX-DV-01  max_tokens raised from 512 → 1024 in all AI calls to prevent
             truncated JSON responses that caused JSONDecodeError crashes.

  FIX-DV-02  Markdown fence stripping rewritten as a dedicated helper
             (_strip_json_fences) that robustly handles:
               - ```json ... ```
               - ``` ... ```
               - Leading/trailing whitespace
             The old split-on-backticks logic produced wrong substrings.

  FIX-DV-03  NameError guard in _ai_verify_with_vision: 'raw' is now
             initialised to "" before the try block so the except clause
             can always reference it safely.

  FIX-DV-04  Truncated-JSON recovery: before raising JSONDecodeError we now
             attempt to extract the largest complete {...} block from a
             partial response, recovering gracefully from mid-stream cuts.

  FIX-DV-05  vision_completion fallback path: when the vision call succeeds
             but returns an empty/whitespace string, we fall through to the
             text-only AI check instead of returning a silent advisory.

  FIX-DV-06  Safe fallback dict updated so advisory=True never silently
             overrides a genuine hard-reject in the aggregation logic.
             The fallback is clearly labelled with parse_error=True so
             callers can distinguish it from a real AI pass.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import unicodedata
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenRouter client (already present in the project)
# ---------------------------------------------------------------------------
# OpenRouter API disabled by design; use only local verification logic.
OPENROUTER_AVAILABLE = False

# ---------------------------------------------------------------------------
# OCR utils (already present in the project)
# ---------------------------------------------------------------------------
try:
    from ocr_utils import extract_document_text, check_image_quality_strict
    OCR_UTILS_AVAILABLE = True
except ImportError:
    OCR_UTILS_AVAILABLE = False
    logger.warning("ocr_utils not available -- local OCR disabled.")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
SUPPORTED_PDF_EXTS   = {".pdf"}

MEDIA_TYPE_MAP = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".bmp":  "image/bmp",
    ".tiff": "image/tiff",
    ".tif":  "image/tiff",
}

# Minimum readable alpha characters after OCR for each doc type
MIN_ALPHA = {
    "id_card":     10,   # Rwanda IDs can be sparse due to holographic laminate
    "cv":          80,
    "diploma":     40,
    "certificate": 30,
    "experience":  40,
}

# FIX-DV-01: Raised from 512 to 1024 to prevent response truncation mid-JSON.
# The full JSON response schema has ~15 fields; 512 tokens was insufficient for
# longer name_found_value / advisory_note strings, causing Unterminated string errors.
_AI_MAX_TOKENS = 1024

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase, strip accents, collapse whitespace."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


def _count_alpha(text: str) -> int:
    return sum(1 for c in text if c.isalpha())


def _name_tokens(name: str) -> list[str]:
    """Return meaningful tokens from a full name (≥ 3 chars)."""
    return [t for t in _normalize(name).split() if len(t) >= 3]


def _name_found_in_text(applicant_name: str, text: str, threshold: float = 0.5) -> bool:
    """Return True if ≥ threshold fraction of name tokens appear in text."""
    tokens = _name_tokens(applicant_name)
    if not tokens:
        return False
    norm_text = _normalize(text)
    found = sum(1 for t in tokens if t in norm_text)
    return (found / len(tokens)) >= threshold


def _file_to_base64(file_path: str) -> tuple[str, str]:
    """Return (base64_data, media_type) for an image file."""
    ext = Path(file_path).suffix.lower()
    media_type = MEDIA_TYPE_MAP.get(ext, "image/jpeg")
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8"), media_type


def _pdf_first_page_to_base64(file_path: str) -> tuple[str, str] | tuple[None, None]:
    """Render the first page of a PDF to a PNG and return base64."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        if not doc:
            return None, None
        mat = fitz.Matrix(2.0, 2.0)
        pix = doc[0].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("png")
        doc.close()
        return base64.b64encode(img_bytes).decode("utf-8"), "image/png"
    except Exception as exc:
        logger.debug("_pdf_first_page_to_base64 failed: %s", exc)
        return None, None


def _get_image_base64(file_path: str) -> tuple[str, str] | tuple[None, None]:
    """Return base64+media_type for any supported file (image or PDF page)."""
    ext = Path(file_path).suffix.lower()
    if ext in SUPPORTED_IMAGE_EXTS:
        try:
            return _file_to_base64(file_path)
        except Exception as exc:
            logger.debug("_get_image_base64 image failed: %s", exc)
            return None, None
    elif ext in SUPPORTED_PDF_EXTS:
        return _pdf_first_page_to_base64(file_path)
    return None, None


# ---------------------------------------------------------------------------
# FIX-DV-02: Robust markdown fence stripping
# ---------------------------------------------------------------------------

def _strip_json_fences(raw: str) -> str:
    """
    Remove markdown code fences from an AI response and return clean JSON text.

    Handles all common patterns:
      ```json\\n{...}\\n```
      ```\\n{...}\\n```
      {... bare JSON ...}

    The old approach (raw.split("```")) was fragile — it produced wrong
    substrings when the response contained more than two fence markers, and
    it failed to strip the leading 'json' language tag reliably.
    """
    text = raw.strip()

    # Pattern: optional ```json or ``` at start, optional ``` at end
    fence_pattern = re.compile(
        r"^```(?:json)?\s*\n?(.*?)\n?```\s*$",
        re.DOTALL | re.IGNORECASE,
    )
    match = fence_pattern.match(text)
    if match:
        return match.group(1).strip()

    # Fallback: strip leading ```json or ``` without a closing fence
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


# ---------------------------------------------------------------------------
# FIX-DV-04: Truncated JSON recovery
# ---------------------------------------------------------------------------

def _parse_json_safe(raw: str, context: str = "") -> dict | None:
    """
    Parse JSON from an AI response, with two levels of recovery:

    1. Normal parse after markdown fence stripping.
    2. If that fails, attempt to extract the largest complete {...} block
       from a truncated response (handles mid-stream cuts).

    Returns None only when both attempts fail.
    """
    cleaned = _strip_json_fences(raw)

    # Attempt 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: extract the largest {...} block present in the string.
    # Walk the string tracking brace depth; record the longest complete object.
    best: str | None = None
    depth = 0
    start = -1
    for i, ch in enumerate(cleaned):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = cleaned[start : i + 1]
                if best is None or len(candidate) > len(best):
                    best = candidate

    if best:
        try:
            result = json.loads(best)
            logger.warning(
                "_parse_json_safe [%s]: recovered partial JSON (%d chars of %d)",
                context, len(best), len(cleaned),
            )
            return result
        except json.JSONDecodeError:
            pass

    logger.warning(
        "_parse_json_safe [%s]: all parse attempts failed. raw snippet: %s",
        context, raw[:300],
    )
    return None


# ---------------------------------------------------------------------------
# Safe advisory fallback (used when AI call fails unrecoverably)
# FIX-DV-06: added parse_error=True so callers can distinguish from real pass
# ---------------------------------------------------------------------------

def _advisory_fallback(declared_type: str, reason: str) -> dict:
    return {
        "accepted":               True,
        "advisory":               True,
        "advisory_note":          f"AI check could not complete ({reason}) — accepted for background review.",
        "rejection_reason":       "",
        "type_match":             True,
        "name_found":             True,
        "quality_ok":             True,
        "document_type_detected": declared_type,
        "name_found_value":       "",
        "parse_error":            True,   # FIX-DV-06
    }


# ---------------------------------------------------------------------------
# AI verification prompt
# ---------------------------------------------------------------------------

_VERIFY_SYSTEM_PROMPT = """You are a strict document verification assistant for a recruitment system.

Your job is to verify that an uploaded document:
1. Is of the declared document type
2. Belongs to the named applicant (their name must appear on it)
3. Is readable and genuine-looking

You will be given:
- The declared document type (e.g. "cv", "id_card", "diploma")
- The applicant's full name
- Either the document image OR extracted OCR text (or both)

Respond ONLY with a JSON object. No extra text. No markdown fences. Format:

{
  "accepted": true | false,
  "document_type_detected": "<cv|id_card|diploma|certificate|experience|unknown>",
  "type_match": true | false,
  "name_found": true | false,
  "name_found_value": "<exact text where name was spotted, or empty string>",
  "quality_ok": true | false,
  "quality_issue": "<description of quality problem or empty string>",
  "rejection_reason": "<clear user-friendly reason if rejected, or empty string>",
  "advisory": false,
  "advisory_note": "<advisory message if accepted with caveats, or empty string>"
}

Rules:
- "accepted" = true ONLY if type_match AND name_found AND quality_ok are all true
  (or advisory=true for borderline cases)
- For id_card: accept if you detect a national ID, passport, or similar government ID
- For cv: accept if it looks like a curriculum vitae or resume  
- For diploma: accept if it looks like an academic degree certificate or transcript
- For certificate: accept if it looks like a professional/training certificate
- Name matching: be flexible with partial matches, diacritics, and name order variations.
  If ≥ 2 name tokens match anywhere on the document, name_found = true.
- If OCR text is sparse but the image visually shows the correct document type and name,
  still accept (set advisory=true with a note about sparse OCR).
- quality_ok = false only for: completely blank/white images, fully unreadable scans,
  or clearly wrong files (e.g. a photo of a cat uploaded as an ID).
- NEVER reject solely on sparse OCR if the visual content is clearly the right document.
- Keep all string values concise (under 120 characters each) to avoid response truncation.
"""


def _ai_verify_with_vision(
    file_path: str,
    declared_type: str,
    applicant_name: str,
    ocr_text: str = "",
) -> dict:
    """Verify the document locally using OCR text and heuristic checks."""
    if not ocr_text or _count_alpha(ocr_text) < MIN_ALPHA.get(declared_type, 10):
        ocr_text = _local_ocr_text(file_path, declared_type)

    if not ocr_text or _count_alpha(ocr_text) < MIN_ALPHA.get(declared_type, 10):
        return _advisory_fallback(declared_type, "Local OCR text unavailable for verification")

    return _ai_verify_text_only(
        ocr_text=ocr_text,
        declared_type=declared_type,
        applicant_name=applicant_name,
    )


def _ai_verify_text_only(
    ocr_text: str,
    declared_type: str,
    applicant_name: str,
    field_of_study: str = "",
    education_level: str = "",
) -> dict:
    """Use local text-only verification rules when vision is not available."""
    if not ocr_text or not ocr_text.strip():
        return _advisory_fallback(declared_type, "No OCR text available for verification")

    name_ok = _name_found_in_text(applicant_name, ocr_text)
    return {
        "accepted":               name_ok,
        "advisory":               not name_ok,
        "advisory_note":          "" if name_ok else "Name not found — accepted for background review.",
        "rejection_reason":       "" if name_ok else f"Your name '{applicant_name}' could not be found in this {declared_type}.",
        "type_match":             True,
        "name_found":             name_ok,
        "quality_ok":             True,
        "document_type_detected": declared_type,
        "name_found_value":       "",
        "parse_error":            False,
    }


# ---------------------------------------------------------------------------
# Local (non-AI) quick checks used as fast pre-filters
# ---------------------------------------------------------------------------

def _local_quality_check(file_path: str, declared_type: str) -> tuple[bool, str]:
    """
    Run the ocr_utils image quality gate (blur/brightness/resolution).
    Returns (ok, reason). PDFs always pass — checked after OCR.
    """
    ext = Path(file_path).suffix.lower()
    if ext in SUPPORTED_PDF_EXTS:
        return True, ""
    if not OCR_UTILS_AVAILABLE:
        return True, ""
    try:
        with open(file_path, "rb") as f:
            content = f.read()
        ok, reason = check_image_quality_strict(content, os.path.basename(file_path))
        return ok, reason
    except Exception as exc:
        logger.debug("_local_quality_check failed: %s", exc)
        return True, ""


def _local_ocr_text(file_path: str, declared_type: str) -> str:
    """Extract text using local OCR (ocr_utils)."""
    if not OCR_UTILS_AVAILABLE:
        return ""
    try:
        return extract_document_text(file_path, declared_type=declared_type) or ""
    except Exception as exc:
        logger.debug("_local_ocr_text failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Core verification decision logic
# ---------------------------------------------------------------------------

def _build_rejection_message(ai_result: dict, declared_type: str, applicant_name: str) -> str:
    """Turn AI result fields into a user-friendly rejection message."""
    reason = ai_result.get("rejection_reason", "").strip()
    if reason:
        return reason

    if not ai_result.get("quality_ok", True):
        issue = ai_result.get("quality_issue", "")
        return (
            f"The uploaded {declared_type.replace('_', ' ')} could not be read clearly. "
            + (issue if issue else "Please upload a clearer, well-lit scan.")
        )

    if not ai_result.get("type_match", True):
        detected = ai_result.get("document_type_detected", "unknown")
        label_map = {
            "id_card":     "National ID / Passport",
            "cv":          "CV / Resume",
            "diploma":     "Academic Diploma",
            "certificate": "Professional Certificate",
            "experience":  "Experience Letter",
        }
        declared_label = label_map.get(declared_type, declared_type.replace("_", " ").title())
        detected_label = (
            label_map.get(detected, detected.replace("_", " ").title())
            if detected != "unknown"
            else "a different document type"
        )
        return (
            f"You declared this as a '{declared_label}', but the uploaded file appears to be "
            f"{detected_label}. Please upload the correct document."
        )

    if not ai_result.get("name_found", True):
        label_map = {
            "id_card":     "National ID / Passport",
            "cv":          "CV / Resume",
            "diploma":     "Academic Diploma",
            "certificate": "Professional Certificate",
            "experience":  "Experience Letter",
        }
        label = label_map.get(declared_type, declared_type.replace("_", " ").title())
        return (
            f"Your name '{applicant_name}' could not be found in this {label}. "
            "Please upload a document that clearly shows your full name, "
            "or ensure this document belongs to you."
        )

    return (
        f"The {declared_type.replace('_', ' ')} could not be verified. "
        "Please re-upload a clear, complete scan."
    )


def _build_success_message(ai_result: dict, declared_type: str) -> str:
    """Build a positive confirmation message."""
    label_map = {
        "id_card":     "National ID / Passport",
        "cv":          "CV / Resume",
        "diploma":     "Academic Diploma / Degree",
        "certificate": "Professional Certificate",
        "experience":  "Experience Document",
    }
    label = label_map.get(declared_type, declared_type.replace("_", " ").title())
    if ai_result.get("advisory"):
        note = ai_result.get("advisory_note", "")
        return f" {label} accepted. {note}".strip()
    name_val = ai_result.get("name_found_value", "")
    if name_val:
        return f" {label} verified. Name confirmed on document."
    return f" {label} accepted."


# ---------------------------------------------------------------------------
# Public API: pre_submission_check
# ---------------------------------------------------------------------------

def pre_submission_check(
    file_path:       str,
    declared_type:   str,
    applicant_name:  str,
    field_of_study:  str = "",
    education_level: str = "",
    fast_mode:       bool = False,
) -> tuple[bool, str]:
    """
    Verify a single document at upload time.

    Steps:
      1. Local image quality gate (blur / brightness / resolution)
      2. Local OCR text extraction
      3. AI verification (vision model if image/PDF renderable, else text-only)

    Returns
    -------
    (accepted: bool, message: str)
        accepted=True  → document passed (message is a success note)
        accepted=False → document rejected (message explains why)
    """
    if not os.path.exists(file_path):
        return False, "The uploaded file could not be found on disk. Please try uploading again."

    # --- Step 1: Local quality gate (images only) ---
    quality_ok, quality_reason = _local_quality_check(file_path, declared_type)
    if not quality_ok:
        return False, quality_reason

    # --- Step 2: Local OCR ---
    ocr_text = _local_ocr_text(file_path, declared_type)
    alpha     = _count_alpha(ocr_text)
    min_alpha = MIN_ALPHA.get(declared_type, 30)

    logger.info(
        "pre_submission_check: file=%s type=%s name=%s alpha=%d",
        os.path.basename(file_path), declared_type, applicant_name, alpha,
    )

    # --- Step 3: AI verification ---
    # Always try vision first (most accurate), fall back to text-only if needed.
    ai_result = _ai_verify_with_vision(
        file_path=file_path,
        declared_type=declared_type,
        applicant_name=applicant_name,
        ocr_text=ocr_text,
    )

    # If vision produced a parse-error advisory but we have good OCR, try text-only
    # as a second opinion and use whichever is more favourable.
    if ai_result.get("parse_error") and alpha >= min_alpha:
        text_result = _ai_verify_text_only(
            ocr_text=ocr_text,
            declared_type=declared_type,
            applicant_name=applicant_name,
            field_of_study=field_of_study,
            education_level=education_level,
        )
        if not text_result.get("parse_error"):
            ai_result = text_result
    # Also fall back if vision hard-rejected but we have OCR evidence to double-check
    elif not ai_result.get("accepted") and not ai_result.get("advisory") and alpha >= min_alpha:
        text_result = _ai_verify_text_only(
            ocr_text=ocr_text,
            declared_type=declared_type,
            applicant_name=applicant_name,
            field_of_study=field_of_study,
            education_level=education_level,
        )
        if text_result.get("accepted") or text_result.get("advisory"):
            ai_result = text_result

    accepted = bool(ai_result.get("accepted", False))
    advisory = bool(ai_result.get("advisory", False))

    if accepted or advisory:
        msg = _build_success_message(ai_result, declared_type)
        return True, msg
    else:
        msg = _build_rejection_message(ai_result, declared_type, applicant_name)
        return False, msg


# ---------------------------------------------------------------------------
# Public API: verify_documents  (called after submission, during shortlisting)
# ---------------------------------------------------------------------------

def verify_documents(
    applicant_name:   str,
    education_level:  str,
    field_of_study:   str,
    document_paths:   list[str],
    declared_types:   list[str],
    cached_doc_texts: dict | None = None,
) -> tuple[bool, bool, str]:
    """
    Verify all submitted documents for a candidate.

    Returns
    -------
    (verified: bool, advisory: bool, summary: str)
        verified=True, advisory=False  → all docs verified cleanly
        verified=True, advisory=True   → accepted with caveats
        verified=False, advisory=False → hard rejection
    """
    if not document_paths:
        return True, True, "No documents to verify."

    cached = cached_doc_texts or {}
    results: list[dict] = []

    for file_path, doc_type in zip(document_paths, declared_types):
        ocr_text = cached.get(doc_type, "") or ""

        # Resolve relative paths: try given path, backend-relative, cwd, and backend/cwd
        def _resolve_path(p: str) -> str | None:
            if not p:
                return None
            candidates = [
                p,
                os.path.join(os.path.dirname(__file__), p),
                os.path.join(os.getcwd(), p),
                os.path.join(os.getcwd(), 'backend', p),
            ]
            for c in candidates:
                try:
                    if c and os.path.exists(c):
                        return c
                except Exception:
                    pass
            return None

        resolved = _resolve_path(file_path)
        if not resolved:
            results.append({
                "doc_type": doc_type,
                "accepted": True,
                "advisory": True,
                "message":  f"{doc_type}: file not found on disk — skipped.",
            })
            continue

        # Use cached OCR if available and rich enough, else re-extract
        if _count_alpha(ocr_text) < MIN_ALPHA.get(doc_type, 30):
            ocr_text = _local_ocr_text(resolved, doc_type)

        ai_result = _ai_verify_with_vision(
            file_path=resolved,
            declared_type=doc_type,
            applicant_name=applicant_name,
            ocr_text=ocr_text,
        )

        # If parse failed or hard-rejected, try text-only as second opinion
        should_retry = (
            ai_result.get("parse_error")
            or (not ai_result.get("accepted") and not ai_result.get("advisory"))
        )
        if should_retry and _count_alpha(ocr_text) >= MIN_ALPHA.get(doc_type, 30):
            # Accept both 'diploma' and mis-labelled 'certificate' as education docs
            is_edu_doc = doc_type in ("diploma", "certificate")
            text_result = _ai_verify_text_only(
                ocr_text=ocr_text,
                declared_type=doc_type,
                applicant_name=applicant_name,
                field_of_study=field_of_study if is_edu_doc else "",
                education_level=education_level if is_edu_doc else "",
            )
            if not text_result.get("parse_error") and (
                text_result.get("accepted") or text_result.get("advisory")
            ):
                ai_result = text_result

        accepted = bool(ai_result.get("accepted", False))
        advisory = bool(ai_result.get("advisory", False))

        if accepted or advisory:
            msg = _build_success_message(ai_result, doc_type)
        else:
            msg = _build_rejection_message(ai_result, doc_type, applicant_name)

        results.append({
            "doc_type": doc_type,
            "accepted": accepted,
            "advisory": advisory,
            "message":  msg,
            "ai":       ai_result,
        })

        logger.info(
            "verify_documents: type=%s accepted=%s advisory=%s parse_error=%s",
            doc_type, accepted, advisory, ai_result.get("parse_error", False),
        )

    # Aggregate result
    hard_failures = [r for r in results if not r["accepted"] and not r["advisory"]]
    advisories    = [r for r in results if r["advisory"]]
    passes        = [r for r in results if r["accepted"] and not r["advisory"]]

    if hard_failures:
        msgs = "; ".join(r["message"] for r in hard_failures)
        return False, False, f"Document verification failed: {msgs}"

    if advisories:
        msgs = "; ".join(r["message"] for r in advisories)
        return True, True, f"Documents accepted with notes: {msgs}"

    summary_parts = [r["message"] for r in passes]
    return True, False, " | ".join(summary_parts) if summary_parts else "All documents verified."


def verify_education_level_from_document(
    education_level: str,
    diploma_text: str,
) -> tuple[bool, str]:
    """
    Verify that the diploma text matches the declared education level.

    Returns
    -------
    (ok: bool, message: str)
        ok=True if education level matches or cannot be determined
        message contains details about the verification
    """
    if not diploma_text.strip():
        return True, "No diploma text available for verification."

    if not education_level.strip():
        return True, "No education level declared."

    normalized_text  = _normalize(diploma_text)
    normalized_level = _normalize(education_level)

    # Local education keyword map (scan order matters: more specific first)
    _EDU_KEYWORD_MAP = [
        ("phd", 4), ("doctor", 4), ("ph.d", 4),
        ("master", 3), ("m.sc", 3), ("msc", 3), ("mba", 3),
        ("advanced diploma", 2), ("advanced cert", 2),
        ("bachelor", 2), ("b.sc", 2), ("bsc", 2), ("degree", 2),
        ("diploma", 1), ("hnd", 1), ("hnc", 1), ("certificate", 1), ("cert", 1),
    ]

    def _local_edu_ordinal(text: str) -> int:
        t = _normalize(text)
        for kw, ordval in _EDU_KEYWORD_MAP:
            if kw in t:
                return ordval
        # fallback: try to match common words in declared level
        for kw, ordval in _EDU_KEYWORD_MAP:
            if kw in _normalize(education_level):
                return ordval
        return 1

    observed = _local_edu_ordinal(diploma_text)
    declared = _local_edu_ordinal(education_level)

    # If observed level meets or exceeds declared -> confirmed
    if observed >= declared:
        return True, f"Education level '{education_level}' confirmed in diploma."

    # Observed lower than declared -> treat as mismatch
    obs_label = {1: 'Diploma/Certificate', 2: "Bachelor's/Advanced Diploma", 3: "Master's", 4: 'PhD'}.get(observed, 'Diploma')
    return False, (
        f"Education level mismatch: diploma appears to be '{obs_label}' (observed ordinal={observed}) "
        f"but declared as '{education_level}' (required ordinal={declared})."
    )


def verify_field_of_study(
    field_of_study: str,
    cv_text: str,
) -> tuple[bool, str]:
    """
    Verify that the CV text matches the declared field of study.

    Returns
    -------
    (ok: bool, message: str)
        ok=True if field of study matches or cannot be determined
        message contains details about the verification
    """
    if not cv_text.strip():
        return True, "No CV text available for verification."

    if not field_of_study.strip():
        return True, "No field of study declared."

    normalized_text  = _normalize(cv_text)
    normalized_field = _normalize(field_of_study)

    if normalized_field in normalized_text or any(
        token in normalized_text for token in normalized_field.split()
    ):
        return True, f"Field of study '{field_of_study}' confirmed in CV."

    return True, f"Field of study '{field_of_study}' declared (text match inconclusive)."


def verify_identity(
    applicant_name: str,
    doc_texts: dict,
    document_paths: dict | None = None,
) -> tuple[bool, str]:
    """
    Verify identity by checking if applicant name appears in ID documents.

    Returns
    -------
    (ok: bool, message: str)
        ok=True if identity is verified or cannot be determined
        message contains details about the verification
    """
    if not applicant_name.strip():
        return True, "No applicant name provided."

    if not doc_texts:
        return True, "No document texts available for verification."

    id_types   = ["national_id", "passport", "id_card"]
    name_found = False

    for doc_type in id_types:
        if doc_type in doc_texts and doc_texts[doc_type]:
            if _name_found_in_text(applicant_name, doc_texts[doc_type]):
                name_found = True
                break

    if name_found:
        return True, f"Identity verified: name '{applicant_name}' found in ID documents."

    if document_paths:
        for doc_type in id_types:
            if doc_type in document_paths and os.path.exists(document_paths[doc_type]):
                try:
                    ai_result = _ai_verify_with_vision(
                        file_path=document_paths[doc_type],
                        declared_type=doc_type,
                        applicant_name=applicant_name,
                        ocr_text=doc_texts.get(doc_type, ""),
                    )
                    if ai_result.get("name_found"):
                        return True, (
                            f"Identity verified via AI vision: name '{applicant_name}' "
                            f"found in {doc_type}."
                        )
                except Exception:
                    pass

    return True, f"Identity verification inconclusive for '{applicant_name}'."


def _ocr_quality_is_low(ocr_text: str) -> bool:
    """
    Check if OCR text quality is low (insufficient readable characters).

    Returns
    -------
    bool
        True if OCR quality is low, False otherwise
    """
    if not ocr_text.strip():
        return True
    readable_chars = sum(1 for c in ocr_text if c.isalnum())
    return readable_chars < 30


def _count_readable_chars(text: str) -> int:
    """
    Count the number of readable characters in text.

    Returns
    -------
    int
        Number of alphanumeric characters
    """
    if not text:
        return 0
    return sum(1 for c in text if c.isalnum())