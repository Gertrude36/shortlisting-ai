from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime
from typing import Tuple

import numpy as np
import pandas as pd

from model_loader import (
    model, feature_columns, label_encoders, scaler, _ARTIFACTS_OK
)
from models import Application, Job
from document_verifier import (
    verify_education_level_from_document,
    verify_field_of_study,
    verify_documents,
    _ocr_quality_is_low,
    _count_readable_chars,
)
from ai_matcher import (
    match_skills_in_cv,
    check_field_job_compatibility,
    AI_AVAILABLE,
)

SHORTLIST_THRESHOLD   = 0.55
HARD_REJECT_MAX_SCORE = 0.45

OCR_CONFIDENCE_THRESHOLD = 0

CV_SKILL_MATCH_WARN_THRESHOLD    = 0.60
CV_SKILL_MATCH_PENALTY_THRESHOLD = 0.40
CV_SKILL_MATCH_HARD_NOTE         = 0.20

EDU_HARD_REJECT_GAP   = 2
EDU_SOFT_WARN_GAP     = 1
EDU_SOFT_WARN_PENALTY = 0.08

SKILLS_HARD_REJECT_THRESHOLD = 0.0
SKILLS_PENALTY_THRESHOLD     = 0.20
SKILLS_WARN_THRESHOLD        = 0.30

EXP_HARD_REJECT_GAP  = 3
EXP_PENALTY_PER_YEAR = 0.05
EXP_MAX_PENALTY      = 0.15

EXP_DOC_MISMATCH_SOFT_GAP       = 2
EXP_DOC_MISMATCH_HARD_GAP       = 4
EXP_DOC_INFLATION_PENALTY       = 0.10
EXP_DOC_LARGE_INFLATION_PENALTY = 0.20

_DOC_QUALITY_FULL_CHARS: dict[str, int] = {
    "id_card":     300,
    "cv":          500,
    "diploma":     200,
    "certificate": 150,
    "experience":  150,
}

_OCR_FAILURE_SIGNALS = [
    "could not be extracted",
    "text could not be extracted",
    "cv text could not be extracted",
    "ocr",
    "scan",
    "blurry",
    "legible",
    "re-upload",
    "missing or could not be read",
    "could not be read",
    "unable to verify one or more",
    "hr review required",
    "skipped",
]

_TRUE_BLOCKING_SIGNALS = [
    "identity mismatch",
    "type mismatch",
    "field mismatch",
    "education level mismatch",
    "document rejected",
    "possible use of another person",
    "wrong document",
    " type mismatch",
    "id document rejected",
    "experience inflation risk",
    "skills inflation risk",
]


def _is_ocr_failure(msg: str) -> bool:
    lower = msg.lower()
    return any(sig in lower for sig in _OCR_FAILURE_SIGNALS)


def _is_true_blocking_failure(msg: str) -> bool:
    if not msg:
        return False
    lower = msg.lower()
    if _is_ocr_failure(msg):
        return False
    return any(sig.lower() in lower for sig in _TRUE_BLOCKING_SIGNALS)


def estimate_ocr_quality_from_texts(doc_texts: dict[str, str]) -> float:
    """
    Estimate overall OCR quality (0-100) from extracted document texts.
    FIX-ENGINE-1: Made public so main.py can call it directly.
    """
    if not doc_texts:
        return 0.0
    scores: list[float] = []
    for doc_type, text in doc_texts.items():
        if not text or not text.strip():
            scores.append(0.0)
            continue
        readable   = _count_readable_chars(text)
        full_chars = _DOC_QUALITY_FULL_CHARS.get(doc_type, 150)
        doc_score  = min(100.0, (readable / full_chars) * 100.0)
        scores.append(doc_score)
    if not scores:
        return 0.0
    avg = sum(scores) / len(scores)
    print(
        f"[estimate_ocr_quality_from_texts] per_doc={dict(zip(doc_texts.keys(), [round(s,1) for s in scores]))} "
        f"avg={avg:.1f}"
    )
    return round(avg, 1)


_estimate_ocr_quality_from_texts = estimate_ocr_quality_from_texts


JOB_FIELD_SPECIFICS: dict[str, dict[str, list[str]]] = {
    "software engineer": {
        "engineering": [
            "software engineering", "computer engineering",
            "computer science", "information technology",
        ],
    },
    "data analyst": {
        "engineering": [
            "computer engineering", "computer science",
            "information technology", "data engineering",
        ],
    },
    "project manager": {
        "engineering": [
            "civil engineering", "mechanical engineering", "software engineering",
            "electrical engineering", "industrial engineering",
            "computer engineering", "engineering management",
        ],
    },
}

JOB_FIELD_MAP: dict[str, list[str]] = {
    "software engineer":   ["computer science", "information technology", "software engineering", "computer engineering"],
    "data analyst":        ["computer science", "statistics", "mathematics", "data science", "information technology", "economics"],
    "nurse":               ["nursing", "clinical nursing", "health sciences", "public health", "general nursing"],
    "accountant":          ["accounting", "finance", "financial accounting", "business administration", "economics"],
    "project manager":     ["business administration", "management", "engineering", "information technology", "project management"],
    "civil engineer":      ["civil engineering", "structural engineering", "construction engineering", "environmental engineering"],
    "mechanical engineer": ["mechanical engineering", "manufacturing engineering", "industrial engineering"],
    "it":                  ["information technology", "computer science", "software engineering", "computer engineering", "ict"],
    "it engineer":         ["information technology", "computer science", "software engineering", "computer engineering", "ict"],
    "it support technician": ["information technology", "computer science", "software engineering", "computer engineering", "ict", "information and communication technology"],
    "doctor":              ["medicine", "mbchb", "mbbs", "health sciences", "clinical medicine"],
    "veterinarian":        ["veterinary medicine", "veterinary technology", "animal health", "animal science"],
    "pharmacist":          ["pharmacy", "pharmaceutical sciences", "pharmacology"],
    "teacher":             ["education", "teaching", "pedagogy"],
    "lawyer":              ["law", "legal studies", "jurisprudence"],
    "architect":           ["architecture", "urban planning", "building design"],
    "electrical engineer": ["electrical engineering", "electronics engineering", "power engineering"],
}

FIELD_ALIASES: dict[str, list[str]] = {
    "veterinary technology":   ["vet tech", "veterinary techology", "veternary technology", "animal technology", "vet technology"],
    "animal health":           ["animal science", "animal studies", "animal husbandry"],
    "computer science":        ["cs", "computing", "software engineering", "information technology", "it"],
    "information technology":  ["it", "ict", "computer science", "computing", "information systems", "it technician", "information and communication technology"],
    "nursing":                 ["registered nursing", "rn", "nurse", "clinical nursing", "general nursing"],
    "business administration": ["bba", "mba", "business management", "management", "business studies"],
    "accounting":              ["finance", "financial accounting", "cpa"],
    "medicine":                ["mbchb", "mbbs", "medical doctor", "md"],
    "software engineering":    ["computer science", "cs", "computing", "information technology"],
    "computer engineering":    ["computer science", "cs", "computing", "information technology"],
}

EDU_ORDER: dict[str, int] = {
    "diploma":    1,
    "bachelor's": 2,
    "bachelor":   2,
    "master's":   3,
    "master":     3,
    "phd":        4,
    "doctorate":  4,
}

_EDU_KEYWORD_MAP: list[tuple[str, int]] = [
    ("phd",        4), ("ph.d",       4), ("doctor",     4),
    ("master",     3), ("msc",        3), ("mba",        3),
    ("m.sc",       3), ("postgrad",   3), ("bachelor",   2),
    ("undergrad",  2), ("bsc",        2), ("b.sc",       2),
    ("beng",       2), ("llb",        2), ("honours",    2),
    ("hons",       2), ("degree",     2), ("diploma",    1),
    ("hnd",        1), ("hnc",        1), ("cert",       1),
    ("technician", 1), ("associate",  1),
]

