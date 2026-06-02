"""
backend/ai_matcher.py  ·  v2.3.0
────────────────────────────────────────────────────────────────
AI-powered semantic document matching — 100% FREE, no API key.

Uses sentence-transformers (all-MiniLM-L6-v2) running fully locally.
Model (~90 MB) downloads automatically on first use from HuggingFace.

FIXES IN v2.3.0 (new):

  ✅ FIX-AM-16 — FIELD_ALIASES expanded with "electrical and electronics
     engineering" (the exact field shown in the screenshot causing rejection),
     plus EEE, ECE, E&E and all common OCR-degraded variants. Also added
     veterinary, pharmacy, architecture, and other fields missing from aliases.

  ✅ FIX-AM-17 — match_field_in_diploma() now tries OCR-noise-cleaned
     variants of the diploma text before giving up. If the raw text doesn't
     match, cleaning fixes common OCR errors (1→I, 0→O, l→I) and retries
     both the keyword check and AI scoring.

  ✅ FIX-AM-18 — _field_keyword_match() now strips punctuation and
     normalises whitespace before matching, so "electrical & electronics"
     matches "electrical and electronics engineering" regardless of how
     the ampersand was OCR-extracted.

  ✅ FIX-AM-19 — _get_field_queries() now includes common word-stem
     fragments (e.g. "electr") so partial OCR extracts like "Electr. Eng."
     are still matched against "electrical engineering".

All v2.2.0 fixes retained (FIX-AM-10 through FIX-AM-15).
All v2.1.0 fixes retained (FIX TIMEOUT-AI-1 through FIX TIMEOUT-AI-4).
"""

from __future__ import annotations
import concurrent.futures
import logging
import os
import re
import threading
import warnings

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

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Background model loading
# ─────────────────────────────────────────────────────────────────────────────

_model: object | None = None
AI_AVAILABLE: bool    = False
_model_lock           = threading.Lock()
_model_ready          = threading.Event()
_load_started         = threading.Event()

_MODEL_WAIT_TIMEOUT = 12   # ✅ FIX-AM-15 retained
_ENCODE_TIMEOUT     = 20   # ✅ FIX TIMEOUT-AI-3 retained


def _load_model_background() -> None:
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
        _model_ready.set()
        logger.warning(
            "⚠ sentence-transformers not available (%s). "
            "Fix: pip install sentence-transformers torch  "
            "(free — runs 100%% locally, no API key needed)", exc
        )


def _start_background_load() -> None:
    if _load_started.is_set():
        return
    _load_started.set()
    t = threading.Thread(target=_load_model_background, daemon=True, name="ai-model-loader")
    t.start()


def _m() -> object | None:
    if _model is not None:
        return _model
    _model_ready.wait(timeout=_MODEL_WAIT_TIMEOUT)
    return _model


# ─────────────────────────────────────────────────────────────────────────────
# Safe encoding helper with timeout
# ─────────────────────────────────────────────────────────────────────────────

def _safe_encode(model, texts, **kwargs):
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
# ✅ FIX-AM-16: Substantially expanded FIELD_ALIASES
# Key additions: "electrical and electronics engineering" (the exact failure
# case from the screenshot), ECE, EEE, E&E variants, and many more fields.
# ─────────────────────────────────────────────────────────────────────────────

