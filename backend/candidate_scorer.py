"""
candidate_scorer.py
Takes extracted candidate profile + job requirements,
and returns structured local scoring output:
  match_score, shortlisted, rank_priority, reasoning_text,
  criterion_scores (per-criterion breakdown).
"""

import logging
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# -- Scoring system prompt -----------------------------------------------------

SCORING_SYSTEM_PROMPT = """You are an expert AI recruitment assistant for a fully automated hiring system.

Your job is to evaluate a candidate's profile against a job's requirements and produce a detailed, 
fair, and explainable scoring decision.

You must return ONLY a valid JSON object with this exact structure:
{
  "match_score": <integer 0-100>,
  "shortlisted": <true|false>,
  "rank_priority": <integer 1-5 where 1=highest priority>,
  "reasoning_text": "<2-4 sentence plain-English summary of the decision>",
  "criterion_scores": {
    "education": {
      "score": <0-100>,
      "weight": <0.0-1.0>,
      "reasoning": "<one sentence>"
    },
    "experience": {
      "score": <0-100>,
      "weight": <0.0-1.0>,
      "reasoning": "<one sentence>"
    },
    "skills": {
      "score": <0-100>,
      "weight": <0.0-1.0>,
      "reasoning": "<one sentence>"
    },
    "certifications": {
      "score": <0-100>,
      "weight": <0.0-1.0>,
      "reasoning": "<one sentence>"
    },
    "language": {
      "score": <0-100>,
      "weight": <0.0-1.0>,
      "reasoning": "<one sentence>"
    }
  },
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "disqualified": <true|false>,
  "disqualification_reason": "<reason or null>"
}

Scoring rules:
- match_score = weighted average of criterion scores
- shortlisted = true if match_score >= 65 AND disqualified = false
- rank_priority: 1 = excellent match (85-100), 2 = strong (70-84), 3 = moderate (55-69), 4 = weak (40-54), 5 = poor (<40)
- disqualified = true only if a hard requirement is completely missing (e.g. required degree absent, required license missing)
- Be fair and objective. Do not penalize candidates for minor formatting or naming variations.
- Consider equivalent qualifications (e.g. relevant experience can compensate for missing formal degree if the job allows it).
"""


# -- Default criterion weights -------------------------------------------------

DEFAULT_WEIGHTS = {
    "education": 0.25,
    "experience": 0.35,
    "skills": 0.25,
    "certifications": 0.10,
    "language": 0.05,
}


# -- Public scoring function ---------------------------------------------------

def score_candidate(
    candidate_profile: dict,
    job_requirements: dict,
    weights: Optional[dict] = None,
) -> dict:
    """
    Score a single candidate against job requirements using local rule-based logic.

    Args:
        candidate_profile: Merged extracted document data for the candidate.
            Expected keys (all optional but helpful):
            full_name, skills, education, experience, certifications, languages, etc.

        job_requirements: Job posting requirements dict.
            Expected keys:
            job_title, required_education, required_experience_years,
            required_skills (list), preferred_skills (list),
            required_certifications (list), required_languages (list),
            hard_requirements (list of must-have strings),
            description (str)

        weights: Optional dict overriding DEFAULT_WEIGHTS per criterion.

    Returns:
        dict with match_score, shortlisted, rank_priority, reasoning_text,
        criterion_scores, strengths, gaps, disqualified, disqualification_reason,
        plus metadata: candidate_name, job_title, scoring_model.
    """
    effective_weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    return _local_score(candidate_profile, job_requirements, effective_weights)


def score_multiple_candidates(
    candidates: list[dict],
    job_requirements: dict,
    weights: Optional[dict] = None,
) -> list[dict]:
    """
    Score a list of candidates and return them sorted by match_score descending.

    Args:
        candidates: List of candidate profile dicts (from document_extractor).
        job_requirements: Job posting requirements dict.
        weights: Optional criterion weight overrides.

    Returns:
        List of scored candidate dicts, sorted best-to-worst, with "rank" field added.
    """
    scored = []
    for candidate in candidates:
        score = score_candidate(candidate, job_requirements, weights)
        scored.append(score)

    # Sort by match_score descending
    scored.sort(key=lambda x: x.get("match_score", 0), reverse=True)

    # Assign final rank
    for i, candidate in enumerate(scored):
        candidate["rank"] = i + 1

    return scored


