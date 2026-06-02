from __future__ import annotations
import os
import re
import itertools
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
# Live OCR toggle
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_enabled() -> bool:
    return os.getenv("ENABLE_OCR", "true").strip().lower() == "true"


_OCR_ENABLED_AT_IMPORT = _ocr_enabled()
if not _OCR_ENABLED_AT_IMPORT:
    logger.warning(
        "[document_verifier] OCR is DISABLED via ENABLE_OCR=false. "
        "All document checks will be skipped and documents accepted automatically."
    )


# ─────────────────────────────────────────────────────────────────────────────
# PDF file detection helper
# ─────────────────────────────────────────────────────────────────────────────

def _is_pdf_file(file_path: str) -> bool:
    if file_path.lower().endswith(".pdf"):
        return True
    try:
        with open(file_path, "rb") as f:
            return f.read(4) == b"%PDF"
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Readable char counter (strips OCR noise)
# ─────────────────────────────────────────────────────────────────────────────

def _count_readable_chars(text: str) -> int:
    cleaned = re.sub(r"[\s|_\-~`^\\]", "", text)
    cleaned = re.sub(r"\b\d{1,2}\b", "", cleaned)
    return len(cleaned)


# ─────────────────────────────────────────────────────────────────────────────
# OCR quality thresholds
# ─────────────────────────────────────────────────────────────────────────────

_OCR_HARD_REJECT_THRESHOLDS: dict[str, int] = {
    "id_card":     180,
    "cv":          150,
    "diploma":     80,
    "certificate": 30,
    "experience":  60,
}

_OCR_HARD_REJECT_THRESHOLDS_PDF: dict[str, int] = {
    "id_card":     50,
    "cv":          100,
    "diploma":     50,
    "certificate": 24,
    "experience":  40,
}

_OCR_HARD_REJECT_THRESHOLDS_FAST: dict[str, int] = {
    "id_card":     108,
    "cv":          90,
    "diploma":     48,
    "certificate": 20,
    "experience":  36,
}

_OCR_HARD_REJECT_THRESHOLDS_PDF_FAST: dict[str, int] = {
    "id_card":     30,
    "cv":          60,
    "diploma":     30,
    "certificate": 16,
    "experience":  24,
}


def _get_threshold(doc_type: str, fast_mode: bool = False, is_pdf: bool = False) -> int:
    if fast_mode and is_pdf:
        return _OCR_HARD_REJECT_THRESHOLDS_PDF_FAST.get(doc_type, 16)
    if fast_mode:
        return _OCR_HARD_REJECT_THRESHOLDS_FAST.get(doc_type, 20)
    if is_pdf:
        return _OCR_HARD_REJECT_THRESHOLDS_PDF.get(doc_type, 24)
    return _OCR_HARD_REJECT_THRESHOLDS.get(doc_type, 30)


def _ocr_quality_is_low(
    text: str,
    doc_type: str,
    fast_mode: bool = False,
    is_pdf: bool = False,
) -> bool:
    if not text.strip():
        return True

    readable = _count_readable_chars(text)

    if doc_type == "id_card" and not is_pdf:
        return readable < 40
    if doc_type == "id_card" and is_pdf:
        return readable < 25

    threshold = _get_threshold(doc_type, fast_mode, is_pdf)
    return readable < threshold