_ORD_LABEL: dict[int, str] = {
    1: "Diploma",
    2: "Bachelor's degree",
    3: "Master's degree",
    4: "PhD / Doctorate",
}


def _score_band(score: float) -> str:
    if score >= 0.75:
        return "Strong match"
    if score >= 0.55:
        return "Good match"
    if score >= 0.40:
        return "Borderline match"
    return "Weak match"


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


def _levenshtein_ratio(a: str, b: str) -> float:
    if not a and not b: return 1.0
    if not a or not b:  return 0.0
    la, lb = len(a), len(b)
    dp = list(range(lb + 1))
    for i in range(1, la + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, lb + 1):
            cost  = 0 if a[i - 1] == b[j - 1] else 1
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev[j - 1] + cost)
    return 1.0 - dp[lb] / max(la, lb)


def _edu_ordinal(level: str) -> int:
    if not level: return 1
    norm = _normalize(level)
    if norm in EDU_ORDER: return EDU_ORDER[norm]
    for keyword, ordinal in _EDU_KEYWORD_MAP:
        if keyword in norm: return ordinal
    return 1


def _parse_list(raw: "str | None") -> list[str]:
    if not raw or str(raw).strip().lower() in ("none", "nan", ""):
        return []
    tokens = re.split(r"[,\n;|]+", str(raw))
    return [_normalize(t) for t in tokens if t.strip()]


def _token_match(a: str, b: str, fuzzy_threshold: float = 0.82) -> bool:
    a, b = _normalize(a), _normalize(b)
    if a == b: return True
    if a in b or b in a: return True
    words_a = {w for w in a.split() if len(w) >= 4}
    words_b = {w for w in b.split() if len(w) >= 4}
    if words_a & words_b: return True
    if _levenshtein_ratio(a, b) >= fuzzy_threshold: return True
    return False


def _field_match(app_field: str, req_fields: list[str]) -> bool:
    app_norm = _normalize(app_field)
    for req in req_fields:
        req_norm = _normalize(req)
        if _token_match(app_norm, req_norm): return True
        for canonical, aliases in FIELD_ALIASES.items():
            all_forms   = [canonical] + [_normalize(a) for a in aliases]
            app_matches = any(_levenshtein_ratio(app_norm, f) >= 0.80 or app_norm in f or f in app_norm for f in all_forms)
            req_matches = any(_levenshtein_ratio(req_norm, f) >= 0.80 or req_norm in f or f in req_norm for f in all_forms)
            if app_matches and req_matches: return True
        if _levenshtein_ratio(app_norm, req_norm) >= 0.75: return True
    return False


def _simple_field_match(app_field: str, req_fields_raw: str) -> int:
    app_norm = _normalize(app_field)
    req_norm = _normalize(req_fields_raw)
    if app_norm in req_norm: return 1
    for req in _parse_list(req_fields_raw):
        if app_norm in req or req in app_norm: return 1
    return 0


def _overlap_ratio(applicant_items: list[str], required_items: list[str]) -> float:
    if not required_items: return 1.0
    matches = sum(
        any(_token_match(req, app) for app in applicant_items)
        for req in required_items
    )
    return round(matches / len(required_items), 4)


def _overlap_count(applicant_items: list[str], required_items: list[str]) -> int:
    return sum(
        any(_token_match(req, app) for app in applicant_items)
        for req in required_items
    )


def _job_req_from_db(job: Job) -> dict:
    return {
        "Required_Education_Levels": job.required_education_levels or "Bachelor's",
        "Required_Fields":           job.required_fields           or "",
        "Required_Min_Experience":   int(job.required_min_experience or 0),
        "Required_Max_Experience":   int(job.required_max_experience or 99),
        "Required_Skills":           job.required_skills            or "",
        "Required_Certifications":   job.required_certifications    or "",
        "Preferred_Qualifications":  job.preferred_qualifications   or "",
    }


def _get_expected_fields_for_job(job: Job) -> list[str]:
    req        = _job_req_from_db(job)
    req_fields = _parse_list(req["Required_Fields"])
    if not req_fields:
        title_norm = _normalize(job.title)
        if title_norm in JOB_FIELD_MAP:
            return JOB_FIELD_MAP[title_norm][:]
        for key, fields in JOB_FIELD_MAP.items():
            if key in title_norm or all(w in title_norm for w in key.split() if len(w) >= 4):
                req_fields = fields[:]
                break
        if not req_fields:
            for key, fields in JOB_FIELD_MAP.items():
                key_words = [w for w in key.split() if len(w) >= 5]
                if any(w in title_norm for w in key_words):
                    req_fields = fields[:]
                    break
    return req_fields


def _refine_req_fields_for_job(job: Job, req_fields: list[str]) -> list[str]:
    title_norm = _normalize(job.title)
    refined    = []
    changed    = False
    applicable_specifics: dict[str, list[str]] = {}
    for job_key, field_map in JOB_FIELD_SPECIFICS.items():
        if job_key in title_norm:
            applicable_specifics = field_map
            break
    if not applicable_specifics:
        return req_fields
    for field in req_fields:
        field_norm = _normalize(field)
        replaced   = False
        for broad_term, specific_fields in applicable_specifics.items():
            if field_norm == broad_term or field_norm in broad_term or broad_term in field_norm:
                refined.extend(specific_fields)
                replaced = True
                changed  = True
                break
        if not replaced:
            refined.append(field)
    if changed:
        seen: set[str] = set()
        result: list[str] = []
        for f in refined:
            if f not in seen:
                seen.add(f)
                result.append(f)
        return result
    return req_fields


def _ai_field_job_compatible(app_field: str, job_title: str) -> tuple[bool, float]:
    if not AI_AVAILABLE:
        return True, 0.0
    try:
        result = check_field_job_compatibility(app_field, job_title)
        if result is None or not isinstance(result, (tuple, list)) or len(result) < 2:
            return True, 0.0
        compat, score = result
        return bool(compat), float(score) if score is not None else 0.0
    except Exception:
        return True, 0.0


def _safe_select_features(df: pd.DataFrame, required_columns: list[str]) -> pd.DataFrame:
    result       = {}
    missing_cols = []
    for col in required_columns:
        if col in df.columns:
            result[col] = df[col].values
        else:
            result[col] = [0]
            missing_cols.append(col)
    if missing_cols:
        print(f"[shortlisting_engine] WARNING: missing features defaulted to 0: {missing_cols}")
    return pd.DataFrame(result)


def _ai_skills_in_text(
    declared_skills: list[str],
    cv_text: str,
) -> tuple[list[str], list[str], dict[str, float]]:
    if not declared_skills:
        return [], [], {}
    if AI_AVAILABLE and cv_text.strip():
        try:
            results = match_skills_in_cv(declared_skills, cv_text)
            if results is None:
                results = {s: (False, 0.0) for s in declared_skills}
            found     = [s for s, (matched, _) in results.items() if matched]
            not_found = [s for s, (matched, _) in results.items() if not matched]
            scores    = {s: sc for s, (_, sc) in results.items()}
            return found, not_found, scores
        except (TypeError, ValueError, AttributeError) as e:
            print(f"[_ai_skills_in_text] AI matching failed ({e}), falling back to keyword matching")
    norm_text  = _normalize(cv_text)
    text_words = [w for w in re.split(r"\W+", norm_text) if len(w) >= 3]
    found, not_found, scores = [], [], {}
    for skill in declared_skills:
        skill_norm = _normalize(skill)
        matched    = skill_norm in norm_text or any(_token_match(skill_norm, w) for w in text_words)
        (found if matched else not_found).append(skill)
        scores[skill] = 1.0 if matched else 0.0
    return found, not_found, scores


