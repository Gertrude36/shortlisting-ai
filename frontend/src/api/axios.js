/**
 * frontend/src/api/axios.js — v5.4.1
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX in v5.4.1:
 *   - Replaced clearInterval() with clearTimeout() for wake pinging timers
 *   - Renamed _wakeInterval → _wakeTimer to avoid confusion
 *   - Added _slotPreacquired flag for upload semaphore (cleaner release logic)
 *   - Reset _slotPreacquired on retry so each attempt acquires a fresh slot
 */

import axios from 'axios'

export const BACKEND =
  import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Skip all Render cold-start logic when NOT pointing at Render production.
const _IS_LOCAL = !/onrender\.com/.test(BACKEND)

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000,
})

// ── Server status ──────────────────────────────────────────────────────────
let _serverStatus      = _IS_LOCAL ? 'awake' : 'sleeping'
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

// Immediately broadcast 'waking' on page load (non-local only)
if (!_IS_LOCAL) {
  setTimeout(() => _setServerStatus('waking'), 0)
}

// ── Re-armable wake gate ───────────────────────────────────────────────────
const WAKE_SAFETY_TIMEOUT_MS = 30_000

let _wakeGatePromise      = null
let _wakeGateResolve      = null
let _serverConfirmedAwake = _IS_LOCAL

function _armWakeGate() {
  _serverConfirmedAwake = false

  _wakeGatePromise = new Promise((resolve) => {
    _wakeGateResolve = () => {
      if (_serverConfirmedAwake) return
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }

    setTimeout(() => {
      if (!_serverConfirmedAwake) {
        console.warn(
          '[axios] Wake gate safety timeout (30s) — unblocking requests without confirming server awake.'
        )
        resolve()
      }
    }, WAKE_SAFETY_TIMEOUT_MS)
  })
}

if (!_IS_LOCAL) {
  _armWakeGate()
} else {
  _wakeGatePromise = Promise.resolve()
}

export function getCurrentWakeGate() {
  return _wakeGatePromise
}

export function rearmWakeGate() {
  if (_IS_LOCAL) return
  console.log('[axios] Re-arming wake gate — server may have gone back to sleep.')
  if (_wakeTimer) {
    clearTimeout(_wakeTimer)
    _wakeTimer = null
  }
  _backoffIndex = 0
  _armWakeGate()
  _setServerStatus('waking')
  _startWakePinging()
}

// ── Upload concurrency semaphore ───────────────────────────────────────────
const MAX_CONCURRENT_UPLOADS = 3
let _inFlight  = 0
const _waiters = []

export function waitForUploadSlot() {
  if (_inFlight < MAX_CONCURRENT_UPLOADS) {
    _inFlight++
    return Promise.resolve()
  }
  return new Promise(resolve => _waiters.push(resolve))
}

export function releaseUploadSlot() {
  const next = _waiters.shift()
  if (next) {
    setTimeout(next, 100)
  } else {
    _inFlight = Math.max(0, _inFlight - 1)
  }
}

// ── Wake pinging ───────────────────────────────────────────────────────────
const BACKOFF_INTERVALS = [1500, 1500, 2000, 2000, 3000, 3000, 5000]

let _wakePending  = false
let _wakeTimer    = null   // ✅ renamed from _wakeInterval
let _backoffIndex = 0

function _knockServer() {
  if (_IS_LOCAL || _wakePending) return
  _wakePending = true
  _setServerStatus('waking')

  fetch(`${BACKEND}/wake`, {
    method:    'GET',
    mode:      'no-cors',
    cache:     'no-store',
    keepalive: true,
  })
    .catch(() => {})
    .finally(() => { _wakePending = false })
}

