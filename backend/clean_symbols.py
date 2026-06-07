"""
Replace Unicode symbols in shortlisting_engine.py with plain-text equivalents.
Run once from the backend directory: python clean_symbols.py
"""
import re

path = "shortlisting_engine.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Map every Unicode symbol used in string literals to plain text
replacements = [
    # Checkmarks / ticks -> plain prefix or removed
    ("\u2705", ""),        # green checkmark box
    ("\u2714", ""),        # heavy checkmark
    ("\u2713", ""),        # checkmark
    ("\u2611", ""),        # ballot box with check

    # Crosses / fails -> plain prefix or removed
    ("\u274c", ""),      # cross mark
    ("\u2718", ""),      # heavy ballot x
    ("\u2717", ""),      # ballot x
    ("\u2612", ""),      # ballot box with x

    # Warning / advisory -> plain prefix
    ("\u26a0", ""),         # warning sign (triangle !)
    ("\ufe0f", ""),            # variation selector-16 (emoji modifier, always invisible)

    # Info / bullets
    ("\u2022", "-"),           # bullet
    ("\u2764", ""),            # red heart (shouldn't appear but guard)
    ("\u2b50", ""),            # star

    # Arrows
    ("\u2192", "->"),          # right arrow
    ("\u2190", "<-"),          # left arrow
    ("\u2713", ""),

    # Box drawing that sneaked in
    ("\u2500", "-"),
    ("\u2502", "|"),
]

original = content
for old, new in replacements:
    content = content.replace(old, new)

if content == original:
    print("No symbols found -- file already clean.")
else:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    changed = sum(1 for o, _ in replacements if o in original)
    print(f"Done. Replaced symbols in {path}")