def _exp_gap_status(exp_years: int, req_min_exp: int) -> tuple[str, int, float]:
    gap = max(0, req_min_exp - exp_years)
    if gap == 0:
        return "pass", 0, 0.0
    if gap <= EXP_HARD_REJECT_GAP:
        penalty = min(gap * EXP_PENALTY_PER_YEAR, EXP_MAX_PENALTY)
        return "penalty", gap, round(penalty, 4)
    return "hard_reject", gap, 0.0


def _estimate_years_from_experience_doc(exp_doc_text: str) -> "int | None":
    if not exp_doc_text or not exp_doc_text.strip():
        return None
    text = _normalize(exp_doc_text)
    CURRENT_YEAR = datetime.now().year
    word_numbers = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    explicit = re.findall(r"(\d+)\s*\+?\s*year[s]?\s+(?:of\s+)?(?:work\s+)?experience", text)
    if explicit:
        return max(int(y) for y in explicit)
    for word, num in word_numbers.items():
        if re.search(rf"\b{word}\b\s*\+?\s*year[s]?\s+(?:of\s+)?(?:work\s+)?experience", text):
            return num
    year_pairs = re.findall(
        r"(20\d{2}|19\d{2})\s*(?:[-\u2013\u2014to/]+)\s*(20\d{2}|19\d{2}|present|current|now|date)",
        text
    )
    if year_pairs:
        total_months = 0
        for start_str, end_str in year_pairs:
            start = int(start_str)
            end   = CURRENT_YEAR if end_str in ("present", "current", "now", "date") else int(end_str)
            if 1950 <= start <= CURRENT_YEAR and start <= end <= CURRENT_YEAR + 1:
                total_months += (end - start) * 12
        if total_months > 0:
            return max(1, round(total_months / 12))
    all_years = [int(y) for y in re.findall(r"\b(20\d{2}|19\d{2})\b", text)
                 if 1970 <= int(y) <= CURRENT_YEAR]
    if len(all_years) >= 2:
        span = max(all_years) - min(all_years)
        if 0 < span <= 40:
            return span
    return None


def _cross_check_experience_doc(
    declared_exp_years: int,
    exp_doc_text: str,
) -> tuple[list[str], list[str], list[str], float]:
    hard_fails:    list[str] = []
    soft_warnings: list[str] = []
    confirmations: list[str] = []
    exp_doc_penalty: float   = 0.0
    has_exp_doc = bool(exp_doc_text and exp_doc_text.strip())
    if not has_exp_doc:
        if declared_exp_years > 0:
            soft_warnings.append(
                f"\u26a0 No experience document uploaded. Declared {declared_exp_years} year(s) "
                "of experience could not be verified from a supporting document. "
                "HR may request an employment letter or reference letter for verification."
            )
        return hard_fails, soft_warnings, confirmations, exp_doc_penalty
    estimated = _estimate_years_from_experience_doc(exp_doc_text)
    print(f"[exp_doc_check] declared={declared_exp_years}yr doc_estimated={estimated}yr")
    if estimated is None:
        soft_warnings.append(
            "\u26a0 Experience document uploaded but specific duration could not be "
            "determined automatically. HR will verify experience years manually."
        )
        return hard_fails, soft_warnings, confirmations, exp_doc_penalty
    gap = declared_exp_years - estimated
    if abs(gap) <= EXP_DOC_MISMATCH_SOFT_GAP:
        confirmations.append(
            f"\u2705 Experience document confirms approximately {estimated} year(s) of experience "
            f"(declared: {declared_exp_years} yr(s) -- within acceptable range)."
        )
    elif EXP_DOC_MISMATCH_SOFT_GAP < gap <= EXP_DOC_MISMATCH_HARD_GAP:
        exp_doc_penalty = EXP_DOC_INFLATION_PENALTY
        soft_warnings.append(
            f"\u26a0 Experience discrepancy: declared {declared_exp_years} yr(s) but document "
            f"suggests approximately {estimated} yr(s) -- a gap of {gap} year(s). "
            f"A score adjustment of {exp_doc_penalty*100:.0f}% has been applied. "
            "HR review is recommended."
        )
    elif gap > EXP_DOC_MISMATCH_HARD_GAP:
        exp_doc_penalty = EXP_DOC_LARGE_INFLATION_PENALTY
        hard_fails.append(
            f"EXPERIENCE INFLATION RISK: Declared {declared_exp_years} yr(s) but the uploaded "
            f"experience document suggests only approximately {estimated} yr(s) -- "
            f"a gap of {gap} year(s) which exceeds the acceptable threshold. "
            f"A score adjustment of {exp_doc_penalty*100:.0f}% has been applied. "
            "HR must manually verify before shortlisting."
        )
    else:
        soft_warnings.append(
            f"\u26a0 Experience document suggests approximately {estimated} yr(s) -- "
            f"slightly more than declared ({declared_exp_years} yr(s)). "
            "This is not a problem. HR may update the record if needed."
        )
    return hard_fails, soft_warnings, confirmations, exp_doc_penalty


