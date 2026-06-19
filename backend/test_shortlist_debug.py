#!/usr/bin/env python3
"""
Test script to trigger batch shortlisting and verify worker logs
"""
import requests
import json
import time
import sys

# Fix encoding on Windows
if sys.platform == "win32":
    import os
    os.environ['PYTHONIOENCODING'] = 'utf-8'

BASE_URL = "http://localhost:8000"
HR_CREDS = {"email": "hr@gmail.com", "password": "Secure@12345"}

def test_shortlist():
    print("=" * 60)
    print("TEST: Batch Shortlisting with Debug Logging")
    print("=" * 60)
    
    # Login
    print("\n[1] Logging in as HR...")
    resp = requests.post(f"{BASE_URL}/auth/login", json=HR_CREDS)
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text}")
        return
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"[OK] Logged in, token: {token[:20]}...")
    
    # Get jobs
    print("\n[2] Fetching jobs...")
    resp = requests.get(f"{BASE_URL}/jobs", headers=headers)
    jobs = resp.json()
    job_id = jobs[0]["id"] if jobs else 5
    print(f"[OK] Found job_id={job_id}")
    
    # Get candidates for this job
    print(f"\n[3] Fetching candidates for job_id={job_id}...")
    resp = requests.get(f"{BASE_URL}/hr/candidates?job_id={job_id}", headers=headers)
    candidates = resp.json()
    print(f"[OK] Found {len(candidates)} candidate(s)")
    for c in candidates[:3]:
        print(f"   - {c.get('applicant_name')} (app_id={c.get('id')}, decision={c.get('decision')})")
    
    # Trigger batch shortlisting
    print(f"\n[4] Triggering batch shortlisting for job_id={job_id}...")
    resp = requests.post(f"{BASE_URL}/hr/shortlist-all/{job_id}", headers=headers)
    if resp.status_code != 200:
        print(f"[FAIL] Shortlist request failed: {resp.status_code} {resp.text}")
        return
    result = resp.json()
    print(f"[OK] Batch shortlisting started")
    print(f"   Message: {result['message']}")
    print(f"   Total applicants: {result['total']}")
    
    # Poll status
    print(f"\n[5] Monitoring shortlist progress (polling status endpoint)...\n")
    max_polls = 30
    poll_count = 0
    while poll_count < max_polls:
        resp = requests.get(f"{BASE_URL}/hr/shortlist-status/{job_id}", headers=headers)
        status = resp.json()
        running = status.get("running", False)
        processed = status.get("processed", 0)
        total = status.get("total", 0)
        shortlisted = status.get("shortlisted", 0)
        
        print(f"   Poll #{poll_count+1}: running={running}, processed={processed}/{total}, shortlisted={shortlisted}")
        poll_count += 1
        
        if not running:
            print(f"\n[OK] Shortlisting completed!")
            print(f"   Final results: {status}")
            break
        
        time.sleep(2)
    
    if running:
        print(f"\n[TIMEOUT] Shortlisting still running after {max_polls} polls")
    
    # Fetch final candidates status
    print(f"\n[6] Fetching final candidates status...")
    resp = requests.get(f"{BASE_URL}/hr/candidates?job_id={job_id}", headers=headers)
    candidates = resp.json()
    print(f"   Candidates after shortlisting:")
    for c in candidates[:5]:
        print(f"   - {c.get('applicant_name')} (decision={c.get('decision')}, score={c.get('ai_score')})")

if __name__ == "__main__":
    try:
        test_shortlist()
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
