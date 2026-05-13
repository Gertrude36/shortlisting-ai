/**
 * frontend/src/api/axios.js
 *
 * FIXES APPLIED IN THIS VERSION:
 *
 * ✅ FIX COLD-START-3 — Wake gate timeout raised from 10s → 40s
 * ─────────────────────────────────────────────────────────────────
 * ROOT CAUSE: Render free-tier Docker cold starts take 30–50 seconds.
 * The previous 10s safety timeout expired before the server was ready,
 * unblocking requests that immediately failed. The gate now waits up
 * to 40 seconds before giving up and unblocking.
 *
 * ✅ FIX COLD-START-4 — Retry logic: 3 attempts with exponential backoff
 * ─────────────────────────────────────────────────────────────────────
 * ROOT CAUSE: The previous _retryOnce retried exactly once after 4s.
 * If the server needed 30s to boot, one retry was not enough.
 * Now retries up to 3 times: 5s → 10s → 15s between attempts.
 *
 * ✅ FIX COLD-START-5 — Exported server status observable
 * ─────────────────────────────────────────────────────────────────────
 * NEW: Exports `getServerStatus()` and `onServerStatusChange(cb)` so
 * UI components (e.g. ApplyPage document step) can show a real
 * "Server is waking up…" banner instead of a confusing CORS/network
 * error. The ApplyPage now blocks uploads until the server is confirmed
 * alive, with a countdown progress bar.
 *
 * ✅ ALL PREVIOUS FIXES RETAINED:
 *   - isPublic checks both HTTP method and path
 *   - Wake gate promise mutex
 *   - Keep-alive ping every 4 minutes
 *   - Authorization header attachment
 *   - 401 redirect with debounce guard
 *   - FormData Content-Type deletion
 */

import axios from 'axios'

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         60_000,   // 60s — covers full cold-start + request processing
})

// ── Server status observable ──────────────────────────────────────────────────
// 'sleeping' → 'waking' → 'awake'
let _serverStatus      = 'sleeping'
const _statusListeners = new Set()

function _setServerStatus(status) {
  if (_serverStatus === status) return
  _serverStatus = status
  _statusListeners.forEach(cb => cb(status))
}

/** Returns the current server status: 'sleeping' | 'waking' | 'awake' */
export function getServerStatus() {
  return _serverStatus
}

/**
 * Subscribe to server status changes.
 * @param {(status: 'sleeping'|'waking'|'awake') => void} cb
 * @returns {() => void} unsubscribe function
 */
export function onServerStatusChange(cb) {
  _statusListeners.add(cb)
  return () => _statusListeners.delete(cb)
}

// ── Wake gate ─────────────────────────────────────────────────────────────────
// A module-level Promise that resolves once the server is confirmed alive
// OR after a 40-second safety timeout.

let _wakeGateResolve
let _serverConfirmedAwake = false

const _wakeGate = new Promise((resolve) => {
  _wakeGateResolve = () => {
    _serverConfirmedAwake = true
    _setServerStatus('awake')
    resolve()
  }

  // ✅ FIX COLD-START-3: 40s timeout (Render Docker cold start = 30–50s)
  setTimeout(() => {
    if (!_serverConfirmedAwake) {
      console.warn('[axios] Wake gate timed out after 40s — unblocking requests.')
      _setServerStatus('awake')   // optimistic — let requests try anyway
      resolve()
    }
  }, 40_000)
})

// ── Wake-up ping ──────────────────────────────────────────────────────────────
// Uses plain fetch() to avoid triggering axios interceptors.

const _wake = () => {
  _setServerStatus('waking')
  return fetch(`${BACKEND}/wake`, { method: 'GET' })
    .then((res) => {
      if (res.ok && !_serverConfirmedAwake) {
        _wakeGateResolve()
      }
    })
    .catch(() => {
      // Server still sleeping — safety timeout will unblock eventually.
      // Keep status as 'waking' so the UI shows the progress banner.
    })
}

// Warm up immediately on module load
_wake()

// Keep alive every 4 minutes (Render sleeps after ~15 min of inactivity)
setInterval(_wake, 4 * 60 * 1000)

// ── Auth storage helpers ──────────────────────────────────────────────────────
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

// ── Public routes — skip auth header, 401 redirect, AND wake gate ─────────────
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
  return PUBLIC_ROUTES.some(({ method: routeMethod, path: routePath }) => {
    const pathMatches   = path === routePath || path.startsWith(routePath + '/')
    const methodMatches = routeMethod === 'ANY' || routeMethod === upperMethod
    return pathMatches && methodMatches
  })
}

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const pub = isPublic(config.url, config.method)

    if (!pub) {
      await _wakeGate
    }

    if (!pub) {
      const token =
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor ──────────────────────────────────────────────────────
let _redirecting = false

const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * ✅ FIX COLD-START-4: Retry up to 3 times with exponential backoff.
 * Waits: 5s → 10s → 15s between attempts.
 */
const _retryWithBackoff = async (error) => {
  const config = error.config

  // Only retry genuine network failures (no HTTP response)
  if (error.response) return Promise.reject(error)

  config._retryCount = (config._retryCount || 0) + 1
  if (config._retryCount > 3) return Promise.reject(error)

  const waitMs = config._retryCount * 5_000   // 5s, 10s, 15s

  console.warn(
    `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
    `Attempt ${config._retryCount}/3 — retrying in ${waitMs / 1000}s…`
  )

  _setServerStatus('waking')
  await _wake()
  await _sleep(waitMs)
  _wakeGateResolve()   // mark gate resolved so future requests don't re-queue

  return api(config)
}

api.interceptors.response.use(
  (response) => {
    if (!_serverConfirmedAwake) {
      _wakeGateResolve()
    }
    return response
  },
  async (error) => {
    if (!error.response) {
      return _retryWithBackoff(error)
    }

    if (error.response?.status === 401) {
      clearAuthStorage()

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