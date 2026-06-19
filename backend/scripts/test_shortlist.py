#!/usr/bin/env python3
"""Test batch shortlisting and OCR document extraction."""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def login_hr():
    """Login as HR user."""
    print("\n[AUTH] Logging in as HR...")
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "hr@gmail.com",
        "password": "Secure@12345"
    })
    if r.status_code != 200:
        print(f"[ERROR] Login failed: {r.status_code}")
        print(r.text)
        return None
    data = r.json()
    token = data.get("access_token")
    print(f"[AUTH] Login successful, token: {token[:20]}...")
    return token

def test_jobs(token):
    """List jobs."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/jobs", headers=headers)
    jobs = r.json()
    print(f"\n[JOBS] Found {len(jobs)} jobs:")
    for job in jobs:
        print(f"  ID {job['id']}: {job['title']}")
    return jobs

def test_hr_candidates(job_id, token):
    """List candidates for a job."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/hr/candidates", params={"job_id": job_id}, headers=headers)
    if r.status_code != 200:
        print(f"\n[ERROR] Failed to fetch candidates: {r.status_code}")
        print(r.text)
        return []
    data = r.json()
    # Handle both dict and list responses
    if isinstance(data, dict):
        candidates = data.get("candidates", [])
    else:
        candidates = data if isinstance(data, list) else []
    print(f"\n[CANDIDATES] Found {len(candidates)} candidates for job {job_id}:")
    for c in candidates:
        # Try multiple field names
        app_id = c.get("id") or c.get("application_id")
        name = c.get("full_name") or c.get("applicant_name")
        decision = c.get("decision") or c.get("status") or "pending"
        if app_id:
            print(f"  App ID {app_id}: {name or 'Unknown'} - decision={decision}")
    return candidates

def test_batch_shortlist(job_id, token):
    """Trigger batch shortlisting."""
    headers = {"Authorization": f"Bearer {token}"}
    print(f"\n[BATCH_SHORTLIST] Starting batch shortlisting for job {job_id}...")
    r = requests.post(f"{BASE_URL}/hr/shortlist-all/{job_id}", headers=headers)
    if r.status_code != 200:
        print(f"[ERROR] Failed to start shortlisting: {r.status_code}")
        print(r.text)
        return None
    data = r.json()
    print(f"[BATCH_SHORTLIST] Response: {data}")
    return data

def test_batch_status(job_id, token):
    """Check batch shortlisting status."""
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/hr/shortlist-status/{job_id}", headers=headers)
    if r.status_code != 200:
        print(f"[ERROR] Failed to fetch status: {r.status_code}")
        return None
    data = r.json()
    print(f"[STATUS] Job {job_id}:")
    print(f"  Running: {data.get('running')}")
    print(f"  Completed: {data.get('completed')}/{data.get('total')}")
    print(f"  Shortlisted: {data.get('shortlisted')}")
    print(f"  Manual review: {data.get('manual_review')}")
    print(f"  Rejected: {data.get('not_shortlisted')}")
    return data

if __name__ == "__main__":
    try:
        # Login
        token = login_hr()
        if not token:
            print("\n[ERROR] Authentication failed!")
            exit(1)
        
        # Get jobs
        jobs = test_jobs(token)
        if not jobs:
            print("\n[ERROR] No jobs found!")
            exit(1)
        
        # Use first job
        job_id = jobs[0]["id"]
        print(f"\n[TEST] Using job ID: {job_id}")
        
        # List current candidates
        candidates_before = test_hr_candidates(job_id, token)
        
        # Start batch shortlisting
        test_batch_shortlist(job_id, token)
        
        # Wait a bit for processing
        print("\n[WAIT] Waiting 3 seconds for batch processing...")
        time.sleep(3)
        
        # Check status
        test_batch_status(job_id, token)
        
        # List candidates after
        candidates_after = test_hr_candidates(job_id, token)
        
        print("\n[SUMMARY] Test completed!")
        
    except Exception as e:
        print(f"\n[ERROR] {e!r}")
        import traceback
        traceback.print_exc()
