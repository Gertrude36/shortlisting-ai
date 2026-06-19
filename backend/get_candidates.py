#!/usr/bin/env python3
import requests,sys
BASE='http://localhost:8000'
creds={'email':'hr@gmail.com','password':'Secure@12345'}
try:
    r=requests.post(f'{BASE}/auth/login', json=creds, timeout=6)
except Exception as e:
    print('Login request failed:', e); sys.exit(1)
if r.status_code!=200:
    print('login failed', r.status_code, r.text); sys.exit(1)
token=r.json()['access_token']
headers={'Authorization':f'Bearer {token}'}
job_id=5
try:
    resp=requests.get(f'{BASE}/hr/candidates?job_id={job_id}', headers=headers, timeout=6)
    data=resp.json()
    import json
    print(json.dumps(data, ensure_ascii=False, indent=2))
except Exception as e:
    print('Failed to fetch candidates:', e)
