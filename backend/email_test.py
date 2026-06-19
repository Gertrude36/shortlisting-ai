#!/usr/bin/env python3
import os
import sys
sys.path.insert(0, os.path.abspath('.'))
from backend.email_utils import BREVO_API_KEY, MAIL_FROM, MAIL_FROM_NAME, FRONTEND_URL, send_test_email
print('BREVO_API_KEY', 'SET' if BREVO_API_KEY else 'MISSING')
print('MAIL_FROM', MAIL_FROM)
print('MAIL_FROM_NAME', MAIL_FROM_NAME)
print('FRONTEND_URL', FRONTEND_URL)
print('Sending test email...')
result = send_test_email('admin@test.com', 'Test User')
print('send_test_email result:', result)
