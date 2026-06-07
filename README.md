# AI-Powered Applicant Shortlisting System

An end-to-end automated recruitment platform that accepts job applications, verifies uploaded documents with OCR and AI, and shortlists candidates without any manual HR review — unless document quality requires it.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Features](#features)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Environment Variables](#environment-variables)
8. [API Reference](#api-reference)
9. [Core Modules](#core-modules)
10. [Document Verification Pipeline](#document-verification-pipeline)
11. [AI Shortlisting Engine](#ai-shortlisting-engine)
12. [User Roles](#user-roles)
13. [Frontend Pages](#frontend-pages)
14. [Deployment](#deployment)
15. [Known Limitations & Gotchas](#known-limitations--gotchas)

---

## Project Overview

This system replaces the manual HR shortlisting process with a fully automated pipeline. When a candidate submits an application:

1. Their uploaded documents (National ID, CV, Diploma) are processed by OCR in the background.
2. A document verifier checks readability, confirms document types, and verifies the applicant's name across every file.
3. An AI shortlisting engine combines an ML model score with rule-based gates (education, field of study, experience, skills) to produce a final decision.
4. Applications with low OCR quality are routed to an HR manual review queue rather than being auto-rejected.

HR officers see ranked shortlists, can download documents, re-run AI scoring, and override decisions. Admins manage users, system logs, and platform-wide reporting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  Vite · React Router · Axios · react-hot-toast · Lucide      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS / REST
┌─────────────────────▼───────────────────────────────────────┐
│                  Backend (FastAPI)                           │
│                                                             │
│   main.py ──────► auth.py        JWT + bcrypt               │
│       │                                                     │
│       ├──────────► document_verifier.py                     │
│       │               ├── ocr_utils.py  (Tesseract/EasyOCR) │
│       │               ├── ai_matcher.py (OpenRouter / ST)   │
│       │               └── document_extractor.py             │
│       │                                                     │
│       ├──────────► shortlisting_engine.py                   │
│       │               ├── ML model  (XGBoost / sklearn)     │
│       │               ├── rule-based gates                  │
│       │               └── AI scoring (OpenRouter)           │
│       │                                                     │
│       └──────────► database.py                              │
│                       SQLite (dev) · PostgreSQL (prod)       │
└─────────────────────────────────────────────────────────────┘
```

Background OCR and shortlisting are handled by `ThreadPoolExecutor` pools — requests return immediately while heavy processing runs asynchronously.

---

## Tech Stack

**Backend**

| Layer | Technology |
|---|---|
| API Framework | FastAPI 0.111 + Uvicorn |
| ORM | SQLAlchemy 2.0 |
| Auth | python-jose (JWT) + passlib/bcrypt |
| Database | SQLite (local dev) / PostgreSQL (production) |
| OCR | Tesseract · EasyOCR · pdfplumber · PyMuPDF |
| ML Model | XGBoost / scikit-learn (trained offline) |
| AI Scoring | OpenRouter API (`claude-sonnet-4-5`) |
| Semantic Matching | sentence-transformers (`all-MiniLM-L6-v2`) |
| Email | Brevo HTTP API |

**Frontend**

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| HTTP | Axios |
| Notifications | react-hot-toast |
| Icons | Lucide React |
| Head management | react-helmet-async |

---

## Features

**Applicants**
- Register, log in, and manage a profile
- Browse active job listings and apply with a multi-step form
- Upload up to 5 document types; each is OCR-verified on upload
- Documents saved to profile can be reused across applications
- Real-time upload progress bar with soft-accept on OCR timeout
- View application status and AI decision reasoning

**HR Officers**
- Post, manage, and delete job positions with deadlines
- View all candidates ranked by AI score per job
- Trigger bulk AI shortlisting for an entire job in one click
- Re-run shortlisting for a single candidate
- Download any uploaded document
- Override AI decisions with a manual approve/reject
- View HR report with per-job stats and candidate breakdowns
- View audit logs

**Admins**
- All HR permissions plus user management
- Create, role-change, and delete accounts
- Send HR invite codes via email
- System-wide statistics dashboard
- Clear old audit logs

**AI / Automation**
- Three-layer document pipeline: OCR quality → type classification → fuzzy name matching
- Rwandan National ID rescue: OCR-noise-tolerant regex bypasses false quality rejections on Kinyarwanda text
- Hard gate evaluation: education level, field of study, experience years, and skills before ML scoring
- Blended score: ML model probability (40%) + rule-based combined match (60%) for known job types
- Low OCR quality automatically routes to manual review queue (threshold: 60/100)
- OpenRouter AI scoring overrides ML when configured

---

## Project Structure

```
project_2/
├── backend/
│   ├── main.py                    # FastAPI app, all routes, CORS, lifespan
│   ├── database.py                # SQLAlchemy engine, session, migrations
│   ├── models.py                  # ORM models: User, Job, Application, Document …
│   ├── schemas.py                 # Pydantic request/response models
│   ├── auth.py                    # JWT creation, password hashing, role guards
│   ├── document_verifier.py       # OCR pipeline: quality → type → name matching
│   ├── shortlisting_engine.py     # Feature engineering, gates, ML predict()
│   ├── ai_matcher.py              # OpenRouter + sentence-transformers helpers
│   ├── candidate_scorer.py        # OpenRouter structured candidate scoring
│   ├── document_extractor.py      # AI-assisted document extraction via OpenRouter
│   ├── ocr_utils.py               # Tesseract / EasyOCR wrappers, quality checks
│   ├── ocr_service.py             # Optional standalone OCR microservice
│   ├── model_loader.py            # Loads model.pkl, scaler.pkl, feature_columns.pkl
│   ├── email_utils.py             # Brevo password-reset and HR-invite emails
│   ├── build_report.py            # PDF report generation helper
│   ├── seed_jobs.py               # Development data seeder
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── render.yaml                # Render deployment config
│   ├── .env                       # Local environment variables (not committed)
│   ├── model.pkl                  # Trained ML model artifact
│   ├── scaler.pkl                 # Feature scaler artifact
│   ├── feature_columns.pkl        # Ordered feature column list
│   ├── label_encoders.pkl         # Categorical label encoders
│   └── uploads/                   # Uploaded documents (local dev)
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── axios.js           # Axios instance, wake-gate, upload slot manager
    │   ├── context/
    │   │   └── AuthContext.jsx    # Auth state, JWT storage, user object
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── DecisionBadge.jsx
    │   │   ├── ReasonBreakdown.jsx
    │   │   ├── SystemLogs.jsx
    │   │   ├── PageHero.jsx
    │   │   ├── JobCard.jsx
    │   │   └── WakeBanner.jsx
    │   ├── pages/
    │   │   ├── HomePage.jsx
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── ForgotPassword.jsx
    │   │   ├── ResetPassword.jsx
    │   │   ├── ApplyPage.jsx      # Multi-step application + document upload
    │   │   ├── ApplicantDashboard.jsx
    │   │   ├── HRDashboard.jsx    # Candidate table, bulk shortlisting, job tabs
    │   │   ├── HRJobCreate.jsx
    │   │   ├── HRReport.jsx
    │   │   ├── AdminDashboard.jsx
    │   │   ├── AdminProfile.jsx
    │   │   └── FeedbackWidget.jsx
    │   ├── App.jsx                # React Router config, role guards
    │   ├── main.jsx
    │   └── index.css
    └── .env
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Tesseract OCR installed on system path (`tesseract --version`)
- Poppler (for PDF rendering — `pdftoppm`)

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env            # Edit values as needed (see Environment Variables)

# Start the development server
uvicorn main:app --reload --port 8000
```

On first start, FastAPI will:
- Create the SQLite database at `backend/capstone.db`
- Run all schema migrations automatically
- Bootstrap an admin account using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
- Load the ML model and sentence-transformers model in the background

### Frontend

```bash
cd frontend

npm install

# Copy and configure environment
echo "VITE_API_URL=http://localhost:8000" > .env

npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Environment Variables

All variables go in `backend/.env`. The table below marks which are required in production.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Prod only | PostgreSQL connection string (`postgresql://…`). Omit for local SQLite. |
| `ENV_MODE` | Prod only | Set to `production` on Render to enable PostgreSQL. Default: `development`. |
| `SECRET_KEY` | Yes | Long random string for JWT signing. |
| `ADMIN_EMAIL` | Yes | Email for the bootstrapped admin account. |
| `ADMIN_PASSWORD` | Yes | Password for the bootstrapped admin account. |
| `HR_INVITE_CODE` | Yes | Secret code required to register an HR account. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins. |
| `FRONTEND_URL` | Yes | Base URL for password-reset links in emails. |
| `OPENROUTER_API_KEY` | Optional | Enables AI scoring and semantic document matching via OpenRouter. |
| `OPENROUTER_MODEL` | Optional | Model string. Default: `anthropic/claude-sonnet-4-5`. |
| `BREVO_API_KEY` | Optional | Enables transactional email (password reset, HR invite). |
| `ENABLE_OCR` | Optional | Set to `false` to skip all OCR. Default: `true`. |
| `UPLOAD_OCR_TIMEOUT` | Optional | Max seconds for per-upload OCR. Default: `120`. |
| `HF_TOKEN` | Optional | HuggingFace token for sentence-transformers model download. |

---

## API Reference

All endpoints are prefixed with the backend base URL. Authentication uses `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register applicant or HR (HR requires invite code) |
| POST | `/auth/login` | Public | Returns JWT token |
| GET | `/auth/me` | Any | Current user profile |
| POST | `/auth/forgot-password` | Public | Send password-reset email |
| POST | `/auth/reset-password` | Public | Reset password with token |

### Jobs

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/jobs` | Public | List active, non-expired jobs |
| GET | `/jobs/{id}` | Public | Single job detail |
| POST | `/jobs` | HR/Admin | Create a job posting |
| DELETE | `/jobs/{id}` | HR/Admin | Delete job and all applications |

### Applications

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/applications` | Applicant | Start an application (creates draft) |
| GET | `/applications/my` | Applicant | List own submitted applications |
| POST | `/applications/{id}/finalize` | Applicant | Submit the draft (triggers background OCR) |
| GET | `/applications/{id}/ocr-status` | Applicant | Poll OCR verification progress |
| DELETE | `/applications/{id}` | Applicant | Delete unsubmitted draft |

### Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/applications/{id}/documents` | Applicant | Upload a document (OCR-verified synchronously) |
| GET | `/applications/{id}/documents` | Any auth | List documents on an application |
| DELETE | `/applications/{id}/documents/{docId}` | Applicant | Remove a document |
| POST | `/applications/{id}/documents/attach-profile` | Applicant | Reuse a profile document |

### Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | Any auth | Get profile fields |
| PUT | `/profile` | Any auth | Update phone, address, national_id |
| GET | `/profile/documents` | Applicant | List saved profile documents |
| POST | `/profile/documents` | Applicant | Upload a document to profile |

### HR

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/hr/candidates` | HR/Admin | All candidates, optionally filtered by job |
| GET | `/hr/jobs` | HR | Active job list |
| POST | `/hr/shortlist-all/{jobId}` | HR/Admin | Trigger bulk AI shortlisting (async) |
| GET | `/hr/shortlist-status/{jobId}` | HR/Admin | Poll bulk shortlisting progress |
| POST | `/hr/shortlist/{applicationId}` | HR/Admin | Re-run shortlisting for one application |
| POST | `/hr/manual-decision/{applicationId}` | HR/Admin | Override AI decision |
| GET | `/hr/report/{jobId}` | HR/Admin | Full job report with ranked candidates |
| GET | `/hr/documents/{docId}/download` | HR/Admin | Download a candidate document |
| GET | `/hr/candidates/{applicationId}/profile` | HR/Admin | Full candidate profile |
| GET | `/hr/logs` | HR/Admin | Audit log |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/stats` | HR/Admin | System-wide statistics |
| GET | `/admin/users` | HR/Admin | List all users |
| POST | `/admin/users` | HR/Admin | Create a user |
| PUT | `/admin/users/{id}/role` | HR/Admin | Change user role |
| DELETE | `/admin/users/{id}` | HR/Admin | Delete user and all their data |
| GET | `/admin/reports` | HR/Admin | Per-job shortlisting report |
| GET | `/admin/logs` | HR/Admin | Full audit log with filters |
| DELETE | `/admin/logs` | HR/Admin | Clear old log entries |

### Misc

| Method | Path | Description |
|---|---|---|
| GET/HEAD | `/wake` | Health check + readiness flag |
| GET/HEAD | `/health` | Lightweight health check |
| POST | `/ocr/quality` | Pre-upload image quality check |
| POST | `/feedback` | Submit user feedback |

---

## Core Modules

### `main.py`

The FastAPI application entry point. Responsibilities:

- Defines all API routes
- Manages CORS with a three-layer approach: FastAPI middleware + `_CORSFallbackMiddleware` + `RawASGICORSWrapper` ASGI wrapper (handles pre-flight and 503-during-startup correctly)
- Runs DB migrations and ML model loading in the lifespan context
- Maintains in-memory job processing status (`_JOB_STATUS`) for polling
- Runs OCR and shortlisting in `ThreadPoolExecutor` pools
- Classifies document rejection reasons to decide which rejections are hard vs advisory

### `database.py`

- Auto-selects SQLite for local dev and PostgreSQL for production based on `ENV_MODE`
- Configures connection pooling (pool_size=3, max_overflow=5) for Render's free tier
- Enables SQLite WAL mode to prevent locking in development
- Returns HTTP 503 (not 500) when the database is unreachable during cold boot

### `auth.py`

- JWT tokens signed with HS256; configurable expiry (default 60 min)
- Separate 15-minute password-reset tokens with `purpose` claim validation
- Role guards: `require_applicant`, `require_hr`, `require_admin`, `require_hr_or_admin`

---

## Document Verification Pipeline

The pipeline runs in two phases: **upload-time** (`pre_submission_check`) and **post-submit** (`verify_documents`).

### Phase 1 — Upload-time check (`pre_submission_check`)

Called synchronously during document upload. Has a configurable timeout (`UPLOAD_OCR_TIMEOUT`, default 120s). On timeout, the document is accepted optimistically.

1. **AI extraction (primary):** Calls `document_extractor.py` which uses OpenRouter to extract structured data (document type, full name, raw text). Accepts if either type or name is plausible; adds advisory flag if uncertain.

2. **Legacy OCR fallback:** If OpenRouter is unavailable, runs Tesseract/EasyOCR via `ocr_utils.py`. Checks readable character count against per-document-type thresholds (e.g. 180 chars for ID cards, 500 for CVs).

3. **Name matching:** Uses Levenshtein-distance fuzzy matching with OCR noise cleaning. Acceptance threshold is 35% name token score — lenient enough for scanned documents but strict enough to catch clearly wrong documents.

4. **Rejection classification:** `_classify_rejection()` in `main.py` categorises rejection reasons (quality, name mismatch, type mismatch, field mismatch) and decides whether to hard-reject or soft-accept with an advisory.

### Phase 2 — Post-submit OCR (`_post_submit_ocr_verify`)

Runs in the background after `finalize`. Extracts full text from all documents, runs `verify_documents()`, computes an OCR quality score (0–100), and stores results in `applications.ocr_result` (JSON). The quality score is used by the shortlisting engine to route low-quality applications to manual review.

### Rwandan National ID handling

ID cards with Kinyarwanda text were being false-rejected by OCR quality checks because diacritics and short Kinyarwanda words were stripped as noise. The fix applies OCR-noise-tolerant regex that accepts an ID card with ≥40 readable characters (vs the 180-char threshold for other formats) and separately checks for ID-specific keywords (national ID number patterns, `NIN`, etc.).

---

## AI Shortlisting Engine

`shortlisting_engine.py` implements `predict()`, the single entry point called for every candidate.

### Decision flow

```
predict()
  │
  ├── Is ocr_quality_score < 60?
  │       YES → "manual_review" (HR queue)
  │
  ├── Is OpenRouter available + doc_texts present?
  │       YES → _ai_score_candidate() via OpenRouter
  │               score ≥ 0.55 → "shortlisted"
  │               score < 0.45 → "not_shortlisted"
  │               else         → "manual_review"
  │
  └── ML fallback
          _hard_gate() — education, field, experience, skills gates
          build_feature_vector() — 23 engineered features
          XGBoost model.predict_proba()
          _compute_display_score() — blended ML + rule score minus penalties
          score ≥ 0.55 → "shortlisted" (even with gate failures if score is high)
          score < 0.55 → "not_shortlisted"
```

### Hard gates

These are checked regardless of ML score. A gate failure adds a penalty or hard-rejects:

- **Education:** Applicant's education ordinal vs required minimum. Gap ≥ 2 levels = hard reject. Gap of 1 = 8% score penalty.
- **Field of study:** Fuzzy field matching + AI compatibility check via OpenRouter. Incompatible field = hard reject.
- **Experience:** Gap > 3 years below minimum = hard reject. Smaller gaps apply a 5%/year penalty.
- **Skills:** Zero matching skills from required list = hard reject.

### Feature vector

`build_feature_vector()` produces 23 features including `skills_overlap_ratio`, `edu_meets_minimum`, `exp_in_range`, `field_match_rich`, `combined_match_score`, and encoded categoricals.

### Document cross-checks

When OCR text is available, `_cross_check_form_vs_docs()` compares the application form against document content:
- Diploma → verifies declared education level and field of study
- CV → verifies declared skills using AI semantic matching
- Certificate → verifies declared certifications
- Experience letter → extracts years from text and compares with declared experience

Discrepancies add warnings or score penalties. Large experience gaps (>4 years) trigger a hard note for HR.

---

## User Roles

| Role | Registration | Capabilities |
|---|---|---|
| `applicant` | Self-register | Apply for jobs, upload documents, view own decisions |
| `hr` | Requires `HR_INVITE_CODE` | Manage candidates and jobs, run shortlisting, download documents, override decisions |
| `admin` | Bootstrapped via env vars or created by HR/Admin | All HR capabilities + user management, system logs, platform reports |

---

## Frontend Pages

| Page | Route | Role | Description |
|---|---|---|---|
| HomePage | `/` | Public | Job listings and platform introduction |
| Login | `/login` | Public | JWT login |
| Register | `/register` | Public | Applicant or HR registration |
| ForgotPassword | `/forgot-password` | Public | Request reset email |
| ResetPassword | `/reset-password` | Public | Set new password with token |
| ApplyPage | `/apply/:jobId` | Applicant | 4-step application wizard with document upload and real-time verification |
| ApplicantDashboard | `/applicant` | Applicant | View submitted applications and AI decisions |
| HRDashboard | `/hr` | HR | Candidate table, job tabs, bulk shortlisting, document download |
| HRJobCreate | `/hr/jobs/new` | HR | Create a new job posting |
| HRReport | `/hr/report/:jobId` | HR/Admin | Per-job report with ranked candidates and score breakdown |
| AdminDashboard | `/admin` | Admin | System stats, user management, logs, feedback |
| AdminProfile | `/admin/profile` | Admin | Admin account settings |

### ApplyPage highlights

- Multi-step wizard: Position Info → Your Details → Documents → Review & Submit
- Pre-upload image quality check via `/ocr/quality`
- Per-document progress bar with progressive hint messages
- Soft-accept on upload timeout (45s): document is treated as received and OCR completes in background
- Profile document reuse: saved documents can be attached to new applications without re-uploading
- Wake-gate: uploads queue in memory if the server is starting up (Render cold boot) and retry automatically

---

## Deployment

The project is deployed on [Render](https://render.com).

**Backend** — `render.yaml` defines the web service:
- Build script: `render-build.sh` (installs CPU-only PyTorch, Tesseract, Poppler)
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment: set `ENV_MODE=production`, `DATABASE_URL`, `SECRET_KEY`, and all other required variables in the Render dashboard

**Frontend** — Deployed on [Vercel](https://vercel.com):
- Build command: `npm run build`
- Set `VITE_API_URL` to the Render backend URL in Vercel environment variables

**Cold boot handling:**
- The frontend polls `/wake` on load and queues uploads until the server responds with `"ready": true`
- The backend returns HTTP 503 (not 500) during startup, allowing the frontend to retry gracefully
- Database connections use `connect_timeout=10` and return 503 if PostgreSQL is still waking up

---

## Known Limitations & Gotchas

**OCR accuracy on low-quality scans:** The system accepts documents with advisory flags rather than hard-rejecting on poor quality. This keeps the pipeline permissive for candidates with older documents or limited scanning equipment, at the cost of more applications reaching the HR manual review queue.

**ML model generalisation:** The XGBoost model was trained on a fixed dataset. Job types not in the training set fall back to rule-based scoring (ML weight drops to 15%, rule weight rises to 85%). The `_job_is_known` flag in the reason JSON indicates which path was taken.

**OpenRouter dependency:** When `OPENROUTER_API_KEY` is not set, the system falls back to sentence-transformers for semantic matching and the XGBoost model for scoring. Both paths are tested and production-ready, but OpenRouter provides richer reasoning text in decision breakdowns.

**Render free tier limits:** The free PostgreSQL plan on Render allows ~10 connections. The pool is capped at 8 (pool_size=3 + max_overflow=5). The free web service sleeps after 15 minutes of inactivity — expect a 15–25 second cold-boot delay.

**File storage:** Uploaded files are stored on the server's local filesystem at `UPLOAD_DIR` (default `/tmp/uploads` in production). Render's free tier has ephemeral storage — files are lost on redeploy. For production use, migrate to an object store (S3, Cloudflare R2, or Render Disks).

**Concurrent OCR:** Background OCR runs in a `ThreadPoolExecutor` with 4 workers. Processing many applications simultaneously will queue. The per-candidate OCR budget is 60 seconds; individual document OCR times out at 20 seconds.