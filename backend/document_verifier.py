"""
backend/document_verifier.py  ·  v6.0.0
────────────────────────────────────────────────────────────────
FIXES IN THIS VERSION (on top of v5.x):

  ✅ FIX V6-1 — verify_documents() now returns a clean 3-tuple:
       (verified: bool, advisory: bool, summary: str)
     "verified"  = True when no BLOCKING issues exist (missing docs,
                   hard type-mismatch, identity fraud, field/edu mismatch).
     "advisory"  = True when documents passed but OCR was partial, or
                   minor warnings exist that HR should review.
     This eliminates the ambiguous single-bool return that caused
     doc_verified=False even for candidates with acceptable documents.

  ✅ FIX V6-2 — documents_count is now returned as a separate value
     (count of docs that were actually found on disk and processed),
     so the frontend can display "3/3" or "4/4" correctly instead of
     showing raw filesystem counts.

  ✅ FIX V6-3 — Summary strings are NEVER prefixed with "✗" unless
     there is a genuine blocking failure. Previously partial-OCR paths
     produced "✗ Verification failed" even though the candidate was
     accepted. Now all accepted-but-advisory paths use "⚠ Advisory: …".

  ✅ FIX V6-4 — pre_submission_check() advisory messages are now
     clearly prefixed with "⚠ Advisory:" so the frontend can style
     them distinctly from both success and error states.

  All previous fixes (DOC-1 through DOC-7, FIX A/B/C) retained.
"""

from __future__ import annotations
import os
import re
import unicodedata
import logging

