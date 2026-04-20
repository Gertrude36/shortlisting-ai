"""
backend/seed_jobs.py
────────────────────────────────────────────────────────────────
Run this ONCE after starting the backend to populate the jobs table.

Usage:
    cd backend
    python seed_jobs.py
"""

import requests
import sys

BASE_URL = "http://localhost:8000"

HR_EMAIL    = "hr@gmail.com"
HR_PASSWORD = "hr@123"   # Strong password — meets all requirements
HR_NAME     = "HR"

# ── Step 1: Create or login HR account ───────────────────────
print("Creating HR account...")
hr_res = requests.post(f"{BASE_URL}/auth/register", json={
    "full_name": HR_NAME,
    "email":     HR_EMAIL,
    "password":  HR_PASSWORD,
    "role":      "hr",
})

if hr_res.status_code in (400, 422):
    # Account already exists or registration failed — try login
    print(f"  Registration response: {hr_res.json().get('detail', hr_res.text)}")
    print("Logging in with existing account...")
    hr_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email":    HR_EMAIL,
        "password": HR_PASSWORD,
    })

if hr_res.status_code not in (200, 201):
    print(f"\n✗ Authentication failed ({hr_res.status_code}): {hr_res.text}")
    print("\nTIP: If the HR account was created with a different password,")
    print(f"     update HR_PASSWORD in this file to match, then re-run.")
    sys.exit(1)

token   = hr_res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"✓ HR authenticated as {HR_EMAIL}\n")


