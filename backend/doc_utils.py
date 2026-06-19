"""
doc_utils.py
------------
Shared low-level utilities used by BOTH document_verifier.py and
shortlisting_engine.py.

Keeping these here breaks the circular import:
  shortlisting_engine  ->  document_verifier  ->  shortlisting_engine  (CIRCULAR)

After this change:
  shortlisting_engine  ->  document_verifier  (one-way, OK)
  shortlisting_engine  ->  doc_utils          (one-way, OK)
  document_verifier    ->  doc_utils          (one-way, OK)
"""
from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------------------
# Character-level OCR quality helpers
# ---------------------------------------------------------------------------

def _count_readable_chars(text: str) -> int:
    """Count printable, non-whitespace characters in *text*."""
    if not text:
        return 0
    return sum(1 for c in text if c.isprintable() and not c.isspace())


def _ocr_quality_is_low(text: str, min_readable: int = 30) -> bool:
    """Return True when *text* has fewer readable chars than *min_readable*."""
    return _count_readable_chars(text) < min_readable


# ---------------------------------------------------------------------------
# Per-document-type character thresholds used for quality estimation
# ---------------------------------------------------------------------------

DOC_QUALITY_FULL_CHARS: dict[str, int] = {
    "id_card":     300,
    "cv":          500,
    "diploma":     200,
    "certificate": 150,
    "experience":  150,
}