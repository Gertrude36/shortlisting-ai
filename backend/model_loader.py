"""
backend/model_loader.py
────────────────────────────────────────────────────────────────
Loads all ML artifacts from disk exactly once when the FastAPI
app starts. Every other module imports the singletons below.

FIXES APPLIED:
  - job_requirements.pkl is loaded conditionally: if the file is
    missing the server no longer crashes at startup — it falls back
    to an empty dict and logs a warning. This artifact is not used
    anywhere in the shortlisting pipeline so its absence is safe.

  - ✅ FIX: Suppressed harmless BertModel LOAD REPORT warning
    ("embeddings.position_ids | UNEXPECTED") that appears when
    loading sentence-transformers/all-MiniLM-L6-v2. The weight
    loads successfully (103/103); this is just a version mismatch
    in a non-trainable buffer — safe to ignore.
"""

import os
import logging
import warnings
import joblib

# ── Suppress harmless transformer/sentence-transformers warnings ──────────────
# The "embeddings.position_ids | UNEXPECTED" message is a known cosmetic warning
# from loading all-MiniLM-L6-v2 across slightly different transformers versions.
# All 103 weights load correctly — this just silences the noise.
logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
warnings.filterwarnings(
    "ignore",
    message=r".*UNEXPECTED.*",
    category=UserWarning,
)
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load(filename: str):
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"ML artifact not found: {path}\n"
            "Run the Jupyter notebook Step 15 first to generate all .pkl files."
        )
    return joblib.load(path)


# ── Singletons (loaded once at import time) ──────────────────────────────────

# Try calibrated model first; fall back to original
calibrated_path = os.path.join(BASE_DIR, "calibrated_model.pkl")
if os.path.exists(calibrated_path):
    model = joblib.load(calibrated_path)
    print("✓ Loaded calibrated model (calibrated_model.pkl)")
else:
    model = _load("model.pkl")
    print("✓ Loaded original model (model.pkl)")

feature_columns = _load("feature_columns.pkl")   # list[str] — exact column order
label_encoders  = _load("label_encoders.pkl")    # dict[str, LabelEncoder]
scaler          = _load("scaler.pkl")             # StandardScaler

# ✅ FIX: job_requirements is not used in shortlisting_engine.py.
#    Load it only if the file exists so a missing file doesn't crash startup.
_job_req_path = os.path.join(BASE_DIR, "job_requirements.pkl")
if os.path.exists(_job_req_path):
    job_requirements = joblib.load(_job_req_path)
else:
    job_requirements = {}
    print("⚠ job_requirements.pkl not found — using empty dict (non-critical)")

print("✓ All ML artifacts loaded successfully")
print(f"  Model        : {type(model).__name__}")
print(f"  Features     : {len(feature_columns)}")
print(f"  Encoders     : {list(label_encoders.keys())}")
if job_requirements:
    print(f"  Job types    : {list(job_requirements.keys())}")