#!/usr/bin/env python3
"""Setup test HR user"""
from database import SessionLocal
from models import User, UserRole
from auth import hash_password

db = SessionLocal()
try:
    # Check if HR user exists
    existing = db.query(User).filter(User.email == "hr@gmail.com").first()
    if existing:
        print(f"HR user already exists: {existing.email}")
        # Update password
        existing.hashed_password = hash_password("Secure@12345")
        db.commit()
        print(f"Password updated to: Secure@12345")
    else:
        # Create new HR user
        hr = User(
            email="hr@gmail.com",
            full_name="HR Manager",
            hashed_password=hash_password("Secure@12345"),
            role=UserRole.hr
        )
        db.add(hr)
        db.commit()
        print(f"HR user created: {hr.email}")
        print(f"Password: Secure@12345")
finally:
    db.close()
