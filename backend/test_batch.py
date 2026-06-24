"""Quick batch shortlisting test — simulates what the HR dashboard triggers."""
import sys, os, json, time
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
import sqlite3

# Reset to pending first
conn = sqlite3.connect('capstone.db')
cur = conn.cursor()
cur.execute("UPDATE applications SET decision='pending', ai_score=NULL, ai_reason=NULL, shortlisted_at=NULL")
conn.commit()
cur.execute("SELECT id, job_id FROM applications")
apps = cur.fetchall()
conn.close()
print(f"Reset {len(apps)} applications to pending")

# Simulate batch shortlisting
from main import _process_one_candidate
import concurrent.futures

def process(app_id, job_id):
    return _process_one_candidate(app_id, job_id)

start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures = [pool.submit(process, a[0], a[1]) for a in apps]
    for f in concurrent.futures.as_completed(futures):
        r = f.result()
        print(f"  app={r.get('application_id')} -> {r.get('decision')} score={r.get('score')}")

elapsed = time.time() - start
print(f"\nBatch completed in {elapsed:.1f}s for {len(apps)} candidates")

# Show final results
conn = sqlite3.connect('capstone.db')
cur = conn.cursor()
cur.execute("SELECT a.id, u.full_name, a.education_level, a.field_of_study, a.decision, a.ai_score FROM applications a JOIN users u ON a.applicant_id=u.id ORDER BY a.ai_score DESC")
print("\nFinal rankings:")
for r in cur.fetchall():
    print(f"  #{r[0]} {r[1]}: {r[2]}/{r[3]} -> {r[4]} ({r[5]*100:.1f}%)" if r[5] else f"  #{r[0]} {r[1]}: {r[2]}/{r[3]} -> {r[4]}")
conn.close()