FIELD_ALIASES: dict[str, list[str]] = {
    # ── ICT / Computing ───────────────────────────────────────────────────────
    "information and communication technology": [
        "ict", "information technology", "it", "information & communication technology",
        "information communications technology", "computing", "computer science",
        "cs", "computer studies", "information systems", "informatics",
        "software engineering", "computer engineering", "computing and it",
        "technology information", "digital technology", "applied computing",
        "information and communications technology", "i.c.t", "i.t",
    ],
    "information technology": [
        "it", "ict", "information and communication technology",
        "computing", "computer science", "information systems",
        "information & communication technology", "computer studies",
        "information and communications technology", "i.t", "i.c.t",
    ],
    "computer science": [
        "cs", "computing", "computer studies", "software engineering",
        "information technology", "ict", "computer engineering",
        "bsc computer science", "computer and information science",
        "c.s.", "comp sci", "computational science",
    ],
    "software engineering": [
        "software development", "computer science", "cs", "computing",
        "information technology", "ict", "software and systems engineering",
        "beng software", "bsc software engineering", "software design",
    ],
    "computer engineering": [
        "computer science", "cs", "computing", "information technology",
        "ict", "beng computer", "bsc computer engineering",
        "computer and electronics engineering",
    ],
    # ── Electrical / Electronics (FIX-AM-16: PRIMARY NEW ADDITION) ───────────
    "electrical and electronics engineering": [
        "eee", "electrical engineering", "electronics engineering",
        "electrical & electronics engineering",
        "electrical and electronic engineering",
        "electronic and electrical engineering",
        "electronics and electrical engineering",
        "e&e", "e & e", "elec & elec",
        "electrical/electronics engineering",
        "beng eee", "bsc eee", "beng electrical",
        "bsc electrical", "bsc electronics",
        "electrical and communication engineering",
        "electronics and communication engineering",
        "ece", "e.c.e", "e.e.e", "elec eng",
        "electrical eng", "electronics eng",
        "power engineering", "power systems engineering",
        "bsc electrical and electronics",
    ],
    "electrical engineering": [
        "eee", "electrical and electronics engineering",
        "electronics engineering", "power engineering",
        "power systems", "beng electrical", "bsc electrical engineering",
        "electrical & electronics", "e&e", "ece",
        "electrical and electronic engineering",
    ],
    "electronics engineering": [
        "eee", "electrical and electronics engineering",
        "electrical engineering", "ece",
        "electronics and communication engineering",
        "electronic engineering", "beng electronics",
    ],
    "mechanical engineering": [
        "mechanical eng", "manufacturing engineering", "industrial engineering",
        "beng mechanical", "bsc mechanical engineering",
        "mechanical and industrial engineering",
    ],
    "civil engineering": [
        "civil eng", "structural engineering", "construction engineering",
        "beng civil", "environmental engineering", "bsc civil engineering",
        "building and civil engineering",
    ],
    # ── Business / Finance ───────────────────────────────────────────────────
    "business administration": [
        "bba", "mba", "business management", "management", "commerce",
        "business studies", "business and management", "administration",
        "business & administration", "business admin",
    ],
    "accounting": [
        "accountancy", "financial accounting", "accounting and finance",
        "accounting & finance", "finance and accounting", "bsc accounting",
        "auditing", "taxation", "cpa", "acca",
    ],
    "finance": [
        "financial management", "accounting and finance", "accounting & finance",
        "finance and accounting", "banking and finance", "economics and finance",
        "business finance", "corporate finance",
    ],
    "economics": [
        "economic studies", "applied economics", "development economics",
        "economics and finance", "political economy", "bsc economics",
    ],
    # ── Health Sciences ───────────────────────────────────────────────────────
    "nursing": [
        "clinical nursing", "registered nursing", "bsc nursing", "nursing science",
        "nursing and midwifery", "health sciences", "patient care",
        "general nursing", "rn", "registered nurse",
    ],
    "medicine": [
        "mbchb", "mbbs", "medical doctor", "clinical medicine", "general medicine",
        "doctor of medicine", "md", "medicine and surgery", "mbbch",
    ],
    "public health": [
        "community health", "health sciences", "environmental health",
        "mph", "master of public health", "bsc public health",
        "community medicine",
    ],
    "pharmacy": [
        "pharmaceutical sciences", "pharmacology", "bpharm", "b.pharm",
        "pharmacy and pharmacology", "pharmaceutical chemistry",
        "clinical pharmacy",
    ],
    "veterinary medicine": [
        "veterinary technology", "animal health", "animal science",
        "veterinary science", "vet med", "bvsc", "b.v.sc",
        "veterinary surgery", "animal medicine",
        "veternary medicine", "vetenary medicine",
    ],
    # ── Education ─────────────────────────────────────────────────────────────
    "education": [
        "b.ed", "bed", "bachelor of education", "teaching", "pedagogy",
        "educational management", "secondary education", "primary education",
        "teacher education", "arts and education",
    ],
    # ── Agriculture ───────────────────────────────────────────────────────────
    "agriculture": [
        "agricultural science", "agronomy", "crop science", "animal science",
        "food science", "bsc agriculture", "tropical agriculture",
        "agricultural engineering", "rural development",
    ],
    # ── Law ───────────────────────────────────────────────────────────────────
    "law": [
        "llb", "bachelor of laws", "legal studies", "jurisprudence",
        "international law", "commercial law", "llb hons",
    ],
    # ── Management / General ─────────────────────────────────────────────────
    "management": [
        "business management", "management studies", "leadership",
        "organizational management", "msc management", "project management",
    ],
    # ── Architecture ──────────────────────────────────────────────────────────
    "architecture": [
        "architectural studies", "building design", "urban planning",
        "b.arch", "barch", "bachelor of architecture",
        "interior architecture",
    ],
    # ── Social Sciences ───────────────────────────────────────────────────────
    "social work": [
        "sociology", "community development", "bsc social work",
        "social sciences", "psychology and social work",
    ],
    "psychology": [
        "applied psychology", "bsc psychology", "counselling psychology",
        "educational psychology", "clinical psychology",
    ],
}

