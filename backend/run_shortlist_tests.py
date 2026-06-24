import json
from candidate_scorer import score_candidate


def run_test(name, candidate, job, expect):
    res = score_candidate(candidate, job)
    ok = True
    for k, v in expect.items():
        if res.get(k) != v:
            ok = False
    print(f"TEST {name}: {'PASS' if ok else 'FAIL'}")
    print(json.dumps(res, indent=2))
    if not ok:
        raise SystemExit(2)


if __name__ == '__main__':
    # Job with a hard requirement and required skill
    job1 = {
        'job_title': 'Software Engineer',
        'required_skills': ['python'],
        'required_experience_years': 2,
        'hard_requirements': ['Bachelor of Science']
    }

    # 1) Good profile with structured fields -> shortlisted
    good_profile = {
        'full_name': 'Good Candidate',
        'skills': ['Python', 'Django'],
        'education': [{'degree': 'Bachelor of Science', 'field': 'Computer Science', 'year': '2019'}],
        'experience': [{'duration': '3 years'}],
        'raw_text': 'Full CV text that is long enough to be considered good OCR',
        'extraction_method': 'ocr+local'
    }
    run_test('good_profile', good_profile, job1, {'shortlisted': True, 'needs_manual_review': False})

    # 2) Poor OCR: extraction method indicates raw OCR and short raw_text -> flag manual review, not auto-shortlist
    poor_ocr = {
        'full_name': 'Poor OCR',
        'skills': [],
        'education': [],
        'experience': [],
        'raw_text': '',
        'extraction_method': 'ocr_raw'
    }
    run_test('poor_ocr', poor_ocr, job1, {'shortlisted': False, 'needs_manual_review': True})

    # 3) Missing hard requirement with good OCR -> disqualified
    job2 = {
        'job_title': 'Project Manager',
        'required_skills': ['planning'],
        'required_experience_years': 5,
        'hard_requirements': ['PMP License']
    }
    missing_hard = {
        'full_name': 'Missing Hard',
        'skills': ['planning'],
        'education': [{'degree': 'Master of Business Administration', 'field': 'Management', 'year': '2018'}],
        'experience': [{'duration': '6 years'}],
        'raw_text': 'Experienced project manager with 6 years of experience in delivery and planning',
        'extraction_method': 'ocr+local'
    }
    run_test('missing_hard', missing_hard, job2, {'shortlisted': False, 'disqualified': True})

    print('\nAll tests passed')