def _cross_check_form_vs_docs(
    application: Application,
    doc_texts: dict[str, str],
) -> tuple[list[str], list[str], list[str], float]:
    hard_fails:    list[str] = []
    soft_warnings: list[str] = []
    confirmations: list[str] = []
    cv_skill_penalty = 0.0

    diploma_text    = doc_texts.get("diploma",     "") or ""
    cv_text         = doc_texts.get("cv",          "") or ""
    cert_text       = doc_texts.get("certificate", "") or ""
    experience_text = doc_texts.get("experience",  "") or ""

    if diploma_text.strip():
        edu_ok, edu_msg = verify_education_level_from_document(
            application.education_level or "", diploma_text
        )
        if edu_ok:
            confirmations.append(
                f"\u2705 Diploma confirms declared education level: '{application.education_level}'."
            )
        elif "mismatch" in edu_msg.lower():
            hard_fails.append(
                f"DOCUMENT MISMATCH -- Education: {edu_msg} "
                "(Declared level in form does not match the uploaded diploma.)"
            )
        else:
            soft_warnings.append(
                f"\u26a0 Education level could not be fully confirmed from diploma. "
                f"HR review recommended. Detail: {edu_msg}"
            )
    else:
        soft_warnings.append(
            "\u26a0 Diploma text could not be extracted -- education level confirmation skipped. "
            "HR should verify the diploma document manually."
        )

    if diploma_text.strip() and application.field_of_study:
        field_ok, field_msg = verify_field_of_study(
            application.field_of_study, diploma_text
        )
        if field_ok:
            confirmations.append(
                f"\u2705 Diploma confirms declared field of study: '{application.field_of_study}'."
            )
        else:
            hard_fails.append(
                f"DOCUMENT MISMATCH -- Field of Study: {field_msg} "
                "(The uploaded diploma does not match the field declared in the form.)"
            )

    if cv_text.strip() and application.skills:
        declared_skills = _parse_list(application.skills)
        if declared_skills:
            found_in_cv, not_in_cv, skill_scores = _ai_skills_in_text(declared_skills, cv_text)
            ratio         = len(found_in_cv) / len(declared_skills)
            score_summary = ", ".join(f"{s}({skill_scores.get(s, 0):.2f})" for s in not_in_cv[:5])
            ai_note       = " (AI semantic matching)" if AI_AVAILABLE else " (keyword matching)"
            if ratio >= CV_SKILL_MATCH_WARN_THRESHOLD:
                confirmations.append(
                    f"\u2705 CV confirms {len(found_in_cv)}/{len(declared_skills)} "
                    f"declared skills ({ratio*100:.0f}% match){ai_note}."
                )
            elif ratio >= CV_SKILL_MATCH_PENALTY_THRESHOLD:
                soft_warnings.append(
                    f"\u26a0 Only {len(found_in_cv)}/{len(declared_skills)} declared skills "
                    f"({ratio*100:.0f}%) confirmed in CV{ai_note}. "
                    f"Skills NOT evidenced: {', '.join(not_in_cv[:5])}{'...' if len(not_in_cv) > 5 else ''}. "
                    "HR review recommended."
                )
            elif ratio >= CV_SKILL_MATCH_HARD_NOTE:
                cv_skill_penalty = 0.10
                soft_warnings.append(
                    f"\u26a0 SKILLS GAP: Only {len(found_in_cv)}/{len(declared_skills)} "
                    f"({ratio*100:.0f}%) skills confirmed{ai_note}. "
                    f"Not evidenced: {score_summary}{'...' if len(not_in_cv) > 5 else ''}. "
                    "Score adjusted. HR review required."
                )
            else:
                cv_skill_penalty = 0.20
                hard_fails.append(
                    f"SKILLS INFLATION RISK: Only {len(found_in_cv)}/{len(declared_skills)} "
                    f"({ratio*100:.0f}%) declared skills evidenced in CV{ai_note}. "
                    f"Not found: {score_summary}{'...' if len(not_in_cv) > 5 else ''}. "
                    "HR must manually review before shortlisting."
                )
    elif not cv_text.strip():
        soft_warnings.append(
            "\u26a0 CV text could not be extracted -- skills cross-check skipped. "
            "HR review required. This does not automatically disqualify the candidate."
        )

    if cert_text.strip() and application.certifications:
        declared_certs = _parse_list(application.certifications)
        if declared_certs:
            found_certs, _, _ = _ai_skills_in_text(declared_certs, cert_text)
            if found_certs:
                confirmations.append(
                    f"\u2705 Certificate confirms {len(found_certs)}/{len(declared_certs)} certification(s)."
                )
            else:
                soft_warnings.append(
                    f"\u26a0 Declared certifications ({', '.join(declared_certs[:3])}) "
                    "not matched in uploaded certificate. HR verification required."
                )

    exp_hard, exp_warn, exp_confirm, exp_doc_penalty = _cross_check_experience_doc(
        declared_exp_years=int(application.experience_years or 0),
        exp_doc_text=experience_text,
    )
    hard_fails.extend(exp_hard)
    soft_warnings.extend(exp_warn)
    confirmations.extend(exp_confirm)
    cv_skill_penalty += exp_doc_penalty

    return hard_fails, soft_warnings, confirmations, cv_skill_penalty


def build_feature_vector(application: Application, job: Job) -> pd.DataFrame:
    req = _job_req_from_db(job)
    app_skills  = _parse_list(application.skills)
    app_certs   = _parse_list(application.certifications)
    edu_level   = (application.education_level or "").strip()
    field       = (application.field_of_study  or "").strip()
    exp_years   = int(application.experience_years or 0)
    grad_year   = int(application.graduation_year  or 2000)
    req_skills   = _parse_list(req["Required_Skills"])
    req_certs    = _parse_list(req["Required_Certifications"])
    req_fields   = _parse_list(req["Required_Fields"])
    req_edu_lvls = _parse_list(req["Required_Education_Levels"])
    req_min_exp  = req["Required_Min_Experience"]
    req_max_exp  = req["Required_Max_Experience"]
    skills_overlap_ratio   = _overlap_ratio(app_skills, req_skills)
    skills_overlap_count   = _overlap_count(app_skills, req_skills)
    total_applicant_skills = len(app_skills)
    cert_overlap_ratio     = _overlap_ratio(app_certs, req_certs)
    cert_overlap_count     = _overlap_count(app_certs, req_certs)
    has_certifications     = int(len(app_certs) > 0)
    app_edu_ord = _edu_ordinal(edu_level)
    edu_level_match = int(any(_token_match(edu_level, lvl) for lvl in req_edu_lvls))
    if not edu_level_match and req_edu_lvls:
        min_required_ord = min(_edu_ordinal(lvl) for lvl in req_edu_lvls)
        edu_level_match  = int(app_edu_ord >= min_required_ord)
    if req_edu_lvls:
        min_required_ord  = min(_edu_ordinal(lvl) for lvl in req_edu_lvls)
        edu_meets_minimum = int(app_edu_ord >= min_required_ord)
    else:
        edu_meets_minimum = 1
    field_match_simple = _simple_field_match(field, req["Required_Fields"])
    field_match_rich   = int(_field_match(field, req_fields))
    field_match        = field_match_simple
    exp_in_range           = int(req_min_exp <= exp_years <= req_max_exp)
    exp_above_min          = max(0, exp_years - req_min_exp)
    exp_surplus            = min(exp_years - req_min_exp, 10)
    current_year           = datetime.now().year
    years_since_graduation = max(0, min(current_year - grad_year, 30))
    combined_match_score = round(
        0.30 * edu_meets_minimum
        + 0.25 * field_match
        + 0.25 * skills_overlap_ratio
        + 0.12 * exp_in_range
        + 0.08 * cert_overlap_ratio,
        4,
    )
    def safe_encode(col: str, value: str) -> tuple[int, bool]:
        le = label_encoders.get(col)
        if le is None: return 0, False
        try:
            return int(le.transform([value])[0]), True
        except ValueError:
            return len(le.classes_) // 2, False
    gender_enc, _         = safe_encode("Gender",          application.gender or "Male")
    edu_enc, _            = safe_encode("Education_Level", edu_level)
    job_enc, job_is_known = safe_encode("Job_Applied",     job.title)
    age_est = max(18, current_year - (grad_year - 22))
    row = {
        "Age":                     age_est,
        "Gender":                  gender_enc,
        "Education_Level":         edu_enc,
        "Experience_Years":        exp_years,
        "Job_Applied":             job_enc,
        "Required_Min_Experience": req_min_exp,
        "Required_Max_Experience": req_max_exp,
        "skills_overlap_ratio":    skills_overlap_ratio,
        "skills_overlap_count":    skills_overlap_count,
        "total_applicant_skills":  total_applicant_skills,
        "cert_overlap_ratio":      cert_overlap_ratio,
        "cert_overlap_count":      cert_overlap_count,
        "has_certifications":      has_certifications,
        "edu_level_match":         edu_level_match,
        "edu_meets_minimum":       edu_meets_minimum,
        "edu_level_ordinal":       app_edu_ord,
        "field_match":             field_match,
        "field_match_rich":        field_match_rich,
        "exp_in_range":            exp_in_range,
        "exp_above_min":           exp_above_min,
        "exp_surplus":             exp_surplus,
        "years_since_graduation":  years_since_graduation,
        "combined_match_score":    combined_match_score,
        "_job_is_known":           job_is_known,
    }
    return pd.DataFrame([row])