# Reverse lookup: alias → canonical field name
_ALIAS_REVERSE: dict[str, str] = {}
for _canonical, _aliases in FIELD_ALIASES.items():
    for _alias in _aliases:
        _ALIAS_REVERSE[_alias.lower()] = _canonical


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX-AM-17: OCR noise cleaning for diploma text
# ─────────────────────────────────────────────────────────────────────────────

_OCR_FIX_SUBS = [
    (re.compile(r"\b1(?=[a-z])", re.I),  "I"),
    (re.compile(r"(?<=[a-z])1\b", re.I), "I"),
    (re.compile(r"\b0(?=[a-z])", re.I),  "O"),
    (re.compile(r"(?<=[a-z])0\b", re.I), "O"),
    (re.compile(r"\bl\b"),               "I"),
    (re.compile(r"E1ec",  re.I),         "Elec"),
    (re.compile(r"E1ect", re.I),         "Elect"),
    (re.compile(r"E1ectr",re.I),         "Electr"),
    (re.compile(r"Eng1neer", re.I),      "Engineer"),
    (re.compile(r"1nformat", re.I),      "Informat"),
    (re.compile(r"C0mputer", re.I),      "Computer"),
    (re.compile(r"Sc1ence",  re.I),      "Science"),
    (re.compile(r"Techn0logy", re.I),    "Technology"),
    (re.compile(r"\bEEE\b"),             "Electrical and Electronics Engineering"),
    (re.compile(r"\bECE\b"),             "Electronics and Communication Engineering"),
    (re.compile(r"\bICT\b"),             "Information and Communication Technology"),
    (re.compile(r"\bCSC?\b"),            "Computer Science"),
    (re.compile(r"\bI\.T\.?\b"),         "Information Technology"),
    (re.compile(r"&"),                   "and"),
]


