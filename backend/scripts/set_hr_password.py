#!/usr/bin/env python3
"""Set a known HR user password."""

from database import SessionLocal
from models import User
from auth import hash_password

db = SessionLocal()
hr_user = db.query(User).filter(User.email == 'hr@gmail.com').first()

if hr_user:
    new_password = 'test123'
    hr_user.hashed_password = hash_password(new_password)
    db.add(hr_user)
    db.commit()
    print(f'✓ HR user password set to: {new_password}')
else:
    print('HR user not found')

db.close()