def _hard_gate(
    application: Application,
    job: Job,
) -> tuple[bool, list[str], list[str], float, float, bool]:
    """
    Returns (passed, hard_failures, soft_warnings, exp_penalty, edu_soft_penalty, field_ok).

    FIX-ENGINE-FIELD-1: Now also returns field_ok (bool) so predict() can pass
    the authoritative field check result to _build_reason(), preventing the
    false "field mismatch" messages caused by _build_reason() re-running its
    own independent AI field compatibility check which could differ from here.
    """
    req          = _job_req_from_db(job)
    app_skills   = _parse_list(application.skills)
    req_skills   = _parse_list(req["Required_Skills"])
    req_edu_lvls = _parse_list(req["Required_Education_Levels"])
    field        = (application.field_of_study  or "").strip()
    edu_level    = (application.education_level or "").strip()
    exp_years    = int(application.experience_years or 0)
    req_min_exp  = req["Required_Min_Experience"]
    hard_failures:    list[str] = []
    soft_warnings:    list[str] = []
    exp_penalty:      float     = 0.0
    edu_soft_penalty: float     = 0.0

    # -- Education gate -------------------------------------------------------
    if req_edu_lvls:
        app_edu_ord      = _edu_ordinal(edu_level)
        min_required_ord = min(_edu_ordinal(lvl) for lvl in req_edu_lvls)
        edu_gap          = min_required_ord - app_edu_ord
        print(
            f"[edu_gate] applicant='{edu_level}'(ord={app_edu_ord}) "
            f"required={req_edu_lvls}(min_ord={min_required_ord}) "
            f"gap={edu_gap} hard_reject_threshold={EDU_HARD_REJECT_GAP}"
        )
        if edu_gap >= EDU_HARD_REJECT_GAP:
            req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
            app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
            hard_failures.append(
                f"Education level does not meet the minimum requirement: "
                f"you have a {app_label} but this position requires at least a {req_label}. "
                "We encourage you to pursue further education and apply again."
            )
        elif edu_gap == EDU_SOFT_WARN_GAP:
            req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
            app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
            edu_soft_penalty = EDU_SOFT_WARN_PENALTY
            soft_warnings.append(
                f"\u26a0 Education gap noted: you have a {app_label} but this role prefers a "
                f"{req_label}. A score adjustment of {edu_soft_penalty*100:.0f}% has been applied. "
                "Your overall profile has been considered -- you may still be shortlisted."
            )

    # -- Field gate -----------------------------------------------------------
    # FIX-ENGINE-FIELD-1: Track the authoritative field_ok result here.
    # This single result is returned to predict() and passed to _build_reason()
    # so the reason message matches the actual gate decision exactly.
    field_ok = True  # default: pass (no expected fields = no requirement)

    all_expected_fields = _get_expected_fields_for_job(job)
    if all_expected_fields:
        refined_fields = _refine_req_fields_for_job(job, all_expected_fields)
        fuzzy_ok       = _field_match(field, refined_fields)

        if fuzzy_ok:
            ai_compat, ai_score = _ai_field_job_compatible(field, job.title)
            if not ai_compat:
                if AI_AVAILABLE:
                    try:
                        result2 = check_field_job_compatibility(field, " ".join(refined_fields[:3]))
                        if result2 is None or not isinstance(result2, (tuple, list)) or len(result2) < 2:
                            ai_compat2, ai_score2 = False, 0.0
                        else:
                            ai_compat2, ai_score2 = bool(result2[0]), float(result2[1]) if result2[1] is not None else 0.0
                    except Exception:
                        ai_compat2, ai_score2 = False, 0.0
                else:
                    ai_compat2, ai_score2 = False, 0.0

                if not ai_compat2:
                    field_ok = False
                    hard_failures.append(
                        f"Field of study '{application.field_of_study}' is not compatible "
                        f"with the '{job.title}' role "
                        f"(AI domain compatibility: {max(ai_score, ai_score2):.0%}). "
                        f"Required background: {', '.join(refined_fields[:4])}."
                    )
                # else: fuzzy matched AND second AI check passed -> field_ok = True (default)
            # else: fuzzy matched AND first AI check passed -> field_ok = True (default)
        else:
            # Fuzzy match failed -- try AI as last resort
            ai_compat, ai_score = _ai_field_job_compatible(field, job.title)
            if not ai_compat:
                field_ok = False
                hard_failures.append(
                    f"Field of study '{application.field_of_study}' does not match "
                    f"any required field (AI score: {ai_score:.0%}). "
                    f"Required: {', '.join(refined_fields[:4])}."
                )
            else:
                # AI says compatible even though fuzzy failed -> accept
                field_ok = True

    # -- Experience gate ------------------------------------------------------
    exp_status, exp_gap, exp_penalty = _exp_gap_status(exp_years, req_min_exp)
    print(
        f"[exp_gate] applicant={exp_years}yr required={req_min_exp}yr "
        f"gap={exp_gap} status={exp_status} penalty={exp_penalty}"
    )
    if exp_status == "hard_reject":
        hard_failures.append(
            f"Experience ({exp_years} yr(s)) is significantly below the minimum required "
            f"({req_min_exp} yr(s)) -- gap of {exp_gap} year(s) exceeds the allowable threshold. "
            "We encourage you to gain more experience and apply again."
        )

    # -- Skills gate ----------------------------------------------------------
    if req_skills and app_skills:
        ratio = _overlap_ratio(app_skills, req_skills)
        if ratio <= SKILLS_HARD_REJECT_THRESHOLD:
            hard_failures.append(
                f"None of the declared skills match the job requirements. "
                f"Key skills needed: {', '.join(_parse_list(req['Required_Skills'])[:5])}. "
                "We encourage you to develop these skills and apply again."
            )
    elif req_skills and not app_skills:
        hard_failures.append(
            f"No skills declared. This role requires: "
            f"{', '.join(_parse_list(req['Required_Skills'])[:5])}."
        )

    passed = len(hard_failures) == 0
    return passed, hard_failures, soft_warnings, exp_penalty, edu_soft_penalty, field_ok


def _compute_display_score(
    ml_prob: float,
    combined_match_score: float,
    gate_failures: list[str],
    job_is_known: bool = True,
    cv_skill_penalty: float = 0.0,
    skills_ratio: float = 1.0,
    exp_penalty: float = 0.0,
    edu_soft_penalty: float = 0.0,
) -> float:
    ml_weight   = 0.40 if job_is_known else 0.15
    rule_weight = 0.60 if job_is_known else 0.85
    blended     = ml_weight * ml_prob + rule_weight * combined_match_score
    skills_score_penalty = 0.0
    if skills_ratio < SKILLS_PENALTY_THRESHOLD:
        skills_score_penalty = 0.08
    elif skills_ratio < SKILLS_WARN_THRESHOLD:
        skills_score_penalty = 0.04
    gate_penalty = min(len(gate_failures) * 0.10, 0.30)
    final = max(
        0.0,
        blended
        - gate_penalty
        - cv_skill_penalty
        - skills_score_penalty
        - exp_penalty
        - edu_soft_penalty,
    )
    return round(min(final, 1.0), 4)


_HR_ONLY_PHRASES = [
    "hr should",
    "hr must",
    "hr review",
    "hr will verify",
    "hr can",
    "hr may",
    "hr should review",
    "hr should verify",
    "before finalising",
    "before shortlisting",
    "manually verify",
    "manual hr review",
    "flagged for hr",
    "hr review required",
    "hr review is recommended",
    "verify manually",
    "re-verify",
    "hr department",
    "could not be verified automatically",
    "one or more documents could not be verified",
    "[hr]",
    "advisory -- will be verified manually by hr",
    "will be verified manually by hr",
    "verified manually by hr",
]

def _is_hr_only_message(msg: str) -> bool:
    lower = msg.lower()
    return any(phrase in lower for phrase in _HR_ONLY_PHRASES)


def _split_warnings_for_audience(
    warnings: list[str],
) -> tuple[list[str], list[str]]:
    applicant_warnings: list[str] = []
    hr_notes:           list[str] = []
    for msg in warnings:
        if _is_hr_only_message(msg):
            hr_notes.append(msg)
        else:
            applicant_warnings.append(msg)
    return applicant_warnings, hr_notes


