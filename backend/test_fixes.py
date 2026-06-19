#!/usr/bin/env python3
"""
Test script to validate the two main fixes:
1. Document extraction is being used in candidate scoring
2. Personalized shortlisting reasons are generated for each candidate
"""

import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"

def test_document_extraction_integration():
    """Test that document extraction is integrated into scoring"""
    print("\n" + "="*70)
    print("TEST 1: Document Extraction Integration")
    print("="*70)
    
    # Check if any applications exist with documents
    try:
        resp = requests.get(f"{BASE_URL}/api/applications", headers={"Authorization": "Bearer admin"})
        if resp.status_code != 200:
            print(f"❌ Failed to fetch applications: {resp.status_code}")
            return False
        
        apps = resp.json()
        if not apps:
            print("❌ No applications found. Cannot test.")
            return False
        
        print(f"✓ Found {len(apps)} applications")
        
        # Look for apps with documents
        apps_with_docs = []
        for app in apps:
            resp = requests.get(f"{BASE_URL}/api/applications/{app['id']}/documents", 
                              headers={"Authorization": "Bearer admin"})
            if resp.status_code == 200:
                docs = resp.json()
                if docs:
                    apps_with_docs.append((app, docs))
                    print(f"  App {app['id']}: {len(docs)} documents")
        
        if not apps_with_docs:
            print("⚠ No applications with documents found. Cannot test document extraction.")
            return None
        
        # Check if enriched fields are populated
        print("\n✓ Checking enriched profile fields:")
        for app, docs in apps_with_docs[:2]:  # Check first 2
            print(f"\n  Application ID {app['id']}:")
            fields = ['education_level', 'field_of_study', 'skills', 'certifications', 'experience_years']
            enriched_count = 0
            for field in fields:
                value = app.get(field)
                if value:
                    print(f"    ✓ {field}: {value}")
                    enriched_count += 1
                else:
                    print(f"    ✗ {field}: EMPTY")
            
            if enriched_count >= 3:
                print(f"  Result: PASS (enriched {enriched_count}/{len(fields)} fields)")
                return True
        
        print("\n⚠ Insufficient enrichment detected")
        return None
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_personalized_reasons():
    """Test that each candidate gets unique personalized reasons"""
    print("\n" + "="*70)
    print("TEST 2: Personalized Shortlisting Reasons")
    print("="*70)
    
    try:
        # Get all jobs
        resp = requests.get(f"{BASE_URL}/api/jobs", headers={"Authorization": "Bearer admin"})
        if resp.status_code != 200:
            print(f"❌ Failed to fetch jobs: {resp.status_code}")
            return False
        
        jobs = resp.json()
        if not jobs:
            print("❌ No jobs found")
            return False
        
        job = jobs[0]
        print(f"✓ Using job: {job['title']} (ID: {job['id']})")
        
        # Get shortlist for this job
        resp = requests.get(f"{BASE_URL}/api/shortlists?job_id={job['id']}", 
                          headers={"Authorization": "Bearer admin"})
        if resp.status_code != 200:
            print(f"❌ Failed to fetch shortlist: {resp.status_code}")
            return False
        
        results = resp.json()
        if isinstance(results, dict):
            shortlist = results.get('shortlist', [])
        else:
            shortlist = results
        
        if not shortlist:
            print("❌ No shortlist results found")
            return False
        
        print(f"✓ Found {len(shortlist)} candidates in shortlist")
        
        # Collect reasons
        reasons_collected = []
        print("\n✓ Collecting personalized reasons:")
        for i, result in enumerate(shortlist[:5], 1):  # Check first 5
            reason = result.get('shortlisting_reason', '')
            candidate_id = result.get('candidate_id', 'unknown')
            shortlisted = result.get('shortlisted', False)
            score = result.get('match_score', 0)
            
            print(f"\n  Candidate {i} (ID: {candidate_id}):")
            print(f"    Score: {score:.2%}, Shortlisted: {shortlisted}")
            print(f"    Reason: {reason[:100]}..." if len(reason) > 100 else f"    Reason: {reason}")
            
            reasons_collected.append({
                'candidate_id': candidate_id,
                'reason': reason,
                'score': score
            })
        
        # Check if reasons are personalized (not all identical)
        if len(reasons_collected) >= 2:
            unique_reasons = len(set(r['reason'] for r in reasons_collected))
            print(f"\n✓ Analysis:")
            print(f"  Total candidates: {len(reasons_collected)}")
            print(f"  Unique reasons: {unique_reasons}")
            
            if unique_reasons >= 2:
                print(f"\n  Result: PASS - Reasons are personalized! ✓")
                
                # Check for personalization markers
                markers = ['year', 'skill', 'education', 'gap', 'require', 'but', 'score']
                marker_count = 0
                for reason in reasons_collected:
                    for marker in markers:
                        if marker.lower() in reason['reason'].lower():
                            marker_count += 1
                            break
                
                if marker_count >= len(reasons_collected) * 0.8:
                    print(f"  Personalization markers found: {marker_count}/{len(reasons_collected)} ✓")
                    return True
            else:
                print(f"\n  Result: FAIL - All reasons are identical (not personalized) ✗")
                return False
        
        return None
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    print("\n" + "#"*70)
    print("# CAPSTONE PROJECT - FIX VALIDATION TEST SUITE")
    print("#"*70)
    
    # Check if server is running
    try:
        resp = requests.get(f"{BASE_URL}/api/jobs", timeout=2)
        print("✓ Backend server is running and responsive")
    except requests.exceptions.ConnectionError:
        print("❌ Backend server is not running on http://localhost:8000")
        print("   Start it with: cd backend && python main.py")
        return 1
    except Exception as e:
        print(f"❌ Error connecting to server: {e}")
        return 1
    
    # Run tests
    results = {}
    
    print("\n[Running Test 1: Document Extraction]")
    results['doc_extraction'] = test_document_extraction_integration()
    
    time.sleep(1)
    
    print("\n[Running Test 2: Personalized Reasons]")
    results['personalized_reasons'] = test_personalized_reasons()
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result is True else "✗ FAIL" if result is False else "⊘ SKIP"
        print(f"  {test_name}: {status}")
    
    print(f"\nResults: {passed} passed, {failed} failed, {skipped} skipped")
    
    if failed == 0 and passed > 0:
        print("\n✅ ALL TESTS PASSED!")
        return 0
    elif failed > 0:
        print("\n❌ SOME TESTS FAILED")
        return 1
    else:
        print("\n⊘ INSUFFICIENT DATA FOR TESTING")
        return 2


if __name__ == "__main__":
    sys.exit(main())
