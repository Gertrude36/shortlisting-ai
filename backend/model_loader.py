"""
backend/model_loader.py
────────────────────────────────────────────────────────────────
Loads all ML artifacts from disk exactly once when the FastAPI
app starts. Every other module imports the singletons below.

FIXES APPLIED:
  ✅ FIX LOAD-1 — job_requirements.pkl loaded conditionally (missing
     file no longer crashes startup).

  ✅ FIX LOAD-2 — Suppressed harmless BertModel LOAD REPORT warning
     ("embeddings.position_ids | UNEXPECTED").

  ✅ FIX LOAD-3 — feature_columns, label_encoders, scaler wrapped in
     try/except with descriptive errors instead of bare FileNotFoundError
     propagating up through lifespan and leaving _APP_READY = False.

  ✅ FIX LOAD-4 — Added _ARTIFACTS_OK flag so main.py can check
     whether ML artifacts loaded correctly independently of whether
     the sentence-transformers model loaded.

  ✅ FIX LOAD-5 — Calibrated model path uses os.path.join consistently
     (was mixing styles across platforms).
"""

import os
import logging
import warnings

import joblib

# ── Suppress harmless transformer/sentence-transformers warnings ──────────────
logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
warnings.filterwarnings("ignore", message=r".*UNEXPECTED.*", category=UserWarning)
warnings.filterwarnings("ignore", message=r".*were not sharded.*", category=UserWarning)
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ✅ FIX LOAD-4: public flag so callers can check load health
_ARTIFACTS_OK: bool = False


def _load(filename: str):
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"ML artifact not found: {path}\n"
            "Run the Jupyter notebook Step 15 first to generate all .pkl files."
        )
    return joblib.load(path)


# ── Singletons (loaded once at import time) ──────────────────────────────────

# ✅ FIX LOAD-3: wrap core artifacts in try/except so a missing file
# surfaces a clear error at startup rather than an opaque crash.
try:
    # ✅ FIX LOAD-5: consistent os.path.join usage
    calibrated_path = os.path.join(BASE_DIR, "calibrated_model.pkl")
    original_path   = os.path.join(BASE_DIR, "model.pkl")

    if os.path.exists(calibrated_path):
        model = joblib.load(calibrated_path)
        print("[model_loader] ✓ Loaded calibrated model (calibrated_model.pkl)")
    elif os.path.exists(original_path):
        model = joblib.load(original_path)
        print("[model_loader] ✓ Loaded original model (model.pkl)")
    else:
        raise FileNotFoundError(
            "Neither calibrated_model.pkl nor model.pkl found in backend/. "
            "Run the training notebook to generate them."
        )

    feature_columns = _load("feature_columns.pkl")   # list[str] — exact column order
    label_encoders  = _load("label_encoders.pkl")     # dict[str, LabelEncoder]
    scaler          = _load("scaler.pkl")             # StandardScaler

    _ARTIFACTS_OK = True
    print("[model_loader] ✓ All core ML artifacts loaded successfully")
    print(f"  Model    : {type(model).__name__}")
    print(f"  Features : {len(feature_columns)}")
    print(f"  Encoders : {list(label_encoders.keys())}")

except Exception as _load_exc:
    # ✅ FIX LOAD-3: provide safe fallback values so imports don't crash
    # the whole process — main.py will surface the error via /health.
    model           = None  # type: ignore[assignment]
    feature_columns = []    # type: ignore[assignment]
    label_encoders  = {}    # type: ignore[assignment]
    scaler          = None  # type: ignore[assignment]
    _ARTIFACTS_OK   = False
    print(f"[model_loader] ⚠️  Failed to load ML artifacts: {_load_exc!r}")
    print("[model_loader] ⚠️  Server will start in degraded mode (shortlisting disabled).")

# ── Optional: job_requirements (not used in shortlisting pipeline) ────────────
_job_req_path = os.path.join(BASE_DIR, "job_requirements.pkl")
if os.path.exists(_job_req_path):
    try:
        job_requirements = joblib.load(_job_req_path)
        print(f"[model_loader] ✓ job_requirements loaded ({len(job_requirements)} job types)")
    except Exception as _jr_exc:
        job_requirements = {}
        print(f"[model_loader] ⚠️  job_requirements.pkl found but failed to load: {_jr_exc!r}")
else:
    job_requirements = {}
    print("[model_loader] ⚠️  job_requirements.pkl not found — using empty dict (non-critical)")