# ── Step 2: Define all jobs with full detailed requirements ──
JOBS = [
    {
        "title":       "Software Engineer",
        "description": "Design, develop, and maintain scalable software systems and applications that power our core platform.",
        "about_role":  "As a Software Engineer you will own the full development lifecycle — from architecture and design through implementation, testing, and production deployment. You will work in an Agile team building high-performance, resilient systems.",
        "responsibilities": (
            "Design and implement scalable backend and frontend services, "
            "Write clean, well-tested and documented code, "
            "Participate in architecture decisions and technical design reviews, "
            "Conduct and respond to code reviews, "
            "Investigate and resolve production incidents, "
            "Collaborate with product managers and QA engineers, "
            "Contribute to CI/CD pipeline improvements, "
            "Mentor junior engineers"
        ),
        "location":       "Kigali, Rwanda",
        "employment_type": "Full-time",
        "salary_range":   "400,000 – 700,000 RWF / month",
        "required_education_levels": "Bachelor's, Master's",
        "required_fields": "Computer Science, Software Engineering, Information Technology, Computer Engineering",
        "required_min_experience": 2,
        "required_max_experience": 12,
        "required_skills": (
            "Python or Java or Node.js (backend development), "
            "React or Vue.js (frontend development), "
            "SQL and NoSQL databases (PostgreSQL or MongoDB), "
            "RESTful API design and development, "
            "Git version control and branching strategies, "
            "Docker and containerisation, "
            "Unit testing and test-driven development (TDD), "
            "Cloud platforms (AWS or GCP or Azure), "
            "Agile and Scrum methodologies, "
            "Data structures and algorithms"
        ),
        "required_certifications": (
            "AWS Certified Developer or Solutions Architect, "
            "Oracle Certified Java Programmer"
        ),
        "preferred_qualifications": (
            "Kubernetes (CKA or CKAD) certification, "
            "Contributions to open-source projects, "
            "Experience with microservices architecture, "
            "GraphQL API experience"
        ),
    },
    {
        "title":       "Data Analyst",
        "description": "Transform complex datasets into clear, actionable insights that drive strategic business and product decisions.",
        "about_role":  "You will work closely with business stakeholders to define analytical requirements, build data pipelines, create interactive dashboards, and present findings that directly influence strategy.",
        "responsibilities": (
            "Collect, clean, and validate large structured and unstructured datasets, "
            "Write complex SQL queries and Python scripts for data extraction and transformation, "
            "Build interactive dashboards and visualisations in Tableau or Power BI, "
            "Conduct statistical analyses to identify trends and opportunities, "
            "Define and track KPIs in collaboration with product and business teams, "
            "Develop and maintain automated reporting pipelines, "
            "Present findings to technical and non-technical audiences, "
            "Collaborate with data engineers to improve data quality"
        ),
        "location":       "Kigali, Rwanda",
        "employment_type": "Full-time",
        "salary_range":   "350,000 – 600,000 RWF / month",
        "required_education_levels": "Bachelor's, Master's",
        "required_fields": "Statistics, Mathematics, Computer Science, Data Science, Economics, Information Systems",
        "required_min_experience": 1,
        "required_max_experience": 10,
        "required_skills": (
            "SQL (PostgreSQL or MySQL or BigQuery), "
            "Python (pandas, NumPy, matplotlib, seaborn), "
            "Data visualisation (Tableau or Power BI), "
            "Statistical analysis and hypothesis testing, "
            "Advanced Microsoft Excel, "
            "Data cleaning and wrangling, "
            "A/B testing and experimental design, "
            "ETL processes and data pipelines, "
            "Storytelling with data, "
            "Business acumen and stakeholder communication"
        ),
        "required_certifications": (
            "Google Professional Data Analytics Certificate, "
            "Tableau Desktop Specialist or Certified Data Analyst"
        ),
        "preferred_qualifications": (
            "Experience with cloud data warehouses (Snowflake or BigQuery or Redshift), "
            "Knowledge of machine learning basics (scikit-learn), "
            "Microsoft Power BI Data Analyst (PL-300) certification"
        ),
    },
    {
        "title":       "Registered Nurse",
        "description": "Deliver high-quality, compassionate patient care within a multidisciplinary clinical team in an acute care setting.",
        "about_role":  "The Registered Nurse will assess, plan, implement, and evaluate patient care plans in collaboration with physicians and allied health professionals. You will be a key advocate for patient safety and recovery.",
        "responsibilities": (
            "Conduct comprehensive patient assessments and document findings, "
            "Develop, implement, and evaluate individualised nursing care plans, "
            "Administer medications, IV therapy, and therapeutic treatments, "
            "Monitor patient vitals and respond to changes in condition, "
            "Perform wound care, catheterisation, and clinical procedures, "
            "Coordinate care with physicians and allied health staff, "
            "Educate patients and families on diagnoses and discharge planning, "
            "Respond to medical emergencies and participate in resuscitation"
        ),
        "location":       "Kigali, Rwanda",
        "employment_type": "Full-time",
        "salary_range":   "300,000 – 550,000 RWF / month",
        "required_education_levels": "Diploma, Bachelor's, Master's",
        "required_fields": "Nursing, Midwifery, Health Sciences, Clinical Medicine",
        "required_min_experience": 1,
        "required_max_experience": 20,
        "required_skills": (
            "Clinical patient assessment, "
            "Medication administration and pharmacology, "
            "IV therapy and venipuncture, "
            "Wound care and dressing techniques, "
            "Basic Life Support (BLS) and CPR, "
            "Electronic Health Records (EHR or EMR), "
            "Infection prevention and control, "
            "Patient and family education, "
            "Care plan development, "
            "Emergency triage protocols"
        ),
        "required_certifications": (
            "Registered Nurse License (Nursing Council), "
            "Basic Life Support (BLS) Certification, "
            "Valid Practicing Certificate"
        ),
        "preferred_qualifications": (
            "Advanced Cardiac Life Support (ACLS), "
            "Paediatric Advanced Life Support (PALS), "
            "ICU or critical care nursing experience, "
            "Specialty certification in oncology or perioperative or psychiatric nursing"
        ),
    },
    {
        "title":       "Accountant",
        "description": "Manage financial records, ensure regulatory compliance, and support strategic financial planning across the organisation.",
        "about_role":  "The Accountant will maintain the integrity of our financial reporting systems, manage month-end and year-end processes, oversee tax compliance, and provide financial analysis to support decision-making.",
        "responsibilities": (
            "Prepare and review monthly, quarterly, and annual financial statements, "
            "Manage accounts payable, accounts receivable, and general ledger entries, "
            "Perform bank reconciliations and resolve discrepancies, "
            "Prepare and file corporate tax returns and ensure VAT compliance, "
            "Support internal and external audit processes, "
            "Develop and monitor departmental budgets and forecasts, "
            "Analyse financial variances and report to senior management, "
            "Implement and strengthen internal financial controls"
        ),
        "location":       "Kigali, Rwanda",
        "employment_type": "Full-time",
        "salary_range":   "350,000 – 600,000 RWF / month",
        "required_education_levels": "Bachelor's, Master's",
        "required_fields": "Accounting, Finance, Business Administration, Economics",
        "required_min_experience": 2,
        "required_max_experience": 15,
        "required_skills": (
            "Financial reporting (IFRS or GAAP), "
            "General ledger management, "
            "Tax preparation and compliance (corporate, VAT, PAYE), "
            "Accounts payable and receivable, "
            "Bank reconciliation, "
            "Advanced Microsoft Excel (pivot tables, VLOOKUP, financial models), "
            "Accounting software (QuickBooks or Sage or SAP or Oracle), "
            "Budgeting and financial forecasting, "
            "Internal controls and audit support, "
            "Cash flow management"
        ),
        "required_certifications": (
            "Certified Public Accountant (CPA), "
            "Association of Chartered Certified Accountants (ACCA)"
        ),
        "preferred_qualifications": (
            "Chartered Management Accountant (CMA) designation, "
            "Experience with SAP ERP or Oracle Financials, "
            "IFRS specialist certification, "
            "CFA Level I or above"
        ),
    },
    {
        "title":       "Project Manager",
        "description": "Lead cross-functional teams and deliver high-impact initiatives on time, within scope, and on budget.",
        "about_role":  "As Project Manager you will own end-to-end project delivery — from initiation and planning through execution, monitoring, and closure. You will manage diverse stakeholders, navigate risks, and maintain transparent communication at all levels.",
        "responsibilities": (
            "Define and document project scope, goals, deliverables, and success metrics, "
            "Develop comprehensive project plans including WBS, timelines, and resource allocation, "
            "Lead and coordinate cross-functional project teams, "
            "Identify, assess, and proactively mitigate project risks and issues, "
            "Manage project budget and track expenditures, "
            "Facilitate sprint planning, stand-ups, retrospectives, and stakeholder reviews, "
            "Maintain RAID logs, status reports, and change requests, "
            "Communicate project status to executive sponsors, "
            "Conduct post-implementation reviews and capture lessons learned"
        ),
        "location":       "Kigali, Rwanda",
        "employment_type": "Full-time",
        "salary_range":   "500,000 – 900,000 RWF / month",
        "required_education_levels": "Bachelor's, Master's",
        "required_fields": "Business Administration, Project Management, Engineering, Computer Science, Information Technology",
        "required_min_experience": 3,
        "required_max_experience": 20,
        "required_skills": (
            "Project planning and scheduling (MS Project or Jira or Asana), "
            "Risk management and mitigation planning, "
            "Budget management and cost control, "
            "Stakeholder management and executive communication, "
            "Agile and Scrum methodologies, "
            "Waterfall and hybrid project delivery frameworks, "
            "Change management, "
            "Team leadership and conflict resolution, "
            "Resource allocation and capacity planning, "
            "Status reporting and documentation"
        ),
        "required_certifications": (
            "Project Management Professional (PMP), "
            "PRINCE2 Practitioner"
        ),
        "preferred_qualifications": (
            "Certified Scrum Master (CSM) or SAFe Agilist, "
            "ITIL Foundation certification, "
            "Six Sigma Green Belt or Black Belt, "
            "PRINCE2 Agile certification"
        ),
    },
]


# ── Step 3: Post each job ────────────────────────────────────
print("Seeding jobs...")
success = 0
for job in JOBS:
    res = requests.post(f"{BASE_URL}/jobs", json=job, headers=headers)
    if res.status_code in (200, 201):
        print(f"  ✓  {job['title']} posted  (id={res.json()['id']})")
        success += 1
    else:
        print(f"  ✗  {job['title']} FAILED  ({res.status_code}): {res.text[:120]}")

print(f"\n{'═'*48}")
print(f"  {success}/{len(JOBS)} jobs seeded successfully.")
print(f"  HR login  →  {HR_EMAIL}")
print(f"  Password  →  {HR_PASSWORD}")
print(f"  Open      →  http://localhost:5173")
print(f"{'═'*48}")