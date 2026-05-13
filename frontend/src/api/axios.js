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
 * The old isPublic() only checked the URL path, not the HTTP method.
 * '/jobs' was in PUBLIC_ROUTES because GET /jobs (job listing) is public.
 * But POST /jobs (create job) requires HR authentication.
 * Same problem exists for DELETE /jobs/:id.
 *
 * Fix: PUBLIC_ROUTES is now a list of { method, path } objects.
 *   GET  /jobs   → public  (anyone can browse job listings)
 *   GET  /jobs/5 → public  (anyone can view a job detail)
 *   POST /jobs   → private (HR only — token required)
 *
 * ✅ FIX — KEEP-ALIVE PING INTERVAL
 * ─────────────────────────────────────────────────────────────────
 * Render free-tier spins the server DOWN after ~15 min of inactivity.
 * When cold-starting, the first request fails at TCP level — before
 * any HTTP headers (including CORS) are sent. The browser reports this
 * as "No 'Access-Control-Allow-Origin' header" even though the backend
 * config is correct.
 *
 * Fix: ping /wake immediately on load, then every 4 minutes, so the
 * server never sleeps while the app is open.
 */

import axios from 'axios'

// ── True only when built with `vite build` (i.e. deployed on Vercel) ─────────
const IS_PROD = import.meta.env.PROD

// VITE_API_URL:
//   • local dev  → http://localhost:8000   (set in .env.local)
//   • production → https://shortlisting-ai.onrender.com  (set in Vercel env vars)
export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000,
})

// ── Wake-up ping + keep-alive interval (production only) ─────────────────────
//
// Two problems solved:
//   1. Immediate ping on load warms the server before the user interacts.
//   2. Repeated pings every 4 minutes prevent cold-starts mid-session.
//
// Uses plain fetch() — never triggers axios interceptors or causes
// spurious 401 redirects.
//
if (IS_PROD) {
  const wake = () => fetch(`${BACKEND}/wake`).catch(() => {})

  // Warm up immediately on load
  wake()

  // Keep alive every 4 minutes
  setInterval(wake, 4 * 60 * 1000)
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
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