def _ocr_quality_rejection_message(declared_type: str, readable: int, threshold: int) -> str:
    return (
        f"Your '{declared_type}' document could not be read clearly. "
        f"Only {readable} readable characters were extracted "
        f"(minimum required: {threshold}). "
        "This usually means the document is blurry, dark, low-contrast, or the scan quality is too low.\n\n"
        "Please upload a clearer scan:\n"
        "• Place the document flat on a surface\n"
        "• Ensure the entire document is in frame with no cut-off edges\n"
        "• Use good lighting — avoid shadows and glare\n"
        "• Hold the camera directly above (not at an angle)\n"
        "• Tap the screen to focus before taking the photo\n"
        "• For scanned PDFs, use at least 300 DPI\n"
        "• Avoid using screenshots of documents — scan or photograph the original"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Document type keyword maps
# ─────────────────────────────────────────────────────────────────────────────
DOC_TYPE_KEYWORDS: dict[str, dict[str, int]] = {
    "id_card": {
        # Standard English keywords
        "national id": 5, "identity card": 5, "id card": 5, "id number": 4,
        "national identity card": 8,
        # Rwanda-specific (Kinyarwanda) — OCR may return mixed case or partial
        "indangamuntu": 8, "icyangombwa": 4,
        "repubulika": 3, "republika": 3, "repubilika": 3,
        "rwanda": 1, "u rwanda": 2,
        # Passport
        "passport": 5, "passeport": 4,
        # Common ID fields
        "date of birth": 2, "surname": 2, "sex": 1, "nationality": 2,
        "id no": 3, "nid": 4, "nin": 3,
        # Partial OCR hits (Rwanda ID often scanned dark)
        "ndangamuntu": 6, "dangamuntu": 4,
        # Photo ID markers
        "place of issue": 3, "date of expiry": 3, "place of birth": 2,
    },
    "cv": {
        "curriculum vitae": 5, "resume": 5, "work experience": 4,
        "cv": 3, "skills": 2, "education": 1,
    },
    "diploma": {
        "diploma": 6, "degree": 5, "bachelor": 8, "master": 8,
        "university": 4, "college": 4,
        "bachelor of": 9, "bachelor's": 9, "master of": 9, "master's": 9,
        "doctor of philosophy": 10, "ph.d": 10, "phd": 8,
        "faculty of": 3, "school of": 3,
        "awarded the degree": 8, "conferred": 5,
        "hereby certifies": 4, "graduation": 4,
        "academic year": 3, "cum laude": 5,
        "having satisfied": 4, "requirements for the award": 6,
        "bachelor of technology": 12, "bachelor of science": 10,
        "rwanda polytechnic": 5, "tumba college": 5, "iprc": 3,
    },
    "certificate": {
        "certificate of": 8, "certification": 7, "this is to certify": 8,
        "certified that": 7, "professional certificate": 8,
        "certifies that": 7, "this certificate": 6,
        "is hereby awarded": 6, "certificate in": 6, "certificate for": 6,
        "has successfully": 5, "has completed": 5,
        "course": 2, "completed": 3, "completion": 3,
        "training": 3, "workshop": 3, "program": 2, "programme": 2,
        "short course": 5, "online course": 5,
        "awarded this certificate": 7, "in recognition of": 4,
        "participation": 3, "attendee": 3, "attendance": 3,
        "bachelor": 4, "degree certificate": 7, "transcript": 3,
    },
    "experience": {
        "employment letter": 3, "work certificate": 5, "employed": 5,
        "civil servant": 4, "this is to certify that": 3,
    },
}

REQUIRED_DOC_TYPES = {"id_card", "cv", "diploma", "certificate"}
MIN_CLASSIFICATION_SCORE = 1

CLASSIFICATION_TOLERANCE_RATIO        = 0.75
CLASSIFICATION_TOLERANCE_RATIO_SHORT  = 0.70
CLASSIFICATION_TOLERANCE_RATIO_PDF    = 0.55
CLASSIFICATION_TOLERANCE_RATIO_CERT   = 0.65

CLEAR_WINNER_THRESHOLD = 15

_MIN_ID_CARD_SCORE     = 4
_MIN_ID_CARD_SCORE_PDF = 3

_ID_CARD_POSITIVE_KEYWORDS = frozenset({
    "indangamuntu", "ndangamuntu", "dangamuntu",
    "national identity card", "national id", "identity card",
    "id card", "passport", "passeport",
    "id no", "nid", "nin",
    "place of issue", "date of expiry",
    # FIX-1: Added more Rwanda ID OCR variants that commonly appear on scanned IDs
    "icyangombwa", "repubulika", "republika", "repubilika",
    "date of birth", "surname", "nationality",
})

# FIX-2: Significantly raised readable thresholds to avoid false rejections.
# Rwanda IDs scanned as PDF often produce very little text even when valid.
# Old values were 200/150 — way too aggressive for real ID documents.
_ID_RULE2_MIN_READABLE      = 350   # was 200 — "no positive keyword" rule (image)
_ID_RULE2_MIN_READABLE_PDF  = 250   # was 150 — "no positive keyword" rule (PDF)
_ID_RULE3_MIN_READABLE      = 350   # was 200 — "id_score too low" rule (image)
_ID_RULE3_MIN_READABLE_PDF  = 250   # was 150 — "id_score too low" rule (PDF)
_ID_RULE4_MIN_READABLE      = 200   # was 150 — "competing type wins" rule (image)
_ID_RULE4_MIN_READABLE_PDF  = 180   # was 120 — "competing type wins" rule (PDF)

# FIX-3: Raised competing-type threshold so only truly unambiguous non-IDs are rejected.
_COMPETING_TYPE_HARD_REJECT_SCORE      = 18   # was 14
_COMPETING_TYPE_HARD_REJECT_SCORE_PDF  = 14   # was 10

# FIX-4: Raised strong-score threshold to be more confident before skipping rules.
_ID_CARD_STRONG_SCORE = 8   # was 6

_ID_CARD_HARD_REJECT_KEYWORDS = frozenset({
    "bachelor of", "bachelor's", "master of", "master's",
    "doctor of philosophy", "phd", "ph.d",
    "awarded the degree", "conferred with", "bachelor of technology",
    "requirements for the award", "having satisfied the requirements",
    "curriculum vitae", "work experience", "professional profile",
    "this is to certify that", "certificate of", "certification",
    "has successfully completed", "has completed the course",
    "rwanda polytechnic", "tumba college",
})

_NON_ID_DOC_TYPES = {"diploma", "cv", "certificate", "experience"}

_MIN_OCR_CHARS_FOR_ID      = 60
_MIN_OCR_CHARS_FOR_CHECKS  = 60
_MIN_OCR_CHARS_FOR_DIPLOMA = 80
_MIN_OCR_CHARS_FOR_UNKNOWN_NON_ID = 400
_MIN_OCR_CHARS_FOR_TYPE_MISMATCH = 120

_MIN_TOKEN_SIMILARITY = 0.68
_SURNAME_MATCH_THRESHOLD = 0.70
_INITIALS_FALLBACK_THRESHOLD = 2.0

_COMMON_WORD_BLOCKLIST = frozenset({
    "university", "college", "institute", "school", "faculty", "department",
    "national", "international", "republic", "kingdom", "the", "and", "of",
    "for", "in", "at", "by", "to", "from", "with", "certificate", "diploma",
    "degree", "bachelor", "master", "doctor", "rwanda", "africa", "african",
    "east", "west", "north", "south", "central", "district", "province",
    "kigali", "kampala", "nairobi", "dar", "addis", "accra", "lagos",
    "technology", "science", "engineering", "management", "business",
    "administration", "education", "health", "medicine", "law", "arts",
    "hereby", "certify", "certifies", "awarded", "conferred", "completed",
    "satisfactorily", "requirements", "academic", "year", "graduation",
    "this", "that", "have", "has", "been", "was", "are", "were", "will",
    "may", "can", "shall", "should", "would", "could", "not", "also",
})

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


_DIGIT_TO_LETTER = re.compile(r"(?<=[A-Za-z])0(?=[A-Za-z])")
_PIPE_TO_I       = re.compile(r"\|")
_STRAY_PUNCT     = re.compile(r"[_~`^\\]")

_OCR_NOISE_SUBS = [
    (re.compile(r"\bl\b"), "I"),
    (re.compile(r"1(?=[A-Za-z])"), "I"),
    (re.compile(r"(?<=[A-Za-z])1"), "I"),
    (re.compile(r"\b0(?=[A-Za-z])"), "O"),
    (re.compile(r"(?<=[A-Za-z])0\b"), "O"),
    (re.compile(r"rn"), "m"),
    (re.compile(r"vv"), "w"),
]


def _clean_ocr_text(text: str) -> str:
    text = _PIPE_TO_I.sub("I", text)
    text = _DIGIT_TO_LETTER.sub("O", text)
    text = _STRAY_PUNCT.sub(" ", text)
    text = re.sub(r" {2,}", " ", text)
    return text


def _clean_ocr_text_aggressive(text: str) -> str:
    text = _clean_ocr_text(text)
    for pattern, replacement in _OCR_NOISE_SUBS:
        text = pattern.sub(replacement, text)
    return text


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
# Name variants and fuzzy matching
# ─────────────────────────────────────────────────────────────────────────────

def _name_variants(full_name: str) -> list[str]:
    norm    = _normalize(full_name)
    tokens  = [t for t in norm.split() if len(t) > 1]
    variants: set[str] = {norm}
    variants.add(" ".join(sorted(tokens)))
    if len(tokens) <= 4:
        for perm in itertools.permutations(tokens):
            variants.add(" ".join(perm))
    else:
        variants.add(" ".join(reversed(tokens)))
    variants.update(tokens)
    for i in range(len(tokens)):
        for j in range(len(tokens)):
            if i != j:
                variants.add(f"{tokens[i]} {tokens[j]}")
    return list(variants)


def _is_blocked_word(word: str) -> bool:
    return word.lower() in _COMMON_WORD_BLOCKLIST


def _initials_present_score(name_tokens: list[str], norm_text: str) -> float:
    return 0.0


def _fuzzy_name_score(
    full_name: str,
    text: str,
    min_token_similarity: float = _MIN_TOKEN_SIMILARITY,
) -> float:
    if not text.strip():
        return 0.0
    norm_text = _normalize(text)
    for variant in _name_variants(full_name):
        if variant in norm_text:
            return 1.0
    name_tokens = [t for t in _normalize(full_name).split() if len(t) > 2 and not _is_blocked_word(t)]
    if not name_tokens:
        return 0.0
    text_words = list({
        w for w in re.split(r"\W+", norm_text)
        if len(w) > 2 and not _is_blocked_word(w)
    })
    best_scores = []
    for token in name_tokens:
        if len(token) <= 3:
            best = 1.0 if token in text_words else 0.0
        else:
            best = max(
                (_levenshtein_ratio(token, word) for word in text_words),
                default=0.0,
            )
        best_scores.append(best)
    if not best_scores:
        return 0.0
    avg_score = sum(best_scores) / len(best_scores)
    return round(avg_score, 4)


def _fuzzy_name_in_text(
    full_name: str,
    text: str,
    min_token_similarity: float = _MIN_TOKEN_SIMILARITY,
) -> tuple[bool, float]:
    score = _fuzzy_name_score(full_name, text, min_token_similarity)
    if not text.strip():
        return False, 0.0
    norm_text   = _normalize(text)
    name_tokens = [
        t for t in _normalize(full_name).split()
        if len(t) > 2 and not _is_blocked_word(t)
    ]
    if not name_tokens:
        return False, score
    text_words = list({
        w for w in re.split(r"\W+", norm_text)
        if len(w) > 2 and not _is_blocked_word(w)
    })

    def _token_matches(token: str) -> bool:
        if len(token) <= 3:
            return token in text_words
        return max(
            (_levenshtein_ratio(token, w) for w in text_words),
            default=0.0,
        ) >= min_token_similarity

    def _token_best_score(token: str) -> float:
        if len(token) <= 3:
            return 1.0 if token in text_words else 0.0
        return max(
            (_levenshtein_ratio(token, w) for w in text_words),
            default=0.0,
        )

    tokens_matched = sum(1 for t in name_tokens if _token_matches(t))
    n = len(name_tokens)
    if n == 1:
        required_matches = 1
    elif n == 2:
        required_matches = 2
    else:
        required_matches = max(2, int(n * 0.60))

    surname_ok = True
    if n >= 2:
        candidate_surnames = []
        last_tok = name_tokens[-1]
        if not _is_blocked_word(last_tok) and len(last_tok) > 2:
            candidate_surnames.append(last_tok)
        first_tok = name_tokens[0]
        if not _is_blocked_word(first_tok) and len(first_tok) > 2 and first_tok != last_tok:
            candidate_surnames.append(first_tok)
        if candidate_surnames:
            best_surname_score = max(_token_best_score(s) for s in candidate_surnames)
            surname_ok = best_surname_score >= _SURNAME_MATCH_THRESHOLD

    found = (tokens_matched >= required_matches) and surname_ok
    return found, score


def _fuzzy_name_score_best(full_name: str, raw_text: str) -> float:
    score_raw      = _fuzzy_name_score(full_name, raw_text)
    cleaned        = _clean_ocr_text(raw_text)
    score_cleaned  = _fuzzy_name_score(full_name, cleaned)
    aggressive     = _clean_ocr_text_aggressive(raw_text)
    score_agg      = _fuzzy_name_score(full_name, aggressive)
    return max(score_raw, score_cleaned, score_agg)


def _fuzzy_name_in_text_best(
    full_name: str,
    raw_text: str,
) -> tuple[bool, float]:
    found_raw,     score_raw     = _fuzzy_name_in_text(full_name, raw_text)
    cleaned                      = _clean_ocr_text(raw_text)
    found_cleaned, score_cleaned = _fuzzy_name_in_text(full_name, cleaned)
    aggressive                   = _clean_ocr_text_aggressive(raw_text)
    found_agg,     score_agg     = _fuzzy_name_in_text(full_name, aggressive)

    found_best = found_raw or found_cleaned or found_agg
    score_best = max(score_raw, score_cleaned, score_agg)
    return found_best, score_best


# FIX-5: _check_name_tolerant — raised the score threshold and tightened
# surname matching. The old threshold of 25% was so low it accepted almost
# any document regardless of whether the applicant's name was present.
# New threshold: 55% score OR surname match with a stricter ratio of 0.75.
def _check_name_tolerant(applicant_name: str, document_text: str) -> tuple[bool, float]:
    name_found, raw_score = _fuzzy_name_in_text_best(applicant_name, document_text)
    score_percent = raw_score * 100

    app_norm = _normalize(applicant_name)
    tokens = [t for t in app_norm.split() if len(t) >= 3 and not _is_blocked_word(t)]
    surname = app_norm.split()[-1] if app_norm.split() else ""

    surname_ok = False
    if surname and len(surname) >= 3:
        doc_norm = _normalize(document_text)
        if surname in doc_norm:
            surname_ok = True
        else:
            for word in doc_norm.split():
                # FIX-5a: Raised surname fuzzy ratio from 0.6 → 0.75 to reduce
                # false positives where unrelated words match the surname loosely.
                if _levenshtein_ratio(surname, word) >= 0.75:
                    surname_ok = True
                    break

    any_token_strong = False
    if tokens:
        doc_words = set(re.split(r"\W+", _normalize(document_text)))
        for tok in tokens:
            if len(tok) >= 4:
                best = max((_levenshtein_ratio(tok, w) for w in doc_words if len(w) >= 3), default=0.0)
                if best >= 0.80:
                    any_token_strong = True
                    break

    # FIX-5b: Raised score threshold from 25% → 55%.
    # Also require BOTH surname_ok AND any_token_strong for acceptance when score is low,
    # preventing a single weak token match from passing a document through.
    if score_percent >= 55.0:
        accepted = True
    elif surname_ok and any_token_strong:
        accepted = True
    elif name_found:
        # _fuzzy_name_in_text_best already applies proper multi-token matching rules
        accepted = True
    else:
        accepted = False

    logger.info(
        f"_check_name_tolerant: score={score_percent:.1f}%, surname_ok={surname_ok}, "
        f"any_token_strong={any_token_strong}, name_found={name_found} -> accepted={accepted}"
    )
    return accepted, score_percent


# ─────────────────────────────────────────────────────────────────────────────
# ID card hard-reject check
# ─────────────────────────────────────────────────────────────────────────────

def _id_card_hard_reject_check(
    norm_text: str,
    readable: int,
    scores: dict[str, int],
    is_pdf: bool,
) -> tuple[bool, str]:
    """
    Returns (reject, message).  reject=True means the document must NOT be
    accepted as an id_card regardless of any other logic.

    RULES (in order):
    Rule 0 — strong positive ID score → skip Rules 2/3/4 (but still run Rule 1).
    Rule 1 — hard-reject keywords (diploma/cert phrases) → always reject.
    Rule 2 — no positive ID keyword AND readable >= threshold → reject.
    Rule 3 — id_card score < minimum AND readable >= threshold → reject.
    Rule 4 — competing non-ID type scores decisively higher → reject.
    """
    id_score = scores.get("id_card", 0)

    # Rule 0 — strong positive ID score: skip Rules 2/3/4.
    if id_score >= _ID_CARD_STRONG_SCORE:
        logger.info(
            "_id_card_hard_reject_check: id_score=%d >= strong threshold=%d — "
            "skipping Rules 2/3/4.", id_score, _ID_CARD_STRONG_SCORE
        )

    # Rule 1 — hard-reject keywords (diploma/cert/CV phrases).
    for kw in _ID_CARD_HARD_REJECT_KEYWORDS:
        if kw in norm_text:
            logger.info(
                "_id_card_hard_reject_check: hard-reject keyword '%s' found in id_card slot "
                "(readable=%d).", kw, readable
            )
            return True, (
                f"This document appears to be a diploma, certificate, CV, or work letter, "
                f"not an ID card (detected keyword: '{kw}'). "
                "Please upload your National ID or Passport."
            )

    # If the ID score is strong, trust it — Rules 2/3/4 do not apply.
    if id_score >= _ID_CARD_STRONG_SCORE:
        return False, ""

    # Determine per-rule readable thresholds (PDF vs image).
    rule2_min = _ID_RULE2_MIN_READABLE_PDF if is_pdf else _ID_RULE2_MIN_READABLE
    rule3_min = _ID_RULE3_MIN_READABLE_PDF if is_pdf else _ID_RULE3_MIN_READABLE
    rule4_min = _ID_RULE4_MIN_READABLE_PDF if is_pdf else _ID_RULE4_MIN_READABLE
    compete_threshold = (
        _COMPETING_TYPE_HARD_REJECT_SCORE_PDF if is_pdf
        else _COMPETING_TYPE_HARD_REJECT_SCORE
    )

    # Rule 2 — no positive ID keyword present, but document is clearly readable.
    if readable >= rule2_min:
        has_positive_kw = any(kw in norm_text for kw in _ID_CARD_POSITIVE_KEYWORDS)
        if not has_positive_kw:
            logger.info(
                "_id_card_hard_reject_check: no positive ID keyword, "
                "readable=%d >= %d → reject.", readable, rule2_min
            )
            return True, (
                "This document does not appear to be a National ID or Passport. "
                "Please upload a valid government-issued ID."
            )

    # Rule 3 — id_card score too low for the amount of text extracted.
    min_score = _MIN_ID_CARD_SCORE_PDF if is_pdf else _MIN_ID_CARD_SCORE
    if readable >= rule3_min and id_score < min_score:
        logger.info(
            "_id_card_hard_reject_check: id_score=%d < min=%d, readable=%d >= %d → reject.",
            id_score, min_score, readable, rule3_min
        )
        return True, (
            "This document does not appear to be a National ID or Passport. "
            "Please upload a valid government-issued ID."
        )

    # Rule 4 — a competing non-ID type scores decisively higher.
    for non_id_type in _NON_ID_DOC_TYPES:
        s = scores.get(non_id_type, 0)
        if s >= compete_threshold and readable >= rule4_min:
            logger.info(
                "_id_card_hard_reject_check: competing type '%s' score=%d >= %d, "
                "readable=%d >= %d → reject.",
                non_id_type, s, compete_threshold, readable, rule4_min
            )
            return True, (
                f"This looks like a {non_id_type.replace('_', ' ')} rather than an ID. "
                "Please upload your National ID or Passport."
            )

    return False, ""


# ─────────────────────────────────────────────────────────────────────────────
# Document type classification
# ─────────────────────────────────────────────────────────────────────────────

def _score_doc_type(norm_text: str, doc_type: str) -> int:
    kw_weights = DOC_TYPE_KEYWORDS.get(doc_type, {})
    raw_score = sum(
        weight
        for kw, weight in kw_weights.items()
        if kw in norm_text
    )
    return max(0, raw_score)


_DIPLOMA_AS_CERTIFICATE_KWS = frozenset({
    "bachelor", "bachelor of", "bachelor's", "master", "master of",
    "master's", "degree", "university", "college", "diploma",
    "awarded the degree", "conferred", "graduation", "faculty",
})

_STRONG_CERT_PHRASES = frozenset({
    "certificate of", "this is to certify", "certified that",
    "professional certificate", "certifies that", "this certificate",
    "is hereby awarded", "certificate in", "certificate for",
    "awarded this certificate", "has successfully completed",
    "has completed the", "short course", "online course",
    "training programme", "training program",
})


def classify_document(
    text: str,
    declared_type: str,
    is_pdf: bool = False,
) -> tuple[bool, str, dict]:
    if not text.strip():
        return True, "unreadable", {}

    norm_text = _normalize(text)
    text_len  = len(norm_text)
    readable  = _count_readable_chars(text)

    scores: dict[str, int] = {
        doc_type: _score_doc_type(norm_text, doc_type)
        for doc_type in DOC_TYPE_KEYWORDS
    }

    best_type  = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]
    raw_decl_score = scores.get(declared_type, 0)

    # ── ID card path — uses centralised hard-reject helper ───────────────────
    if declared_type == "id_card":
        should_reject, reject_msg = _id_card_hard_reject_check(
            norm_text, readable, scores, is_pdf
        )
        if should_reject:
            best_non_id = max(_NON_ID_DOC_TYPES, key=lambda t: scores.get(t, 0))
            return False, best_non_id, scores

        id_score = scores.get("id_card", 0)

        # Low-readable PDF with some ID score → accept with advisory
        if is_pdf and readable < 150 and id_score > 0:
            return True, "id_card", scores

        # Not enough OCR to make a determination → accept with advisory
        if readable < 60:
            return True, "unknown", scores

        if id_score >= _MIN_ID_CARD_SCORE:
            return True, "id_card", scores

        # FIX-6: Raised the readable guard for the "give benefit of doubt" fallback.
        # Old value was _ID_RULE3_MIN_READABLE (which was itself just raised to 350).
        # For a document with low id_score, we accept it only if OCR is genuinely sparse.
        if readable < 150:
            return True, "unknown", scores

        return False, "unknown_non_id", scores

    # ── Non-id_card types ────────────────────────────────────────────────────

    if readable < _MIN_OCR_CHARS_FOR_TYPE_MISMATCH and best_type != declared_type:
        return True, declared_type, scores

    if declared_type == "certificate":
        diploma_as_cert = any(kw in norm_text for kw in _DIPLOMA_AS_CERTIFICATE_KWS)
        has_strong_cert = any(kw in norm_text for kw in _STRONG_CERT_PHRASES)
        if diploma_as_cert or has_strong_cert or raw_decl_score > 0:
            logger.info(
                "classify_document: certificate slot — diploma_as_cert=%s, "
                "has_strong_cert=%s, raw_decl_score=%d — accepting.",
                diploma_as_cert, has_strong_cert, raw_decl_score,
            )
            return True, "certificate", scores

    if declared_type == "diploma":
        has_diploma_kw = any(
            kw in norm_text
            for kw in ("bachelor", "master", "degree", "diploma", "university", "college",
                        "awarded the degree", "conferred", "graduation", "faculty", "school of")
        )
        if has_diploma_kw:
            logger.info(
                "classify_document: diploma slot — diploma keywords present, "
                "raw_decl_score=%d — accepting.", raw_decl_score,
            )
            return True, "diploma", scores

    if is_pdf and readable < 300:
        boost_factor = 1.50 if declared_type == "cv" else 1.35
    elif text_len < 200 and raw_decl_score > 0:
        boost_factor = 1.20
    else:
        boost_factor = 1.0

    decl_score = int(raw_decl_score * boost_factor) if raw_decl_score > 0 else 0

    if is_pdf and readable < 300:
        tolerance = CLASSIFICATION_TOLERANCE_RATIO_PDF
    elif text_len < 200:
        tolerance = CLASSIFICATION_TOLERANCE_RATIO_SHORT
    else:
        tolerance = CLASSIFICATION_TOLERANCE_RATIO

    if declared_type == "certificate":
        tolerance = min(tolerance, CLASSIFICATION_TOLERANCE_RATIO_CERT)

    if best_score < MIN_CLASSIFICATION_SCORE:
        return True, declared_type, scores

    if best_type == declared_type:
        return True, best_type, scores

    if best_score < CLEAR_WINNER_THRESHOLD and decl_score >= best_score * tolerance:
        return True, declared_type, scores

    if declared_type == "cv" and raw_decl_score >= 8:
        _DIPLOMA_CEREMONY_KWS = {
            "hereby certifies", "awarded the degree", "conferred",
            "this is to certify that", "having satisfied the requirements",
            "requirements for the award", "satisfactorily completed",
            "has been awarded", "magna cum laude", "cum laude",
        }
        ceremony_hit = any(kw in norm_text for kw in _DIPLOMA_CEREMONY_KWS)
        if not ceremony_hit:
            return True, "cv", scores

    if declared_type == "certificate" and raw_decl_score >= 5:
        has_strong_cert_kw = any(kw in norm_text for kw in _STRONG_CERT_PHRASES)
        if has_strong_cert_kw:
            return True, "certificate", scores

    if readable < 200:
        logger.info(
            "classify_document: low readable (%d) fallback — accepting %s with advisory.",
            readable, declared_type,
        )
        return True, declared_type, scores

    return False, best_type, scores


