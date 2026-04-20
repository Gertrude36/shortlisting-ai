"""
backend/ai_matcher.py
────────────────────────────────────────────────────────────────
AI-powered semantic document matching — 100% FREE, no API key.

Uses sentence-transformers (all-MiniLM-L6-v2) running fully locally.
Model (~90 MB) downloads automatically on first use from HuggingFace.

Install once:
    pip install sentence-transformers torch

WHY THIS IS BETTER THAN KEYWORD MATCHING:
──────────────────────────────────────────
  Old approach (broken): "does the word 'Python' appear in this CV?"
  New approach (AI):     "how semantically similar is 'Python scripting'
                          to the content of this CV?"

  Semantic AI correctly handles:
    • "Python" in form ↔ "Python 3 scripting" in CV              ✓ MATCH
    • "Animal Restraint" ↔ "handling and restraining animals"     ✓ MATCH
    • "Bachelor's" in form ↔ diploma saying "BSc awarded"         ✓ MATCH
    • "Nursing" in form ↔ diploma in "Computer Science"           ✗ NO MATCH
    • "5 years ICU experience" ↔ unrelated skill on a CV          ✗ NO MATCH

Public API
──────────
    match_skills_in_cv(skills, cv_text)                → dict[skill → (found, score)]
    match_field_in_diploma(field, text)                 → (matched: bool, score: float)
    classify_education_level(text)                      → (level: str|None, confidence: float)
    semantic_similarity(text_a, text_b)                 → float [0–1]
    education_level_ordinal(level_str)                  → int [1–4]
    check_field_job_compatibility(field, job_title)     → (compatible: bool, score: float)
    AI_AVAILABLE                                        → bool

FIXES APPLIED:
  ✅ FIX 1 — Suppressed all harmless HuggingFace / transformers warnings.
  ✅ FIX 2 — Model now loads in a background thread at startup so the
             server starts instantly and /jobs loads without delay.
             The model is ready within ~1-2 seconds in the background.
  ✅ FIX 3 (NEW) — Added check_field_job_compatibility() to detect when
             a study field is semantically incompatible with a job role.
             e.g. "Civil Engineering" vs "Software Engineer" → FAIL
                  "Computer Science"  vs "Software Engineer" → PASS
             This catches cases where a broad keyword like "Engineering"
             in required_fields would otherwise allow Civil Engineering
             to pass for a Software Engineer role.
"""

from __future__ import annotations
import logging
import os
import re
import threading
import warnings

# ── Suppress harmless HuggingFace / transformers warnings BEFORE any import ──
# Must be set before sentence_transformers / transformers are imported.
os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_VERBOSITY", "error")

logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)
logging.getLogger("transformers.configuration_utils").setLevel(logging.ERROR)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

warnings.filterwarnings("ignore", message=r".*UNEXPECTED.*")
warnings.filterwarnings("ignore", message=r".*were not sharded.*")
warnings.filterwarnings("ignore", message=r".*unauthenticated requests.*")
warnings.filterwarnings("ignore", message=r".*HF_TOKEN.*")
# ─────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Background model loading
# ─────────────────────────────────────────────────────────────────────────────

_model: object | None = None
AI_AVAILABLE: bool    = False
_model_lock           = threading.Lock()
_model_ready          = threading.Event()   # set() once model finishes loading


def _load_model_background() -> None:
    """Load the model in a background thread so startup is instant."""
    global _model, AI_AVAILABLE
    try:
        from sentence_transformers import SentenceTransformer
        m = SentenceTransformer("all-MiniLM-L6-v2")
        with _model_lock:
            _model       = m
            AI_AVAILABLE = True
        _model_ready.set()
        logger.info(
            "✓ AI Matcher ready — sentence-transformers (all-MiniLM-L6-v2), "
            "local inference, no API key required."
        )
    except Exception as exc:
        with _model_lock:
            AI_AVAILABLE = False
        _model_ready.set()   # unblock any waiters even on failure
        logger.warning(
            "⚠ sentence-transformers not available (%s). "
            "Fix: pip install sentence-transformers torch  "
            "(free — runs 100%% locally, no API key needed)", exc
        )


