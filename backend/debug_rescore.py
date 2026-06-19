import requests, json
BASE='http://localhost:8000'
# login as HR
r=requests.post(f'{BASE}/auth/login', json={'email':'hr@gmail.com','password':'Secure@12345'})
if r.status_code!=200:
    print('auth failed', r.status_code, r.text); raise SystemExit
token=r.json().get('access_token')
headers={'Authorization':f'Bearer {token}'}
app_id = 2
# trigger re-shortlist for single application
print(f'Triggering re-shortlist for application {app_id}...')
r=requests.post(f'{BASE}/hr/shortlist/{app_id}', headers=headers)
print('shortlist response:', r.status_code)
try:
    print(json.dumps(r.json(), indent=2))
except Exception:
    print(r.text)
# fetch single application from hr/candidates
print('\nFetching updated candidate record...')
r=requests.get(f'{BASE}/hr/candidates', params={'job_id':5}, headers=headers)
print('candidates status', r.status_code)
try:
    data = r.json()
    for c in data:
        if c.get('application_id')==app_id:
            print(json.dumps(c, indent=2))
            # try parse ai_reason
            try:
                ar = json.loads(c.get('ai_reason') or '{}')
                print('\nParsed ai_reason:')
                print(json.dumps(ar, indent=2))
            except Exception as e:
                print('ai_reason parse failed', e)
            break
except Exception as e:
    print('failed to get candidates', e)