# ─────────────────────────────────────────────────────────────────────────────
# Field-of-study verification
# ─────────────────────────────────────────────────────────────────────────────

def verify_field_of_study(
    field_of_study: str,
    diploma_text: str,
) -> tuple[bool, str]:
    if not diploma_text.strip():
        return True, "Field of study check skipped (no diploma text)."

    if AI_AVAILABLE:
        matched, ai_score = match_field_in_diploma(field_of_study, diploma_text)
        if matched:
            return True, f"Field confirmed (AI {ai_score:.0%})."
        if ai_score >= 0.25:
            return True, f"Field approx confirmed (AI {ai_score:.0%})."
        logger.info(
            "verify_field_of_study: field=%r ai_score=%.2f — "
            "returning advisory (not hard-reject); shortlisting engine will decide.",
            field_of_study, ai_score,
        )
        return True, (
            f"FIELD MISMATCH: '{field_of_study}' not confirmed (AI {ai_score:.0%}). "
            "Will be reviewed during shortlisting."
        )

    norm_field = _normalize(field_of_study)
    norm_text  = _normalize(diploma_text)
    if norm_field in norm_text:
        return True, "Field confirmed (text match)."

    field_tokens = [t for t in norm_field.split() if len(t) >= 3 and not _is_blocked_word(t)]
    text_words = set(re.split(r"\W+", norm_text))

    if not field_tokens:
        return True, "Field noted, could not verify terms."

    exact_matches = [t for t in field_tokens if t in text_words]
    if exact_matches:
        if len(exact_matches) >= 2 or len(exact_matches) / len(field_tokens) >= 0.5:
            return True, f"Field confirmed ({len(exact_matches)}/{len(field_tokens)} terms)."

    fuzzy_thresh = 0.75
    fuzzy_matches = 0
    for token in field_tokens:
        best = max((_levenshtein_ratio(token, w) for w in text_words if len(w) >= 3), default=0.0)
        if best >= fuzzy_thresh:
            fuzzy_matches += 1

    if fuzzy_matches >= 2 or (len(field_tokens) and fuzzy_matches / len(field_tokens) >= 0.5):
        return True, f"Field confirmed ({fuzzy_matches} fuzzy matches)."

    if len(norm_text.replace(" ", "")) < 200:
        return True, "Field not fully verified (limited text), accepted."

    logger.info(
        "verify_field_of_study: field=%r no keyword/fuzzy match — "
        "returning advisory (not hard-reject); shortlisting engine will decide.",
        field_of_study,
    )
    return True, (
        f"FIELD MISMATCH: '{field_of_study}' not found in diploma text. "
        "Will be reviewed during shortlisting."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Education level verification
# ─────────────────────────────────────────────────────────────────────────────

def verify_education_level_from_document(
    declared_level: str,
    diploma_text: str,
) -> tuple[bool, str]:
    if not diploma_text.strip():
        return True, "Education level check skipped (no diploma text)."

    norm_decl = _normalize(declared_level)
    canonical_decl = _EDU_LEVEL_ALIASES.get(norm_decl)
    if not canonical_decl:
        for alias, canonical in _EDU_LEVEL_ALIASES.items():
            if alias in norm_decl or norm_decl in alias:
                canonical_decl = canonical
                break

    if not canonical_decl:
        return True, f"Level '{declared_level}' noted (alias not recognised)."

    declared_ord = _EDU_LEVEL_ORDER.get(canonical_decl, 0)

    if AI_AVAILABLE:
        detected_level, confidence = classify_education_level(diploma_text)
        if detected_level is None or confidence < 0.30:
            return True, f"Level could not be determined (conf {confidence:.0%}), accepted."
        detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)
        if detected_ord >= declared_ord:
            return True, f"Level confirmed: {detected_level}."
        logger.info(
            "verify_education_level_from_document: declared=%r detected=%r — "
            "returning advisory (not hard-reject); shortlisting engine will decide.",
            declared_level, detected_level,
        )
        return True, (
            f"EDUCATION MISMATCH: declared {declared_level}, detected {detected_level}. "
            "Will be reviewed during shortlisting."
        )

    edu_keywords = {
        "phd": ["doctor of philosophy", "ph.d", "phd", "doctorate"],
        "master's": ["master of", "master's degree", "msc", "mba"],
        "bachelor's": ["bachelor of", "bachelor's degree", "bsc", "ba"],
        "diploma": ["advanced diploma", "higher diploma", "diploma in"],
    }
    norm_text = diploma_text.lower()
    detected_level = None
    for level, kw_list in edu_keywords.items():
        if any(kw in norm_text for kw in kw_list):
            detected_level = level
            break

    if detected_level is None:
        return True, "Level not detected in diploma text, accepted."

    detected_ord = _EDU_LEVEL_ORDER.get(detected_level, 0)
    if detected_ord >= declared_ord:
        return True, f"Level confirmed: {detected_level}."

    logger.info(
        "verify_education_level_from_document: declared=%r detected=%r (keyword) — "
        "returning advisory; shortlisting engine will decide.",
        declared_level, detected_level,
    )
    return True, (
        f"EDUCATION MISMATCH: declared {declared_level}, detected {detected_level}. "
        "Will be reviewed during shortlisting."
    )


