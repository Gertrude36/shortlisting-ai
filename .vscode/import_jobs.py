"""
import_jobs.py  —  Run this LOCALLY after export_jobs.py.

Usage:
    cd backend
    python import_jobs.py

It will ask for your HR email + password, then POST every job
from jobs_export.json to your live Render backend.
"""

import json
import sys
import getpass
import requests

# ── Config ────────────────────────────────────────────────────────────────────
PRODUCTION_URL = "https://shortlisting-ai.onrender.com"
EXPORT_FILE    = "jobs_export.json"
# ─────────────────────────────────────────────────────────────────────────────

def login(email: str, password: str) -> str:
    """Returns a JWT access token or exits on failure."""
    resp = requests.post(
        f"{PRODUCTION_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    if resp.status_code != 200:
        print(f"❌  Login failed: {resp.json().get('detail', resp.text)}")
        sys.exit(1)
    data = resp.json()
    if data.get("role") != "hr":
        print("❌  This account is not an HR account. Please use your HR credentials.")
        sys.exit(1)
    print(f"✅  Logged in as {email}")
    return data["access_token"]


def import_jobs(token: str, jobs: list) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    ok = 0
    for i, job in enumerate(jobs, start=1):
        resp = requests.post(
            f"{PRODUCTION_URL}/jobs",
            json=job,
            headers=headers,
            timeout=60,
        )
        if resp.status_code in (200, 201):
            print(f"  ✅  [{i}/{len(jobs)}] Created: {job.get('title', 'Unknown')}")
            ok += 1
        else:
            detail = resp.json().get("detail", resp.text) if resp.content else resp.status_code
            print(f"  ❌  [{i}/{len(jobs)}] Failed '{job.get('title')}': {detail}")

    print(f"\n{'='*50}")
    print(f"Done — {ok}/{len(jobs)} jobs imported successfully.")
    if ok < len(jobs):
        print("Re-run the script to retry failed jobs (duplicates are skipped by the server).")


def main():
    print("=" * 50)
    print("  Shortlisting AI — Job Importer")
    print(f"  Target: {PRODUCTION_URL}")
    print("=" * 50)

    # Load export file
    try:
        with open(EXPORT_FILE, encoding="utf-8") as f:
            jobs = json.load(f)
    except FileNotFoundError:
        print(f"❌  '{EXPORT_FILE}' not found. Run export_jobs.py first.")
        sys.exit(1)

    if not jobs:
        print("⚠️  No jobs found in export file.")
        sys.exit(0)

    print(f"\nFound {len(jobs)} job(s) to import.\n")

    # Credentials
    print("Enter your HR account credentials for the LIVE site:")
    email    = input("  Email: ").strip()
    password = getpass.getpass("  Password: ")

    print("\nWaking up backend (may take ~30 seconds on free tier)...")
    try:
        requests.get(f"{PRODUCTION_URL}/wake", timeout=60)
    except Exception:
        pass

    token = login(email, password)

    print(f"\nImporting {len(jobs)} job(s)...\n")
    import_jobs(token, jobs)


if __name__ == "__main__":
    main()