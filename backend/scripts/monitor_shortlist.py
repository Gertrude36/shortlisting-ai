#!/usr/bin/env python3
"""Monitor batch shortlisting progress."""

import requests
import json
import time

BASE_URL = 'http://localhost:8000'

# Try login again to get fresh token
r = requests.post(f'{BASE_URL}/auth/login', json={
    'email': 'hr@gmail.com',
    'password': 'Secure@12345'
})
token = r.json().get('access_token')

headers = {'Authorization': f'Bearer {token}'}

# Check status
print("\n[MONITORING] Batch shortlisting progress...\n")
for i in range(20):
    r = requests.get(f'{BASE_URL}/hr/shortlist-status/5', headers=headers)
    data = r.json()
    running = data.get("running")
    completed = data.get("completed")
    total = data.get("total")
    shortlisted = data.get("shortlisted")
    manual = data.get("manual_review")
    rejected = data.get("not_shortlisted")
    
    print(f"[{i:2d}] Running: {str(running):5} | Done: {completed}/{total} | Shortlisted: {shortlisted} | Manual: {manual} | Rejected: {rejected}")
    
    if not running:
        print("\n✓ Batch shortlisting completed!")
        break
    time.sleep(0.5)
else:
    print("\n⏱ Timeout - still processing...")

# Show final candidates
print("\n[FINAL] Candidate decisions:")
r = requests.get(f'{BASE_URL}/hr/candidates?job_id=5', headers=headers)
candidates = r.json()
if isinstance(candidates, list):
    for c in candidates:
        app_id = c.get("id") or c.get("application_id")
        name = c.get("full_name") or c.get("applicant_name")
        decision = c.get("decision") or c.get("status") or "pending"
        score = c.get("ai_score")
        if app_id:
            score_str = f"({score:.3f})" if score else ""
            print(f"  App {app_id}: {name} -> {decision} {score_str}")
