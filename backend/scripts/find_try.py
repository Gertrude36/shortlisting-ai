p = r'g:/Btech IT/Capstone Project/project_2/backend/document_extractor.py'
with open(p, encoding='utf-8') as f:
    for i, l in enumerate(f, 1):
        if l.strip().startswith('try:'):
            print(f"{i}: {l.rstrip()}")