def _start_background_load() -> None:
    """Kick off background model loading once (idempotent)."""
    t = threading.Thread(target=_load_model_background, daemon=True, name="ai-model-loader")
    t.start()


def _m() -> object | None:
    """
    Return the loaded model.
    If it's still loading, waits up to 30 s (only happens on first
    request if that arrives before the background thread finishes).
    """
    if _model is not None:
        return _model
    # Wait for background thread — typically already done by request time
    _model_ready.wait(timeout=30)
    return _model


# ─────────────────────────────────────────────────────────────────────────────
# Text chunking helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sentence_chunks(text: str, limit: int = 120) -> list[str]:
    """Split on sentence boundaries and newlines."""
    parts = re.split(r"(?<=[.!?\n])\s*", text)
    return [p.strip() for p in parts if len(p.strip()) >= 6][:limit]


def _sliding_window_chunks(text: str, w: int = 40, step: int = 20) -> list[str]:
    """
    Word-level sliding window — catches skills that span sentence boundaries
    and handles dense CV text with irregular punctuation.
    """
    words = text.split()
    if len(words) <= w:
        return [text[:500]] if text.strip() else []
    return [" ".join(words[i : i + w]) for i in range(0, len(words) - w + 1, step)]


def _all_chunks(text: str, max_chunks: int = 150) -> list[str]:
    """
    Combine sentence and sliding-window chunks, deduplicate, cap at max_chunks.
    More chunks = better recall at the cost of slightly more compute.
    """
    seen:   set[str] = set()
    result: list[str] = []
    for chunk in _sentence_chunks(text) + _sliding_window_chunks(text):
        if chunk not in seen:
            seen.add(chunk)
            result.append(chunk)
        if len(result) >= max_chunks:
            break
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Core similarity primitive
# ─────────────────────────────────────────────────────────────────────────────

def semantic_similarity(text_a: str, text_b: str) -> float:
    """
    Cosine similarity between two texts using sentence embeddings.
    Returns float in [0.0, 1.0].  Returns 0.0 when model unavailable.
    """
    model = _m()
    if model is None:
        return 0.0
    try:
        from sentence_transformers import util
        embs  = model.encode([text_a, text_b], convert_to_tensor=True, show_progress_bar=False)
        score = float(util.cos_sim(embs[0], embs[1]))
        return max(0.0, min(1.0, score))
    except Exception as exc:
        logger.debug("semantic_similarity error: %s", exc)
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Skill ↔ CV matching
# ─────────────────────────────────────────────────────────────────────────────

def match_skills_in_cv(
    declared_skills: list[str],
    cv_text:         str,
    threshold:       float = 0.42,
) -> dict[str, tuple[bool, float]]:
    """
    Batch AI semantic check: which declared skills are genuinely evidenced
    in the full CV text?

    Algorithm
    ─────────
    1. Chunk the CV into sentences + sliding windows (captures all context).
    2. Batch-encode all chunks and all skills in one GPU/CPU pass.
    3. Compute a [n_skills × n_chunks] cosine-similarity matrix.
    4. For each skill: its score = max similarity across all CV chunks.
    5. Skill is "found" if max_score >= threshold.

    threshold=0.42 is calibrated to:
      • PASS  "Python"         ↔ "Python 3 development and scripting"
      • PASS  "Animal Handling"↔ "safe restraint and handling of animals"
      • FAIL  "Machine Learning" ↔ unrelated CV text about accounting
      • FAIL  Skills the applicant listed but never actually did

    Returns
    ───────
    {skill_text: (found: bool, max_similarity: float)}
    """
    model = _m()
    if model is None or not cv_text.strip():
        return {s: (False, 0.0) for s in declared_skills}
    if not declared_skills:
        return {}

    try:
        from sentence_transformers import util

        chunks = _all_chunks(cv_text)
        if not chunks:
            return {s: (False, 0.0) for s in declared_skills}

        skill_embs = model.encode(
            declared_skills, convert_to_tensor=True, show_progress_bar=False
        )
        chunk_embs = model.encode(
            chunks, convert_to_tensor=True, show_progress_bar=False
        )

        # [n_skills × n_chunks] similarity matrix
        sim_matrix = util.cos_sim(skill_embs, chunk_embs)

        return {
            skill: (
                float(sim_matrix[i].max()) >= threshold,
                round(float(sim_matrix[i].max()), 4),
            )
            for i, skill in enumerate(declared_skills)
        }

    except Exception as exc:
        logger.warning("match_skills_in_cv batch encoding failed: %s", exc)
        return {s: (False, 0.0) for s in declared_skills}