async function _checkHealth() {
  if (_IS_LOCAL || _serverConfirmedAwake) return
  try {
    const res = await fetch(`${BACKEND}/health`, {
      method: 'GET',
      mode:   'cors',
      cache:  'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok && _wakeGateResolve) _wakeGateResolve()
  } catch {
    // Still booting — next interval will retry.
  }
}

function _startWakePinging() {
  if (_IS_LOCAL) return
  if (_wakeTimer) {
    clearTimeout(_wakeTimer)
    _wakeTimer = null
  }

  _backoffIndex = 0

  _knockServer()
  _checkHealth()

  function _scheduleNext() {
    if (_serverConfirmedAwake) return

    const delay = BACKOFF_INTERVALS[Math.min(_backoffIndex, BACKOFF_INTERVALS.length - 1)]
    _backoffIndex++

    _wakeTimer = setTimeout(() => {
      if (_serverConfirmedAwake) return
      _knockServer()
      _checkHealth()
      _scheduleNext()
    }, delay)
  }

  _scheduleNext()
}

_startWakePinging()

// ── Keep-alive: ping every 4 min to prevent Render from sleeping mid-session
setInterval(async () => {
  if (_IS_LOCAL || !_serverConfirmedAwake) return
  try {
    const res = await fetch(`${BACKEND}/health`, {
      method: 'GET',
      mode:   'cors',
      cache:  'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) rearmWakeGate()
  } catch {
    rearmWakeGate()
  }
}, 4 * 60 * 1_000)

// ── Auth helpers ───────────────────────────────────────────────────────────
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

// ── Route classification ───────────────────────────────────────────────────
const PUBLIC_ROUTES = [
  { method: 'ANY', path: '/auth/login' },
  { method: 'ANY', path: '/auth/register' },
  { method: 'ANY', path: '/auth/forgot-password' },
  { method: 'ANY', path: '/auth/reset-password' },
  { method: 'ANY', path: '/wake' },
  { method: 'ANY', path: '/health' },
  { method: 'GET',  path: '/jobs' },
]

const isPublic = (url = '', method = '') => {
  const path  = url.split('?')[0]
  const upper = method.toUpperCase()
  return PUBLIC_ROUTES.some(({ method: rm, path: rp }) =>
    (path === rp || path.startsWith(rp + '/')) &&
    (rm === 'ANY' || rm === upper)
  )
}

const isDocumentUpload = (url = '', method = '') => {
  if (method.toUpperCase() !== 'POST') return false
  const path = url.split('?')[0]
  return (
    /\/applications\/\d+\/documents$/.test(path) ||
    /\/profile\/documents$/.test(path)
  )
}

const isShortlistAll = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/hr\/shortlist-all\/\d+$/.test(url.split('?')[0])

const isBackgroundRoute = (url = '') =>
  /\/(auth\/me|jobs)($|\?)/.test(url) ||
  /\/hr\/shortlist-all\/\d+$/.test(url)

const RETRY_POST_WAKE_DELAYS = [1_000, 2_000, 3_000]
const _sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    if (isShortlistAll(config.url, config.method)) {
      config.timeout = 180_000
      config._isShortlistAll = true
    }

    if (isDocumentUpload(config.url, config.method)) {
      await getCurrentWakeGate()
      // ✅ Acquire upload slot and mark it on config
      if (!config._slotPreacquired) {
        await waitForUploadSlot()
        config._slotPreacquired = true
      }
      config._serializedUpload = true
      config.timeout = 150_000
    } else if (!isPublic(config.url, config.method)) {
      if (!_serverConfirmedAwake) {
        await getCurrentWakeGate()
      }
    }

    if (!isPublic(config.url, config.method)) {
      const token =
        localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  err => Promise.reject(err),
)

// ── Response interceptor ───────────────────────────────────────────────────
let _redirecting = false

api.interceptors.response.use(
  response => {
    // ✅ Release upload slot only if it was acquired
    if (response.config?._serializedUpload && response.config?._slotPreacquired) {
      releaseUploadSlot()
      response.config._slotPreacquired = false   // reset for potential retry
    }
    if (!_serverConfirmedAwake && _wakeGateResolve) {
      _wakeGateResolve()
    }
    return response
  },

  async error => {
    // ✅ Release upload slot if it was acquired
    if (error.config?._serializedUpload && error.config?._slotPreacquired) {
      releaseUploadSlot()
      error.config._slotPreacquired = false   // reset so retry can re-acquire
    }

    if (!error.response) {
      const config = error.config || {}

      if (config.url?.includes('/wake') || config.url?.includes('/health')) {
        return Promise.reject(error)
      }

      if (!isBackgroundRoute(config.url || '')) {
        rearmWakeGate()
      }

      if (isDocumentUpload(config.url, config.method)) {
        return Promise.reject(error)
      }

      if (config._isShortlistAll) {
        console.warn('[axios] shortlist-all timed out or lost connection — not retrying.')
        return Promise.reject(error)
      }

      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      const postWakeDelay = RETRY_POST_WAKE_DELAYS[config._retryCount - 1]

      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 — waiting for server to wake, then +${postWakeDelay / 1000}s…`
      )

      await getCurrentWakeGate()
      await _sleep(postWakeDelay)
      return api(config)
    }

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