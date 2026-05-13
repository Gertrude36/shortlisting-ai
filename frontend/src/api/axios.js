/**
 * frontend/src/api/axios.js
 *
 * FIXES APPLIED:
 *
 * ✅ FIX — isPublic NOW CHECKS HTTP METHOD
 * ─────────────────────────────────────────────────────────────────
 * ROOT CAUSE OF "Not authenticated" on HR Job Create:
 *
 *   HRJobCreate.jsx calls api.post('/jobs', ...)
 *   The request interceptor called isPublic('/jobs') → true
 *   So it SKIPPED attaching the Authorization header
 *   Backend received POST /jobs with no token → 401 "Not authenticated"
 *
 *   Fix: PUBLIC_ROUTES now uses { method, path } objects.
 *   GET /jobs → public; POST /jobs → private (requires token).
 *
 * ✅ FIX — COLD-START / CORS ERROR on document upload page
 * ─────────────────────────────────────────────────────────────────
 * ROOT CAUSE:
 *   Render free-tier spins the server DOWN after ~15 min of inactivity.
 *   When the document upload page loads, it immediately calls
 *   GET /applications/{id}/documents. If the server is sleeping, the
 *   TCP connection fails before any HTTP headers are sent. The browser
 *   reports this as "No 'Access-Control-Allow-Origin' header" even
 *   though the CORS config is correct.
 *
 * FIXES:
 *   1. Wake ping runs in ALL environments (not just prod) — removed
 *      the IS_PROD guard that was preventing it from working locally.
 *   2. Aggressive warm-up: ping /wake immediately on load, then every
 *      4 minutes.
 *   3. Auto-retry on network errors: if a request fails with a network
 *      error (ERR_FAILED / no response), we wait 3 seconds and retry
 *      once automatically — this recovers from cold-start failures
 *      transparently.
 *   4. Increased timeout to 45s for the first cold-start request.
 */

import axios from 'axios'

// VITE_API_URL:
//   • local dev  → http://localhost:8000   (set in .env.local)
//   • production → https://shortlisting-ai.onrender.com  (set in Vercel env vars)
export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         45_000,   // 45s — generous enough for a cold-start wakeup
})

// ── Wake-up ping + keep-alive interval ───────────────────────────────────────
//
// FIX: removed IS_PROD guard — wake ping now runs everywhere.
// Render free-tier cold-starts affect anyone who opens the app after
// ~15 min of inactivity, in any environment.
//
// Uses plain fetch() — never triggers axios interceptors or causes
// spurious 401 redirects.

const _wake = () =>
  fetch(`${BACKEND}/wake`, { method: 'GET' }).catch(() => {
    // Silently ignore — server may still be sleeping; the retry logic
    // in the response interceptor will recover the actual request.
  })

// Warm up immediately on load
_wake()

// Keep alive every 4 minutes (Render sleeps after ~15 min)
setInterval(_wake, 4 * 60 * 1000)

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
//
// Each entry specifies BOTH the HTTP method and the path pattern.
//
//   method: 'ANY'  → public for all HTTP methods (e.g. auth endpoints)
//   method: 'GET'  → public only for GET requests (e.g. job listing)
//
const PUBLIC_ROUTES = [
  { method: 'ANY', path: '/auth/login' },
  { method: 'ANY', path: '/auth/register' },
  { method: 'ANY', path: '/auth/forgot-password' },
  { method: 'ANY', path: '/auth/reset-password' },
  { method: 'ANY', path: '/wake' },
  { method: 'ANY', path: '/health' },
  { method: 'GET', path: '/jobs' },    // GET /jobs and GET /jobs/:id are public
                                        // POST /jobs (create) requires HR token
                                        // DELETE /jobs/:id requires HR token
]

/**
 * Returns true if this request should skip the Authorization header.
 *
 * @param {string} url    - The request URL path (e.g. '/jobs/5')
 * @param {string} method - The HTTP method in UPPERCASE (e.g. 'GET', 'POST')
 */
const isPublic = (url = '', method = '') => {
  const path        = url.split('?')[0]
  const upperMethod = method.toUpperCase()

  return PUBLIC_ROUTES.some(({ method: routeMethod, path: routePath }) => {
    const pathMatches =
      path === routePath ||
      path.startsWith(routePath + '/')

    const methodMatches =
      routeMethod === 'ANY' ||
      routeMethod === upperMethod

    return pathMatches && methodMatches
  })
}

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    if (!isPublic(config.url, config.method)) {
      const token =
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // Let axios set Content-Type automatically for FormData (boundary header)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor ──────────────────────────────────────────────────────
let _redirecting = false   // debounce guard — stops multiple simultaneous redirects

/**
 * Wait ms milliseconds.
 */
const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retry a failed axios request once after a short delay.
 * Used to transparently recover from Render cold-start TCP failures.
 *
 * We only retry on network errors (no response at all), not on HTTP
 * error responses (4xx / 5xx) — those are real errors from the server.
 */
const _retryOnce = async (error) => {
  const config = error.config

  // Only retry genuine network failures (no HTTP response received)
  if (error.response) return Promise.reject(error)

  // Don't retry if we already retried
  if (config._retried) return Promise.reject(error)

  config._retried = true

  console.warn(
    `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
    'Server may be cold-starting — waking up and retrying in 4 seconds…'
  )

  // Ping /wake and wait for the server to come back up
  await _wake()
  await _sleep(4000)

  return api(config)
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ── Retry once on network failure (cold-start recovery) ──────────────
    if (!error.response) {
      return _retryOnce(error)
    }

    // ── Handle 401 Unauthorized ───────────────────────────────────────────
    if (error.response?.status === 401) {
      // Always clear storage on 401 — stale token must never linger
      clearAuthStorage()

      // If caller set _skipRedirect:true, skip the redirect.
      // AuthContext uses this for the startup /auth/me boot check.
      const skipRedirect = error.config?._skipRedirect === true

      if (
        !isPublic(error.config?.url, error.config?.method) &&
        !skipRedirect &&
        !_redirecting
      ) {
        _redirecting = true
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        setTimeout(() => { _redirecting = false }, 3000)
      }
    }

    return Promise.reject(error)
  },
)

export default api