# -- Helpers -------------------------------------------------------------------

def _format_education(education: list) -> str:
    if not education:
        return "Not provided"
    parts = []
    for edu in education:
        if isinstance(edu, dict):
            parts.append(
                f"{edu.get('degree', '')} in {edu.get('field', '')} "
                f"from {edu.get('institution', '')} ({edu.get('year', '')})"
            )
        else:
            parts.append(str(edu))
    return "; ".join(parts)


def _format_experience(experience: list) -> str:
    if not experience:
        return "Not provided"
    parts = []
    for exp in experience:
        if isinstance(exp, dict):
            parts.append(
                f"{exp.get('title', '')} at {exp.get('company', '')} "
                f"({exp.get('duration', '')})"
            )
        else:
            parts.append(str(exp))
    return "; ".join(parts)


def _fallback_score(candidate_profile: dict, job_requirements: dict, error: str = "") -> dict:
    """Return a safe fallback score when AI scoring fails."""
    return {
        "match_score": 0,
        "shortlisted": False,
        "rank_priority": 5,
        "reasoning_text": f"Scoring failed due to an error: {error}",
        "criterion_scores": {
            criterion: {"score": 0, "weight": weight, "reasoning": "Scoring unavailable"}
            for criterion, weight in DEFAULT_WEIGHTS.items()
        },
        "strengths": [],
        "gaps": ["Scoring system error -- manual review required"],
        "disqualified": False,
        "disqualification_reason": None,
        "candidate_name": candidate_profile.get("full_name", "Unknown"),
        "job_title": job_requirements.get("job_title", "Unknown"),
        "scoring_model": "fallback",
        "error": error,
    }


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _parse_list_field(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [s.strip() for s in str(value).split(",") if s.strip()]


def _collect_profile_text(candidate_profile: dict) -> str:
    texts = []

    def collect(value):
        if isinstance(value, dict):
            for v in value.values():
                collect(v)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif value is not None:
            texts.append(str(value))

    for value in candidate_profile.values():
        collect(value)

    return " ".join(texts).lower()


def _find_years_in_text(text: str) -> float:
    text = str(text or "")
    years = 0.0
    for match in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:years|yrs|y)\b", text, re.I):
        years = max(years, float(match.group(1)))
    if years:
        return years
    range_match = re.search(r"(\d{4})\s*[-–to]+\s*(\d{4})", text)
    if range_match:
        start = int(range_match.group(1))
        end = int(range_match.group(2))
        if end >= start:
            return float(end - start)
    return 0.0


def _estimate_experience_years(experience) -> float:
    if experience is None:
        return 0.0
    if isinstance(experience, (int, float)):
        return float(experience)
    if isinstance(experience, str):
        return _find_years_in_text(experience)
    total = 0.0
    for item in experience:
        if isinstance(item, dict):
            if item.get("duration"):
                years = _find_years_in_text(item["duration"])
                total += years
            elif item.get("start_date") and item.get("end_date"):
                try:
                    start = datetime.fromisoformat(item["start_date"])
                    end = datetime.fromisoformat(item["end_date"])
                    total += max(0.0, (end - start).days / 365.0)
                except Exception:
                    total += _find_years_in_text(" ".join(str(item.get(k, "")) for k in item.values()))
            else:
                total += _find_years_in_text(str(item))
        else:
            total += _find_years_in_text(str(item))
    return min(total, 30.0)


def _calculate_match_score(required: list[str], actual: list[str]) -> float:
    if not required:
        return 100.0
    actual_norm = [_normalize_text(x) for x in actual]
    matches = 0
    for item in required:
        needle = _normalize_text(item)
        if not needle:
            continue
        for candidate_text in actual_norm:
            if needle in candidate_text:
                matches += 1
                break
    return round((matches / len(required)) * 100.0, 1)


