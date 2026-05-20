/**
 * frontend/src/api/axios.js — v5.2.0
 *
 * FIXES IN v5.2.0 (over v5.1.0):
 *
 *   ✅ FIX NET-1 — shortlist-all requests now get a 180s timeout
 *            (was inheriting the default 30s, causing network errors
 *            on OCR + AI batches that take 30–120s per applicant).
 *
 *   ✅ FIX NET-2 — shortlist-all network errors no longer trigger
 *            rearmWakeGate() (the server is awake; it's just slow).
 *            This prevents the wake banner from appearing mid-batch.
 *
 *   ✅ FIX NET-3 — shortlist-all requests are NOT retried on network
 *            error (retrying a partially-completed batch would
 *            double-process candidates). Instead the error is surfaced
 *            immediately so the frontend can show a useful message.
 *
 * All previous v5.1.0 fixes retained unchanged.
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

// ── Re-armable wake gate ───────────────────────────────────────────────────
let _wakeGatePromise      = null
let _wakeGateResolve      = null
let _serverConfirmedAwake = _IS_LOCAL

const WAKE_SAFETY_TIMEOUT_MS = 45_000

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
          '[axios] Wake gate safety timeout (45s) — unblocking uploads without confirming server awake.'
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
  if (_wakeInterval) {
    clearInterval(_wakeInterval)
    _wakeInterval = null
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
let _wakeInterval = null
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
    if (res.ok) {
      if (_wakeGateResolve) _wakeGateResolve()
    }
  } catch {
    // Still booting — next interval will retry.
  }
}

function _startWakePinging() {
  if (_IS_LOCAL) return
  if (_wakeInterval) { clearInterval(_wakeInterval); _wakeInterval = null }

  _backoffIndex = 0

  _knockServer()
  _checkHealth()

  function _scheduleNext() {
    if (_serverConfirmedAwake) return

    const delay = BACKOFF_INTERVALS[Math.min(_backoffIndex, BACKOFF_INTERVALS.length - 1)]
    _backoffIndex++

    _wakeInterval = setTimeout(() => {
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

const isDocumentUpload = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/applications\/\d+\/documents$/.test(url.split('?')[0])

// ✅ FIX NET-1: Detect shortlist-all requests so we can extend their timeout
const isShortlistAll = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/hr\/shortlist-all\/\d+$/.test(url.split('?')[0])

// Routes where network errors should NOT trigger rearmWakeGate().
// ✅ FIX NET-2: shortlist-all added — server is alive, just slow
const isBackgroundRoute = (url = '') =>
  /\/(auth\/me|jobs)($|\?)/.test(url) ||
  /\/hr\/shortlist-all\/\d+$/.test(url)

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    // ✅ FIX NET-1: Give shortlist-all a generous 180s timeout.
    // OCR + ML per applicant takes 30–120s; this covers small batches.
    if (isShortlistAll(config.url, config.method)) {
      config.timeout = 180_000
      config._isShortlistAll = true
    }

    if (isDocumentUpload(config.url, config.method)) {
      await getCurrentWakeGate()

      if (!config._slotPreacquired) {
        await waitForUploadSlot()
      }

      config._serializedUpload = true
      config.timeout = 150_000
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
const _sleep = ms => new Promise(r => setTimeout(r, ms))

api.interceptors.response.use(
  response => {
    if (response.config?._serializedUpload && !response.config?._slotPreacquired) {
      releaseUploadSlot()
    }
    if (!_serverConfirmedAwake && _wakeGateResolve) {
      _wakeGateResolve()
    }
    return response
  },

  async error => {
    if (error.config?._serializedUpload && !error.config?._slotPreacquired) {
      releaseUploadSlot()
    }

    if (!error.response) {
      const config = error.config || {}

      if (config.url?.includes('/wake') || config.url?.includes('/health')) {
        return Promise.reject(error)
      }

      // ✅ FIX NET-2: Don't re-arm wake gate for shortlist-all timeouts.
      // The server is alive — the request just took longer than expected.
      if (!isBackgroundRoute(config.url || '')) {
        rearmWakeGate()
      }

      if (isDocumentUpload(config.url, config.method)) {
        return Promise.reject(error)
      }

      // ✅ FIX NET-3: Don't retry shortlist-all on network error.
      // Retrying a partially-completed batch could double-process candidates.
      // Surface the error immediately so the UI shows a helpful message.
      if (config._isShortlistAll) {
        console.warn('[axios] shortlist-all timed out or lost connection — not retrying.')
        return Promise.reject(error)
      }

      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      const waitMs = config._retryCount * 2_000
      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 — waiting ${waitMs / 1000}s…`
      )

      await Promise.race([getCurrentWakeGate(), _sleep(waitMs)])
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