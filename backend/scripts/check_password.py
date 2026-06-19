#!/usr/bin/env python3
"""Check HR user credentials."""

from database import SessionLocal
from models import User
from auth import verify_password

db = SessionLocal()
hr_user = db.query(User).filter(User.email == 'hr@gmail.com').first()

if hr_user:
    print(f'HR User found: {hr_user.email}')
    print(f'Password hash: {hr_user.hashed_password[:50]}...')
    
    # Try to verify with common passwords
    test_passwords = ['password123', 'password', 'test123', '123456', 'admin', '']
    for pwd in test_passwords:
        try:
            if verify_password(pwd, hr_user.hashed_password):
                print(f'✓ MATCH: password is "{pwd}"')
                break
        except Exception:
            pass
    else:
        print('✗ No password match found')
else:
    print('HR user not found')

db.close()
