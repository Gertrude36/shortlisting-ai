import importlib.util, sys, os
spec = importlib.util.spec_from_file_location('ocr', os.path.join(os.path.dirname(__file__), 'ocr_utils.py'))
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)
fp = os.path.join(os.path.dirname(__file__), 'uploads', '0ebc47ccd7a6494299f92805daec8c3c.pdf')
print('TEST FILE:', fp)
text = ocr.extract_document_text(fp)
print('LEN:', len(text))
print(text[:1200])
