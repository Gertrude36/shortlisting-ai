import os

src = r'g:\Btech IT\Capstone Project\project_2\frontend\src'

REPLACEMENTS = [
    ('\u2705', ''),       # checkmark box
    ('\u2714', ''),       # heavy checkmark
    ('\u2713', ''),       # checkmark
    ('\u274c', ''),       # cross
    ('\u2718', ''),       # ballot x
    ('\u26a0', ''),       # warning triangle
    ('\ufe0f', ''),       # variation selector
    ('\u2764', ''),       # heart
    ('\u2b50', ''),       # star
    ('\u2022', '-'),      # bullet
    ('\u2192', '->'),     # right arrow
    ('\u2190', '<-'),     # left arrow
    ('\u2014', ' - '),    # em dash
    ('\u2013', '-'),      # en dash
    ('\u2026', '...'),    # ellipsis
    ('\u2018', "'"),      # left single quote
    ('\u2019', "'"),      # right single quote
    ('\u201c', '"'),      # left double quote
    ('\u201d', '"'),      # right double quote
    ('\u00b7', '.'),      # middle dot
    ('\u00a0', ' '),      # non-breaking space
    # Supplementary emoji (4-byte)
    ('\U0001f4a1', ''),
    ('\U0001f4cc', ''),
    ('\U0001f510', ''),
    ('\U0001f512', ''),
    ('\U0001f6e1', ''),
    ('\U0001f916', ''),
    ('\U0001f4cb', ''),
    ('\U0001f4c4', ''),
    ('\U0001f3af', ''),
    ('\U0001f4e7', ''),
]

for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if not (fname.endswith('.jsx') or fname.endswith('.js')):
            continue
        path = os.path.join(root, fname)
        with open(path, 'r', encoding='utf-8') as f:
            c = f.read()
        orig = c
        for old, new in REPLACEMENTS:
            c = c.replace(old, new)
        if c != orig:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(c)
            print(f'Cleaned: {fname}')

print('Frontend done.')
