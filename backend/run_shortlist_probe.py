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
try:
    jobs = requests.get(f'{BASE}/jobs', headers=headers, timeout=6).json()
except Exception as e:
    print('Failed to fetch jobs:', e); sys.exit(1)
print('Found', len(jobs), 'jobs')
for j in jobs:
    jid=j.get('id')
    title=j.get('title')
    try:
        c=requests.get(f'{BASE}/hr/candidates?job_id={jid}', headers=headers, timeout=6)
    except Exception as e:
        print('Failed to fetch candidates for job', jid, ':', e)
        cand=[]
        continue
    try:
        cand=c.json()
    except Exception as e:
        cand=[]
    print('job', jid, 'title=', title, 'candidates=', len(cand))
    if len(cand)>0:
        print('Triggering shortlist for job', jid)
        resp=requests.post(f'{BASE}/hr/shortlist-all/{jid}', headers=headers, timeout=6)
        print('shortlist resp:', resp.status_code, resp.text)
        if resp.status_code==200:
            import time
            status_url = resp.json().get('status_url')
            if not status_url:
                status_url = f'/hr/shortlist-status/{jid}'
            full_status = BASE + status_url
            print('Polling status at', full_status)
            for i in range(30):
                try:
                    s=requests.get(full_status, headers=headers, timeout=6).json()
                except Exception as e:
                    print('Status poll failed:', e); break
                running = s.get('running', False)
                processed = s.get('processed', 0)
                total = s.get('total', 0)
                shortlisted = s.get('shortlisted', 0)
                print(f'  poll {i+1}: running={running} processed={processed}/{total} shortlisted={shortlisted}')
                if not running:
                    print('Shortlisting finished:', s)
                    # Fetch final candidates
                    try:
                        final = requests.get(f'{BASE}/hr/candidates?job_id={jid}', headers=headers, timeout=6).json()
                        print('Final candidates:')
                        for c in final:
                            print(' -', c.get('applicant_name'), 'decision=', c.get('decision'), 'score=', c.get('ai_score'))
                    except Exception as e:
                        print('Failed to fetch final candidates:', e)
                    break
                time.sleep(2)
        break
else:
    print('No jobs with candidates found')