def verify_identity(
    applicant_name: str,
    doc_texts: dict[str, str],
) -> tuple[bool, str]:
    readable_docs = {k: v for k, v in doc_texts.items() if v.strip()}
    if not readable_docs:
        return True, "Identity check skipped (no readable text)."
    name_found_in = []
    per_doc_scores = {}
    for doc_type, text in readable_docs.items():
        found, score = _fuzzy_name_in_text_best(applicant_name, text)
        per_doc_scores[doc_type] = round(score, 2)
        if found:
            name_found_in.append(doc_type)
    if "id_card" in readable_docs:
        id_text = readable_docs["id_card"]
        id_score = per_doc_scores.get("id_card", 0)
        id_readable = _count_readable_chars(id_text) >= _MIN_OCR_CHARS_FOR_ID
        id_quality_low = _ocr_quality_is_low(id_text, "id_card")
        if id_readable and not id_quality_low:
            if id_score < 0.30 or "id_card" not in name_found_in:
                return False, "The name on your ID doesn't match your account name. Please upload your own ID."
    if name_found_in:
        return True, f"Identity confirmed in {name_found_in}."
    return True, f"Identity not fully verified (scores {per_doc_scores}), accepted."


# ─────────────────────────────────────────────────────────────────────────────
# Pre-submission check
# ─────────────────────────────────────────────────────────────────────────────