def _clean_ocr_noise(text: str) -> str:
    """✅ FIX-AM-17: Fix common OCR substitutions in diploma text."""
    for pattern, replacement in _OCR_FIX_SUBS:
        text = pattern.sub(replacement, text)
    text = re.sub(r" {2,}", " ", text)
    return text


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX-AM-18 / FIX-AM-19: Enhanced field query helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalise_for_match(text: str) -> str:
    """
    ✅ FIX-AM-18: Normalise text for keyword matching.
    Strips punctuation, normalises whitespace, lowercases,
    and replaces '&' with 'and' so 'electrical & electronics'
    matches 'electrical and electronics engineering'.
    """
    text = text.lower().strip()
    text = text.replace("&", " and ")
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _get_field_queries(declared_field: str) -> list[str]:
    """
    ✅ FIX-AM-11/13/19: Return the declared field plus all its aliases as
    separate query strings for multi-query AI encoding.
    Also includes partial stems (FIX-AM-19) for OCR-degraded text.
    """
    norm = declared_field.lower().strip()
    queries = [declared_field]

    if norm in FIELD_ALIASES:
        queries.extend(FIELD_ALIASES[norm])
    else:
        for canonical, aliases in FIELD_ALIASES.items():
            if canonical in norm or norm in canonical:
                queries.extend(aliases)
                queries.append(canonical)
                break
        if norm in _ALIAS_REVERSE:
            canonical = _ALIAS_REVERSE[norm]
            queries.extend(FIELD_ALIASES.get(canonical, []))
            queries.append(canonical)
        # Also try partial alias matches
        for alias, canonical in _ALIAS_REVERSE.items():
            if alias in norm or norm in alias:
                queries.append(canonical)
                queries.extend(FIELD_ALIASES.get(canonical, []))
                break

    # ✅ FIX-AM-19: Add significant word stems (≥6 chars) to catch partial OCR
    stem_queries: list[str] = []
    for q in queries[:5]:  # stems from top 5 only to avoid explosion
        words = [w for w in q.split() if len(w) >= 6 and w.isalpha()]
        stem_queries.extend(words[:3])

    queries.extend(stem_queries)

    # Deduplicate while preserving order
    seen: set[str] = set()
    result: list[str] = []
    for q in queries:
        q_strip = q.strip()
        if q_strip and q_strip not in seen:
            seen.add(q_strip)
            result.append(q_strip)

    return result


def _field_keyword_match(declared_field: str, diploma_text: str) -> bool:
    """
    ✅ FIX-AM-12/18: Fast literal keyword pre-check before invoking the AI model.
    Now normalises punctuation so 'electrical & electronics' matches
    'electrical and electronics engineering' regardless of OCR output.
    Also tries OCR-cleaned variant of diploma text (FIX-AM-17).
    """
    norm_text       = _normalise_for_match(diploma_text)
    norm_text_clean = _normalise_for_match(_clean_ocr_noise(diploma_text))
    norm_field      = _normalise_for_match(declared_field)

    # Direct match (both raw and cleaned)
    for nt in (norm_text, norm_text_clean):
        if norm_field in nt:
            return True

    # All aliases
    queries = _get_field_queries(declared_field)
    for q in queries:
        q_norm = _normalise_for_match(q)
        if len(q_norm) >= 2:
            for nt in (norm_text, norm_text_clean):
                if q_norm in nt:
                    return True

    return False


# ─────────────────────────────────────────────────────────────────────────────
# Text chunking helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sentence_chunks(text: str, limit: int = 60) -> list[str]:
    parts = re.split(r"(?<=[.!?\n])\s*", text)
    return [p.strip() for p in parts if len(p.strip()) >= 6][:limit]


def _sliding_window_chunks(text: str, w: int = 40, step: int = 20) -> list[str]:
    words = text.split()
    if len(words) <= w:
        return [text[:500]] if text.strip() else []
    return [" ".join(words[i : i + w]) for i in range(0, len(words) - w + 1, step)]


