/**
 * frontend/src/api/axios.js — v5.3.0
 *
 * FIXES IN v5.3.0 (over v5.2.0):
 *
 *   ✅ FIX NET-4 — /profile/documents now correctly matched by
 *            isDocumentUpload(). Previously only /applications/:id/documents
 *            was matched, so /profile/documents skipped the wake gate,
 *            the upload semaphore, and the 150s timeout — causing immediate
 *            network failures on cold starts and the "Re-arming wake gate"
 *            log spam seen in the console.
 *
 *   ✅ FIX NET-5 — Retry logic no longer uses Promise.race(wakeGate, sleep).
 *            Previously the short sleep (2s/4s/6s) always won the race,
 *            meaning retries fired while the server was still waking up.
 *            Now retries await the wake gate FIRST (up to 45s), then add
 *            a small extra delay before re-sending, so the request only
 *            goes out once the server is confirmed alive.
 *
 *   ✅ FIX NET-6 — Retry waits changed from (retryCount × 2s) to a fixed
 *            staggered schedule (3s / 5s / 8s) applied AFTER the wake gate
 *            resolves. This prevents thundering-retries while still giving
 *            the server a moment to stabilise after waking.
 *
 * All previous v5.2.0 fixes retained unchanged.
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

// ✅ FIX NET-4: Added /profile/documents to the document upload matcher.
// Previously only /applications/:id/documents was matched, so /profile/documents
// bypassed the wake gate, upload semaphore, and 150s timeout entirely —
// causing the "Network error on POST /profile/documents" console errors.
const isDocumentUpload = (url = '', method = '') => {
  if (method.toUpperCase() !== 'POST') return false
  const path = url.split('?')[0]
  return (
    /\/applications\/\d+\/documents$/.test(path) ||
    /\/profile\/documents$/.test(path)
  )
}

// ✅ FIX NET-1 (v5.2.0): Detect shortlist-all requests for extended timeout.
const isShortlistAll = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/hr\/shortlist-all\/\d+$/.test(url.split('?')[0])

// Routes where network errors should NOT trigger rearmWakeGate().
// ✅ FIX NET-2 (v5.2.0): shortlist-all — server is alive, just slow.
const isBackgroundRoute = (url = '') =>
  /\/(auth\/me|jobs)($|\?)/.test(url) ||
  /\/hr\/shortlist-all\/\d+$/.test(url)

// ✅ FIX NET-6: Staggered post-wakeup delays applied AFTER the gate resolves.
// Gives the server a moment to stabilise before the retry hits it.
const RETRY_POST_WAKE_DELAYS = [3_000, 5_000, 8_000]

const _sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    // ✅ FIX NET-1 (v5.2.0): Give shortlist-all a generous 180s timeout.
    if (isShortlistAll(config.url, config.method)) {
      config.timeout = 180_000
      config._isShortlistAll = true
    }

    if (isDocumentUpload(config.url, config.method)) {
      // Always wait for the server to be awake before sending documents.
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

      // ✅ FIX NET-2 (v5.2.0): Don't re-arm wake gate for shortlist-all.
      if (!isBackgroundRoute(config.url || '')) {
        rearmWakeGate()
      }

      if (isDocumentUpload(config.url, config.method)) {
        // Document uploads already awaited the wake gate in the request
        // interceptor. If we still got a network error the server went back
        // to sleep mid-session. Release the slot and surface the error so
        // the UI can prompt the user to retry manually.
        return Promise.reject(error)
      }

      // ✅ FIX NET-3 (v5.2.0): Don't retry shortlist-all on network error.
      if (config._isShortlistAll) {
        console.warn('[axios] shortlist-all timed out or lost connection — not retrying.')
        return Promise.reject(error)
      }

      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      // ✅ FIX NET-5 + NET-6: Wait for the wake gate to resolve FIRST (up
      // to 45s), then add a small stagger delay before re-sending.
      // Previously we raced the gate against a short sleep (2s/4s/6s) which
      // always won, so retries fired while the server was still sleeping.
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