#!/usr/bin/env python3
from database import SessionLocal
from models import Document
from document_extractor import extract_document

app_id = 2
db = SessionLocal()
docs = db.query(Document).filter(Document.application_id == app_id).all()
print(f'Found {len(docs)} documents for application {app_id}')
for d in docs:
    print('DOC', d.id, d.doc_type, d.file_path)
    if d.doc_type in ('diploma', 'certificate'):
        # Try absolute and backend-relative paths
        import os, json
        candidates = [d.file_path, os.path.join('backend', d.file_path), os.path.join(os.getcwd(), d.file_path), os.path.join(os.getcwd(), 'backend', d.file_path)]
        used = None
        for p in candidates:
            if p and os.path.exists(p):
                used = p
                break
        if not used:
            print('EXTRACTION SKIPPED: file not found in candidates:', candidates)
            continue
        try:
            res = extract_document(used, document_type_hint=d.doc_type)
            print('EXTRACTION RESULT for', d.id, json.dumps(res, ensure_ascii=False, indent=2)[:2000])
        except Exception as e:
            print('EXTRACTION ERROR for', d.id, e)

db.close()
