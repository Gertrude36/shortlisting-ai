#!/usr/bin/env python3
"""
Create test applicant data with applications to test publication workflow.
"""

import sys
sys.path.insert(0, '/backend')

from database import SessionLocal
from models import User, Application, Document, Job, DecisionStatus
from auth import hash_password
from datetime import datetime, timezone, timedelta
import json
import tempfile
import os

def seed_test_data():
    """Create test applicant and application data."""
    db = SessionLocal()
    
    try:
        # Get first available job
        job = db.query(Job).filter(Job.is_active == True).first()
        if not job:
            print("❌ No active jobs found. Please create a job first.")
            return False
        
        print(f"✓ Using job: {job.title} (ID: {job.id})")
        
        # Check if test applicant exists
        test_email = "testapplicant@example.com"
        existing_applicant = db.query(User).filter(User.email == test_email).first()
        
        if existing_applicant:
            applicant = existing_applicant
            print(f"✓ Test applicant already exists: {applicant.email}")
        else:
            # Create test applicant
            applicant = User(
                email=test_email,
                full_name="Test Applicant",
                hashed_password=hash_password("TestPass@123"),
                role="applicant"
            )
            db.add(applicant)
            db.commit()
            print(f"✓ Created test applicant: {applicant.email}")
        
        # Check if application already exists
        existing_app = db.query(Application).filter(
            Application.job_id == job.id,
            Application.applicant_id == applicant.id
        ).first()
        
        if existing_app:
            print(f"✓ Application already exists (ID: {existing_app.id})")
            if existing_app.decision == DecisionStatus.shortlisted:
                print(f"  - Status: SHORTLISTED")
            else:
                print(f"  - Status: {existing_app.decision}")
            application = existing_app
        else:
            # Create application
            now = datetime.now(timezone.utc)
            application = Application(
                job_id=job.id,
                applicant_id=applicant.id,
                education_level="Bachelor's Degree",
                field_of_study="Computer Science",
                graduation_year=2022,
                experience_years=3,
                skills="Python, Java, JavaScript, SQL",
                certifications="AWS Solutions Architect",
                gender="Male",
                phone="+1234567890",
                address="123 Test St, Test City",
                date_of_birth="1995-01-15",
                submitted_at=now,
                ai_score=0.85,
                ai_reason=json.dumps({
                    "skills_match": 0.9,
                    "experience_match": 0.8,
                    "education_match": 0.85,
                    "summary": "Strong candidate with relevant skills and experience"
                }),
                doc_verified=False,
                doc_advisory=False,
                decision=DecisionStatus.shortlisted,  # Mark as shortlisted
                shortlisted_at=now,
                ocr_quality_score=0.92,
                ocr_confidence_flag=True,
            )
            db.add(application)
            db.commit()
            print(f"✓ Created application (ID: {application.id}) - Status: SHORTLISTED")
        
        # Verify result
        app_count = db.query(Application).filter(
            Application.job_id == job.id
        ).count()
        print(f"\n✅ Test data ready:")
        print(f"   - Job: {job.title}")
        print(f"   - Applicants for this job: {app_count}")
        print(f"\nYou can now run: test_publish_workflow.py")
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = seed_test_data()
    exit(0 if success else 1)