def _build_reason(
    decision: str,
    display_score: float,
    ml_prob: float,
    application: Application,
    job: Job,
    df: pd.DataFrame,
    gate_failures: list[str],
    gate_soft_warnings: list[str],
    job_is_known: bool = True,
    doc_hard_fails: "list[str] | None"    = None,
    doc_warnings: "list[str] | None"      = None,
    doc_confirmations: "list[str] | None" = None,
    exp_penalty: float = 0.0,
    edu_soft_penalty: float = 0.0,
    doc_verified: bool = False,
    doc_advisory: bool = False,
    doc_check_ran: bool = True,
    # -- FIX-ENGINE-FIELD-1 -------------------------------------------------
    # NEW: authoritative field_ok result from _hard_gate().
    # Using this instead of re-running _ai_field_job_compatible() independently
    # eliminates false "field mismatch" messages when the field actually matched.
    # Default True = backward-compatible (show "field matches" if not provided).
    gate_field_ok: bool = True,
) -> str:
    req          = _job_req_from_db(job)
    app_skills   = _parse_list(application.skills)
    app_certs    = _parse_list(application.certifications)
    req_skills   = _parse_list(req["Required_Skills"])
    req_certs    = _parse_list(req["Required_Certifications"])
    req_fields   = _parse_list(req["Required_Fields"])
    req_edu_lvls = _parse_list(req["Required_Education_Levels"])

    edu_level   = (application.education_level or "").strip()
    app_edu_ord = _edu_ordinal(edu_level)
    if req_edu_lvls:
        min_required_ord = min(_edu_ordinal(lvl) for lvl in req_edu_lvls)
        edu_meets_min    = app_edu_ord >= min_required_ord
        edu_gap          = min_required_ord - app_edu_ord
    else:
        min_required_ord = 1
        edu_meets_min    = True
        edu_gap          = 0

    sk_ratio    = float(df["skills_overlap_ratio"].iloc[0])
    cert_ratio  = float(df["cert_overlap_ratio"].iloc[0])
    exp_years   = int(application.experience_years or 0)
    req_min_exp = req["Required_Min_Experience"]
    req_max_exp = req["Required_Max_Experience"]

    matched_skills = [s for s in app_skills if any(_token_match(s, r) for r in req_skills)]
    missing_skills = [r for r in req_skills  if not any(_token_match(r, a) for a in app_skills)]
    matched_certs  = [c for c in app_certs   if any(_token_match(c, r) for r in req_certs)]
    missing_certs  = [r for r in req_certs   if not any(_token_match(r, a) for a in app_certs)]

    criteria_met:      list[str] = []
    criteria_failed:   list[str] = []
    raw_warnings:      list[str] = []

    # -- Education ------------------------------------------------------------
    if edu_meets_min:
        criteria_met.append("Education level meets the minimum requirement for this position.")
    elif edu_gap == EDU_SOFT_WARN_GAP:
        req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
        app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
        raw_warnings.append(
            f"\u26a0 Education gap noted: you have a {app_label} but this role prefers a "
            f"{req_label}. A score adjustment of {edu_soft_penalty*100:.0f}% has been applied. "
            "Your overall profile has been considered."
        )
    else:
        req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
        app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
        criteria_failed.append(
            f"Education level does not meet the minimum requirement: "
            f"you have a {app_label} but this position requires at least a {req_label}. "
            "We encourage you to pursue further education and apply again."
        )

    # -- Field of Study --------------------------------------------------------
    # FIX-ENGINE-FIELD-1: Use gate_field_ok (the authoritative result from
    # _hard_gate) instead of re-running AI compatibility check independently.
    # Previously this block called _ai_field_job_compatible() again which could
    # return a different result from _hard_gate(), causing "field doesn't match"
    # to appear in criteria_failed even when the field passed the gate.
    all_expected   = _get_expected_fields_for_job(job)
    refined_fields = _refine_req_fields_for_job(job, all_expected) if all_expected else req_fields

    if gate_field_ok:
        criteria_met.append("Field of study matches the required field for this position.")
    else:
        display_fields = refined_fields[:3] or req_fields[:3] or ["see job description"]
        criteria_failed.append(
            f"Field of study '{application.field_of_study}' does not match "
            f"the required academic background for a '{job.title}' role "
            f"(required: {', '.join(display_fields)})."
        )

    # -- Experience -----------------------------------------------------------
    exp_status, exp_gap_val, _ = _exp_gap_status(exp_years, req_min_exp)
    if exp_status == "pass":
        if exp_years > req_max_exp:
            criteria_met.append(
                "Years of experience meet the minimum requirement. "
                "Note: exceeds maximum -- may be over-qualified, HR discretion."
            )
        else:
            criteria_met.append("Years of experience meet the minimum requirement for this position.")
    elif exp_status == "penalty":
        raw_warnings.append(
            f"\u26a0 Experience gap noted: you have {exp_years} yr(s) but this role requires "
            f"a minimum of {req_min_exp} yr(s) ({exp_gap_val} yr(s) short). "
            f"A score adjustment of {exp_penalty*100:.0f}% has been applied. "
            "Your strong education and/or skills profile has been taken into account -- "
            "you may still be shortlisted based on your overall score."
        )
    else:
        criteria_failed.append(
            f"Experience ({exp_years} yr(s)) is significantly below the minimum required "
            f"({req_min_exp} yr(s)) -- gap of {exp_gap_val} year(s) exceeds the allowable threshold. "
            "We encourage you to gain more experience and apply again."
        )

    # -- Skills ---------------------------------------------------------------
    skills_msg_base = (
        f"Skills matched: {len(matched_skills)}/{len(req_skills) or 0} required "
        f"({sk_ratio*100:.0f}%)."
        + (f" Matched: {', '.join(matched_skills)}." if matched_skills else "")
        + (f" Missing: {', '.join(missing_skills)}."  if missing_skills else "")
    )
    if not req_skills:
        criteria_met.append("No specific skills listed as requirements for this position.")
    elif sk_ratio >= SKILLS_WARN_THRESHOLD:
        criteria_met.append(skills_msg_base)
    elif sk_ratio > SKILLS_HARD_REJECT_THRESHOLD:
        raw_warnings.append(
            f"\u26a0 Skills gap noted: {skills_msg_base} "
            f"We encourage you to develop the missing skills "
            f"({', '.join(missing_skills[:3])}) and apply again. "
            "This does not automatically disqualify your application -- "
            "your education and experience have been taken into account."
        )
    else:
        criteria_failed.append(
            f"None of the declared skills match the job requirements. "
            f"Key skills needed: {', '.join(missing_skills[:5])}. "
            "We encourage you to develop these skills and apply again."
        )

    # -- Certifications -------------------------------------------------------
    if req_certs:
        if cert_ratio > 0:
            cert_msg = (
                f"Certifications: {len(matched_certs)}/{len(req_certs)} matched ({cert_ratio*100:.0f}%)."
                + (f" Matched: {', '.join(matched_certs)}." if matched_certs else "")
                + (f" Missing: {', '.join(missing_certs)}."  if missing_certs else "")
            )
            criteria_met.append(cert_msg)
        else:
            missing_cert_names = ", ".join(missing_certs[:3]) if missing_certs else "see job description"
            raw_warnings.append(
                f"\u26a0 Certifications: {len(matched_certs)}/{len(req_certs)} matched (0%). "
                f"Missing: {missing_cert_names}. "
                "These will be reviewed as part of the evaluation process."
            )
            raw_warnings.append(
                f"\u26a0 [HR] Certifications: 0/{len(req_certs)} matched. "
                f"Missing: {', '.join(missing_certs[:5]) if missing_certs else 'see requirements'}. "
                "Advisory -- will be verified manually by HR."
            )

    for w in gate_soft_warnings:
        if w not in raw_warnings:
            raw_warnings.append(w)

    for c in (doc_confirmations or []):
        criteria_met.append(c)
    for w in (doc_warnings or []):
        raw_warnings.append(w)
    for f in (doc_hard_fails or []):
        criteria_failed.append(f)

    # -- Document status -------------------------------------------------------
    # FIX-SE-20: Only emit doc messages when verify_documents() actually ran.
    if doc_check_ran:
        if doc_verified and not doc_advisory:
            criteria_met.append("\u2705 Documents fully verified -- all required documents accepted.")
        elif doc_verified and doc_advisory:
            raw_warnings.append(
                "\u26a0 Your documents have been received. Some files could not be fully "
                "read automatically -- they will be reviewed as part of the evaluation process."
            )
            raw_warnings.append(
                "\u26a0 [HR] Documents accepted with advisory: one or more documents could not be "
                "fully verified by OCR. HR should manually review the flagged documents before "
                "finalising the shortlisting decision."
            )
        else:
            raw_warnings.append(
                "\u26a0 Your documents have been received and are under review. "
                "Our team will verify them as part of the evaluation process."
            )
            raw_warnings.append(
                "\u26a0 [HR] One or more documents could not be verified automatically. "
                "HR should review the uploaded documents before finalising the decision."
            )
    # doc_check_ran=False -> documents already verified at upload, emit nothing.

    band = _score_band(display_score)
    criteria_met.append(f"Overall match score: {display_score*100:.1f}% -- {band}.")

    for failure in gate_failures:
        if failure not in criteria_failed:
            criteria_failed.append(failure)

    criteria_warnings, hr_notes = _split_warnings_for_audience(raw_warnings)

    if decision == "shortlisted":
        summary = (
            f"Candidate meets the requirements for shortlisting "
            f"(score: {display_score*100:.1f}% -- {band})."
            + (f" Notes: {'; '.join(criteria_warnings[:2])}." if criteria_warnings else " All core criteria satisfied.")
        )
    else:
        all_fails = list(dict.fromkeys(criteria_failed))
        summary   = (
            f"Candidate does not meet minimum requirements (score: {display_score*100:.1f}% -- {band}). "
            f"Main reason(s): {'; '.join(all_fails[:2] or ['Score below threshold'])}."
        )

    return json.dumps({
        "decision":            decision,
        "score":               round(display_score, 4),
        "ml_confidence":       round(ml_prob, 4),
        "score_band":          band,
        "shortlist_threshold": SHORTLIST_THRESHOLD,
        "ml_note": (
            f"AI model confidence: {ml_prob*100:.1f}%"
            if job_is_known
            else f"AI model confidence: {ml_prob*100:.1f}% (rule-based -- job type not in training set)"
        ),
        "job_is_known":        job_is_known,
        "doc_verified":        doc_verified,
        "doc_advisory":        doc_advisory,
        "criteria_met":        criteria_met,
        "criteria_failed":     criteria_failed,
        "criteria_warnings":   criteria_warnings,
        "hr_notes":            hr_notes,
        "summary":             summary,
    }, ensure_ascii=False)


