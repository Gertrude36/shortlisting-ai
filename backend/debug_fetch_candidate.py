import requests, json
BASE='http://localhost:8000'
# login
try:
    r=requests.post(f'{BASE}/auth/login', json={'email':'hr@gmail.com','password':'Secure@12345'}, timeout=10)
except Exception as e:
    print('auth request failed', e); raise
if r.status_code!=200:
    print('auth failed', r.status_code, r.text)
    raise SystemExit
token=r.json().get('access_token')
headers={'Authorization':f'Bearer {token}'}
# fetch candidates for job 5
try:
    r=requests.get(f'{BASE}/hr/candidates', params={'job_id':5}, headers=headers, timeout=10)
    print('status', r.status_code)
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print('fetch failed', e)
