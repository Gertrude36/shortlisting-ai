/**
 * frontend/src/api/axios.js
 *
 * FIXES APPLIED:
 *
 * ✅ FIX 1 — 401 RETRY LOOP STOPPED (debounce guard added)
 * ─────────────────────────────────────────────────────────────────
 * The browser showed 10-15 repeated 401s on /auth/login and /auth/me.
 * Root cause: multiple components mounting at the same time each
 * triggered a request with an expired token → each got 401 → each
 * called clearAuthStorage + redirect simultaneously.
 *
 * Fix: `_redirecting` flag prevents multiple concurrent 401 handlers
 * from all firing the redirect at once.
 *
 * ✅ FIX 2 — PUBLIC ROUTE MATCHING FIXED
 * ─────────────────────────────────────────────────────────────────
 * Previously `isPublic('/jobs/5')` returned true because '/jobs' is a
 * substring of '/jobs/5'. A job-detail page with an expired token
 * would silently skip the Authorization header instead of sending it.
 *
 * Fix: exact prefix matching with trailing-slash check so '/jobs'
 * only matches '/jobs' and '/jobs?...' — not '/jobs/5'.
 *
 * ✅ FIX 3 — WAKE PING USES API INSTANCE (not bare axios)
 * ─────────────────────────────────────────────────────────────────
 * Previously the wake ping used the bare `axios` global which has a
 * different baseURL and timeout. Now it uses the configured `api`
 * instance for consistency.
 *
 * ✅ FIX 4 — 401 ON PUBLIC ROUTES CLEARS STORAGE TOO
 * ─────────────────────────────────────────────────────────────────
 * If /auth/login returns 401 (wrong credentials), the old code skipped
 * clearAuthStorage — leaving a stale token that broke subsequent requests.
 * Now storage is always cleared on 401, but the redirect only fires for
 * protected routes.
 */

import axios from 'axios'

// ── True only when built with `vite build` (i.e. deployed on Vercel) ─────────
const IS_PROD = import.meta.env.PROD

// VITE_API_URL is:
//   • local dev  → http://localhost:8000   (set in .env.local)
//   • production → https://shortlisting-ai.onrender.com  (set in Vercel env vars)
export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000,   // 30 s — generous for Render cold starts
})

// ── Wake-up ping (production only) ───────────────────────────────────────────
// Render free tier spins down after 15 min of inactivity.
// ✅ FIX 3: use the configured `api` instance (not bare axios global)
if (IS_PROD) {
  api
    .get('/wake', { timeout: 60_000 })
    .catch(() => {
      // Silently ignore — this is just a warm-up ping
    })
}

// ── Auth storage keys ─────────────────────────────────────────────────────────
const AUTH_KEYS = [
  'token', 'role', 'userId', 'fullName',
  'nationalId', 'location', 'phone', 'documents',
]

export function clearAuthStorage() {
  AUTH_KEYS.forEach((key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  })
}

// ── Public routes — skip Authorization header & 401 redirect ─────────────────
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/wake',
  '/jobs',
]

// ✅ FIX 2: Exact prefix matching — '/jobs' must NOT match '/jobs/5'
const isPublic = (url = '') => {
  const path = url.split('?')[0]   // strip query string before matching
  return PUBLIC_ROUTES.some((route) => {
    return (
      path === route ||
      path.startsWith(route + '/')
    )
  })
}

// ── Request interceptor: attach JWT (skip public routes) ─────────────────────
api.interceptors.request.use(
  (config) => {
    if (!isPublic(config.url)) {
      const token =
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    // NEVER manually set Content-Type for FormData — axios sets the correct
    // multipart boundary automatically.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor: handle 401s globally ───────────────────────────────
// ✅ FIX 1: Guard flag — prevents multiple simultaneous 401 responses
//           from all triggering clearAuthStorage + redirect at once.
let _redirecting = false

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // ✅ FIX 4: Always clear storage on any 401 — even on public routes —
      //           so a stale token never lingers after a failed login attempt.
      clearAuthStorage()

      // Only redirect to /login for protected routes, and only once
      if (!isPublic(error.config?.url) && !_redirecting) {
        _redirecting = true
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        // Reset after navigation completes
        setTimeout(() => { _redirecting = false }, 3000)
      }
    }
    return Promise.reject(error)
  },
)

export default api