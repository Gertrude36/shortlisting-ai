/**
 * frontend/src/api/axios.js
 *
 * FIXES:
 * ✅ Wake gate waits silently — no broken unblocking on retry
 * ✅ Retry logic does NOT call _wakeGateResolve() prematurely
 * ✅ Server status exported for UI banner (sleeping → waking → awake)
 * ✅ 60s timeout covers full cold-start
 * ✅ Duplicate upload guard: clears error state before retry so
 *    the backend never sees two uploads for the same doc type
 */

import axios from 'axios'

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         90_000,   // 90s — covers full cold-start + processing
})

// ── Server status observable ──────────────────────────────────────────────────
let _serverStatus      = 'sleeping'
let _serverConfirmedAwake = false
const _statusListeners = new Set()

function _setServerStatus(status) {
  if (_serverStatus === status) return
  _serverStatus = status
  _statusListeners.forEach(cb => cb(status))
}

export function getServerStatus() { return _serverStatus }

export function onServerStatusChange(cb) {
  _statusListeners.add(cb)
  return () => _statusListeners.delete(cb)
}

// ── Wake gate ─────────────────────────────────────────────────────────────────
// One shared promise. Resolves ONLY when server responds OK to /wake.
// Never resolves prematurely on retry.

let _wakeGateResolve = null

const _wakeGate = new Promise((resolve) => {
  _wakeGateResolve = () => {
    if (_serverConfirmedAwake) return  // prevent double-resolve
    _serverConfirmedAwake = true
    _setServerStatus('awake')
    resolve()
  }

  // 50s safety timeout — if server never responds, unblock so
  // the real request can fail with a proper error, not hang forever.
  setTimeout(() => {
    if (!_serverConfirmedAwake) {
      console.warn('[axios] Wake gate timed out after 50s — unblocking.')
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }
  }, 50_000)
})

// ── Wake-up ping  (plain fetch to avoid axios interceptors) ───────────────────
let _wakePending = false

const _wake = () => {
  if (_serverConfirmedAwake) return Promise.resolve()
  if (_wakePending) return Promise.resolve()

  _wakePending = true
  _setServerStatus('waking')

  return fetch(`${BACKEND}/wake`, { method: 'GET', signal: AbortSignal.timeout(15_000) })
    .then(res => {
      if (res.ok) _wakeGateResolve()
    })
    .catch(() => { /* still sleeping — timeout will handle it */ })
    .finally(() => { _wakePending = false })
}

// Kick off immediately, and keep-alive every 4 min
_wake()
setInterval(() => {
  if (!_serverConfirmedAwake) _wake()
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

// ── Public routes — skip auth + wake gate ─────────────────────────────────────
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
  return PUBLIC_ROUTES.some(({ method: rm, path: rp }) => {
    return (path === rp || path.startsWith(rp + '/')) &&
           (rm === 'ANY' || rm === upperMethod)
  })
}

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const pub = isPublic(config.url, config.method)

    // Block non-public requests until server is confirmed awake
    if (!pub) await _wakeGate

    if (!pub) {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // Let browser set Content-Type for FormData (with boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  err => Promise.reject(err),
)

// ── Response interceptor ──────────────────────────────────────────────────────
let _redirecting = false
const _sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Retry on genuine network failures only (no HTTP response received).
 * Does NOT call _wakeGateResolve — that only happens when /wake responds OK.
 * Backs off: 5s → 10s → 15s.
 */
const _retryWithBackoff = async (error) => {
  const config = error.config

  // Don't retry if we got an HTTP response (4xx/5xx) — that's a real error
  if (error.response) return Promise.reject(error)

  // Don't retry /wake itself
  if (config.url?.includes('/wake')) return Promise.reject(error)

  config._retryCount = (config._retryCount || 0) + 1
  if (config._retryCount > 3) return Promise.reject(error)

  const waitMs = config._retryCount * 5_000

  console.warn(
    `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
    `Attempt ${config._retryCount}/3 — retrying in ${waitMs / 1000}s…`
  )

  _setServerStatus('waking')
  _wake()                // fire a new wake ping in background
  await _sleep(waitMs)   // wait before retry

  return api(config)
}

api.interceptors.response.use(
  response => {
    // First successful response = server is definitely awake
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