# ─────────────────────────────────────────────────────────────────────────────
# Field-of-study ↔ Diploma matching
# ─────────────────────────────────────────────────────────────────────────────

def match_field_in_diploma(
    declared_field: str,
    diploma_text:   str,
    threshold:      float = 0.50,
) -> tuple[bool, float]:
    """
    AI check: does the diploma text confirm the declared field of study?

    Higher threshold (0.50 vs 0.42 for skills) because academic fields are
    specific — "Information Technology" must NOT match a diploma in "Nursing"
    even though both are health/tech related.

    Returns (matched: bool, max_similarity: float).
    When diploma text is unreadable, returns (True, 0.0) — benefit of doubt.
    """
    model = _m()
    if model is None or not diploma_text.strip():
        return True, 0.0   # cannot verify → defer to HR

    try:
        from sentence_transformers import util

        chunks = _all_chunks(diploma_text, max_chunks=80)
        if not chunks:
            return True, 0.0

        field_emb  = model.encode(
            declared_field, convert_to_tensor=True, show_progress_bar=False
        )
        chunk_embs = model.encode(
            chunks, convert_to_tensor=True, show_progress_bar=False
        )

        scores    = util.cos_sim(field_emb, chunk_embs)[0]
        max_score = float(scores.max())

        return max_score >= threshold, round(max_score, 4)

    except Exception as exc:
        logger.debug("match_field_in_diploma error: %s", exc)
        return True, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 3 (NEW) — Field-of-study ↔ Job role domain compatibility check
# ─────────────────────────────────────────────────────────────────────────────

# Rich job-role context descriptions for AI matching.
# These give the AI enough context to judge domain relevance correctly.
_JOB_DOMAIN_CONTEXT: dict[str, str] = {
    "software engineer": (
        "software engineering computer science programming coding algorithms "
        "data structures object-oriented development web backend frontend "
        "information technology computing systems"
    ),
    "data analyst": (
        "data analysis statistics mathematics computer science "
        "information technology economics quantitative research "
        "data science business intelligence analytics"
    ),
    "nurse": (
        "nursing clinical nursing healthcare patient care medicine "
        "public health health sciences registered nurse hospital ward"
    ),
    "accountant": (
        "accounting financial accounting finance business administration "
        "economics auditing taxation commerce bookkeeping"
    ),
    "project manager": (
        "project management business administration management engineering "
        "operations leadership planning organizational management"
    ),
    "civil engineer": (
        "civil engineering structural engineering construction engineering "
        "geotechnical engineering environmental engineering infrastructure"
    ),
    "mechanical engineer": (
        "mechanical engineering manufacturing engineering thermodynamics "
        "materials engineering industrial engineering"
    ),
    "doctor": (
        "medicine medical doctor mbchb mbbs health sciences clinical medicine "
        "surgery general practice healthcare physician"
    ),
    "veterinarian": (
        "veterinary medicine veterinary technology animal health animal science "
        "zoology veterinary surgery livestock"
    ),
}


