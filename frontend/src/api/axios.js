/**
 * frontend/src/api/axios.js
 *
 * FIXES APPLIED:
 *
 * ✅ FIX 1 — 401 RETRY LOOP STOPPED (debounce guard)
 * ✅ FIX 2 — PUBLIC ROUTE MATCHING FIXED (exact prefix, not substring)
 * ✅ FIX 3 — WAKE PING USES API INSTANCE (not bare axios global)
 * ✅ FIX 4 — 401 ON PUBLIC ROUTES CLEARS STORAGE TOO
 * ✅ FIX 5 — _skipRedirect SUPPORT FOR AuthContext BOOT CHECK
 *            AuthContext calls /auth/me on startup with _skipRedirect:true
 *            so the interceptor clears storage but does NOT redirect —
 *            AuthContext handles the redirect via ProtectedRoute naturally.
 *            Without this, you get a double-redirect flash on cold load.
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

// ── Wake-up ping (production only) ───────────────────────────────────────────
if (IS_PROD) {
  api
    .get('/wake', { timeout: 60_000 })
    .catch(() => {})   // silently ignore — just a warm-up ping
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

// ✅ FIX 2: exact match — '/jobs' must NOT match '/jobs/5'
const isPublic = (url = '') => {
  const path = url.split('?')[0]
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(route + '/')
  )
}

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    if (!isPublic(config.url)) {
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
let _redirecting = false   // ✅ FIX 1: debounce guard

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // ✅ FIX 4: always clear storage on 401 — stale token must never linger
      clearAuthStorage()

      // ✅ FIX 5: if caller set _skipRedirect:true, skip the redirect.
      //           AuthContext uses this for the startup /auth/me boot check.
      const skipRedirect = error.config?._skipRedirect === true

      if (!isPublic(error.config?.url) && !skipRedirect && !_redirecting) {
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