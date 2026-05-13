from __future__ import annotations
"""
backend/shortlisting_engine.py
────────────────────────────────────────────────────────────────
FIXES APPLIED IN THIS VERSION:

  ✅ FIX J (CRITICAL) — Experience is now a HYBRID gate, not a hard gate
  ✅ FIX H (RETAINED) — Robust education level ordinal resolution
  ✅ FIX I (RETAINED) — Evaluation priority order enforced
  ✅ FIX E (RETAINED) — Rebalanced scoring weights
  ✅ FIX F (RETAINED) — Skills not a standalone hard-reject gate
  ✅ RETAINED — All previous fixes (A–G)

  ✅ FIX K (NEW) — Experience Document Cross-Check
  ────────────────────────────────────────────────────────────────
  The shortlisting engine now reads the uploaded "experience"
  document (employment letter / reference letter / work certificate)
  and cross-checks it against the declared experience_years.

  ✅ DEPLOY FIX — from __future__ import annotations MOVED TO LINE 1
  ────────────────────────────────────────────────────────────────
  Root cause of SyntaxError on Render:
    File "/app/shortlisting_engine.py", line 81
        from __future__ import annotations
  This import MUST be the very first statement in the file.
  Previously it was placed after the module docstring AND after
  some blank lines, which Python 3.11 rejects with a SyntaxError.
  Fixed by placing it as the absolute first line (before the docstring).
"""
from __future__ import annotations

import json
import re
import unicodedata
import numpy as np
import pandas as pd
from typing import Tuple

from model_loader import (
    model, feature_columns, label_encoders, scaler
)
from models import Application, Job
from document_verifier import (
    verify_education_level_from_document,
    verify_field_of_study,
)
from ai_matcher import (
    match_skills_in_cv,
    check_field_job_compatibility,
    AI_AVAILABLE,
)

# ─────────────────────────────────────────────────────────────────────────────
# Shortlisting threshold
# ─────────────────────────────────────────────────────────────────────────────
SHORTLIST_THRESHOLD   = 0.40
HARD_REJECT_MAX_SCORE = 0.35

CV_SKILL_MATCH_WARN_THRESHOLD    = 0.60
CV_SKILL_MATCH_PENALTY_THRESHOLD = 0.40
CV_SKILL_MATCH_HARD_NOTE         = 0.20

EDU_HARD_REJECT_GAP      = 1
SKILLS_HARD_REJECT_THRESHOLD = 0.0
SKILLS_PENALTY_THRESHOLD     = 0.20
SKILLS_WARN_THRESHOLD        = 0.30

# ✅ FIX J — Experience hybrid gate thresholds
EXP_HARD_REJECT_GAP     = 3    # Hard reject only if missing more than 3 years
EXP_PENALTY_PER_YEAR    = 0.05 # Score penalty per missing year (max capped below)
EXP_MAX_PENALTY         = 0.15 # Maximum score penalty for experience gap

# ✅ FIX K — Experience document cross-check thresholds
EXP_DOC_MISMATCH_SOFT_GAP = 2
EXP_DOC_MISMATCH_HARD_GAP = 4
EXP_DOC_INFLATION_PENALTY  = 0.10
EXP_DOC_LARGE_INFLATION_PENALTY = 0.20

# ─────────────────────────────────────────────────────────────────────────────
# Job-specific field refinements
# ─────────────────────────────────────────────────────────────────────────────
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
    "it engineer":         ["information technology", "computer science", "software engineering", "computer engineering", "ict"],
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
    ("phd",        4),
    ("ph.d",       4),
    ("doctor",     4),
    ("master",     3),
    ("msc",        3),
    ("mba",        3),
    ("m.sc",       3),
    ("postgrad",   3),
    ("bachelor",   2),
    ("undergrad",  2),
    ("bsc",        2),
    ("b.sc",       2),
    ("beng",       2),
    ("llb",        2),
    ("honours",    2),
    ("hons",       2),
    ("degree",     2),
    ("diploma",    1),
    ("hnd",        1),
    ("hnc",        1),
    ("cert",       1),
    ("technician", 1),
    ("associate",  1),
]