def _build_manual_review_reason(
    application: Application,
    job: Job,
    ocr_quality_score: float,
    route_reason: str = "low_ocr_quality",
) -> str:
    applicant_warnings = [
        "\u26a0 Your documents have been received. They are being reviewed by our team "
        "and you will be notified of the outcome in due course.",
    ]
    if route_reason == "advisory_docs":
        hr_notes = [
            f"\u26a0 [HR] Document OCR quality estimated at {ocr_quality_score:.0f}/100 "
            f"(threshold: {OCR_CONFIDENCE_THRESHOLD}/100). One or more uploaded documents "
            "could not be read automatically with sufficient confidence.",
            "\u26a0 [HR] This application has been placed in the HR Manual Review Queue.",
            "\u26a0 [HR] HR can review the documents, then approve (shortlist) or reject this candidate.",
        ]
    else:
        hr_notes = [
            f"\u26a0 [HR] Document OCR quality score ({ocr_quality_score:.0f}/100) is below the "
            f"minimum threshold ({OCR_CONFIDENCE_THRESHOLD}/100) required for automated shortlisting.",
            "\u26a0 [HR] This application has been placed in the HR Manual Review Queue.",
            "\u26a0 [HR] HR can review the documents, then approve (shortlist) or reject this candidate.",
        ]
    return json.dumps({
        "decision":            "manual_review",
        "score":               None,
        "ml_confidence":       None,
        "score_band":          "Pending HR Review",
        "shortlist_threshold": SHORTLIST_THRESHOLD,
        "ml_note":             "Automatic shortlisting skipped -- document quality too low for reliable AI evaluation.",
        "job_is_known":        True,
        "doc_verified":        False,
        "doc_advisory":        True,
        "ocr_quality_score":   round(ocr_quality_score, 1),
        "ocr_threshold":       OCR_CONFIDENCE_THRESHOLD,
        "criteria_met":        [],
        "criteria_failed":     [],
        "criteria_warnings":   applicant_warnings,
        "hr_notes":            hr_notes,
        "summary": (
            f"Application flagged for HR manual review -- average document quality score "
            f"{ocr_quality_score:.0f}/100 is below the automated shortlisting threshold "
            f"of {OCR_CONFIDENCE_THRESHOLD}/100. HR must review before a decision is made."
        ),
    }, ensure_ascii=False)


