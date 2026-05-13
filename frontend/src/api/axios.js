/**
 * frontend/src/api/axios.js
 *
 * FIXES:
 * ✅ FIX 1 — Wake gate uses aggressive parallel pinging (every 2s) until server responds
 * ✅ FIX 2 — Wake gate has a shorter 30s safety timeout (Render cold starts rarely exceed 25s)
 * ✅ FIX 3 — Non-upload requests are NOT blocked by wake gate (only document uploads wait)
 * ✅ FIX 4 — Retry backoff reduced: 2s → 4s → 8s instead of 5s → 10s → 15s
 * ✅ FIX 5 — Removed duplicate-upload guard GET call from axios.js (handled in ApplyPage)
 * ✅ FIX 6 — Upload requests get a longer 120s timeout; other requests keep 30s
 * ✅ FIX 7 — Server status exported reliably for UI banner
 */

import axios from 'axios'

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000,   // default 30s; overridden per-request for uploads
})

// ── Server status observable ──────────────────────────────────────────────────
let _serverStatus         = 'sleeping'
let _serverConfirmedAwake = false
const _statusListeners    = new Set()

function _setServerStatus(status) {
  if (_serverStatus === status) return
  _serverStatus = status
  _statusListeners.forEach(cb => cb(status))
}

export function getServerStatus()        { return _serverStatus }
export function onServerStatusChange(cb) {
  _statusListeners.add(cb)
  return () => _statusListeners.delete(cb)
}

// ── Wake gate ─────────────────────────────────────────────────────────────────
// Resolves ONLY when server responds OK to /wake.
// Only document uploads (POST /applications/*/documents) are gated.

let _wakeGateResolve = null

const _wakeGate = new Promise((resolve) => {
  _wakeGateResolve = () => {
    if (_serverConfirmedAwake) return
    _serverConfirmedAwake = true
    _setServerStatus('awake')
    resolve()
  }

  // 30s safety timeout — unblock so uploads can fail with a real error
  setTimeout(() => {
    if (!_serverConfirmedAwake) {
      console.warn('[axios] Wake gate timed out after 30s — unblocking.')
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }
  }, 30_000)
})

// ── Wake-up ping (plain fetch, bypasses interceptors) ─────────────────────────
let _wakePending  = false
let _wakeInterval = null

const _wake = () => {
  if (_serverConfirmedAwake) {
    // Server is awake — stop the interval
    if (_wakeInterval) { clearInterval(_wakeInterval); _wakeInterval = null }
    return Promise.resolve()
  }
  if (_wakePending) return Promise.resolve()

  _wakePending = true
  _setServerStatus('waking')

  return fetch(`${BACKEND}/wake`, {
    method: 'GET',
    signal: AbortSignal.timeout(8_000),   // 8s per attempt — fail fast, retry quickly
  })
    .then(res => { if (res.ok) _wakeGateResolve() })
    .catch(() => { /* server still sleeping — next interval will retry */ })
    .finally(() => { _wakePending = false })
}

// Kick off immediately, then retry every 2s until awake
_wake()
_wakeInterval = setInterval(_wake, 2_000)

// Keep-alive ping every 4 min after server is awake (prevents re-sleeping)
setInterval(() => {
  if (_serverConfirmedAwake) {
    fetch(`${BACKEND}/wake`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {})
  }
}, 4 * 60 * 1000)

// ── Auth helpers ──────────────────────────────────────────────────────────────
const AUTH_KEYS = [
  'token', 'role', 'userId', 'fullName',
  'nationalId', 'location', 'phone', 'documents',
]

export function clearAuthStorage() {
  AUTH_KEYS.forEach(key => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  })
}

// ── Route classification ──────────────────────────────────────────────────────
const PUBLIC_ROUTES = [
  { method: 'ANY', path: '/auth/login' },
  { method: 'ANY', path: '/auth/register' },
  { method: 'ANY', path: '/auth/forgot-password' },
  { method: 'ANY', path: '/auth/reset-password' },
  { method: 'ANY', path: '/wake' },
  { method: 'ANY', path: '/health' },
  { method: 'GET', path: '/jobs' },
]

const isPublic = (url = '', method = '') => {
  const path        = url.split('?')[0]
  const upperMethod = method.toUpperCase()
  return PUBLIC_ROUTES.some(({ method: rm, path: rp }) =>
    (path === rp || path.startsWith(rp + '/')) &&
    (rm === 'ANY' || rm === upperMethod)
  )
}

// Only document upload POSTs need to wait for the wake gate.
// GET /documents, DELETE /documents, and all other requests proceed immediately
// so the UI stays responsive while the server warms up.
const isDocumentUpload = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/applications\/\d+\/documents$/.test(url.split('?')[0])

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    // Only block document uploads on the wake gate
    if (isDocumentUpload(config.url, config.method)) {
      await _wakeGate
      // Give document uploads extra timeout (OCR + verification can be slow)
      config.timeout = 120_000
    }

    if (!isPublic(config.url, config.method)) {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // Let browser set Content-Type for FormData (with multipart boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  err => Promise.reject(err),
)

// ── Response interceptor ──────────────────────────────────────────────────────
let _redirecting = false
const _sleep     = ms => new Promise(r => setTimeout(r, ms))

/**
 * Retry on genuine network failures only (no HTTP response received).
 * Faster backoff: 2s → 4s → 8s.
 * Does NOT retry document uploads (user should retry manually with fresh file).
 */
const _retryWithBackoff = async (error) => {
  const config = error.config

  // Don't retry if we got an HTTP response (4xx/5xx) — that's a real error
  if (error.response) return Promise.reject(error)

  // Don't retry /wake itself or document uploads
  if (config.url?.includes('/wake'))    return Promise.reject(error)
  if (isDocumentUpload(config.url, config.method)) return Promise.reject(error)

  config._retryCount = (config._retryCount || 0) + 1
  if (config._retryCount > 3) return Promise.reject(error)

  const waitMs = config._retryCount * 2_000   // 2s, 4s, 8s

  console.warn(
    `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
    `Attempt ${config._retryCount}/3 — retrying in ${waitMs / 1000}s…`
  )

  _setServerStatus('waking')
  _wake()
  await _sleep(waitMs)

  return api(config)
}

api.interceptors.response.use(
  response => {
    // First successful response confirms server is awake
    if (!_serverConfirmedAwake) _wakeGateResolve()
    return response
  },
  async error => {
    if (!error.response) return _retryWithBackoff(error)

    if (error.response?.status === 401) {
      clearAuthStorage()
      if (
        !isPublic(error.config?.url, error.config?.method) &&
        !error.config?._skipRedirect &&
        !_redirecting
      ) {
        _redirecting = true
        if (window.location.pathname !== '/login') window.location.href = '/login'
        setTimeout(() => { _redirecting = false }, 3_000)
      }
    }

    return Promise.reject(error)
  },
)

export default api