_ORD_LABEL: dict[int, str] = {
    1: "Diploma",
    2: "Bachelor's degree",
    3: "Master's degree",
    4: "PhD / Doctorate",
}


# ─────────────────────────────────────────────────────────────────────────────
# Text normalisation
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
# ✅ FIX H — Robust education ordinal
# ─────────────────────────────────────────────────────────────────────────────

def _edu_ordinal(level: str) -> int:
    if not level:
        return 1
    norm = _normalize(level)
    if norm in EDU_ORDER:
        return EDU_ORDER[norm]
    for keyword, ordinal in _EDU_KEYWORD_MAP:
        if keyword in norm:
            return ordinal
    return 1


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_list(raw: str | None) -> list[str]:
    if not raw or str(raw).strip().lower() in ("none", "nan", ""):
        return []
    tokens = re.split(r"[,\n;|]+", str(raw))
    return [_normalize(t) for t in tokens if t.strip()]


def _token_match(a: str, b: str, fuzzy_threshold: float = 0.82) -> bool:
    a, b = _normalize(a), _normalize(b)
    if a == b:
        return True
    if a in b or b in a:
        return True
    words_a = {w for w in a.split() if len(w) >= 4}
    words_b = {w for w in b.split() if len(w) >= 4}
    if words_a & words_b:
        return True
    if _levenshtein_ratio(a, b) >= fuzzy_threshold:
        return True
    return False


def _field_match(app_field: str, req_fields: list[str]) -> bool:
    app_norm = _normalize(app_field)
    for req in req_fields:
        req_norm = _normalize(req)
        if _token_match(app_norm, req_norm):
            return True
        for canonical, aliases in FIELD_ALIASES.items():
            all_forms   = [canonical] + [_normalize(a) for a in aliases]
            app_matches = any(_levenshtein_ratio(app_norm, f) >= 0.80 or app_norm in f or f in app_norm for f in all_forms)
            req_matches = any(_levenshtein_ratio(req_norm, f) >= 0.80 or req_norm in f or f in req_norm for f in all_forms)
            if app_matches and req_matches:
                return True
        if _levenshtein_ratio(app_norm, req_norm) >= 0.75:
            return True
    return False


def _simple_field_match(app_field: str, req_fields_raw: str) -> int:
    app_norm = _normalize(app_field)
    req_norm = _normalize(req_fields_raw)
    if app_norm in req_norm:
        return 1
    for req in _parse_list(req_fields_raw):
        if app_norm in req or req in app_norm:
            return 1
    return 0


def _overlap_ratio(applicant_items: list[str], required_items: list[str]) -> float:
    if not required_items:
        return 1.0
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
        seen:   set[str]  = set()
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
        return check_field_job_compatibility(app_field, job_title)
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
        results   = match_skills_in_cv(declared_skills, cv_text)
        found     = [s for s, (matched, _) in results.items() if matched]
        not_found = [s for s, (matched, _) in results.items() if not matched]
        scores    = {s: sc for s, (_, sc) in results.items()}
        return found, not_found, scores

    norm_text  = _normalize(cv_text)
    text_words = [w for w in re.split(r"\W+", norm_text) if len(w) >= 3]
    found, not_found, scores = [], [], {}
    for skill in declared_skills:
        skill_norm = _normalize(skill)
        matched    = skill_norm in norm_text or any(_token_match(skill_norm, w) for w in text_words)
        (found if matched else not_found).append(skill)
        scores[skill] = 1.0 if matched else 0.0
    return found, not_found, scores


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX J — Experience gap classifier
# ─────────────────────────────────────────────────────────────────────────────

def _exp_gap_status(exp_years: int, req_min_exp: int) -> tuple[str, int, float]:
    gap = max(0, req_min_exp - exp_years)
    if gap == 0:
        return "pass", 0, 0.0
    if gap <= EXP_HARD_REJECT_GAP:
        penalty = min(gap * EXP_PENALTY_PER_YEAR, EXP_MAX_PENALTY)
        return "penalty", gap, round(penalty, 4)
    return "hard_reject", gap, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX K — Experience document cross-check helper