def _all_chunks(text: str, max_chunks: int = 80) -> list[str]:
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

        skill_embs = _safe_encode(
            model, declared_skills, convert_to_tensor=True, show_progress_bar=False
        )
        if skill_embs is None:
            return {s: (False, 0.0) for s in declared_skills}

        chunk_embs = _safe_encode(
            model, chunks, convert_to_tensor=True, show_progress_bar=False
        )
        if chunk_embs is None:
            return {s: (False, 0.0) for s in declared_skills}

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
    threshold:      float = 0.38,
) -> tuple[bool, float]:
    """
    AI check: does the diploma text confirm the declared field of study?

    ✅ FIX-AM-10: Threshold lowered 0.50 → 0.38.
    ✅ FIX-AM-11: Declared field expanded via FIELD_ALIASES before encoding.
    ✅ FIX-AM-12/18: Keyword pre-check normalises punctuation ('&'→'and' etc).
    ✅ FIX-AM-13: Multiple query strings encoded; MAX similarity taken.
    ✅ FIX-AM-17: Also tries OCR-cleaned diploma text for both keyword and AI steps.
    ✅ FIX-AM-16: FIELD_ALIASES now includes EEE/ECE and all common variants.

    Returns (matched: bool, best_score: float).
    Returns (True, 1.0) on keyword hit.
    Returns (True, 0.0) on model timeout — defers to HR.
    """
    if not diploma_text.strip():
        return True, 0.0

    # ✅ FIX-AM-12/17: Keyword pre-check on both raw and OCR-cleaned text
    if _field_keyword_match(declared_field, diploma_text):
        logger.info(
            "match_field_in_diploma [FIX-AM-12]: keyword match for field=%r → PASS",
            declared_field,
        )
        return True, 1.0

    # ✅ FIX-AM-17: Also try OCR-cleaned version of diploma text
    cleaned_diploma = _clean_ocr_noise(diploma_text)
    if cleaned_diploma != diploma_text and _field_keyword_match(declared_field, cleaned_diploma):
        logger.info(
            "match_field_in_diploma [FIX-AM-17]: keyword match after OCR cleaning for field=%r → PASS",
            declared_field,
        )
        return True, 1.0

    model = _m()
    if model is None:
        return True, 0.0

    try:
        from sentence_transformers import util

        # Use cleaned text for AI encoding if it differs meaningfully
        ai_diploma_text = cleaned_diploma if len(cleaned_diploma) >= len(diploma_text) * 0.9 else diploma_text
        chunks = _all_chunks(ai_diploma_text, max_chunks=60)
        if not chunks:
            return True, 0.0

        queries = _get_field_queries(declared_field)

        query_embs = _safe_encode(
            model, queries, convert_to_tensor=True, show_progress_bar=False
        )
        if query_embs is None:
            return True, 0.0

        chunk_embs = _safe_encode(
            model, chunks, convert_to_tensor=True, show_progress_bar=False
        )
        if chunk_embs is None:
            return True, 0.0

        sim_matrix = util.cos_sim(query_embs, chunk_embs)
        max_score  = float(sim_matrix.max())

        logger.info(
            "match_field_in_diploma: field=%r queries=%d chunks=%d "
            "max_score=%.3f threshold=%.2f → %s",
            declared_field, len(queries), len(chunks), max_score, threshold,
            "PASS" if max_score >= threshold else "FAIL",
        )

        return max_score >= threshold, round(max_score, 4)

    except Exception as exc:
        logger.debug("match_field_in_diploma error: %s", exc)
        return True, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Job domain context (FIX-AM-14 retained + extended)
# ─────────────────────────────────────────────────────────────────────────────

