from document_extractor import _local_parse_text

samples = [
    "Diploma\nInstitution: Kigali Institute of Science and Technology\nDegree: Advanced Diploma in Information Technology\nGraduation: 2019",
    "DIPLOMA\nThis is to certify that John Doe has been awarded the Diploma in Computer Science by Example University, 2018",
    "Certificate of Completion\nAwarded: Diploma in Electrical Engineering - 2020\nInstitution: ABC College",
]

for i, s in enumerate(samples, 1):
    print(f"--- Sample {i} ---")
    out = _local_parse_text(s)
    print('parsed:', out)
    print()
