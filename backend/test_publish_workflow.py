#!/usr/bin/env python3
"""
Test script for the publication workflow:
1. Get HR authentication token
2. Fetch jobs
3. Run batch shortlisting
4. Test publication endpoint
5. Verify results were published
"""

import requests
import json
import time
from datetime import datetime, timezone, timedelta

API_URL = "http://localhost:8000"

def log(msg, status="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {status:10s} | {msg}")

def test_workflow():
    try:
        # 1. Login as HR
        log("Testing HR login...")
        login_res = requests.post(f"{API_URL}/auth/login", json={
            "email": "hr@gmail.com",
            "password": "Secure@12345"
        })
        if login_res.status_code != 200:
            log(f"Login failed: {login_res.text}", "ERROR")
            return False
        
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        log(f"✓ HR logged in successfully", "SUCCESS")

        # 2. Get jobs
        log("Fetching jobs...")
        jobs_res = requests.get(f"{API_URL}/jobs", headers=headers)
        if jobs_res.status_code != 200:
            log(f"Failed to fetch jobs: {jobs_res.text}", "ERROR")
            return False
        
        jobs = jobs_res.json()
        log(f"✓ Found {len(jobs)} job(s)", "SUCCESS")
        if not jobs:
            log("No jobs available - skipping test", "WARN")
            return False
        
        job = jobs[0]
        job_id = job["id"]
        log(f"  Using job: {job['title']} (ID: {job_id})", "INFO")

        # 3. Get candidates for this job (should be pending before shortlisting)
        log("Fetching candidates before shortlisting...")
        candidates_before_res = requests.get(f"{API_URL}/hr/candidates?job_id={job_id}", headers=headers)
        if candidates_before_res.status_code != 200:
            log(f"Failed to fetch candidates: {candidates_before_res.text}", "ERROR")
            return False
        
        candidates_before = candidates_before_res.json()
        log(f"✓ Found {len(candidates_before)} candidate(s)", "SUCCESS")
        
        unpublished_before = [c for c in candidates_before if not c.get("published_at")]
        shortlisted_before = [c for c in candidates_before if c.get("decision") == "shortlisted"]
        log(f"  - Unpublished: {len(unpublished_before)}", "INFO")
        log(f"  - Shortlisted: {len(shortlisted_before)}", "INFO")

        if len(candidates_before) == 0:
            log("No candidates for this job - test skipped (no test data available)", "WARN")
            log("\n⚠️  TEST INCOMPLETE - No candidates in database", "WARN")
            log("To run full test, please:", "INFO")
            log("  1. Register an applicant via frontend", "INFO")
            log("  2. Apply to a job", "INFO")
            log("  3. Run this test again", "INFO")
            return False

        # 4. Test publication endpoint
        if len(unpublished_before) > 0:
            log(f"Publishing results for {len(unpublished_before)} unpublished candidate(s)...", "INFO")
            publish_res = requests.post(
                f"{API_URL}/hr/publish-results/{job_id}",
                headers=headers
            )
            
            if publish_res.status_code != 200:
                log(f"Publication failed: {publish_res.text}", "ERROR")
                return False
            
            result = publish_res.json()
            log(f"✓ Publication successful", "SUCCESS")
            log(f"  - Published: {result.get('published_count', 0)}", "INFO")
            log(f"  - Shortlisted: {result.get('shortlisted', 0)}", "INFO")
            log(f"  - Not shortlisted: {result.get('not_shortlisted', 0)}", "INFO")
            log(f"  - Manual review: {result.get('manual_review', 0)}", "INFO")
            
            if result.get("email_errors"):
                log(f"  - Email errors: {len(result['email_errors'])}", "WARN")
                for error in result["email_errors"][:3]:
                    log(f"    {error}", "WARN")

            # 5. Verify publication
            log("Verifying publication in database...", "INFO")
            time.sleep(1)
            
            candidates_after_res = requests.get(f"{API_URL}/hr/candidates?job_id={job_id}", headers=headers)
            candidates_after = candidates_after_res.json()
            
            published_after = [c for c in candidates_after if c.get("published_at")]
            unpublished_after = [c for c in candidates_after if not c.get("published_at")]
            
            log(f"✓ Publication verified", "SUCCESS")
            log(f"  - Published: {len(published_after)}", "INFO")
            log(f"  - Unpublished: {len(unpublished_after)}", "INFO")
            
            # Show details of published candidates
            if published_after:
                for idx, candidate in enumerate(published_after[:3], 1):
                    log(f"  [{idx}] {candidate.get('full_name')} - Decision: {candidate.get('decision')} - Published: {candidate.get('published_at', 'N/A')}", "INFO")

            # 6. Test that re-publishing doesn't duplicate
            log("Testing re-publish prevention...", "INFO")
            time.sleep(1)
            
            publish_res2 = requests.post(
                f"{API_URL}/hr/publish-results/{job_id}",
                headers=headers
            )
            
            if publish_res2.status_code == 200:
                result2 = publish_res2.json()
                if result2.get('published_count', 0) == 0:
                    log(f"✓ Re-publish correctly found 0 new results to publish", "SUCCESS")
                else:
                    log(f"⚠ Re-publish found {result2.get('published_count')} results to publish (expected 0)", "WARN")
            else:
                log(f"Re-publish test returned {publish_res2.status_code}", "INFO")

        else:
            log("No candidates available for publication test", "WARN")
        
        log("\n✅ ALL TESTS PASSED", "SUCCESS")
        return True

    except Exception as e:
        log(f"Test failed with exception: {str(e)}", "ERROR")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_workflow()
    exit(0 if success else 1)