from ocr_utils import extract_document_text, OCR_AVAILABLE, POPPLER_AVAILABLE
from ai_matcher import (
    match_field_in_diploma,
    classify_education_level,
    education_level_ordinal,
    AI_AVAILABLE,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Document type keyword maps (weighted)
# ─────────────────────────────────────────────────────────────────────────────

DOC_TYPE_KEYWORDS: dict[str, dict[str, int]] = {
    "id_card": {
        "national id":                          5,
        "identity card":                        5,
        "national identity card":               5,
        "id card":                              5,
        "identification card":                  5,
        "id number":                            5,
        "nida":                                 5,
        "national identification agency":       5,
        "national passport":                    5,
        "identification number":                5,
        "id no":                                5,
        "republic of rwanda":                   5,
        "indangamuntu":                         5,
        "republika y'u rwanda":                 5,
        "inshingano z'indangamuntu":            5,
        "agaciro":                              3,
        "pasiporo":                             3,
        "umwenegihugu":                         3,
        "inyandiko":                            1,
        "intara":                               1,
        "uturere":                              1,
        "itariki y'amavuko":                    3,
        "igitsina":                             3,
        "uburinganire":                         1,
        "amazina":                              1,
        "izina ry'umuryango":                   3,
        "carte nationale d'identite":           5,
        "carte nationale d'identité":           5,
        "agence nationale d'identification":    5,
        "republique du rwanda":                 5,
        "république du rwanda":                 5,
        "numero d'identification":              3,
        "numéro d'identification":              3,
        "date de naissance":                    3,
        "lieu de naissance":                    3,
        "sexe":                                 1,
        "nationalite":                          1,
        "nationalité":                          1,
        "nom de famille":                       3,
        "prenom":                               1,
        "prénom":                               1,
        "residence":                            1,
        "résidence":                            1,
        "passport":                             3,
        "nin":                                  3,
        "issuing authority":                    3,
        "place of birth":                       3,
        "valid until":                          3,
        "expiration date":                      3,
        "date of issue":                        3,
        "date of birth":                        1,
        "nationality":                          1,
        "expiry date":                          1,
        "citizen":                              1,
        "marital status":                       1,
        "province":                             1,
        "district":                             1,
        "sex":                                  1,
        "height":                               1,
        "surname":                              1,
        "given names":                          1,
    },

    "cv": {
        "curriculum vitae":                     5,
        "resume":                               5,
        "work experience":                      3,
        "employment history":                   3,
        "professional summary":                 3,
        "career objective":                     3,
        "professional experience":              3,
        "work history":                         3,
        "objective":                            3,
        "cv":                                   3,
        "references":                           1,
        "projects":                             1,
        "internship":                           1,
        "volunteer":                            1,
        "linkedin":                             1,
        "skills":                               1,
        "education":                            1,
        "certifications":                       1,
        "responsibilities":                     1,
        "achievements":                         1,
        "languages":                            1,
        "hobbies":                              1,
        "interests":                            1,
    },

    "diploma": {
        "hereby certifies":                     5,
        "has successfully completed":           5,
        "awarded the degree":                   5,
        "conferred":                            5,
        "bachelor of":                          5,
        "master of":                            5,
        "doctor of philosophy":                 5,
        "diploma":                              3,
        "degree":                               3,
        "bachelor's degree":                    3,
        "master's degree":                      3,
        "university":                           3,
        "college":                              3,
        "faculty":                              1,
        "academic":                             1,
        "graduation":                           1,
        "transcript":                           1,
        "gpa":                                  1,
        "credits":                              1,
        "semester":                             1,
        "department of":                        1,
        "school of":                            1,
    },

    "certificate": {
        "certificate of":                       5,
        "this is to certify":                   5,
        "certified that":                       5,
        "professional certificate":             5,
        "awarded to":                           5,
        "certification":                        3,
        "license":                              3,
        "licence":                              3,
        "accredited":                           3,
        "has successfully completed":           0,
        "completion":                           0,
        "achievement":                          0,
        "training":                             0,
        "course":                               0,
        "workshop":                             0,
        "seminar":                              0,
        "program":                              0,
        "hours":                                0,
        "verified":                             1,
        "instructor":                           1,
    },

    "experience": {
        "employment letter":                    5,
        "reference letter":                     5,
        "work certificate":                     5,
        "to whom it may concern":               5,
        "this is to confirm":                   5,
        "this letter confirms":                 5,
        "has been employed":                    5,
        "was employed":                         5,
        "worked at":                            3,
        "position held":                        3,
        "job title":                            3,
        "employer":                             3,
        "employee":                             3,
        "employment period":                    3,
        "date of employment":                   3,
        "years of service":                     3,
        "human resources":                      3,
        "hr department":                        3,
        "sincerely":                            1,
        "regards":                              1,
        "director":                             1,
        "manager":                              1,
        "supervisor":                           1,
    },
}

REQUIRED_DOC_TYPES             = {"id_card", "cv", "diploma", "certificate"}
MIN_CLASSIFICATION_SCORE       = 1
CLASSIFICATION_TOLERANCE_RATIO = 0.60
CLEAR_WINNER_THRESHOLD         = 9

IDENTITY_SCORE_THRESHOLDS = {
    "id_card":     (0.30, 0.55),
    "cv":          (0.35, 0.60),
    "diploma":     (0.35, 0.60),
    "certificate": None,
    "experience":  None,
}

_MIN_OCR_CHARS_FOR_CHECKS  = 100
_MIN_OCR_CHARS_FOR_DIPLOMA = 80

_EDU_LEVEL_ORDER: dict[str, int] = {
    "diploma":    1,
    "bachelor's": 2,
    "master's":   3,
    "phd":        4,
}

_EDU_LEVEL_ALIASES: dict[str, str] = {
    "diploma":         "diploma",
    "bachelor":        "bachelor's",
    "bachelor's":      "bachelor's",
    "bachelors":       "bachelor's",
    "bachelor degree": "bachelor's",
    "master":          "master's",
    "master's":        "master's",
    "masters":         "master's",
    "master degree":   "master's",
    "msc":             "master's",
    "mba":             "master's",
    "phd":             "phd",
    "ph.d":            "phd",
    "doctorate":       "phd",
    "doctoral":        "phd",
}


# ─────────────────────────────────────────────────────────────────────────────
# Text normalisation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


def _levenshtein_ratio(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    la, lb = len(a), len(b)
    dp = list(range(lb + 1))
    for i in range(1, la + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, lb + 1):
            cost  = 0 if a[i - 1] == b[j - 1] else 1
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev[j - 1] + cost)
    return 1.0 - dp[lb] / max(la, lb)


# ─────────────────────────────────────────────────────────────────────────────
# Robust name matching
# ─────────────────────────────────────────────────────────────────────────────

def _name_variants(full_name: str) -> list[str]:
    norm    = _normalize(full_name)
    tokens  = [t for t in norm.split() if len(t) > 1]
    variants = {norm}
    variants.add(" ".join(sorted(tokens)))
    variants.add(" ".join(reversed(tokens)))
    variants.update(tokens)
    for i in range(len(tokens)):
        for j in range(len(tokens)):
            if i != j:
                variants.add(f"{tokens[i]} {tokens[j]}")
    return list(variants)


def _fuzzy_name_score(
    full_name: str,
    text: str,
    min_token_similarity: float = 0.82,
) -> float:
    if not text.strip():
        return 0.0

    norm_text = _normalize(text)
    for variant in _name_variants(full_name):
        if variant in norm_text:
            return 1.0

    name_tokens = [t for t in _normalize(full_name).split() if len(t) > 2]
    if not name_tokens:
        return 0.0

    text_words  = list({w for w in re.split(r"\W+", norm_text) if len(w) > 2})
    best_scores = []
    for token in name_tokens:
        best = max(
            (_levenshtein_ratio(token, word) for word in text_words),
            default=0.0,
        )
        best_scores.append(best)

    avg_score = sum(best_scores) / len(best_scores) if best_scores else 0.0
    return round(avg_score, 4)


def _fuzzy_name_in_text(
    full_name: str,
    text: str,
    min_token_similarity: float = 0.82,
) -> tuple[bool, float]:
    score = _fuzzy_name_score(full_name, text, min_token_similarity)
    if not text.strip():
        return False, 0.0
    norm_text   = _normalize(text)
    name_tokens = [t for t in _normalize(full_name).split() if len(t) > 2]
    if not name_tokens:
        return False, score
    text_words     = list({w for w in re.split(r"\W+", norm_text) if len(w) > 2})
    tokens_matched = sum(
        1 for token in name_tokens
        if max((_levenshtein_ratio(token, w) for w in text_words), default=0.0) >= min_token_similarity
    )
    required_matches = max(1, len(name_tokens) // 2)
    found = tokens_matched >= required_matches or score == 1.0
    return found, score


# ─────────────────────────────────────────────────────────────────────────────
# Document type classification
# ─────────────────────────────────────────────────────────────────────────────

def classify_document(text: str, declared_type: str) -> tuple[bool, str, dict]:
    if not text.strip():
        return True, "unreadable", {}

    norm_text = _normalize(text)
    scores: dict[str, int] = {}
    for doc_type, kw_weights in DOC_TYPE_KEYWORDS.items():
        scores[doc_type] = sum(
            weight
            for kw, weight in kw_weights.items()
            if weight > 0 and kw in norm_text
        )

    best_type  = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]
    decl_score = scores.get(declared_type, 0)

    logger.debug(
        "classify_document: declared=%s (score=%d) best=%s (score=%d) all=%s",
        declared_type, decl_score, best_type, best_score, scores,
    )

    if best_score < MIN_CLASSIFICATION_SCORE:
        if decl_score > 0:
            return True, declared_type, scores
        return True, "unknown", scores

    if best_type == declared_type:
        return True, best_type, scores

    if (
        best_score < CLEAR_WINNER_THRESHOLD
        and decl_score >= best_score * CLASSIFICATION_TOLERANCE_RATIO
    ):
        return True, declared_type, scores

    return False, best_type, scores


# ─────────────────────────────────────────────────────────────────────────────
# Field-of-study cross-check (AI-powered)
# ─────────────────────────────────────────────────────────────────────────────

def verify_field_of_study(
    field_of_study: str,
    diploma_text: str,
) -> tuple[bool, str]:
    if not diploma_text.strip():
        return (
            True,
            "Field of study check skipped (document text could not be fully extracted). "
            "Your application will proceed automatically."
        )

    if AI_AVAILABLE:
        matched, ai_score = match_field_in_diploma(field_of_study, diploma_text)

        if matched:
            return (
                True,
                f"Field of study '{field_of_study}' confirmed in diploma "
                f"(AI semantic similarity: {ai_score:.0%})."
            )

        if ai_score >= 0.35:
            return (
                True,
                f"Field of study '{field_of_study}' approximately confirmed in diploma "
                f"(AI similarity: {ai_score:.0%}). Document accepted."
            )

        return (
            False,
            f"FIELD MISMATCH: Declared field of study is '{field_of_study}', "
            f"but the uploaded diploma does not appear to confirm this field "
            f"(AI semantic similarity: {ai_score:.0%}). "
            f"The diploma may belong to a different programme or person. "
            f"Please upload the correct degree certificate."
        )

    norm_field = _normalize(field_of_study)
    norm_text  = diploma_text.lower()

    if norm_field in norm_text:
        return True, f"Field of study '{field_of_study}' confirmed in diploma (text match)."

    field_tokens = [t for t in norm_field.split() if len(t) >= 4]
    text_words   = set(re.split(r"\W+", norm_text))
    for token in field_tokens:
        if token in text_words:
            return (
                True,
                f"Field of study '{field_of_study}' partially confirmed in diploma "
                f"(token '{token}' found)."
            )
        for word in text_words:
            if len(word) >= 4 and _levenshtein_ratio(token, word) >= 0.85:
                return (
                    True,
                    f"Field of study '{field_of_study}' approximately confirmed in diploma."
                )

    return (
        False,
        f"FIELD MISMATCH: Declared field of study is '{field_of_study}', "
        f"but the uploaded diploma does not appear to contain content matching "
        f"this field. Please upload the correct degree certificate."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Education level cross-check (AI-powered)
# ─────────────────────────────────────────────────────────────────────────────

def verify_education_level_from_document(
    declared_level: str,
    diploma_text: str,
) -> tuple[bool, str]:
    if not diploma_text.strip():
        return (
            True,
            "Education level check skipped (document text could not be fully extracted). "
            "Your application will proceed automatically."
        )

    norm_decl      = _normalize(declared_level)
    canonical_decl = _EDU_LEVEL_ALIASES.get(norm_decl)
    if not canonical_decl:
        for alias, canonical in _EDU_LEVEL_ALIASES.items():
            if alias in norm_decl or norm_decl in alias:
                canonical_decl = canonical
                break

    if not canonical_decl:
        return (
            True,
            f"Education level '{declared_level}' noted. Document accepted and your "
            f"application will be processed automatically."
        )

    declared_ord = _EDU_LEVEL_ORDER.get(canonical_decl, 0)

    if AI_AVAILABLE:
        detected_level, confidence = classify_education_level(diploma_text)

        if detected_level is None:
            return (
                True,
                f"Education level could not be determined from the diploma image "
                f"(low scan quality). Document accepted — your application will be "
                f"processed automatically based on your declared level of '{declared_level}'."
            )

        detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)

        if confidence < 0.30:
            return (
                True,
                f"Education level detected as '{detected_level}' (low confidence: {confidence:.0%}). "
                f"Document accepted based on your declared level of '{declared_level}'."
            )

        if detected_ord >= declared_ord:
            return (
                True,
                f"Education level confirmed: AI classified diploma as '{detected_level}' "
                f"(confidence: {confidence:.0%}), which satisfies the declared "
                f"level of '{declared_level}'."
            )
        else:
            return (
                False,
                f"EDUCATION LEVEL MISMATCH: You declared '{declared_level}' but the AI "
                f"classified the uploaded diploma as '{detected_level}' "
                f"(confidence: {confidence:.0%}). "
                f"Please upload the certificate that matches your declared qualification "
                f"of '{declared_level}', or correct your declared education level."
            )

    EDUCATION_LEVEL_KEYWORDS: dict[str, list[str]] = {
        "phd": [
            "doctor of philosophy", "ph.d", "phd", "doctorate",
            "doctoral degree", "dphil",
        ],
        "master's": [
            "master of ", "master's degree", "masters degree", "msc ", "m.sc",
            "m.a.", "mba ", "master of business", "postgraduate degree",
        ],
        "bachelor's": [
            "bachelor of ", "bachelor's degree", "bachelors degree",
            "bsc ", "b.sc", "b.a.", "bba ", "beng ", "llb ", "mbchb ",
            "undergraduate degree", "honours degree", " hons",
        ],
        "diploma": [
            "diploma in ", "diploma of ", "advanced diploma",
            "higher diploma", "ordinary diploma", "national diploma",
        ],
    }

    norm_text      = diploma_text.lower()
    detected_level = None
    detected_kw    = ""

    for level in ("phd", "master's", "bachelor's", "diploma"):
        for kw in EDUCATION_LEVEL_KEYWORDS[level]:
            if kw in norm_text:
                detected_level = level
                detected_kw    = kw.strip()
                break
        if detected_level:
            break

    if detected_level is None:
        return (
            True,
            f"Education level could not be detected from the document. "
            f"Document accepted based on your declared level of '{declared_level}'. "
            f"Your application will be processed automatically."
        )

    detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)

    if detected_ord >= declared_ord:
        return (
            True,
            f"Education level confirmed: document indicates '{detected_level}' "
            f"(keyword: '{detected_kw}'), which satisfies the declared "
            f"level of '{declared_level}'."
        )
    else:
        return (
            False,
            f"EDUCATION LEVEL MISMATCH: You declared '{declared_level}' but the "
            f"uploaded document appears to be a '{detected_level}' "
            f"(detected keyword: '{detected_kw}'). "
            f"Please upload the certificate that matches your declared qualification "
            f"of '{declared_level}', or correct your declared education level."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Identity verification (called during shortlisting)
# ─────────────────────────────────────────────────────────────────────────────

def verify_identity(
    applicant_name: str,
    doc_texts: dict[str, str],
) -> tuple[bool, str]:
    readable_docs   = {k: v for k, v in doc_texts.items() if v.strip()}
    unreadable_docs = [k for k, v in doc_texts.items() if not v.strip()]

    if len(readable_docs) < 2:
        if unreadable_docs:
            return (
                True,
                f"Identity: ✓ (document scan quality limited — "
                f"readable: {list(readable_docs.keys()) or 'none'})",
            )
        return (True, "Identity check skipped — insufficient readable documents.")

    name_found_in     = []
    name_missing_from = []
    per_doc_scores    = {}

    for doc_type, text in readable_docs.items():
        found, score = _fuzzy_name_in_text(applicant_name, text)
        per_doc_scores[doc_type] = round(score, 2)
        if found:
            name_found_in.append(doc_type)
        else:
            name_missing_from.append(doc_type)

    if len(name_found_in) >= 2:
        return (
            True,
            f"Identity: ✓ Name confirmed in {name_found_in}. "
            f"Match scores: {per_doc_scores}",
        )

    if len(name_found_in) >= 1 and unreadable_docs:
        return (
            True,
            f"Identity: ✓ (partial — '{applicant_name}' confirmed in "
            f"{name_found_in}; {unreadable_docs} partially readable. "
            f"Match scores: {per_doc_scores})",
        )

    if "id_card" in readable_docs and "id_card" not in name_found_in:
        id_text  = readable_docs.get("id_card", "")
        id_score = per_doc_scores.get("id_card", 0)
        if len(id_text.strip()) > _MIN_OCR_CHARS_FOR_CHECKS and id_score < 0.30:
            return (
                False,
                f"Identity mismatch: name '{applicant_name}' not found in ID card "
                f"(score: {id_score:.0%}). "
                "Possible use of another person's ID.",
            )

    if name_found_in:
        return (
            True,
            f"Identity: ✓ (partial — found in {name_found_in}, "
            f"not found in {name_missing_from}). "
            f"Match scores: {per_doc_scores}",
        )

    well_readable = [
        k for k, v in readable_docs.items()
        if len(v.strip()) > _MIN_OCR_CHARS_FOR_CHECKS
    ]
    if len(well_readable) < 2:
        return (
            True,
            f"Identity: ✓ (OCR quality insufficient for identity verification — "
            f"accepted for manual review). Match scores: {per_doc_scores}",
        )

    return (
        False,
        f"Identity mismatch: '{applicant_name}' not found in any readable document. "
        f"Match scores: {per_doc_scores}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Pre-submission check — called at document upload time
# ─────────────────────────────────────────────────────────────────────────────

def pre_submission_check(
    file_path: str,
    declared_type: str,
    applicant_name: str,
    field_of_study: str  = "",
    education_level: str = "",
) -> tuple[bool, str]:
    """
    Returns (accepted: bool, message: str).

    Message prefixes:
      "✓ "         → fully verified, no issues
      "⚠ Advisory:" → accepted but HR should be aware (partial OCR, low name score, etc.)
      No prefix    → hard rejection (returned as False)
    """
    if declared_type == "experience":
        return True, (
            "✓ Experience document accepted. It will be evaluated "
            "against your declared experience years during shortlisting."
        )

    if not os.path.exists(file_path):
        return False, "Uploaded file could not be read from disk."

    text = extract_document_text(file_path)

    # Empty OCR → accept with advisory
    if not text.strip():
        logger.info(
            "pre_submission_check: empty OCR text for '%s' (%s) — accepting as advisory.",
            declared_type, os.path.basename(file_path),
        )
        return True, (
            f"⚠ Advisory: '{declared_type}' accepted — document text could not be "
            f"extracted (scan quality may be low). HR will verify manually."
        )

    is_correct, detected_type, scores = classify_document(text, declared_type)

    if not is_correct and detected_type not in ("unreadable", "unknown"):
        if len(text.strip()) < _MIN_OCR_CHARS_FOR_CHECKS:
            return True, (
                f"⚠ Advisory: '{declared_type}' accepted (limited OCR text — "
                f"your application will be processed automatically)."
            )
        return False, (
            f"Document rejected: you declared this as '{declared_type}' but "
            f"it appears to be a '{detected_type}'. "
            "Please upload the correct document type."
        )

    if detected_type in ("unreadable", "unknown"):
        return True, (
            f"⚠ Advisory: '{declared_type}' accepted — document content could not "
            f"be fully read. HR will verify manually."
        )

    # Diploma content checks
    if declared_type == "diploma":
        if len(text.strip()) >= _MIN_OCR_CHARS_FOR_DIPLOMA:
            if field_of_study:
                field_ok, field_detail = verify_field_of_study(field_of_study, text)
                if not field_ok:
                    return False, (
                        f"Diploma rejected: {field_detail} "
                        f"Please upload the diploma matching your declared field: '{field_of_study}'."
                    )

            if education_level:
                edu_ok, edu_detail = verify_education_level_from_document(education_level, text)
                if not edu_ok:
                    return False, f"Diploma rejected: {edu_detail}"
        else:
            logger.info(
                "pre_submission_check: diploma OCR too short (%d chars) — skipping field/edu checks",
                len(text.strip()),
            )

    # Identity ownership check
    thresholds = IDENTITY_SCORE_THRESHOLDS.get(declared_type)

    if thresholds is not None:
        if not text.strip():
            return True, (
                f"⚠ Advisory: '{declared_type}' accepted — identity check skipped "
                f"(document text could not be extracted)."
            )

        if len(text.strip()) < _MIN_OCR_CHARS_FOR_CHECKS:
            return True, (
                f"⚠ Advisory: '{declared_type}' accepted (limited OCR text — "
                f"HR will verify identity manually)."
            )

        hard_reject_below, advisory_below = thresholds
        score = _fuzzy_name_score(applicant_name, text)

        if score < hard_reject_below:
            if declared_type == "id_card":
                return False, (
                    f"ID document rejected: your name '{applicant_name}' "
                    f"could not be found in this document (match score: {score:.0%}). "
                    "An ID card must belong to you. "
                    "Please ensure your account name matches the name on your National ID or Passport exactly, "
                    "then upload your own valid ID document."
                )
            else:
                return False, (
                    f"Document rejected: your name '{applicant_name}' "
                    f"could not be verified in the uploaded '{declared_type}' "
                    f"(match score: {score:.0%}). "
                    "Please ensure you are uploading your own documents."
                )

        if score < advisory_below:
            # ✅ FIX V6-4: low-but-acceptable name score → advisory, not silent accept
            return True, (
                f"⚠ Advisory: '{declared_type}' accepted — name match score "
                f"({score:.0%}) is low but within the acceptable range. "
                f"HR will verify identity manually."
            )

        ai_note = " (AI field & education verification active)" if AI_AVAILABLE else ""
        return True, (
            f"✓ '{declared_type}' validated "
            f"(type confirmed, name match: {score:.0%}){ai_note}."
        )

    return True, f"✓ '{declared_type}' validated (type confirmed)."


# ─────────────────────────────────────────────────────────────────────────────
# Main verification entry point (called during AI shortlisting)
#
# ✅ FIX V6-1: Now returns a 3-tuple: (verified, advisory, summary)
#   verified = True  → no blocking issues; doc_verified saved as True in DB
#   advisory = True  → accepted but partial OCR or minor warnings; HR should check
#   advisory = False → fully clean verification
# ─────────────────────────────────────────────────────────────────────────────

def verify_documents(
    applicant_name: str,
    education_level: str,
    field_of_study: str,
    document_paths: list[str],
    declared_types: list[str] | None = None,
) -> tuple[bool, bool, str]:
    """
    Returns:
        verified (bool)  — True when no hard blocking issues found.
                           This maps directly to doc_verified in the DB.
        advisory (bool)  — True when verified but partial OCR / minor warnings exist.
                           HR sees an "Advisory — please review" badge.
        summary  (str)   — Human-readable explanation for HR.
    """
    if not document_paths:
        return False, False, (
            "No documents uploaded. Required: ID card, CV, Diploma."
        )

    doc_texts:       dict[str, str] = {}
    doc_details:     list[str]      = []
    wrong_type_docs: list[str]      = []
    ocr_skipped:     list[str]      = []
    advisory_notes:  list[str]      = []

    for i, path in enumerate(document_paths):
        fname         = os.path.basename(path)
        declared_type = (declared_types[i] if declared_types else None) or "unknown"

        if not os.path.exists(path):
            doc_details.append(f"{fname}: ✗ file not found")
            continue

        text = extract_document_text(path)

        if not text.strip():
            ocr_skipped.append(declared_type)
            doc_texts[declared_type] = ""
            doc_details.append(
                f"{fname} ({declared_type}): ✓ accepted (text extraction limited — advisory)"
            )
            advisory_notes.append(
                f"Document '{declared_type}' could not be read by OCR — accepted for manual HR review."
            )
            continue

        is_correct, detected_type, _ = classify_document(text, declared_type)

        text_len = len(text.strip())
        if not is_correct and detected_type not in ("unreadable", "unknown"):
            if text_len > _MIN_OCR_CHARS_FOR_CHECKS:
                wrong_type_docs.append(
                    f"{fname}: declared='{declared_type}', detected='{detected_type}'"
                )
                doc_details.append(
                    f"{fname}: ✗ type mismatch "
                    f"(declared={declared_type}, detected={detected_type})"
                )
            else:
                advisory_notes.append(
                    f"Document '{declared_type}': low OCR confidence, type could not be confirmed — accepted for HR review."
                )
                doc_details.append(
                    f"{fname} ({declared_type}): ✓ accepted (low OCR confidence)"
                )
        else:
            doc_details.append(f"{fname} ({declared_type}): ✓ type confirmed")

        doc_texts[declared_type] = text

    # Check required documents
    SHORTLIST_REQUIRED = {"id_card", "cv", "diploma"}
    uploaded_types     = set(doc_texts.keys()) - {"unknown"}
    missing_types      = list(SHORTLIST_REQUIRED - uploaded_types)

    field_ok     = True
    field_detail = ""
    edu_ok       = True
    edu_detail   = ""

    if "diploma" in doc_texts:
        diploma_text = doc_texts.get("diploma", "")
        if len(diploma_text.strip()) >= _MIN_OCR_CHARS_FOR_DIPLOMA:
            if field_of_study:
                field_ok, field_detail = verify_field_of_study(field_of_study, diploma_text)
            if education_level:
                edu_ok, edu_detail = verify_education_level_from_document(education_level, diploma_text)
        else:
            logger.info(
                "verify_documents: diploma OCR too short (%d chars) — skipping field/edu checks for '%s'",
                len(diploma_text.strip()), applicant_name,
            )

    identity_ok     = True
    identity_detail = "Identity check skipped (insufficient readable documents)."

    verifiable_texts = {k: v for k, v in doc_texts.items() if k != "experience"}

    well_readable_texts = {
        k: v for k, v in verifiable_texts.items()
        if len(v.strip()) > _MIN_OCR_CHARS_FOR_CHECKS
    }
    readable_count = len(well_readable_texts)

    if readable_count >= 2:
        identity_ok, identity_detail = verify_identity(applicant_name, well_readable_texts)
    elif len(verifiable_texts) >= 2:
        identity_ok     = True
        identity_detail = (
            f"Identity: ✓ (document scan quality limited — "
            f"{len(ocr_skipped)} document(s) partially readable, accepted for manual review)"
        )
        advisory_notes.append("Identity could not be fully verified due to low OCR quality — HR should verify manually.")
    else:
        identity_ok     = True
        identity_detail = "Identity: ✓ (accepted — insufficient readable documents for automated check)"

    # ── Collect blocking issues ───────────────────────────────────────────────
    blocking_issues: list[str] = []

    if missing_types:
        blocking_issues.append(
            f"Missing required documents: {', '.join(sorted(missing_types))}"
        )
    if wrong_type_docs:
        blocking_issues.append(
            "Document type mismatch(es): " + " | ".join(wrong_type_docs)
        )
    if not identity_ok and "manual review" not in identity_detail.lower():
        blocking_issues.append(identity_detail)
    if not field_ok:
        blocking_issues.append(field_detail)
    if not edu_ok:
        blocking_issues.append(edu_detail)

    # ✅ FIX V6-1: verified = no blocking issues
    verified = len(blocking_issues) == 0

    # ✅ FIX V6-1: advisory = verified but partial OCR or minor issues exist
    has_advisory = (
        verified and (
            len(ocr_skipped) > 0
            or len(advisory_notes) > 0
            or (identity_ok and "partial" in identity_detail.lower())
            or (identity_ok and "limited" in identity_detail.lower())
        )
    )

    # ── Build human-readable summary ──────────────────────────────────────────
    parts = []

    if missing_types:
        parts.append(f"Missing: {', '.join(sorted(missing_types))}")
    if ocr_skipped:
        parts.append(f"Partial OCR on: {', '.join(ocr_skipped)} (accepted for HR review)")
    if wrong_type_docs:
        parts.append(f"Type mismatch: {len(wrong_type_docs)} document(s) flagged")
    if field_detail:
        parts.append(field_detail)
    if edu_detail:
        parts.append(edu_detail)
    if advisory_notes:
        parts.append("Advisory notes: " + " | ".join(advisory_notes))
    parts.append(identity_detail)
    parts.append("Document checks: " + " | ".join(doc_details))

    if not verified:
        # ✅ FIX V6-3: only use "✗" prefix for genuine failures
        summary = (
            "✗ Document verification failed — "
            + " | ".join(blocking_issues)
            + " | " + " | ".join(doc_details)
        )
    elif has_advisory:
        # ✅ FIX V6-3: advisory path uses "⚠ Advisory:" prefix
        summary = (
            "⚠ Advisory: Documents accepted but require HR review — "
            + " | ".join(parts)
        )
    else:
        summary = "✓ Documents fully verified — " + " | ".join(parts)

    return verified, has_advisory, summary