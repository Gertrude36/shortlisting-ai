"""
backend/document_verifier.py
────────────────────────────────────────────────────────────────
WHAT WAS FIXED IN THIS VERSION:

  ✅ FIX 1 (CRITICAL) — Field-of-study check now uses AI
  ───────────────────────────────────────────────────────────────
  Previously: verify_field_of_study() used keyword scanning with
  a dictionary of hard-coded field→keywords mappings and chains
  of if-conditions. It missed paraphrased fields and didn't
  actually "read" the diploma.

  Now: Uses sentence-transformers AI (match_field_in_diploma)
  which encodes the full diploma text and the declared field into
  embedding space, then checks cosine similarity. No keywords
  needed — the AI understands meaning, not just word overlap.

  Examples now handled correctly:
    "Bachelor of Information Technology" diploma → "IT" declared  ✓
    "Nursing" diploma  → "Computer Science" declared              ✗
    "BSc Animal Health" diploma → "Veterinary Technology"         ✓ (related)

  ✅ FIX 2 (CRITICAL) — Education level detection now uses AI
  ───────────────────────────────────────────────────────────────
  Previously: verify_education_level_from_document() searched the
  diploma text for a list of keyword strings (e.g. "bachelor of",
  "bsc "). This failed on many real diplomas where the exact
  keyword wasn't present but the meaning was clear.

  Now: Uses classify_education_level() which encodes the diploma
  into embedding space and classifies it against template
  descriptions of each level (PhD / Master's / Bachelor's /
  Diploma). This is AI classification, not keyword scanning.

  ✅ RETAINED — ID card Rwanda keyword fix, OCR handling, identity
  verification, pre-submission checks, all previous fixes.
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
# Document type keyword maps (weighted) — still used for doc TYPE classification
# Field/education verification is now done by AI (not keywords)
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
}

REQUIRED_DOC_TYPES         = {"id_card", "cv", "diploma", "certificate"}
MIN_CLASSIFICATION_SCORE   = 1
CLASSIFICATION_TOLERANCE_RATIO = 0.60
CLEAR_WINNER_THRESHOLD     = 9

IDENTITY_SCORE_THRESHOLDS = {
    "id_card":     (0.60, 0.75),
    "cv":          (0.50, 0.72),
    "diploma":     (0.50, 0.72),
    "certificate": None,
}

# Education level ordinal lookup (used for AI result comparison)
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
# Document type classification (keyword-based — appropriate for type detection)
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
# ✅ FIX 1 — Field-of-study cross-check (now AI-powered)
# ─────────────────────────────────────────────────────────────────────────────

def verify_field_of_study(
    field_of_study: str,
    diploma_text: str,
) -> tuple[bool, str]:
    """
    Verify that the declared field of study is genuinely confirmed by the
    diploma document.

    ✅ FIX: Uses AI semantic similarity (sentence-transformers) instead of
    keyword scanning. The AI encodes both the diploma text and the declared
    field into embedding space, then measures cosine distance.

    Falls back to substring matching when AI model is not installed.
    """
    if not diploma_text.strip():
        return (
            True,
            "Field of study check skipped — diploma text could not be extracted "
            "(OCR tools not installed). Manual review recommended."
        )

    # ── AI path (sentence-transformers) ──────────────────────────────────────
    if AI_AVAILABLE:
        matched, ai_score = match_field_in_diploma(field_of_study, diploma_text)

        if matched:
            return (
                True,
                f"Field of study '{field_of_study}' confirmed in diploma "
                f"(AI semantic similarity: {ai_score:.0%})."
            )

        # Score between 0.35–0.50 → borderline, don't hard-fail
        if ai_score >= 0.35:
            return (
                True,
                f"⚠ Field of study '{field_of_study}' partially confirmed in diploma "
                f"(AI similarity: {ai_score:.0%} — borderline). HR review recommended."
            )

        return (
            False,
            f"FIELD MISMATCH: Declared field of study is '{field_of_study}', "
            f"but the uploaded diploma does not appear to confirm this field "
            f"(AI semantic similarity: {ai_score:.0%}). "
            f"The diploma may belong to a different programme or person. "
            f"Please upload the correct degree certificate."
        )

    # ── Fallback: substring matching (when AI model not installed) ────────────
    norm_field = _normalize(field_of_study)
    norm_text  = diploma_text.lower()

    if norm_field in norm_text:
        return True, f"Field of study '{field_of_study}' confirmed in diploma (text match)."

    # Check individual meaningful tokens
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
# ✅ FIX 2 — Education level cross-check (now AI-powered)
# ─────────────────────────────────────────────────────────────────────────────

def verify_education_level_from_document(
    declared_level: str,
    diploma_text: str,
) -> tuple[bool, str]:
    """
    Verify that the declared education level is confirmed by the diploma.

    ✅ FIX: Uses AI classification (classify_education_level) instead of
    keyword scanning. The AI encodes the diploma text and classifies it
    against template descriptions of PhD / Master's / Bachelor's / Diploma
    using cosine similarity in embedding space.

    Falls back to keyword detection when AI model is not installed.
    """
    if not diploma_text.strip():
        return (
            True,
            "Education level check skipped — diploma text could not be extracted. "
            "Manual review recommended."
        )

    # Normalise the declared level
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
            f"⚠ Could not map declared education level '{declared_level}' to a "
            "known level. Education level check skipped — manual HR review recommended."
        )

    declared_ord = _EDU_LEVEL_ORDER.get(canonical_decl, 0)

    # ── AI path (sentence-transformers) ──────────────────────────────────────
    if AI_AVAILABLE:
        detected_level, confidence = classify_education_level(diploma_text)

        if detected_level is None:
            return (
                True,
                f"⚠ AI could not determine education level from diploma text "
                f"(low OCR quality or short text). "
                f"Accepted for manual HR review — please verify the applicant's "
                f"claimed level of '{declared_level}'."
            )

        detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)

        logger.debug(
            "verify_education_level_from_document: declared=%s (ord=%d) "
            "AI-detected=%s (ord=%d) confidence=%.3f",
            canonical_decl, declared_ord, detected_level, detected_ord, confidence,
        )

        # Low confidence → don't hard-fail, defer to HR
        if confidence < 0.30:
            return (
                True,
                f"⚠ AI education level detection low confidence ({confidence:.0%}). "
                f"Best guess: '{detected_level}'. "
                f"Declared level '{declared_level}' accepted pending HR review."
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

    # ── Fallback: keyword detection (when AI not installed) ───────────────────
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

    norm_text = diploma_text.lower()
    detected_level: str | None = None
    detected_keyword: str      = ""

    for level in ("phd", "master's", "bachelor's", "diploma"):
        for kw in EDUCATION_LEVEL_KEYWORDS[level]:
            if kw in norm_text:
                detected_level   = level
                detected_keyword = kw.strip()
                break
        if detected_level:
            break

    if detected_level is None:
        return (
            True,
            "⚠ Could not determine education level from diploma text. "
            f"Accepted for manual HR review — please verify the applicant's "
            f"claimed level of '{declared_level}'."
        )

    detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)

    if detected_ord >= declared_ord:
        return (
            True,
            f"Education level confirmed: document indicates '{detected_level}' "
            f"(keyword: '{detected_keyword}'), which satisfies the declared "
            f"level of '{declared_level}'."
        )
    else:
        return (
            False,
            f"EDUCATION LEVEL MISMATCH: You declared '{declared_level}' but the "
            f"uploaded document appears to be a '{detected_level}' "
            f"(detected keyword: '{detected_keyword}'). "
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
                f"Identity: ✓ (manual review recommended — OCR tools not installed, "
                f"could not read {unreadable_docs}. "
                f"Readable docs: {list(readable_docs.keys()) or 'none'})",
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
            f"{name_found_in}; {unreadable_docs} unreadable. "
            f"Match scores: {per_doc_scores})",
        )

    if "id_card" in readable_docs and "id_card" not in name_found_in:
        if per_doc_scores.get("id_card", 0) < 0.5:
            return (
                False,
                f"Identity mismatch: name '{applicant_name}' not found in ID card "
                f"(score: {per_doc_scores.get('id_card', 0):.0%}). "
                "Possible use of another person's ID.",
            )

    if name_found_in:
        return (
            True,
            f"Identity: ✓ (partial — found in {name_found_in}, "
            f"not found in {name_missing_from}). "
            f"Match scores: {per_doc_scores}",
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
    if not os.path.exists(file_path):
        return False, "Uploaded file could not be read from disk."

    text = extract_document_text(file_path)
    ext  = os.path.splitext(file_path)[1].lower()

    if not text.strip():
        if ext in (".png", ".jpg", ".jpeg") and not OCR_AVAILABLE:
            return True, (
                f"⚠ Image document '{declared_type}' accepted — "
                "OCR tools are not configured. Document will be reviewed manually."
            )
        if ext == ".pdf" and not POPPLER_AVAILABLE:
            return True, (
                f"⚠ PDF document '{declared_type}' accepted — "
                "PDF could not be fully read. Document will be reviewed manually."
            )
        return True, (
            f"⚠ Could not extract text from '{declared_type}'. "
            "Accepted for manual review."
        )

    is_correct, detected_type, scores = classify_document(text, declared_type)

    if not is_correct and detected_type not in ("unreadable", "unknown"):
        return False, (
            f"Document rejected: you declared this as '{declared_type}' but "
            f"it appears to be a '{detected_type}'. "
            "Please upload the correct document type."
        )

    if detected_type == "unknown":
        return True, (
            f"⚠ '{declared_type}' uploaded — document content could not be "
            "automatically confirmed (low OCR confidence). "
            "Document accepted and will be reviewed by HR during shortlisting."
        )

    # Diploma content checks (AI-powered)
    if declared_type == "diploma":
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

    # Identity ownership check (score-based)
    thresholds = IDENTITY_SCORE_THRESHOLDS.get(declared_type)

    if thresholds is not None:
        hard_reject_below, advisory_below = thresholds
        score = _fuzzy_name_score(applicant_name, text)

        if score < hard_reject_below:
            if declared_type == "id_card":
                return False, (
                    f"❌ ID document rejected: your name '{applicant_name}' "
                    f"could not be found in this document (match score: {score:.0%}). "
                    "An ID card must belong to you. "
                    "Please upload your own valid National ID or Passport."
                )
            else:
                return False, (
                    f"❌ Document rejected: your name '{applicant_name}' "
                    f"could not be verified in the uploaded '{declared_type}' "
                    f"(match score: {score:.0%}). "
                    "Please ensure you are uploading your own documents."
                )

        if score < advisory_below:
            return True, (
                f"⚠ '{declared_type}' accepted with low name-match confidence "
                f"({score:.0%}). This may be flagged for HR review. "
                "Ensure the document belongs to you."
            )

        ai_note = " (AI field & education verification active)" if AI_AVAILABLE else ""
        return True, (
            f"✓ '{declared_type}' validated "
            f"(type: {detected_type}, name match: {score:.0%}){ai_note}."
        )

    return True, f"✓ '{declared_type}' validated (type: {detected_type})."


# ─────────────────────────────────────────────────────────────────────────────
# Main verification entry point (called during AI shortlisting)
# ─────────────────────────────────────────────────────────────────────────────

def verify_documents(
    applicant_name: str,
    education_level: str,
    field_of_study: str,
    document_paths: list[str],
    declared_types: list[str] | None = None,
) -> tuple[bool, str]:
    if not document_paths:
        return False, "No documents uploaded. Required: ID card, CV, Diploma, Certificate."

    doc_texts:       dict[str, str] = {}
    doc_details:     list[str]      = []
    wrong_type_docs: list[str]      = []
    ocr_skipped:     list[str]      = []

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
                f"{fname} ({declared_type}): ⚠ text extraction skipped "
                "(OCR tools not available — document accepted for manual review)"
            )
            continue

        is_correct, detected_type, _ = classify_document(text, declared_type)

        if not is_correct and detected_type not in ("unreadable", "unknown"):
            wrong_type_docs.append(
                f"{fname}: declared='{declared_type}', detected='{detected_type}'"
            )
            doc_details.append(
                f"{fname}: ✗ type mismatch "
                f"(declared={declared_type}, detected={detected_type})"
            )
        else:
            doc_details.append(f"{fname} ({declared_type}): ✓ type confirmed")

        doc_texts[declared_type] = text

    uploaded_types = set(doc_texts.keys()) - {"unknown"}
    missing_types  = list(REQUIRED_DOC_TYPES - uploaded_types)

    field_ok     = True
    field_detail = ""
    edu_ok       = True
    edu_detail   = ""

    if "diploma" in doc_texts:
        diploma_text = doc_texts.get("diploma", "")
        if field_of_study:
            field_ok, field_detail = verify_field_of_study(field_of_study, diploma_text)
        if education_level:
            edu_ok, edu_detail = verify_education_level_from_document(education_level, diploma_text)

    identity_ok     = True
    identity_detail = "Identity check skipped (insufficient readable documents)."

    readable_count = sum(1 for v in doc_texts.values() if v.strip())
    if readable_count >= 2:
        identity_ok, identity_detail = verify_identity(applicant_name, doc_texts)
    elif len(doc_texts) >= 2:
        identity_ok     = True
        identity_detail = (
            f"Identity: ✓ (advisory — OCR unavailable, "
            f"{len(ocr_skipped)} document(s) could not be read. "
            "Manual review recommended.)"
        )

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

    verified = len(blocking_issues) == 0

    parts = []
    if missing_types:
        parts.append(f"Missing: {', '.join(sorted(missing_types))}")
    if ocr_skipped:
        parts.append(
            f"OCR skipped (tools not installed) — accepted for manual review: "
            f"{', '.join(ocr_skipped)}"
        )
    if wrong_type_docs:
        parts.append(f"Type flags: {len(wrong_type_docs)}")
    if field_detail:
        parts.append(field_detail)
    if edu_detail:
        parts.append(edu_detail)
    parts.append(identity_detail)
    parts.append("Docs: " + " | ".join(doc_details))

    summary = (
        "✓ Documents accepted. " + " | ".join(parts)
        if verified
        else "✗ Verification failed — " + " | ".join(blocking_issues)
             + " | " + " | ".join(doc_details)
    )

    return verified, summary