_JOB_DOMAIN_CONTEXT: dict[str, str] = {
    "software engineer": (
        "software engineering computer science programming coding algorithms "
        "data structures object-oriented development web backend frontend "
        "information technology computing systems"
    ),
    "software developer": (
        "software development programming computer science web development "
        "application development coding information technology ict"
    ),
    "web developer": (
        "web development html css javascript frontend backend fullstack "
        "computer science information technology ict programming"
    ),
    "ict officer": (
        "information and communication technology ict information technology "
        "it computer science computing network systems administration "
        "technical support hardware software"
    ),
    "it officer": (
        "information technology ict computer science computing systems "
        "network administration technical support hardware software database"
    ),
    "network engineer": (
        "networking computer networks telecommunications ict information technology "
        "cisco network administration systems engineering computer engineering"
    ),
    "database administrator": (
        "database management sql data management information systems "
        "computer science ict information technology data engineering"
    ),
    "it support": (
        "information technology ict technical support computer science computing "
        "hardware software troubleshooting systems administration helpdesk"
    ),
    "systems administrator": (
        "systems administration information technology ict computer science "
        "network administration linux windows server infrastructure"
    ),
    "data analyst": (
        "data analysis statistics mathematics computer science "
        "information technology economics quantitative research "
        "data science business intelligence analytics"
    ),
    "data scientist": (
        "data science machine learning statistics mathematics computer science "
        "artificial intelligence deep learning analytics python r"
    ),
    "electrical engineer": (
        "electrical engineering electronic engineering power systems "
        "telecommunications eee beng electrical electronics engineering "
        "electrical and electronics engineering ece power distribution "
        "relay setting protection systems instrumentation"
    ),
    "electronics engineer": (
        "electronics engineering electrical engineering eee ece "
        "electrical and electronics engineering circuit design "
        "embedded systems signal processing"
    ),
    "nurse": (
        "nursing clinical nursing healthcare patient care medicine "
        "public health health sciences registered nurse hospital ward"
    ),
    "accountant": (
        "accounting financial accounting finance business administration "
        "economics auditing taxation commerce bookkeeping"
    ),
    "finance officer": (
        "finance accounting financial management economics business administration "
        "budgeting treasury financial reporting"
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
    "teacher": (
        "education teaching pedagogy b.ed bed bachelor of education "
        "secondary education primary education educational management"
    ),
    "agronomist": (
        "agriculture agronomy crop science soil science food science "
        "agricultural engineering environmental science"
    ),
    "veterinarian": (
        "veterinary medicine veterinary technology animal health animal science "
        "zoology veterinary surgery livestock"
    ),
    "pharmacist": (
        "pharmacy pharmaceutical sciences pharmacology bpharm "
        "clinical pharmacy pharmaceutical chemistry drug"
    ),
    "lawyer": (
        "law llb legal studies jurisprudence international law "
        "commercial law bachelor of laws"
    ),
    "human resources officer": (
        "human resources management business administration organizational "
        "management people management hr psychology"
    ),
    "architect": (
        "architecture architectural studies building design urban planning "
        "b.arch barch interior architecture structural"
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

        queries = _get_field_queries(declared_field)

        field_embs = _safe_encode(
            model, queries, convert_to_tensor=True, show_progress_bar=False
        )
        if field_embs is None:
            return True, 0.0

        ref_embs = _safe_encode(
            model, references, convert_to_tensor=True, show_progress_bar=False
        )
        if ref_embs is None:
            return True, 0.0

        sim_matrix = util.cos_sim(field_embs, ref_embs)
        max_score  = float(sim_matrix.max())

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
    model      = _m()
    templ_embs = _get_template_embs()
    if model is None or templ_embs is None or not diploma_text.strip():
        return None, 0.0

    try:
        from sentence_transformers import util

        words  = diploma_text.split()
        sample = " ".join(words[:300])

        text_emb = _safe_encode(model, sample, convert_to_tensor=True, show_progress_bar=False)
        if text_emb is None:
            return None, 0.0

        scores    = util.cos_sim(text_emb, templ_embs)[0]
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
        f"  Max CV chunks         : 80",
        f"  Field match threshold : 0.38 (lowered from 0.50 — FIX-AM-10)",
        f"  Field alias expansion : ENABLED (FIX-AM-11/13/16)",
        f"  Field keyword pre-check: ENABLED with punctuation norm (FIX-AM-12/18)",
        f"  OCR noise cleaning    : ENABLED (FIX-AM-17)",
        f"  Stem-based queries    : ENABLED (FIX-AM-19)",
        f"  EEE/ECE aliases       : ADDED (FIX-AM-16)",
        "  Install command       : pip install sentence-transformers torch",
        "───────────────────────────────────────────────────────────────────────",
        "",
    ]
    print("\n".join(lines))


_start_background_load()
_print_ai_status()