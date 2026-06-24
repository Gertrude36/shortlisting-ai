from document_extractor import extract_multiple_documents
import os
BASE = os.path.join(os.path.dirname(__file__), 'uploads')
files = ['45c6850b44f642e3a9701552cac02099.pdf', 'dd4fefcf501a479babd1d119680c103f.pdf', '56ce00cd9e6044759897034eb1e738da.pdf']
paths = [{'file_path': os.path.join(BASE,f)} for f in files]
res = extract_multiple_documents(paths, applicant_name='MUKANYAMWASA Marie Madeleine')
import json
print(json.dumps(res['merged_profile'], indent=2, ensure_ascii=False))