def pre_submission_check(
    file_path: str,
    declared_type: str,
    applicant_name: str,
    field_of_study: str = "",
    education_level: str = "",
    fast_mode: bool = False,
) -> tuple[bool, str]:
    if not _ocr_enabled() or not OCR_AVAILABLE:
        reason = "OCR disabled" if not _ocr_enabled() else "Tesseract not installed"
        return True, f"✓ '{declared_type}' received. Document verification is running automatically."

    if declared_type == "experience":
        return True, "✓ Experience document accepted."

    if not os.path.exists(file_path):
        return False, "Uploaded file could not be read from disk. Please try uploading again."

    is_pdf      = _is_pdf_file(file_path)
    text        = extract_document_text(file_path, fast_mode=fast_mode, declared_type=declared_type)

    logger.info(
        f"OCR text from {declared_type} ({os.path.basename(file_path)}) "
        f"[is_pdf={is_pdf}, readable={_count_readable_chars(text)}]:\n{text[:800]}"
    )

    readable    = _count_readable_chars(text)
    threshold   = _get_threshold(declared_type, fast_mode, is_pdf=is_pdf)
    quality_low = _ocr_quality_is_low(text, declared_type, fast_mode, is_pdf=is_pdf)

    # ── Empty OCR ─────────────────────────────────────────────────────────────
    if not text.strip():
        if declared_type == "id_card":
            return False, "We couldn't read your ID. Please upload a clearer photo."
        return False, (
            f"We couldn't read your {declared_type.replace('_', ' ')}. "
            "Please upload a clearer scan or a text-based PDF."
        )

    # ── FIX-7: For id_card, run hard-reject BEFORE quality/name checks.
    if declared_type == "id_card":
        norm_text_early = _normalize(text)
        scores_early: dict[str, int] = {
            dt: _score_doc_type(norm_text_early, dt) for dt in DOC_TYPE_KEYWORDS
        }
        should_reject_early, reject_msg_early = _id_card_hard_reject_check(
            norm_text_early, readable, scores_early, is_pdf
        )
        if should_reject_early:
            logger.info(
                "pre_submission_check: early id_card hard-reject triggered "
                "(readable=%d): %s", readable, reject_msg_early
            )
            return False, reject_msg_early

    # ── Quality check ─────────────────────────────────────────────────────────
    if quality_low:
        logger.info(
            "pre_submission_check: quality_low=True for %s, readable=%d < threshold=%d — "
            "accepting with advisory.",
            declared_type, readable, threshold,
        )
        return True, f"✓ {declared_type.replace('_', ' ').title()} received. Our team will verify it shortly."

    # ── FIX-8: Name/identity check now applied to ALL document types,
    # not just id_card. Previously, cv/diploma/certificate were accepted
    # without any name verification, allowing anyone to upload a random
    # document. We now reject any document where the applicant's name
    # cannot be found — unless OCR quality is too low to be confident.
    #
    # For id_card: hard reject (name mismatch = document belongs to someone else).
    # For other types: hard reject only when readable chars are sufficient to be
    # confident the name would appear if the document were genuine.
    # ─────────────────────────────────────────────────────────────────────────
    _MIN_READABLE_FOR_NAME_CHECK = 120  # only check name if we have enough text

    if readable >= _MIN_READABLE_FOR_NAME_CHECK:
        name_accepted, name_score = _check_name_tolerant(applicant_name, text)
        if not name_accepted:
            if declared_type == "id_card":
                return False, (
                    f"We couldn't confirm your name on this ID. "
                    f"The ID should clearly show: {applicant_name}. "
                    "Please upload your own National ID or Passport."
                )
            else:
                return False, (
                    f"We couldn't confirm your name on this {declared_type.replace('_', ' ')}. "
                    f"The document should clearly show: {applicant_name}. "
                    "If your name appears differently on the document, please contact support."
                )
    else:
        logger.info(
            "pre_submission_check: readable=%d < %d — skipping name check for %s.",
            readable, _MIN_READABLE_FOR_NAME_CHECK, declared_type,
        )

    # ── Document type classification ──────────────────────────────────────────
    is_correct, detected_type, scores = classify_document(text, declared_type, is_pdf=is_pdf)

    # ── Second id_card hard-reject after full classify_document ───────────────
    if declared_type == "id_card":
        norm_text_full = _normalize(text)
        should_reject_full, reject_msg_full = _id_card_hard_reject_check(
            norm_text_full, readable, scores, is_pdf
        )
        if should_reject_full:
            logger.info(
                "pre_submission_check: post-classify id_card hard-reject triggered "
                "(readable=%d, is_correct=%s): %s",
                readable, is_correct, reject_msg_full,
            )
            return False, reject_msg_full

    # ── Unknown/unreadable but name OK → accept ───────────────────────────────
    if detected_type in ("unreadable", "unknown"):
        return True, f"✓ {declared_type.replace('_', ' ').title()} received. Our team will verify it shortly."

    # ── Non-ID type mismatch handling ─────────────────────────────────────────
    if not is_correct and detected_type not in ("unreadable", "unknown", "unknown_non_id"):
        if readable < 300:
            logger.info(
                "pre_submission_check: type mismatch for %s but readable=%d < 300 — "
                "accepting with advisory (detected_type=%s, scores=%s).",
                declared_type, readable, detected_type, scores,
            )
            return True, (
                f"✓ {declared_type.replace('_', ' ').title()} received. "
                "Our team will verify the document type during review."
            )

        return False, (
            f"This doesn't look like a {declared_type.replace('_', ' ')}. "
            f"Please upload the correct document."
        )

    # ── Diploma extra checks — ALWAYS accept, note for shortlisting ───────────
    if declared_type == "diploma" and readable >= _MIN_OCR_CHARS_FOR_DIPLOMA:
        if field_of_study:
            field_ok, field_msg = verify_field_of_study(field_of_study, text)
            if "mismatch" in field_msg.lower():
                logger.info(
                    "pre_submission_check: diploma field advisory at upload: %s", field_msg
                )
            return True, "✓ Diploma received. We'll verify the details during review."

        if education_level:
            edu_ok, edu_msg = verify_education_level_from_document(education_level, text)
            if "mismatch" in edu_msg.lower():
                logger.info(
                    "pre_submission_check: diploma edu-level advisory at upload: %s", edu_msg
                )
            return True, "✓ Diploma received. We'll verify the details during review."

    return True, f"✓ {declared_type.replace('_', ' ').title()} accepted."