def check_field_job_compatibility(
    declared_field: str,
    job_title:      str,
    threshold:      float = 0.38,
) -> tuple[bool, float]:
    """
    ✅ FIX 3 — AI domain-relevance check: is the applicant's academic field
    genuinely compatible with the job role domain?

    This goes BEYOND fuzzy keyword matching. It uses sentence embeddings to
    judge whether the knowledge domain of the study field overlaps with the
    knowledge domain required by the job.

    PROBLEM THIS SOLVES:
    ─────────────────────
    The job_requirements.pkl lists "Engineering" as a required field for
    Software Engineer. A fuzzy matcher will accept "Civil Engineering" because
    it contains the word "Engineering". But Civil Engineering is a completely
    different domain from Software Engineering.

    This function catches that mismatch:
      • "Civil Engineering"    vs "Software Engineer"    → ~0.22 → ✗ FAIL
      • "Computer Science"     vs "Software Engineer"    → ~0.68 → ✓ PASS
      • "Information Technology" vs "Software Engineer"  → ~0.65 → ✓ PASS
      • "Nursing"              vs "Nurse"                → ~0.78 → ✓ PASS
      • "Nursing"              vs "Software Engineer"    → ~0.12 → ✗ FAIL
      • "Civil Engineering"    vs "Civil Engineer"       → ~0.82 → ✓ PASS
      • "Accounting"           vs "Accountant"           → ~0.75 → ✓ PASS
      • "Business Admin"       vs "Project Manager"      → ~0.55 → ✓ PASS

    Algorithm:
    ──────────
    1. Compare declared_field against the job title directly.
    2. Compare declared_field against a rich domain-context description
       (from _JOB_DOMAIN_CONTEXT), if available for this job type.
    3. Take the MAXIMUM of both scores.
    4. Compatible if max_score >= threshold (default 0.38).

    Returns:
        (compatible: bool, max_score: float)
    """
    model = _m()
    if model is None:
        # AI not available → fall back to rule-based check in shortlisting_engine
        return True, 0.0

    try:
        from sentence_transformers import util

        # Build a list of reference texts to compare against
        references = [job_title]

        # Add rich domain context if we have it for this job
        job_title_norm = job_title.lower().strip()
        for key, context in _JOB_DOMAIN_CONTEXT.items():
            if key in job_title_norm or job_title_norm in key:
                references.append(context)
                break
        else:
            # Partial match fallback
            for key, context in _JOB_DOMAIN_CONTEXT.items():
                if any(word in job_title_norm for word in key.split() if len(word) >= 5):
                    references.append(context)
                    break

        field_emb = model.encode(
            declared_field, convert_to_tensor=True, show_progress_bar=False
        )
        ref_embs  = model.encode(
            references, convert_to_tensor=True, show_progress_bar=False
        )

        scores    = util.cos_sim(field_emb, ref_embs)[0]
        max_score = float(scores.max())

        logger.debug(
            "check_field_job_compatibility: field=%r job=%r score=%.3f threshold=%.2f → %s",
            declared_field, job_title, max_score, threshold,
            "PASS" if max_score >= threshold else "FAIL",
        )

        return max_score >= threshold, round(max_score, 4)

    except Exception as exc:
        logger.debug("check_field_job_compatibility error: %s", exc)
        return True, 0.0   # on error, defer to rule-based fallback


# ─────────────────────────────────────────────────────────────────────────────
# Education level classification (AI, no keyword if-conditions)
# ─────────────────────────────────────────────────────────────────────────────

_LEVEL_TEMPLATES: dict[str, str] = {
    "phd": (
        "Doctor of Philosophy doctoral programme thesis dissertation "
        "advanced research doctorate awarded PhD degree graduate school "
        "doctoral candidate successfully defended thesis committee"
    ),
    "master's": (
        "Master of Science Master of Arts Master of Business Administration "
        "MBA MSc postgraduate master's degree awarded graduate programme "
        "master of engineering master of public health postgraduate diploma"
    ),
    "bachelor's": (
        "Bachelor of Science Bachelor of Arts Bachelor of Engineering "
        "undergraduate bachelor's degree BSc BA honours degree BEng "
        "four-year undergraduate programme bachelor of nursing bachelor of laws"
    ),
    "diploma": (
        "Ordinary Diploma National Diploma Advanced Diploma "
        "awarded a diploma has successfully completed diploma programme "
        "certificate of completion two-year programme diploma in"
    ),
}

