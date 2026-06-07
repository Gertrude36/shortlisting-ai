"""
candidate_scorer.py
Takes extracted candidate profile + job requirements,
calls OpenRouter (claude-sonnet-4-5), and returns structured JSON:
  match_score, shortlisted, rank_priority, reasoning_text,
  criterion_scores (per-criterion breakdown).
"""

import logging
from typing import Optional

from openrouter_client import chat_completion_json, OpenRouterError

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
    Score a single candidate against job requirements using OpenRouter AI.

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

    user_message = f"""
## Job Requirements
- **Title**: {job_requirements.get("job_title", "N/A")}
- **Required Education**: {job_requirements.get("required_education", "Not specified")}
- **Required Experience**: {job_requirements.get("required_experience_years", "Not specified")} years
- **Required Skills**: {", ".join(job_requirements.get("required_skills", []))}
- **Preferred Skills**: {", ".join(job_requirements.get("preferred_skills", []))}
- **Required Certifications**: {", ".join(job_requirements.get("required_certifications", []))}
- **Required Languages**: {", ".join(job_requirements.get("required_languages", []))}
- **Hard Requirements**: {", ".join(job_requirements.get("hard_requirements", []))}
- **Job Description**: {job_requirements.get("description", "Not provided")}

## Criterion Weights to Use
- Education: {effective_weights["education"]}
- Experience: {effective_weights["experience"]}
- Skills: {effective_weights["skills"]}
- Certifications: {effective_weights["certifications"]}
- Language: {effective_weights["language"]}

## Candidate Profile
- **Name**: {candidate_profile.get("full_name", "Unknown")}
- **Skills**: {", ".join(candidate_profile.get("skills", [])) or "Not provided"}
- **Education**: {_format_education(candidate_profile.get("education", []))}
- **Experience**: {_format_experience(candidate_profile.get("experience", []))}
- **Certifications**: {", ".join(candidate_profile.get("certifications", [])) or "None listed"}
- **Languages**: {", ".join(candidate_profile.get("languages", [])) or "Not specified"}
- **Summary**: {candidate_profile.get("summary", "Not provided")}

Please score this candidate against the job requirements and return the JSON.
"""

    try:
        result = chat_completion_json(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=SCORING_SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=2048,
        )

        # Attach metadata
        result["candidate_name"] = candidate_profile.get("full_name", "Unknown")
        result["job_title"] = job_requirements.get("job_title", "Unknown")
        result["scoring_model"] = "anthropic/claude-sonnet-4-5"

        return result

    except OpenRouterError as e:
        logger.error(f"OpenRouter scoring error: {e}")
        return _fallback_score(candidate_profile, job_requirements, error=str(e))
    except Exception as e:
        logger.error(f"Unexpected scoring error: {e}")
        return _fallback_score(candidate_profile, job_requirements, error=str(e))


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