# ─────────────────────────────────────────────────────────────────────────────
# Main verification entry point (called during AI shortlisting)
# ─────────────────────────────────────────────────────────────────────────────

def verify_documents(
    applicant_name: str,
    education_level: str,
    field_of_study: str,
    document_paths: list[str],
    declared_types: list[str] | None = None,
    cached_doc_texts: dict[str, str] | None = None,
) -> tuple[bool, bool, str]:
    if not _ocr_enabled() or not OCR_AVAILABLE:
        reason = "ENABLE_OCR=false" if not _ocr_enabled() else "Tesseract not available"
        doc_count = len(document_paths) if document_paths else 0
        return True, True, (
            f"⚠ Advisory: Document verification skipped — {reason} "
            f"({doc_count} file(s) received). "
            "Documents will be re-verified automatically when OCR is re-enabled."
        )
    if not document_paths:
        return False, False, "No documents uploaded. Please upload your ID, CV, and Diploma."

    doc_texts = {}
    all_verified = True
    advisory = False
    details = []
    for i, path in enumerate(document_paths):
        declared = (declared_types[i] if declared_types else "unknown")
        accepted, msg = pre_submission_check(
            path, declared, applicant_name, field_of_study, education_level, fast_mode=False
        )
        if accepted:
            details.append(f"{path}: ✓ {msg[:50]}")
            doc_texts[declared] = msg
        else:
            details.append(f"{path}: ✗ {msg[:100]}")
            all_verified = False
        if "limited text" in msg.lower() or "uncertain" in msg.lower() or "advisory" in msg.lower():
            advisory = True

    summary = "Documents: " + " | ".join(details)
    return all_verified, advisory, summary