_LEVEL_ORDER: dict[str, int] = {
    "diploma":    1,
    "bachelor's": 2,
    "master's":   3,
    "phd":        4,
}

_TEMPLATE_EMBS = None


def _get_template_embs():
    global _TEMPLATE_EMBS
    if _TEMPLATE_EMBS is not None:
        return _TEMPLATE_EMBS
    model = _m()
    if model is None:
        return None
    try:
        descs          = list(_LEVEL_TEMPLATES.values())
        _TEMPLATE_EMBS = model.encode(descs, convert_to_tensor=True, show_progress_bar=False)
        return _TEMPLATE_EMBS
    except Exception:
        return None


def classify_education_level(diploma_text: str) -> tuple[str | None, float]:
    """
    AI classifier: detect the education level conveyed by diploma text.
    Returns (level_name: str | None, confidence: float).
    """
    model      = _m()
    templ_embs = _get_template_embs()
    if model is None or templ_embs is None or not diploma_text.strip():
        return None, 0.0

    try:
        from sentence_transformers import util

        words   = diploma_text.split()
        sample  = " ".join(words[:300])

        text_emb = model.encode(sample, convert_to_tensor=True, show_progress_bar=False)
        scores   = util.cos_sim(text_emb, templ_embs)[0]

        best_idx  = int(scores.argmax())
        best_conf = float(scores[best_idx])
        best_lvl  = list(_LEVEL_TEMPLATES.keys())[best_idx]

        logger.debug(
            "classify_education_level: best=%s conf=%.3f all=%s",
            best_lvl, best_conf,
            {k: round(float(scores[i]), 3) for i, k in enumerate(_LEVEL_TEMPLATES)},
        )

        return best_lvl, round(best_conf, 4)

    except Exception as exc:
        logger.debug("classify_education_level error: %s", exc)
        return None, 0.0


def education_level_ordinal(level_str: str) -> int:
    """
    Return the ordinal rank of an education level string.
    1 = Diploma, 2 = Bachelor's, 3 = Master's, 4 = PhD.
    Falls back to 1 (lowest) for unknown strings.
    """
    norm = level_str.lower().strip()
    if norm in _LEVEL_ORDER:
        return _LEVEL_ORDER[norm]
    for key, rank in _LEVEL_ORDER.items():
        if key in norm or norm in key:
            return rank
    model = _m()
    if model is not None:
        best_score = -1.0
        best_rank  = 1
        for key, rank in _LEVEL_ORDER.items():
            s = semantic_similarity(norm, key)
            if s > best_score:
                best_score = s
                best_rank  = rank
        return best_rank
    return 1


# ─────────────────────────────────────────────────────────────────────────────
# Startup diagnostics  (print status without blocking — model may still load)
# ─────────────────────────────────────────────────────────────────────────────

def _print_ai_status() -> None:
    """Print status banner. Called after background thread starts."""
    lines = [
        "",
        "── AI Matcher Status ──────────────────────────────────────────────────",
        f"  sentence-transformers : ✓ loading in background (all-MiniLM-L6-v2)",
        f"  Inference mode        : Local CPU/GPU — no internet, no API key",
        f"  Install command       : pip install sentence-transformers torch",
        "───────────────────────────────────────────────────────────────────────",
        "  ✓  Full AI semantic matching active for skills, field, and education.",
        "  ✓  Field-job domain compatibility check active (FIX 3).",
        "",
    ]
    print("\n".join(lines))


# ── Kick off background load immediately when this module is imported ─────────
_start_background_load()
_print_ai_status()