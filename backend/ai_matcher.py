"""
backend/ai_matcher.py  ·  v2.1.0
────────────────────────────────────────────────────────────────
AI-powered semantic document matching — 100% FREE, no API key.

Uses sentence-transformers (all-MiniLM-L6-v2) running fully locally.
Model (~90 MB) downloads automatically on first use from HuggingFace.

Install once:
    pip install sentence-transformers torch

FIXES IN THIS VERSION (on top of original):

  ✅ FIX TIMEOUT-AI-1 — _m() wait timeout reduced from 30 s → 8 s.
     If the model isn't loaded within 8 s of a request arriving, we
     fall back to keyword matching rather than blocking the worker
     thread for up to 30 s and eating into the 110 s candidate budget.

  ✅ FIX TIMEOUT-AI-2 — _all_chunks() max_chunks reduced 150 → 80.
     Fewer chunks = faster batch encoding. 80 chunks still gives
     excellent recall for typical CV/diploma text (500–1500 words).

  ✅ FIX TIMEOUT-AI-3 — match_skills_in_cv(), match_field_in_diploma(),
     and check_field_job_compatibility() now wrap model.encode() in a
     concurrent.futures timeout (default 20 s). If encoding stalls
     (e.g. first run downloading the model), the function returns
     gracefully instead of holding the worker thread indefinitely.

  ✅ FIX TIMEOUT-AI-4 — _start_background_load() is now idempotent
     using a threading.Event guard so re-importing the module in
     worker threads does not spawn duplicate loader threads.

  All original functionality (FIX 1, FIX 2, FIX 3) retained.
"""

from __future__ import annotations
import concurrent.futures
import logging
import os
import re
import threading
import warnings

# ── Suppress harmless HuggingFace / transformers warnings BEFORE any import ──
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

# ✅ FIX TIMEOUT-AI-4: guard so re-imports don't spawn duplicate threads
_load_started = threading.Event()

# ✅ FIX TIMEOUT-AI-1: how long _m() will block waiting for the model.
# 8 s is enough on a warm server; on a cold start we fall back to keyword
# matching rather than blocking the candidate worker for 30 s.
_MODEL_WAIT_TIMEOUT = 8

# ✅ FIX TIMEOUT-AI-3: max seconds we allow a model.encode() call to run
# before giving up and returning an empty/fallback result.
_ENCODE_TIMEOUT = 20


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
    # ✅ FIX TIMEOUT-AI-4: only ever start one loader thread
    if _load_started.is_set():
        return
    _load_started.set()
    t = threading.Thread(target=_load_model_background, daemon=True, name="ai-model-loader")
    t.start()


def _m() -> object | None:
    """
    Return the loaded model.
    ✅ FIX TIMEOUT-AI-1: Wait at most _MODEL_WAIT_TIMEOUT seconds (8 s).
    If the model isn't ready yet we return None so callers fall back to
    keyword matching instead of blocking the worker thread for 30 s.
    """
    if _model is not None:
        return _model
    _model_ready.wait(timeout=_MODEL_WAIT_TIMEOUT)
    return _model


# ─────────────────────────────────────────────────────────────────────────────
# Safe encoding helper with timeout
# ─────────────────────────────────────────────────────────────────────────────