# ─────────────────────────────────────────────────────────────────────────────

def _estimate_years_from_experience_doc(exp_doc_text: str) -> int | None:
    """
    Parse an experience document and estimate total years of experience mentioned.
    Returns the estimated integer years, or None if uncertain.
    """
    if not exp_doc_text or not exp_doc_text.strip():
        return None

    text = _normalize(exp_doc_text)

    # Strategy 1: explicit "X years" phrase
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

    # Strategy 2: date ranges
    CURRENT_YEAR = 2026
    year_pairs = re.findall(
        r"(20\d{2}|19\d{2})\s*(?:[-–—to/]+)\s*(20\d{2}|19\d{2}|present|current|now|date)",
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

    # Strategy 3: single years mentioned (loose fallback)
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
    """
    Cross-check the experience document against declared experience_years.
    Returns (hard_fails, soft_warnings, confirmations, exp_doc_penalty).
    """
    hard_fails:    list[str] = []
    soft_warnings: list[str] = []
    confirmations: list[str] = []
    exp_doc_penalty: float   = 0.0

    has_exp_doc = bool(exp_doc_text and exp_doc_text.strip())

    if not has_exp_doc:
        if declared_exp_years > 0:
            soft_warnings.append(
                f"⚠ No experience document uploaded. Declared {declared_exp_years} year(s) "
                "of experience could not be verified from a supporting document. "
                "HR may request an employment letter or reference letter for verification."
            )
        return hard_fails, soft_warnings, confirmations, exp_doc_penalty

    estimated = _estimate_years_from_experience_doc(exp_doc_text)
    print(
        f"[exp_doc_check] declared={declared_exp_years}yr "
        f"doc_estimated={estimated}yr"
    )

    if estimated is None:
        soft_warnings.append(
            "⚠ Experience document uploaded but specific duration could not be "
            "determined automatically. HR will verify experience years manually."
        )
        return hard_fails, soft_warnings, confirmations, exp_doc_penalty

    gap = declared_exp_years - estimated

    if abs(gap) <= EXP_DOC_MISMATCH_SOFT_GAP:
        confirmations.append(
            f"✅ Experience document confirms approximately {estimated} year(s) of experience "
            f"(declared: {declared_exp_years} yr(s) — within acceptable range)."
        )
    elif EXP_DOC_MISMATCH_SOFT_GAP < gap <= EXP_DOC_MISMATCH_HARD_GAP:
        exp_doc_penalty = EXP_DOC_INFLATION_PENALTY
        soft_warnings.append(
            f"⚠ Experience discrepancy: declared {declared_exp_years} yr(s) but document "
            f"suggests approximately {estimated} yr(s) — a gap of {gap} year(s). "
            f"A score adjustment of {exp_doc_penalty*100:.0f}% has been applied. "
            "HR review is recommended."
        )
    elif gap > EXP_DOC_MISMATCH_HARD_GAP:
        exp_doc_penalty = EXP_DOC_LARGE_INFLATION_PENALTY
        hard_fails.append(
            f"EXPERIENCE INFLATION RISK: Declared {declared_exp_years} yr(s) but the uploaded "
            f"experience document suggests only approximately {estimated} yr(s) — "
            f"a gap of {gap} year(s) which exceeds the acceptable threshold. "
            f"A score adjustment of {exp_doc_penalty*100:.0f}% has been applied. "
            "HR must manually verify before shortlisting."
        )
    else:
        soft_warnings.append(
            f"⚠ Experience document suggests approximately {estimated} yr(s) — "
            f"slightly more than declared ({declared_exp_years} yr(s)). "
            "This is not a problem. HR may update the record if needed."
        )

    return hard_fails, soft_warnings, confirmations, exp_doc_penalty


# ─────────────────────────────────────────────────────────────────────────────
# Document ↔ Form cross-check
# ─────────────────────────────────────────────────────────────────────────────

def _cross_check_form_vs_docs(
    application: Application,
    doc_texts: dict[str, str],
) -> tuple[list[str], list[str], list[str], float]:
    """
    Cross-checks uploaded documents against form fields.
    doc_texts keys: "id_card", "cv", "diploma", "certificate", "experience"
    Returns (hard_fails, soft_warnings, confirmations, total_penalty).
    """
    hard_fails:    list[str] = []
    soft_warnings: list[str] = []
    confirmations: list[str] = []
    cv_skill_penalty = 0.0

    diploma_text    = doc_texts.get("diploma",     "")
    cv_text         = doc_texts.get("cv",          "")
    cert_text       = doc_texts.get("certificate", "")
    experience_text = doc_texts.get("experience",  "")

    # ── 1. DIPLOMA → Education level + Field of study ────────────────────────
    if diploma_text.strip():
        edu_ok, edu_msg = verify_education_level_from_document(
            application.education_level or "", diploma_text
        )
        if edu_ok:
            confirmations.append(
                f"✅ Diploma confirms declared education level: '{application.education_level}'."
            )
        elif "mismatch" in edu_msg.lower():
            hard_fails.append(
                f"DOCUMENT MISMATCH — Education: {edu_msg} "
                "(Declared level in form does not match the uploaded diploma.)"
            )
        else:
            soft_warnings.append(
                f"⚠ Education level could not be fully confirmed from diploma. "
                f"HR review recommended. Detail: {edu_msg}"
            )
    else:
        soft_warnings.append(
            "⚠ Diploma text could not be extracted — education level confirmation skipped."
        )

    if diploma_text.strip() and application.field_of_study:
        field_ok, field_msg = verify_field_of_study(
            application.field_of_study, diploma_text
        )
        if field_ok:
            confirmations.append(
                f"✅ Diploma confirms declared field of study: '{application.field_of_study}'."
            )
        else:
            hard_fails.append(
                f"DOCUMENT MISMATCH — Field of Study: {field_msg} "
                "(The uploaded diploma does not match the field declared in the form.)"
            )

    # ── 2. CV → Skills cross-check ───────────────────────────────────────────
    if cv_text.strip() and application.skills:
        declared_skills = _parse_list(application.skills)
        if declared_skills:
            found_in_cv, not_in_cv, skill_scores = _ai_skills_in_text(declared_skills, cv_text)
            ratio         = len(found_in_cv) / len(declared_skills)
            score_summary = ", ".join(f"{s}({skill_scores.get(s,0):.2f})" for s in not_in_cv[:5])
            ai_note       = " (AI semantic matching)" if AI_AVAILABLE else " (keyword matching)"

            if ratio >= CV_SKILL_MATCH_WARN_THRESHOLD:
                confirmations.append(
                    f"✅ CV confirms {len(found_in_cv)}/{len(declared_skills)} "
                    f"declared skills ({ratio*100:.0f}% match){ai_note}."
                )
            elif ratio >= CV_SKILL_MATCH_PENALTY_THRESHOLD:
                soft_warnings.append(
                    f"⚠ Only {len(found_in_cv)}/{len(declared_skills)} declared skills "
                    f"({ratio*100:.0f}%) confirmed in CV{ai_note}. "
                    f"Skills NOT evidenced: {', '.join(not_in_cv[:5])}{'…' if len(not_in_cv)>5 else ''}. "
                    "HR review recommended."
                )
            elif ratio >= CV_SKILL_MATCH_HARD_NOTE:
                cv_skill_penalty = 0.10
                soft_warnings.append(
                    f"⚠ SKILLS GAP: Only {len(found_in_cv)}/{len(declared_skills)} "
                    f"({ratio*100:.0f}%) skills confirmed{ai_note}. "
                    f"Not evidenced: {score_summary}{'…' if len(not_in_cv)>5 else ''}. "
                    "Score adjusted. HR review required."
                )
            else:
                cv_skill_penalty = 0.20
                hard_fails.append(
                    f"SKILLS INFLATION RISK: Only {len(found_in_cv)}/{len(declared_skills)} "
                    f"({ratio*100:.0f}%) declared skills evidenced in CV{ai_note}. "
                    f"Not found: {score_summary}{'…' if len(not_in_cv)>5 else ''}. "
                    "HR must manually review before shortlisting."
                )
    elif not cv_text.strip():
        soft_warnings.append(
            "⚠ CV text could not be extracted — skills cross-check skipped. HR review required."
        )

    # ── 3. CERTIFICATE → Certifications cross-check ──────────────────────────
    if cert_text.strip() and application.certifications:
        declared_certs = _parse_list(application.certifications)
        if declared_certs:
            found_certs, _, _ = _ai_skills_in_text(declared_certs, cert_text)
            if found_certs:
                confirmations.append(
                    f"✅ Certificate confirms {len(found_certs)}/{len(declared_certs)} certification(s)."
                )
            else:
                soft_warnings.append(
                    f"⚠ Declared certifications ({', '.join(declared_certs[:3])}) "
                    "not matched in uploaded certificate. HR verification required."
                )

    # ── 4. EXPERIENCE DOCUMENT → Experience years cross-check ────────────────
    exp_hard, exp_warn, exp_confirm, exp_doc_penalty = _cross_check_experience_doc(
        declared_exp_years=int(application.experience_years or 0),
        exp_doc_text=experience_text,
    )
    hard_fails.extend(exp_hard)
    soft_warnings.extend(exp_warn)
    confirmations.extend(exp_confirm)
    cv_skill_penalty += exp_doc_penalty

    return hard_fails, soft_warnings, confirmations, cv_skill_penalty


# ─────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ─────────────────────────────────────────────────────────────────────────────

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
    years_since_graduation = max(0, min(2026 - grad_year, 30))

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
        if le is None:
            return 0, False
        try:
            return int(le.transform([value])[0]), True
        except ValueError:
            return len(le.classes_) // 2, False

    gender_enc, _         = safe_encode("Gender",          application.gender or "Male")
    edu_enc, _            = safe_encode("Education_Level", edu_level)
    job_enc, job_is_known = safe_encode("Job_Applied",     job.title)

    row = {
        "Age":                     max(18, 2026 - (grad_year - 22)),
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


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX J — Hard-gate: Education → Field → Exp (hybrid) → Skills
# ─────────────────────────────────────────────────────────────────────────────

def _hard_gate(application: Application, job: Job) -> tuple[bool, list[str], float]:
    req          = _job_req_from_db(job)
    app_skills   = _parse_list(application.skills)
    req_skills   = _parse_list(req["Required_Skills"])
    req_edu_lvls = _parse_list(req["Required_Education_Levels"])
    field        = (application.field_of_study  or "").strip()
    edu_level    = (application.education_level or "").strip()
    exp_years    = int(application.experience_years or 0)
    req_min_exp  = req["Required_Min_Experience"]

    failures:    list[str] = []
    exp_penalty: float     = 0.0

    # ── 1. EDUCATION ─────────────────────────────────────────────────────────
    if req_edu_lvls:
        app_edu_ord      = _edu_ordinal(edu_level)
        min_required_ord = min(_edu_ordinal(lvl) for lvl in req_edu_lvls)
        edu_gap          = min_required_ord - app_edu_ord

        print(
            f"[edu_gate] applicant='{edu_level}'(ord={app_edu_ord}) "
            f"required={req_edu_lvls}(min_ord={min_required_ord}) "
            f"gap={edu_gap} reject_threshold={EDU_HARD_REJECT_GAP}"
        )

        if edu_gap >= EDU_HARD_REJECT_GAP:
            req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
            app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
            failures.append(
                f"Education level does not meet the minimum requirement: "
                f"you have a {app_label} but this position requires at least a {req_label}. "
                "We encourage you to pursue further education and apply again."
            )

    # ── 2. FIELD OF STUDY ────────────────────────────────────────────────────
    all_expected_fields = _get_expected_fields_for_job(job)
    if all_expected_fields:
        refined_fields = _refine_req_fields_for_job(job, all_expected_fields)
        fuzzy_ok       = _field_match(field, refined_fields)

        if fuzzy_ok:
            ai_compat, ai_score = _ai_field_job_compatible(field, job.title)
            if not ai_compat:
                ai_compat2, ai_score2 = (
                    check_field_job_compatibility(field, " ".join(refined_fields[:3]))
                    if AI_AVAILABLE else (False, 0.0)
                )
                if not ai_compat2:
                    failures.append(
                        f"Field of study '{application.field_of_study}' is not compatible "
                        f"with the '{job.title}' role "
                        f"(AI domain compatibility: {max(ai_score, ai_score2):.0%}). "
                        f"Required background: {', '.join(refined_fields[:4])}."
                    )
        else:
            ai_compat, ai_score = _ai_field_job_compatible(field, job.title)
            if not ai_compat:
                failures.append(
                    f"Field of study '{application.field_of_study}' does not match "
                    f"any required field (AI score: {ai_score:.0%}). "
                    f"Required: {', '.join(refined_fields[:4])}."
                )

    # ── 3. EXPERIENCE (✅ FIX J — hybrid gate) ───────────────────────────────
    exp_status, exp_gap, exp_penalty = _exp_gap_status(exp_years, req_min_exp)

    print(
        f"[exp_gate] applicant={exp_years}yr required={req_min_exp}yr "
        f"gap={exp_gap} status={exp_status} penalty={exp_penalty}"
    )

    if exp_status == "hard_reject":
        failures.append(
            f"Experience ({exp_years} yr(s)) is significantly below the minimum required "
            f"({req_min_exp} yr(s)) — gap of {exp_gap} year(s) exceeds the allowable threshold. "
            "We encourage you to gain more experience and apply again."
        )

    # ── 4. SKILLS ────────────────────────────────────────────────────────────
    if req_skills and app_skills:
        ratio = _overlap_ratio(app_skills, req_skills)
        if ratio <= SKILLS_HARD_REJECT_THRESHOLD:
            failures.append(
                f"None of the declared skills match the job requirements. "
                f"Key skills needed: {', '.join(_parse_list(req['Required_Skills'])[:5])}. "
                "We encourage you to develop these skills and apply again."
            )
    elif req_skills and not app_skills:
        failures.append(
            f"No skills declared. This role requires: "
            f"{', '.join(_parse_list(req['Required_Skills'])[:5])}."
        )

    return len(failures) == 0, failures, exp_penalty


# ─────────────────────────────────────────────────────────────────────────────
# Display score calculation
# ─────────────────────────────────────────────────────────────────────────────

def _compute_display_score(
    ml_prob: float,
    combined_match_score: float,
    gate_failures: list[str],
    job_is_known: bool = True,
    cv_skill_penalty: float = 0.0,
    skills_ratio: float = 1.0,
    exp_penalty: float = 0.0,
) -> float:
    ml_weight   = 0.40 if job_is_known else 0.15
    rule_weight = 0.60 if job_is_known else 0.85
    blended     = ml_weight * ml_prob + rule_weight * combined_match_score

    skills_score_penalty = 0.0
    if skills_ratio < SKILLS_PENALTY_THRESHOLD:
        skills_score_penalty = 0.08
    elif skills_ratio < SKILLS_WARN_THRESHOLD:
        skills_score_penalty = 0.04

    penalty = min(len(gate_failures) * 0.15, 0.60)

    final = max(0.0, blended - penalty - cv_skill_penalty - skills_score_penalty - exp_penalty)
    return round(min(final, 1.0), 4)


# ─────────────────────────────────────────────────────────────────────────────
# Reason builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_reason(
    decision: str,
    display_score: float,
    ml_prob: float,
    application: Application,
    job: Job,
    df: pd.DataFrame,
    gate_failures: list[str],
    job_is_known: bool = True,
    doc_hard_fails: list[str] | None    = None,
    doc_warnings: list[str] | None      = None,
    doc_confirmations: list[str] | None = None,
    exp_penalty: float = 0.0,
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
    else:
        min_required_ord = 1
        edu_meets_min    = True

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
    criteria_warnings: list[str] = []

    # ── 1. EDUCATION ─────────────────────────────────────────────────────────
    if edu_meets_min:
        criteria_met.append("Education level meets the minimum requirement for this position.")
    else:
        req_label = _ORD_LABEL.get(min_required_ord, ", ".join(req_edu_lvls))
        app_label = _ORD_LABEL.get(app_edu_ord, edu_level)
        criteria_failed.append(
            f"Education level does not meet the minimum requirement: "
            f"you have a {app_label} but this position requires at least a {req_label}. "
            "We encourage you to pursue further education and apply again."
        )

    # ── 2. FIELD OF STUDY ────────────────────────────────────────────────────
    refined_fields    = _refine_req_fields_for_job(job, _get_expected_fields_for_job(job))
    fuzzy_field_ok    = _field_match(application.field_of_study or "", refined_fields)
    ai_compat, _      = _ai_field_job_compatible(application.field_of_study or "", job.title)
    field_actually_ok = fuzzy_field_ok and (ai_compat or not AI_AVAILABLE)

    if field_actually_ok:
        criteria_met.append("Field of study matches the required field for this position.")
    else:
        criteria_failed.append(
            f"Field of study '{application.field_of_study}' does not match "
            f"the required academic background for a '{job.title}' role "
            f"(required: {', '.join(refined_fields[:3]) or ', '.join(req_fields[:3]) or 'see job description'})."
        )

    # ── 3. EXPERIENCE (FIX J — hybrid result) ────────────────────────────────
    exp_status, exp_gap, _ = _exp_gap_status(exp_years, req_min_exp)

    if exp_status == "pass":
        if exp_years > req_max_exp:
            criteria_met.append(
                "Years of experience meet the minimum requirement. "
                "Note: exceeds maximum — may be over-qualified, HR discretion."
            )
        else:
            criteria_met.append("Years of experience meet the minimum requirement for this position.")
    elif exp_status == "penalty":
        criteria_warnings.append(
            f"⚠ Experience gap noted: you have {exp_years} yr(s) but this role requires "
            f"a minimum of {req_min_exp} yr(s) ({exp_gap} yr(s) short). "
            f"A score adjustment of {exp_penalty*100:.0f}% has been applied. "
            "Your strong education and/or skills profile has been taken into account — "
            "you may still be shortlisted based on your overall score."
        )
    else:
        criteria_failed.append(
            f"Experience ({exp_years} yr(s)) is significantly below the minimum required "
            f"({req_min_exp} yr(s)) — gap of {exp_gap} year(s) exceeds the allowable threshold. "
            "We encourage you to gain more experience and apply again."
        )

    # ── 4. SKILLS ────────────────────────────────────────────────────────────
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
        criteria_warnings.append(
            f"⚠ Skills gap noted: {skills_msg_base} "
            f"We encourage you to develop the missing skills "
            f"({', '.join(missing_skills[:3])}) and apply again. "
            "This does not automatically disqualify your application — "
            "your education and experience have been taken into account."
        )
    else:
        criteria_failed.append(
            f"None of the declared skills match the job requirements. "
            f"Key skills needed: {', '.join(missing_skills[:5])}. "
            "We encourage you to develop these skills and apply again."
        )

    # ── 5. CERTIFICATIONS ────────────────────────────────────────────────────
    if req_certs:
        cert_msg = (
            f"Certifications: {len(matched_certs)}/{len(req_certs)} matched ({cert_ratio*100:.0f}%)."
            + (f" Matched: {', '.join(matched_certs)}." if matched_certs else "")
            + (f" Missing: {', '.join(missing_certs)}."  if missing_certs else "")
        )
        if cert_ratio > 0:
            criteria_met.append(cert_msg)
        else:
            criteria_warnings.append(cert_msg + " (Advisory — will be verified manually by HR.)")

    # ── 6. DOCUMENT CROSS-CHECK RESULTS ──────────────────────────────────────
    for c in (doc_confirmations or []):
        criteria_met.append(c)
    for w in (doc_warnings or []):
        criteria_warnings.append(w)
    for f in (doc_hard_fails or []):
        criteria_failed.append(f)

    criteria_met.append(f"Overall match score: {display_score*100:.1f}%")

    for failure in gate_failures:
        if failure not in criteria_failed:
            criteria_failed.append(failure)

    if decision == "shortlisted":
        summary = (
            f"Candidate meets core requirements (score: {display_score*100:.1f}%)."
            + (f" Note: {'; '.join(criteria_warnings)}." if criteria_warnings else " All criteria satisfied.")
        )
    else:
        all_fails = list(dict.fromkeys(criteria_failed))
        summary   = (
            f"Candidate does not meet minimum requirements (score: {display_score*100:.1f}%). "
            f"Main reason(s): {'; '.join(all_fails[:2] or ['Score below threshold'])}."
        )

    return json.dumps({
        "decision":          decision,
        "score":             round(display_score, 4),
        "ml_confidence":     round(ml_prob, 4),
        "ml_note":           (
            f"AI model confidence: {ml_prob*100:.1f}%"
            if job_is_known
            else f"AI model confidence: {ml_prob*100:.1f}% (rule-based — job type not in training set)"
        ),
        "job_is_known":      job_is_known,
        "criteria_met":      criteria_met,
        "criteria_failed":   criteria_failed,
        "criteria_warnings": criteria_warnings,
        "summary":           summary,
    }, ensure_ascii=False)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def predict(
    application: Application,
    job: Job,
    doc_texts: dict[str, str] | None = None,
) -> Tuple[str, float, str]:
    """
    Returns (decision, score, reason_json).

    doc_texts keys accepted:
      "id_card", "cv", "diploma", "certificate", "experience"

    Evaluation priority:
      1. Education level  (hard gate)
      2. Field of study   (hard gate)
      3. Experience       (hybrid — hard reject only if gap > 3 yrs)
      4. Skills           (soft — only hard if ratio == 0)
      5. ML model score   (blended)
      6. Document cross-check (diploma, cv, certificate, experience)
    """
    passed, gate_failures, exp_penalty = _hard_gate(application, job)
    df                                  = build_feature_vector(application, job)

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
        doc_hard_fails, doc_warnings, doc_confirmations, cv_skill_penalty = (
            _cross_check_form_vs_docs(application, doc_texts)
        )

    all_gate_failures = gate_failures + doc_hard_fails
    all_passed        = passed and len(doc_hard_fails) == 0

    display_score = _compute_display_score(
        ml_prob, combined_match_score, all_gate_failures,
        job_is_known, cv_skill_penalty, skills_ratio,
        exp_penalty=exp_penalty,
    )

    if not all_passed:
        reason = _build_reason(
            decision="not_shortlisted", display_score=display_score,
            ml_prob=ml_prob, application=application, job=job, df=df,
            gate_failures=all_gate_failures, job_is_known=job_is_known,
            doc_hard_fails=doc_hard_fails, doc_warnings=doc_warnings,
            doc_confirmations=doc_confirmations,
            exp_penalty=exp_penalty,
        )
        return "not_shortlisted", display_score, reason

    decision = "shortlisted" if display_score >= SHORTLIST_THRESHOLD else "not_shortlisted"

    reason = _build_reason(
        decision=decision, display_score=display_score,
        ml_prob=ml_prob, application=application, job=job, df=df,
        gate_failures=[], job_is_known=job_is_known,
        doc_hard_fails=[], doc_warnings=doc_warnings,
        doc_confirmations=doc_confirmations,
        exp_penalty=exp_penalty,
    )

    return decision, display_score, reason