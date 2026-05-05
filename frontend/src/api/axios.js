/**
 * frontend/src/api/axios.js
 *
 * FIXES vs previous version:
 *
 * 1. IS_PROD now uses Vite's built-in `import.meta.env.PROD` flag (true only
 *    in a production build) instead of checking whether VITE_API_URL is set.
 *    Previously, .env.local set VITE_API_URL=http://localhost:8000 which made
 *    IS_PROD=true in local dev and fired the wake-ping at localhost — harmless
 *    but wasteful and confusing.
 *
 * 2. BACKEND is always the Render URL in production and always
 *    http://localhost:8000 in dev (via .env.local), so the Vite proxy is not
 *    needed and has been removed from vite.config.js.
 *
 * 3. Wake-up ping now fires only in a real production build (import.meta.env.PROD).
 *
 * 4. Minor: clearAuthStorage is exported so other modules can call it.
 */

import axios from 'axios'

// ── True only when built with `vite build` (i.e. deployed on Vercel) ─────────
const IS_PROD = import.meta.env.PROD

// VITE_API_URL is:
//   • local dev  → http://localhost:8000   (set in .env.local)
//   • production → https://shortlisting-ai.onrender.com  (set in .env / Vercel)
export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000, // 30 s — generous for Render cold starts
})

// ── Wake-up ping (production only) ───────────────────────────────────────────
// Render free tier spins down after 15 min of inactivity.
// This lightweight GET wakes the backend in the background so the first
// real request isn't delayed by a 30-second cold start.
if (IS_PROD) {
  axios
    .get(`${BACKEND}/wake`, { timeout: 60_000 }) // allow up to 60 s for cold start
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

// ── Public routes — skip Authorization header & skip 401 redirect ─────────────
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/wake',
  '/jobs',         // public job listing — no auth needed
]

const isPublic = (url = '') =>
  PUBLIC_ROUTES.some((r) => url.includes(r))

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
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !isPublic(error.config?.url)
    ) {
      clearAuthStorage()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api