from document_extractor import extract_multiple_documents

# Monkeypatch extract_document by importing module and replacing function
import document_extractor as de

# Prepare fake extraction results for two documents
res1 = {
    'document_type': 'cv',
    'raw_text': 'Candidate CV with skills: Python',
    'skills': ['Python'],
    'education': [{'degree': 'Diploma', 'field': 'IT', 'year': '2020'}]
}
res2 = {
    'document_type': 'diploma',
    'raw_text': 'Diploma image text with additional skill: Django',
    'skills': ['Django'],
    'education': [{'degree': 'Diploma', 'field': 'Information Technology', 'year': '2020'}],
    'certifications': ['CompTIA A+']
}

# Save original
_orig = de.extract_document

def fake_extract_document(file_path, document_type_hint=None, applicant_name=None):
    if 'cv' in file_path:
        return res1
    return res2

# Patch
de.extract_document = fake_extract_document

out = extract_multiple_documents([
    {'file_path': 'applicant_cv.pdf', 'document_type_hint': 'cv'},
    {'file_path': 'applicant_diploma.jpg', 'document_type_hint': 'diploma'},
], applicant_name='Test Candidate')

print('merged_profile:', out['merged_profile'])

# Restore
de.extract_document = _orig
