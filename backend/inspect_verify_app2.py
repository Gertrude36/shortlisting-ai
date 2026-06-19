#!/usr/bin/env python3
from database import SessionLocal
from models import Document, Application, User
from document_verifier import verify_documents, _local_ocr_text

app_id = 2

db = SessionLocal()
app = db.query(Application).filter(Application.id==app_id).first()
user = db.query(User).filter(User.id==app.applicant_id).first()
docs = db.query(Document).filter(Document.application_id==app_id).all()
print('app education_level=', app.education_level, 'field=', app.field_of_study)
paths=[]
types=[]
for d in docs:
    print('DOC', d.id, d.doc_type, d.file_path)
    paths.append(d.file_path)
    types.append(d.doc_type.value if hasattr(d.doc_type,'value') else d.doc_type)

# Build cached texts
cached = {}
for p,t in zip(paths, types):
    try:
        txt = _local_ocr_text(p, t)
    except Exception as e:
        txt = ''
    cached[t] = txt
    print('OCR len for', t, len(txt))

print('\nCalling verify_documents...')
res = verify_documents(user.full_name, app.education_level or '', app.field_of_study or '', paths, types, cached)
print('verify_documents result=', res)

db.close()
