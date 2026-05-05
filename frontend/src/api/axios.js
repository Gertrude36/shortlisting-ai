/**
 * frontend/src/api/axios.js
 *
 * FIXES:
 * 1. In dev (no VITE_API_URL), baseURL is '' so all requests go through
 *    the Vite proxy at /api/* → avoids CORS entirely in local development.
 * 2. In production (VITE_API_URL is set on Vercel), requests go directly
 *    to the backend — CORS must be allowed by the backend for that origin.
 * 3. Request interceptor skips attaching Authorization header on PUBLIC_ROUTES
 *    so stale tokens never cause a 401 on login/register.
 * 4. Wake-up ping only fires in production where VITE_API_URL exists.
 */

import axios from 'axios'

const IS_PROD   = Boolean(import.meta.env.VITE_API_URL)
export const BACKEND = import.meta.env.VITE_API_URL || ''

// In dev  → baseURL is '' so axios hits '/api/auth/login' → Vite proxy forwards it
// In prod → baseURL is 'https://shortlisting-ai.onrender.com'
const api = axios.create({
  baseURL:          BACKEND,
  withCredentials:  false,
})

// ── Wake up Render backend on app load (production only) ─────────────────────
if (IS_PROD) {
  axios.get(`${BACKEND}/wake`).catch(() => {
    // Silently ignore — this is just a warm-up ping
  })
}

// ── Auth keys to clear on logout / 401 ───────────────────────────────────────
const AUTH_KEYS = ['token', 'role', 'userId', 'fullName', 'nationalId', 'location', 'phone', 'documents']

export function clearAuthStorage() {
  AUTH_KEYS.forEach(key => localStorage.removeItem(key))
  AUTH_KEYS.forEach(key => sessionStorage.removeItem(key))
}

// ── Public routes — no Authorization header, no 401 redirect ─────────────────
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/wake',
]

const isPublic = (url = '') => PUBLIC_ROUTES.some(r => url.includes(r))

// ── Request interceptor: attach JWT (skip public routes) ─────────────────────
api.interceptors.request.use(
  (config) => {
    // Don't attach a stale token to public routes — it causes 401s on login
    if (!isPublic(config.url)) {
      const token =
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    // CRITICAL: Never set Content-Type for FormData — axios sets it automatically
    // with the correct multipart boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401s globally ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isPublic(error.config?.url)) {
      clearAuthStorage()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api