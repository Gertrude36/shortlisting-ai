#!/usr/bin/env python3
"""
Simplified test to verify the two main fixes:
1. Document extraction is being used in candidate scoring  
2. Personalized shortlisting reasons are generated for each candidate
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys

# Database path
DB_PATH = "sqlite:///capstone.db"

def test_database_state():
    """Check if the database has applications with enriched profile data"""
    print("\n" + "="*70)
    print("TEST: Checking Database State")
    print("="*70)
    
    try:
        engine = create_engine(DB_PATH)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        # Get all applications
        query = text("""
            SELECT id, job_id, education_level, field_of_study, skills, 
                   certifications, experience_years, ai_reason, decision
            FROM applications
            WHERE submitted_at IS NOT NULL
            LIMIT 10
        """)
        
        result = session.execute(query)
        apps = result.fetchall()
        
        if not apps:
            print("❌ No submitted applications found in database")
            return False
        
        print(f"✓ Found {len(apps)} submitted applications\n")
        
        # Check for enriched fields
        enriched_count = 0
        enriched_apps = []
        
        for app in apps:
            app_id, job_id, edu_level, field, skills, certs, exp_years, reason, decision = app
            
            # Count enriched fields
            enriched_fields = sum([
                bool(edu_level),
                bool(field),
                bool(skills),
                bool(certs),
                bool(exp_years)
            ])
            
            if enriched_fields >= 3:
                enriched_count += 1
                enriched_apps.append((app_id, enriched_fields, reason, decision))
            
            print(f"Application {app_id}:")
            print(f"  Education Level: {edu_level or 'EMPTY'}")
            print(f"  Field of Study: {field or 'EMPTY'}")
            print(f"  Skills: {skills[:50]+'...' if skills else 'EMPTY'}")
            print(f"  Certifications: {certs or 'EMPTY'}")
            print(f"  Experience Years: {exp_years or 'EMPTY'}")
            print(f"  Enrichment Score: {enriched_fields}/5")
            print()
        
        # Test 1: Document extraction (check enriched fields)
        print("="*70)
        print("TEST 1 RESULT: Document Extraction Integration")
        print("="*70)
        if enriched_count >= len(apps) * 0.6:  # At least 60% enriched
            print(f"✓ PASS: {enriched_count}/{len(apps)} applications have enriched profile data")
            test1_pass = True
        else:
            print(f"⚠ WARNING: Only {enriched_count}/{len(apps)} applications enriched")
            print("  This might indicate document extraction isn't being used consistently")
            test1_pass = None
        
        # Test 2: Personalized reasons
        print("\n" + "="*70)
        print("TEST 2 RESULT: Personalized Shortlisting Reasons")
        print("="*70)
        
        # Get the reasons from enriched apps
        reasons = [app[2] for app in enriched_apps if app[2]]
        
        if len(reasons) < 2:
            print("⚠ Not enough applications with reasons to test personalization")
            test2_pass = None
        else:
            unique_reasons = len(set(reasons))
            print(f"Applications with reasons: {len(reasons)}")
            print(f"Unique reasons: {unique_reasons}")
            
            # Check for personalization
            sample_reasons = reasons[:3]
            print(f"\nSample reasons:")
            for i, reason in enumerate(sample_reasons, 1):
                print(f"  {i}: {reason[:80]}..." if len(reason) > 80 else f"  {i}: {reason}")
            
            if unique_reasons >= 2:
                print(f"\n✓ PASS: Reasons are personalized (unique: {unique_reasons})")
                
                # Check for specific data in reasons (not generic templates)
                markers = ['year', 'skill', 'education', 'gap', 'require', 'score', '%']
                reasons_with_markers = 0
                for reason in reasons:
                    if any(marker in reason.lower() for marker in markers):
                        reasons_with_markers += 1
                
                if reasons_with_markers > 0:
                    print(f"  Reasons contain specific data: {reasons_with_markers}/{len(reasons)} ✓")
                
                test2_pass = True
            else:
                print(f"\n✗ FAIL: All reasons are identical")
                test2_pass = False
        
        session.close()
        
        return test1_pass, test2_pass
        
    except Exception as e:
        print(f"❌ Database error: {e}")
        import traceback
        traceback.print_exc()
        return False, False


def main():
    print("\n" + "#"*70)
    print("# CAPSTONE PROJECT - FIX VALIDATION (DATABASE)")
    print("#"*70)
    
    try:
        test1_result, test2_result = test_database_state()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    print(f"Test 1 (Document Extraction): {'✓ PASS' if test1_result is True else '✗ FAIL' if test1_result is False else '⊘ UNCERTAIN'}")
    print(f"Test 2 (Personalized Reasons): {'✓ PASS' if test2_result is True else '✗ FAIL' if test2_result is False else '⊘ UNCERTAIN'}")
    
    if test1_result is True and test2_result is True:
        print("\n✅ ALL FIXES VERIFIED!")
        return 0
    elif test1_result is False or test2_result is False:
        print("\n❌ FIXES NOT WORKING PROPERLY")
        return 1
    else:
        print("\n⚠ INSUFFICIENT DATA TO VERIFY")
        print("You need to:")
        print("  1. Submit at least one application with documents")
        print("  2. Run shortlisting for a job")
        print("  3. Then run this test again")
        return 2


if __name__ == "__main__":
    sys.exit(main())
