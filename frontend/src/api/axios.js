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
 * ✅ FIX COLD-START-2 (NEW) — WAKE GATE
 * ─────────────────────────────────────────────────────────────────
 * ROOT CAUSE OF REMAINING COLD-START FAILURES:
 *   The original code fired _wake() and then immediately allowed
 *   requests to proceed. Because _wake() is async and the first page
 *   API call (e.g. GET /applications/{id}/documents) fires in the same
 *   JS microtask queue tick, there was effectively zero gap between
 *   "we pinged /wake" and "we sent the real request" — the server had
 *   no time to finish booting.
 *
 * FIX — Wake Gate (promise-based mutex):
 *   A module-level Promise (_wakeGate) is created once on import.
 *   It resolves when /wake responds successfully OR after a 10s timeout
 *   (so a broken /wake endpoint never blocks the app forever).
 *   The request interceptor awaits _wakeGate for all non-public routes
 *   before sending any request, guaranteeing the server is alive.
 *
 *   Public routes (/auth/login, /jobs GET, etc.) skip the gate so the
 *   jobs listing page loads instantly without waiting for the server.
 *
 * OTHER FIXES retained from previous version:
 *   1. Wake ping runs in ALL environments (not just prod).
 *   2. Aggressive keep-alive: ping /wake every 4 minutes.
 *   3. Auto-retry on network errors: wait 4s and retry once.
 *   4. Increased timeout to 45s for cold-start requests.
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

// ── Wake gate ─────────────────────────────────────────────────────────────────
//
// _wakeGate is a Promise that resolves once the backend is confirmed alive.
// All authenticated requests await this before being sent, ensuring the
// server has had time to finish booting after a cold-start.
//
// The gate resolves (not rejects) on both success AND timeout so that
// a broken /wake endpoint never blocks the entire app permanently.
// After the gate resolves once, subsequent requests skip the wait entirely
// because awaiting an already-resolved Promise is instant.

let _wakeGateResolve          // called when server confirms it's awake
let _serverConfirmedAwake = false

const _wakeGate = new Promise((resolve) => {
  _wakeGateResolve = () => {
    _serverConfirmedAwake = true
    resolve()
  }

  // Safety timeout — if /wake never responds in 10s, unblock anyway.
  // This prevents the app from hanging forever if /wake itself is broken.
  setTimeout(() => {
    if (!_serverConfirmedAwake) {
      console.warn('[axios] Wake gate timed out after 10s — unblocking requests anyway.')
      resolve()
    }
  }, 10_000)
})

// ── Wake-up ping + keep-alive interval ───────────────────────────────────────
//
// Uses plain fetch() so it never triggers axios interceptors.
// On success: resolves the wake gate so queued requests can proceed.
// On failure: the 10s safety timeout will unblock them instead.

const _wake = () =>
  fetch(`${BACKEND}/wake`, { method: 'GET' })
    .then((res) => {
      if (res.ok && !_serverConfirmedAwake) {
        _wakeGateResolve()
      }
    })
    .catch(() => {
      // Server still sleeping — the safety timeout will unblock the gate.
      // The _retryOnce interceptor will handle the actual failed request.
    })

// Warm up immediately on module load
_wake()

// Keep alive every 4 minutes (Render sleeps after ~15 min of inactivity)
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

// ── Public routes — skip Authorization header, 401 redirect, AND wake gate ───
//
// Each entry specifies BOTH the HTTP method and the path pattern.
//
//   method: 'ANY'  → public for all HTTP methods (e.g. auth endpoints)
//   method: 'GET'  → public only for GET requests (e.g. job listing)
//
// Public routes skip the wake gate so the jobs listing page and auth
// pages load instantly without waiting for the server to confirm it's alive.
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
 * Returns true if this request should skip the Authorization header,
 * the 401 redirect, and the wake gate.
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
  async (config) => {
    const pub = isPublic(config.url, config.method)

    // ── Wake gate: hold non-public requests until server confirms alive ──
    // Awaiting an already-resolved Promise is synchronous (0ms cost),
    // so this only adds latency on the very first request after a cold-start.
    if (!pub) {
      await _wakeGate
    }

    // ── Attach Authorization header ──────────────────────────────────────
    if (!pub) {
      const token =
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // ── Let axios set Content-Type automatically for FormData ────────────
    // (axios must set the multipart boundary automatically)
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
 * Used to transparently recover from Render cold-start TCP failures
 * that slip through before the wake gate resolves.
 *
 * Only retries on network errors (no response at all), not on HTTP
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

  // Ping /wake, wait for the server to come back up, then resolve gate
  await _wake()
  await _sleep(4_000)

  // Mark gate as resolved so future requests don't wait again
  _wakeGateResolve()

  return api(config)
}

api.interceptors.response.use(
  (response) => {
    // Any successful response confirms the server is alive — resolve the gate
    // in case it hadn't been resolved yet (e.g. a public route responded first).
    if (!_serverConfirmedAwake) {
      _wakeGateResolve()
    }
    return response
  },
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
        setTimeout(() => { _redirecting = false }, 3_000)
      }
    }

    return Promise.reject(error)
  },
)

export default api