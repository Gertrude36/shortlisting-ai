import json
import os
from document_extractor import extract_document

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')

report = []

for fname in sorted(os.listdir(UPLOAD_DIR)):
    path = os.path.join(UPLOAD_DIR, fname)
    try:
        res = extract_document(path)
    except Exception as e:
        res = {'error': str(e), 'document_type': 'unknown', 'file_name': fname}
    entry = {
        'file_name': fname,
        'extraction_method': res.get('extraction_method'),
        'document_type': res.get('document_type'),
        'raw_text_len': len(res.get('raw_text','') or ''),
        'has_education': bool(res.get('education')),
        'has_skills': bool(res.get('skills')),
        'error': res.get('error')
    }
    print(f"{fname}: method={entry['extraction_method']}, doc_type={entry['document_type']}, raw_len={entry['raw_text_len']}, edu={entry['has_education']}, skills={entry['has_skills']}, err={entry['error']}")
    report.append({**entry, 'raw_text_preview': (res.get('raw_text') or '')[:200]})

with open(os.path.join(os.path.dirname(__file__), 'extraction_report.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print('\nWrote backend/extraction_report.json')
