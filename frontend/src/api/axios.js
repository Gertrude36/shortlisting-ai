/**
 * frontend/src/api/axios.js
 *
 * ✅ FIX 1 — VITE_API_URL must be set on Vercel as an environment variable.
 *             Value: https://shortlisting-ai.onrender.com
 *             Without it, every API call silently hits localhost and fails,
 *             causing the frontend to appear blank.
 *
 * ✅ FIX 2 — Never set Content-Type manually on axios instance.
 *             For FormData, axios auto-sets multipart/form-data + boundary.
 *             Overriding it removes the boundary and breaks file uploads.
 *
 * ✅ FIX 3 — Wake-up ping: Render free tier sleeps after 15 min of inactivity.
 *             On app load, we silently ping /wake so the backend is ready
 *             before the user makes a real request.
 */

import axios from 'axios'

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BACKEND,
  // ✅ DO NOT set Content-Type here — axios handles it automatically:
  //    - JSON body    → Content-Type: application/json
  //    - FormData     → Content-Type: multipart/form-data; boundary=----xyz
  withCredentials: false,
})

// ── Wake up Render backend on app load (prevents cold-start delays) ──────────
// Only runs in production (when VITE_API_URL is set)
if (import.meta.env.VITE_API_URL) {
  axios.get(`${BACKEND}/wake`).catch(() => {
    // Silently ignore — this is just a warm-up ping
  })
}

// ── Request interceptor: attach JWT token ────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token')

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // ✅ CRITICAL: Never set Content-Type for FormData requests.
    // Axios detects FormData and sets the correct multipart header + boundary.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle auth errors globally ────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      sessionStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api