def _local_score(candidate_profile: dict, job_requirements: dict, weights: Optional[dict] = None) -> dict:
    effective_weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    profile_text = _collect_profile_text(candidate_profile)

    required_education = _parse_list_field(job_requirements.get("required_education"))
    required_experience = job_requirements.get("required_experience_years")
    required_skills = _parse_list_field(job_requirements.get("required_skills"))
    preferred_skills = _parse_list_field(job_requirements.get("preferred_skills"))
    required_certs = _parse_list_field(job_requirements.get("required_certifications"))
    required_languages = _parse_list_field(job_requirements.get("required_languages"))
    hard_requirements = _parse_list_field(job_requirements.get("hard_requirements"))

    education_items = candidate_profile.get("education", [])
    experience_items = candidate_profile.get("experience", [])
    candidate_skills = _parse_list_field(candidate_profile.get("skills"))
    candidate_certs = _parse_list_field(candidate_profile.get("certifications"))
    candidate_langs = _parse_list_field(candidate_profile.get("languages"))
    raw_text = candidate_profile.get("raw_text", "") or ""
    extraction_method = candidate_profile.get("extraction_method", "") or ""
    # Consider OCR poor when raw text is very short or extraction method indicates raw OCR
    ocr_poor = (len(raw_text.strip()) < 60) or extraction_method.endswith("_raw")

    edu_text = " ".join(
        str(item.get("degree", "")) + " " + str(item.get("field", "")) if isinstance(item, dict) else str(item)
        for item in education_items
    ).lower()
    if required_education:
        edu_score = 100.0 if any(_normalize_text(req) in edu_text for req in required_education) else 50.0
    else:
        edu_score = 100.0

    exp_years = _estimate_experience_years(experience_items)
    try:
        exp_req = float(required_experience) if required_experience not in (None, "", "None") else 0.0
    except Exception:
        exp_req = 0.0
    if exp_req > 0:
        exp_score = min(100.0, max(0.0, (exp_years / exp_req) * 100.0))
    else:
        exp_score = 100.0

    skills_score = _calculate_match_score(required_skills, candidate_skills)
    if preferred_skills:
        pref_score = _calculate_match_score(preferred_skills, candidate_skills)
        skills_score = min(100.0, skills_score + pref_score * 0.15)

    certification_score = _calculate_match_score(required_certs, candidate_certs)
    language_score = _calculate_match_score(required_languages, candidate_langs)

    hard_missing = []
    # Check hard requirements more robustly: look into structured fields first,
    # then fall back to raw profile text. If OCR quality is poor, do not
    # automatically disqualify -- flag for manual review instead.
    for req in hard_requirements:
        norm_req = _normalize_text(req)
        if not norm_req:
            continue

        found = False
        # search in explicit structured fields
        for field_list in (candidate_skills, candidate_certs, candidate_langs):
            for v in field_list:
                if norm_req in _normalize_text(v):
                    found = True
                    break
            if found:
                break

        # search in education items specially
        if not found and education_items:
            edu_combined = " ".join(
                (item.get("degree", "") + " " + item.get("field", "")) if isinstance(item, dict) else str(item)
                for item in education_items
            )
            if norm_req in _normalize_text(edu_combined):
                found = True

        # final fallback: search in collected profile text
        if not found and norm_req in profile_text:
            found = True

        if not found:
            hard_missing.append(req)

    # If OCR was poor and hard requirements appear missing, do not auto-disqualify.
    if hard_missing and ocr_poor:
        disqualified = False
        disqualification_reason = None
        needs_manual_review = True
    else:
        disqualified = bool(hard_missing)
        disqualification_reason = ", ".join(hard_missing) if hard_missing else None
        needs_manual_review = False

    match_score = round(
        edu_score * effective_weights["education"] +
        exp_score * effective_weights["experience"] +
        skills_score * effective_weights["skills"] +
        certification_score * effective_weights["certifications"] +
        language_score * effective_weights["language"],
        1,
    )

    strengths = []
    gaps = []
    if edu_score >= 90:
        strengths.append("Education matches the job requirement")
    else:
        gaps.append("Education does not meet the stated requirement")
    if exp_score >= 100:
        strengths.append(f"Estimated experience {exp_years:.1f} years meets requirement")
    else:
        gaps.append(f"Experience short by {max(0.0, exp_req - exp_years):.1f} years")
    if skills_score >= 80:
        strengths.append("Strong skills match to required job skills")
    else:
        gaps.append("Some required skills are missing or not clearly present")
    if certification_score >= 100:
        strengths.append("All required certifications are present")
    elif required_certs:
        gaps.append("Required certifications are missing or unclear")
    if language_score >= 100:
        strengths.append("Language requirements satisfied")
    elif required_languages:
        gaps.append("Language requirements not fully met")

    if hard_missing:
        gaps.append(f"Missing hard requirement(s): {', '.join(hard_missing)}")

    primary_gaps = []
    if disqualified:
        primary_gaps.append(f"missing hard requirement(s): {', '.join(hard_missing)}")
    elif match_score < 65:
        if edu_score < 90:
            primary_gaps.append("education below required level")
        if exp_score < 100:
            primary_gaps.append(f"experience short by {max(0.0, exp_req - exp_years):.1f} years")
        if skills_score < 80:
            primary_gaps.append("skills match is weak")
        if certification_score < 100 and required_certs:
            primary_gaps.append("required certifications missing")
        if language_score < 100 and required_languages:
            primary_gaps.append("language requirements incomplete")

    if needs_manual_review:
        reasoning_text = (
            f"Candidate requires manual review due to possible poor OCR/extraction. "
            f"Preliminary match score: {match_score:.0f}%. Please verify missing items: {', '.join(hard_missing)}."
        )
    elif disqualified:
        reasoning_text = (
            f"Candidate is not shortlisted due to {primary_gaps[0]}. "
            f"Overall match score is {match_score:.0f}%."
        )
    elif match_score >= 65:
        reasoning_text = (
            f"Candidate is shortlisted with a {match_score:.0f}% match. "
            f"Strengths include {', '.join(strengths[:2]) or 'good overall fit'}.")
    else:
        reason = primary_gaps[0] if primary_gaps else "gaps in the profile"
        reasoning_text = (
            f"Candidate is not shortlisted with a {match_score:.0f}% match. "
            f"Primary reason: {reason}."
        )

    return {
        "match_score": int(match_score),
        "shortlisted": (match_score >= 65 and not disqualified and not needs_manual_review),
        "rank_priority": 1 if match_score >= 85 else 2 if match_score >= 70 else 3 if match_score >= 55 else 4 if match_score >= 40 else 5,
        "reasoning_text": reasoning_text,
        "criterion_scores": {
            "education": {"score": int(edu_score), "weight": effective_weights["education"], "reasoning": "Education requirement matched." if edu_score >= 90 else "Education is below the requirement."},
            "experience": {"score": int(min(exp_score, 100)), "weight": effective_weights["experience"], "reasoning": "Experience requirement satisfied." if exp_score >= 100 else "Insufficient experience for the role."},
            "skills": {"score": int(min(skills_score, 100)), "weight": effective_weights["skills"], "reasoning": "Skills match the job requirements." if skills_score >= 80 else "Some required skills are missing."},
            "certifications": {"score": int(min(certification_score, 100)), "weight": effective_weights["certifications"], "reasoning": "Certifications match requirements." if certification_score >= 100 else "Missing or unmatched certifications."},
            "language": {"score": int(min(language_score, 100)), "weight": effective_weights["language"], "reasoning": "Language requirements met." if language_score >= 100 else "Language requirements not fully met."},
        },
        "strengths": strengths,
        "gaps": gaps,
        "disqualified": disqualified,
        "disqualification_reason": disqualification_reason,
        "needs_manual_review": needs_manual_review,
        "candidate_name": candidate_profile.get("full_name", "Unknown"),
        "job_title": job_requirements.get("job_title", "Unknown"),
        "scoring_model": "local_rule_based",
    }