def predict(
    application: Application,
    job: Job,
    doc_texts: "dict[str, str] | None" = None,
    document_paths: "list[str] | None" = None,
    declared_types: "list[str] | None" = None,
    ocr_quality_score: "float | None"  = None,
) -> tuple[str, float, str, dict]:
    from fastapi import HTTPException

    if not _ARTIFACTS_OK or model is None or scaler is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "ML shortlisting engine is unavailable -- model artifacts failed to load. "
                "Check server logs for details."
            ),
        )

    # -- FIX-ENGINE-2: Determine effective OCR quality score ------------------
    effective_ocr_score: float = 100.0

    if ocr_quality_score is not None:
        effective_ocr_score = float(ocr_quality_score)
        print(f"[predict] app={application.id} using explicit ocr_quality_score={effective_ocr_score:.1f}")
    elif hasattr(application, "ocr_quality_score") and application.ocr_quality_score is not None:
        effective_ocr_score = float(application.ocr_quality_score)
        print(f"[predict] app={application.id} using stored ocr_quality_score={effective_ocr_score:.1f}")
    elif getattr(application, "ocr_confidence_flag", False) is True:
        effective_ocr_score = 0.0
        print(f"[predict] app={application.id} ocr_confidence_flag=True -> effective_ocr_score=0")
    elif doc_texts:
        effective_ocr_score = estimate_ocr_quality_from_texts(doc_texts)
        print(f"[predict] app={application.id} estimated ocr quality from doc_texts: {effective_ocr_score:.1f}")

    # -- FIX-ENGINE-3: Route to manual_review when OCR quality is too low -----
    is_low_ocr = effective_ocr_score < OCR_CONFIDENCE_THRESHOLD

    if is_low_ocr:
        print(
            f"[predict] app={application.id} OCR quality {effective_ocr_score:.1f} < "
            f"{OCR_CONFIDENCE_THRESHOLD} -- routing to manual_review"
        )
        route_reason = "low_ocr_quality"
        if doc_texts and any(v and v.strip() for v in doc_texts.values()):
            route_reason = "advisory_docs"
        reason_json = _build_manual_review_reason(
            application, job, effective_ocr_score, route_reason=route_reason
        )
        doc_result = {
            "verified": False,
            "advisory": True,
            "summary": (
                f" Low OCR quality ({effective_ocr_score:.1f}/100) -- "
                "application routed to HR manual review queue."
            ),
        }
        return "manual_review", 0.0, reason_json, doc_result

    # -- Normal path -----------------------------------------------------------
    doc_verified       = False
    doc_advisory       = False
    doc_verify_summary = "Documents not checked."
    doc_check_ran      = False

    if document_paths:
        doc_check_ran = True
        doc_verified, doc_advisory, doc_verify_summary = verify_documents(
            applicant_name   = application.full_name if hasattr(application, "full_name") else "",
            education_level  = application.education_level or "",
            field_of_study   = application.field_of_study  or "",
            document_paths   = document_paths,
            declared_types   = declared_types,
            cached_doc_texts = doc_texts,
        )
        print(
            f"[predict] verify_documents -> verified={doc_verified} "
            f"advisory={doc_advisory} for application {application.id}"
        )

        # Hard reject if documents failed verification (identity mismatch or false documents)
        if not doc_verified:
            print(
                f"[predict] app={application.id} documents failed verification -- hard rejecting"
            )
            reason_json = _build_manual_review_reason(
                application, job, effective_ocr_score, route_reason="doc_verification_failed"
            )
            doc_result = {
                "verified": False,
                "advisory": False,
                "summary": doc_verify_summary,
            }
            return "hard_reject", 0.0, reason_json, doc_result

        if doc_advisory and doc_texts:
            estimated_quality = estimate_ocr_quality_from_texts(doc_texts)
            print(
                f"[predict] app={application.id} post-verify advisory=True "
                f"estimated_ocr_quality={estimated_quality:.1f} threshold={OCR_CONFIDENCE_THRESHOLD}"
            )
            if estimated_quality < OCR_CONFIDENCE_THRESHOLD:
                print(
                    f"[predict] app={application.id} estimated OCR quality {estimated_quality:.1f} "
                    f"< {OCR_CONFIDENCE_THRESHOLD} -- routing to manual_review (advisory_docs)"
                )
                reason_json = _build_manual_review_reason(
                    application, job, estimated_quality, route_reason="advisory_docs"
                )
                doc_result = {
                    "verified": False,
                    "advisory": True,
                    "summary": (
                        f" Advisory document quality estimated at {estimated_quality:.1f}/100 -- "
                        "application routed to HR manual review queue."
                    ),
                }
                return "manual_review", 0.0, reason_json, doc_result

    elif hasattr(application, "doc_verified"):
        doc_verified = bool(application.doc_verified)
        doc_advisory = getattr(application, "doc_advisory", False)
        # doc_check_ran stays False -> _build_reason() emits no doc messages

    # -- FIX-ENGINE-FIELD-1: _hard_gate now returns field_ok ------------------
    passed, gate_failures, gate_soft_warnings, exp_penalty, edu_soft_penalty, gate_field_ok = _hard_gate(
        application, job
    )

    df           = build_feature_vector(application, job)
    job_is_known = bool(df["_job_is_known"].iloc[0])
    feature_df   = _safe_select_features(df, feature_columns)

    try:
        X_scaled = scaler.transform(feature_df)
    except Exception:
        try:
            X_scaled = scaler.transform(feature_df.values)
        except Exception:
            X_scaled = feature_df.values

    try:
        ml_prob = float(model.predict_proba(X_scaled)[0][1])
        ml_prob = max(0.0, min(1.0, ml_prob))
    except Exception as e:
        print(f"[shortlisting_engine] model.predict_proba failed: {e}")
        ml_prob = 0.0

    combined_match_score = float(df["combined_match_score"].iloc[0])
    skills_ratio         = float(df["skills_overlap_ratio"].iloc[0])

    doc_hard_fails:    list[str] = []
    doc_warnings:      list[str] = []
    doc_confirmations: list[str] = []
    cv_skill_penalty   = 0.0

    if doc_texts:
        raw_hard, raw_warn, doc_confirmations, cv_skill_penalty = (
            _cross_check_form_vs_docs(application, doc_texts)
        )
        for msg in raw_hard:
            if _is_ocr_failure(msg):
                doc_warnings.append(msg)
            else:
                doc_hard_fails.append(msg)
        doc_warnings.extend(raw_warn)

    all_gate_failures = gate_failures + doc_hard_fails
    has_hard_failures = len(all_gate_failures) > 0

    display_score = _compute_display_score(
        ml_prob,
        combined_match_score,
        all_gate_failures,
        job_is_known,
        cv_skill_penalty,
        skills_ratio,
        exp_penalty=exp_penalty,
        edu_soft_penalty=edu_soft_penalty,
    )

    print(
        f"[predict] app={application.id} ml_prob={ml_prob:.3f} "
        f"combined={combined_match_score:.3f} display={display_score:.3f} "
        f"threshold={SHORTLIST_THRESHOLD} gate_failures={len(all_gate_failures)} "
        f"gate_field_ok={gate_field_ok} doc_hard={len(doc_hard_fails)} "
        f"doc_warn={len(doc_warnings)} doc_check_ran={doc_check_ran}"
    )

    if not has_hard_failures:
        decision = "shortlisted" if display_score >= SHORTLIST_THRESHOLD else "not_shortlisted"
        reason = _build_reason(
            decision=decision,
            display_score=display_score,
            ml_prob=ml_prob,
            application=application,
            job=job,
            df=df,
            gate_failures=[],
            gate_soft_warnings=gate_soft_warnings,
            job_is_known=job_is_known,
            doc_hard_fails=[],
            doc_warnings=doc_warnings,
            doc_confirmations=doc_confirmations,
            exp_penalty=exp_penalty,
            edu_soft_penalty=edu_soft_penalty,
            doc_verified=doc_verified,
            doc_advisory=doc_advisory,
            doc_check_ran=doc_check_ran,
            gate_field_ok=gate_field_ok,  # FIX-ENGINE-FIELD-1
        )
    else:
        if display_score >= SHORTLIST_THRESHOLD:
            decision = "shortlisted"
            print(
                f"[shortlisting_engine] OVERRIDE: gate failures present but score "
                f"{display_score:.1%} >= {SHORTLIST_THRESHOLD:.1%} -- shortlisting with warnings."
            )
        else:
            decision = "not_shortlisted"

        reason = _build_reason(
            decision=decision,
            display_score=display_score,
            ml_prob=ml_prob,
            application=application,
            job=job,
            df=df,
            gate_failures=all_gate_failures if decision == "not_shortlisted" else [],
            gate_soft_warnings=gate_soft_warnings,
            job_is_known=job_is_known,
            doc_hard_fails=doc_hard_fails if decision == "not_shortlisted" else [],
            doc_warnings=doc_warnings,
            doc_confirmations=doc_confirmations,
            exp_penalty=exp_penalty,
            edu_soft_penalty=edu_soft_penalty,
            doc_verified=doc_verified,
            doc_advisory=doc_advisory,
            doc_check_ran=doc_check_ran,
            gate_field_ok=gate_field_ok,  # FIX-ENGINE-FIELD-1
        )

    doc_result = {
        "verified": doc_verified,
        "advisory": doc_advisory,
        "summary":  doc_verify_summary,
    }

    # Send email notification to applicant about shortlisting result
    try:
        from email_utils import send_shortlisting_result_email
        applicant_email = getattr(application, "email", None) or getattr(application, "applicant_email", None)
        if applicant_email and decision in ("shortlisted", "not_shortlisted", "hard_reject"):
            send_shortlisting_result_email(
                to_name=application.full_name if hasattr(application, "full_name") else "Applicant",
                to_email=applicant_email,
                job_title=job.title if hasattr(job, "title") else "Position",
                decision=decision,
                ai_score=display_score,
                reason_summary=reason.get("summary", "") if isinstance(reason, dict) else str(reason)[:500],
            )
            print(f"[predict] Sent shortlisting result email to {applicant_email} for application {application.id}")
    except Exception as email_err:
        print(f"[predict] Failed to send shortlisting result email: {email_err}")

    return decision, display_score, reason, doc_result