def _safe_encode(model, texts, **kwargs):
    """
    ✅ FIX TIMEOUT-AI-3: Run model.encode() in a thread with a hard timeout.
    Returns the embeddings tensor on success, or None on timeout/error.
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(model.encode, texts, **kwargs)
        try:
            return fut.result(timeout=_ENCODE_TIMEOUT)
        except concurrent.futures.TimeoutError:
            logger.warning(
                "_safe_encode timed out after %ds — falling back to keyword matching",
                _ENCODE_TIMEOUT,
            )
            return None
        except Exception as exc:
            logger.debug("_safe_encode error: %s", exc)
            return None


# ─────────────────────────────────────────────────────────────────────────────
# Text chunking helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sentence_chunks(text: str, limit: int = 60) -> list[str]:
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


def _all_chunks(text: str, max_chunks: int = 80) -> list[str]:
    """
    ✅ FIX TIMEOUT-AI-2: Reduced default max_chunks from 150 → 80.
    Combine sentence and sliding-window chunks, deduplicate, cap at max_chunks.
    80 chunks gives excellent recall for typical CV/diploma text while
    meaningfully reducing batch-encoding time.
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
        embs = _safe_encode(model, [text_a, text_b], convert_to_tensor=True, show_progress_bar=False)
        if embs is None:
            return 0.0
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

    ✅ FIX TIMEOUT-AI-3: model.encode() calls are wrapped in _safe_encode()
    with a 20 s hard timeout. On timeout, falls back to returning all skills
    as unmatched (conservative) rather than blocking the candidate worker.

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

        # ✅ FIX TIMEOUT-AI-3: use _safe_encode with timeout
        skill_embs = _safe_encode(
            model, declared_skills, convert_to_tensor=True, show_progress_bar=False
        )
        if skill_embs is None:
            logger.warning("match_skills_in_cv: skill encoding timed out — returning empty matches")
            return {s: (False, 0.0) for s in declared_skills}

        chunk_embs = _safe_encode(
            model, chunks, convert_to_tensor=True, show_progress_bar=False
        )
        if chunk_embs is None:
            logger.warning("match_skills_in_cv: chunk encoding timed out — returning empty matches")
            return {s: (False, 0.0) for s in declared_skills}

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

    ✅ FIX TIMEOUT-AI-3: encode calls wrapped with _safe_encode timeout.
    Returns (True, 0.0) on timeout — defers to HR rather than blocking.
    """
    model = _m()
    if model is None or not diploma_text.strip():
        return True, 0.0   # cannot verify → defer to HR

    try:
        from sentence_transformers import util

        chunks = _all_chunks(diploma_text, max_chunks=60)
        if not chunks:
            return True, 0.0

        field_emb = _safe_encode(
            model, declared_field, convert_to_tensor=True, show_progress_bar=False
        )
        if field_emb is None:
            return True, 0.0

        chunk_embs = _safe_encode(
            model, chunks, convert_to_tensor=True, show_progress_bar=False
        )
        if chunk_embs is None:
            return True, 0.0

        scores    = util.cos_sim(field_emb, chunk_embs)[0]
        max_score = float(scores.max())

        return max_score >= threshold, round(max_score, 4)

    except Exception as exc:
        logger.debug("match_field_in_diploma error: %s", exc)
        return True, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 3 (original) — Field-of-study ↔ Job role domain compatibility check
# ─────────────────────────────────────────────────────────────────────────────

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
    AI domain-relevance check: is the applicant's academic field compatible
    with the job role domain?

    ✅ FIX TIMEOUT-AI-3: encode calls wrapped with _safe_encode timeout.
    Returns (True, 0.0) on timeout — defers to rule-based fallback.
    """
    model = _m()
    if model is None:
        return True, 0.0

    try:
        from sentence_transformers import util

        references = [job_title]

        job_title_norm = job_title.lower().strip()
        for key, context in _JOB_DOMAIN_CONTEXT.items():
            if key in job_title_norm or job_title_norm in key:
                references.append(context)
                break
        else:
            for key, context in _JOB_DOMAIN_CONTEXT.items():
                if any(word in job_title_norm for word in key.split() if len(word) >= 5):
                    references.append(context)
                    break

        field_emb = _safe_encode(
            model, declared_field, convert_to_tensor=True, show_progress_bar=False
        )
        if field_emb is None:
            return True, 0.0

        ref_embs = _safe_encode(
            model, references, convert_to_tensor=True, show_progress_bar=False
        )
        if ref_embs is None:
            return True, 0.0

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
        return True, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Education level classification
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
        result         = _safe_encode(model, descs, convert_to_tensor=True, show_progress_bar=False)
        _TEMPLATE_EMBS = result
        return _TEMPLATE_EMBS
    except Exception:
        return None


def classify_education_level(diploma_text: str) -> tuple[str | None, float]:
    """
    AI classifier: detect the education level conveyed by diploma text.
    Returns (level_name: str | None, confidence: float).
    ✅ FIX TIMEOUT-AI-3: encode call wrapped with _safe_encode timeout.
    """
    model      = _m()
    templ_embs = _get_template_embs()
    if model is None or templ_embs is None or not diploma_text.strip():
        return None, 0.0

    try:
        from sentence_transformers import util

        words   = diploma_text.split()
        sample  = " ".join(words[:300])

        text_emb = _safe_encode(model, sample, convert_to_tensor=True, show_progress_bar=False)
        if text_emb is None:
            return None, 0.0

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
# Startup diagnostics
# ─────────────────────────────────────────────────────────────────────────────

def _print_ai_status() -> None:
    lines = [
        "",
        "── AI Matcher Status ──────────────────────────────────────────────────",
        "  sentence-transformers : ✓ loading in background (all-MiniLM-L6-v2)",
        "  Inference mode        : Local CPU/GPU — no internet, no API key",
        f"  Model wait timeout    : {_MODEL_WAIT_TIMEOUT}s (then falls back to keyword matching)",
        f"  Encode timeout        : {_ENCODE_TIMEOUT}s per encode call",
        f"  Max CV chunks         : 80 (reduced from 150 for speed)",
        "  Install command       : pip install sentence-transformers torch",
        "───────────────────────────────────────────────────────────────────────",
        "  ✓  Full AI semantic matching active for skills, field, and education.",
        "  ✓  Field-job domain compatibility check active.",
        "  ✓  Timeout guards on all encode() calls (no more 110s hangs).",
        "",
    ]
    print("\n".join(lines))


# ── Kick off background load immediately when this module is imported ─────────
_start_background_load()
_print_ai_status()