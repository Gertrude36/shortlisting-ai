import os

backend = r'g:\Btech IT\Capstone Project\project_2\backend'

REPLACEMENTS = [
    ('\u2550', '='),
    ('\u2551', '|'),
    ('\u2554', '+'),
    ('\u2557', '+'),
    ('\u255a', '+'),
    ('\u255d', '+'),
    ('\u2500', '-'),
    ('\u2502', '|'),
    ('\u2588', '#'),
    ('\u25cf', '*'),
    ('\U0001f4cc', ''),
    ('\U0001f4a1', ''),
    ('\U0001f510', ''),
    ('\U0001f512', ''),
    ('\u2705', ''),
    ('\u2714', ''),
    ('\u2713', ''),
    ('\u274c', ''),
    ('\u2718', ''),
    ('\u26a0', ''),
    ('\ufe0f', ''),
    ('\u2764', ''),
    ('\u2b50', ''),
    ('\u2022', '-'),
    ('\u2192', '->'),
    ('\u2190', '<-'),
    ('\u2014', '--'),
    ('\u2013', '-'),
    ('\u2026', '...'),
    ('\u2018', "'"),
    ('\u2019', "'"),
    ('\u201c', '"'),
    ('\u201d', '"'),
    ('\u00e2\u20ac\u201c', ' - '),
    ('\u00e2\u20ac\u2122', "'"),
    ('[OK]', ''),
    ('[FAIL]', ''),
    ('[!]', ''),
]

for fname in os.listdir(backend):
    if not fname.endswith('.py'):
        continue
    if fname == 'fix_symbols.py':
        continue
    path = os.path.join(backend, fname)
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    orig = c
    for old, new in REPLACEMENTS:
        c = c.replace(old, new)
    # Remove any remaining non-Latin characters above U+024F
    # (keeps accented Latin chars but removes emoji, box drawing, etc.)
    result = []
    for ch in c:
        cp = ord(ch)
        if cp <= 0x024F or cp == 0x0009 or cp == 0x000A or cp == 0x000D:
            result.append(ch)
        # else: drop it
    cleaned = ''.join(result)
    if cleaned != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        print(f'Cleaned: {fname}')
    else:
        print(f'  OK: {fname}')

print('All done.')
