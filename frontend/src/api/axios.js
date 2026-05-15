/**
 * frontend/src/api/axios.js — FULLY FIXED v3
 *
 * BUGS FIXED IN THIS VERSION:
 *
 *   ✅ BUG 1 — _pingWake() used a plain cors-mode fetch() for the wake ping,
 *              so it got CORS-blocked while the server was asleep and never
 *              actually triggered Render to boot the dyno.
 *              FIX: Split into two fetches — a fire-and-forget no-cors "knock"
 *              to wake Render, plus a separate cors fetch to read the response
 *              and confirm readiness.
 *
 *   ✅ BUG 2 — Auth token injected TWICE: once in a standalone interceptor
 *              added at the top of the file, and again inside the combined
 *              request interceptor. Duplicate Authorization headers cause
 *              some proxies to reject or mangle requests.
 *              FIX: Removed the early standalone interceptor. Token injection
 *              now lives only in the single combined request interceptor.
 *
 *   ✅ BUG 3 — _inFlight semaphore leak: waitForUploadSlot() incremented
 *              _inFlight unconditionally (even for queued waiters).
 *              releaseUploadSlot() only decremented when no waiter was present.
 *              Net effect: every dequeued waiter left _inFlight one count too
 *              high. Over N uploads _inFlight reached MAX_CONCURRENT_UPLOADS
 *              permanently, stalling all future uploads.
 *              FIX: waitForUploadSlot() only increments _inFlight when
 *              granting the slot immediately. releaseUploadSlot() transfers
 *              the slot to the next waiter (no counter change) or decrements
 *              (no waiter). Counter = active uploads, always.
 *
 *   ✅ BUG 4 — rearmWakeGate() was guarded by _serverConfirmedAwake === true.
 *              After a safety-timeout unblock, _serverConfirmedAwake stays
 *              false, so the keep-alive interval could never re-arm on a
 *              half-awake or re-sleeping server.
 *              FIX: rearmWakeGate() is now unconditional — it always re-arms
 *              and restarts pinging.
 *
 *   ✅ BUG 5 — _startWakePinging() fired at module load even in local dev
 *              (BACKEND = localhost:8000), sending pointless wake requests.
 *              FIX: All Render cold-start logic is skipped when BACKEND
 *              contains "localhost" or "127.0.0.1".
 *
 * Previously shipped fixes (retained):
 *   ✅ FIX A — getCurrentWakeGate() read dynamically (not captured at closure)
 *   ✅ FIX B — Safety timeout unblocks without marking server confirmed awake
 *   ✅ FIX C — rearmWakeGate() exported
 *   ✅ FIX 1 — Upload serializer (semaphore, MAX_CONCURRENT_UPLOADS = 2)
 *   ✅ FIX 2 — Re-armable wake gate
 *   ✅ FIX 4 — Semaphore released in both success AND error paths
 *   ✅ FIX 5 — Keep-alive detects sleep and re-arms
 *   ✅ FIX 6 — 2s ping interval, 35s safety timeout
 *   ✅ FIX 7 — 120s timeout for document uploads
 */

import axios from 'axios'

export const BACKEND =
  import.meta.env.VITE_API_URL || 'http://localhost:8000'

// BUG 5 FIX: Skip all Render cold-start logic for local dev backends.
const _IS_LOCAL = /localhost|127\.0\.0\.1/.test(BACKEND)

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
let _serverConfirmedAwake = _IS_LOCAL  // local dev is always "awake"

function _armWakeGate() {
  _serverConfirmedAwake = false

  _wakeGatePromise = new Promise((resolve) => {
    // Resolves when a real HTTP 200 from /wake is received.
    _wakeGateResolve = () => {
      if (_serverConfirmedAwake) return
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }

    // BUG B FIX (retained): Safety unblock after 35s.
    // Unblocks queued uploads but does NOT confirm server awake —
    // pinging continues until a real 200 is received.
    setTimeout(() => {
      if (!_serverConfirmedAwake) {
        console.warn(
          '[axios] Wake gate safety timeout (35s) — unblocking uploads without confirming server awake.'
        )
        resolve()
        // _serverConfirmedAwake stays false → pinging continues
      }
    }, 35_000)
  })
}

if (!_IS_LOCAL) {
  _armWakeGate()
} else {
  // Dev: gate is already resolved so interceptors never wait.
  _wakeGatePromise = Promise.resolve()
}

// BUG A FIX (retained): Always return the CURRENT gate at call time.
export function getCurrentWakeGate() {
  return _wakeGatePromise
}

/**
 * Re-arm the wake gate.
 * BUG 4 FIX: No longer guarded by _serverConfirmedAwake — always re-arms.
 */
export function rearmWakeGate() {
  if (_IS_LOCAL) return
  console.log('[axios] Re-arming wake gate — server may have gone back to sleep.')
  _armWakeGate()
  _setServerStatus('waking')
  _startWakePinging()
}

// ── Upload concurrency semaphore ───────────────────────────────────────────
// BUG 3 FIX: _inFlight only counts actively granted slots.
// waitForUploadSlot: increment only on immediate grant.
// releaseUploadSlot: transfer to next waiter (no counter change) or decrement.
const MAX_CONCURRENT_UPLOADS = 2
let _inFlight  = 0
const _waiters = []

export function waitForUploadSlot() {
  if (_inFlight < MAX_CONCURRENT_UPLOADS) {
    _inFlight++             // immediate grant — count it
    return Promise.resolve()
  }
  // At capacity — queue the caller (do NOT increment _inFlight yet)
  return new Promise(resolve => _waiters.push(resolve))
}

export function releaseUploadSlot() {
  const next = _waiters.shift()
  if (next) {
    // Slot transfers to the next waiter — _inFlight stays the same.
    setTimeout(next, 100)   // 100ms gap so Render's HTTP/2 mux can breathe
  } else {
    _inFlight = Math.max(0, _inFlight - 1)
  }
}

// ── Wake pinging ───────────────────────────────────────────────────────────
let _wakePending  = false
let _wakeInterval = null

function _pingWake() {
  if (_IS_LOCAL || _serverConfirmedAwake || _wakePending) return Promise.resolve()
  _wakePending = true
  _setServerStatus('waking')

  // BUG 1 FIX: Split into two fetches:
  //
  // Knock (no-cors, fire-and-forget):
  //   Sends bytes to the server so Render starts the dyno.
  //   Must be no-cors — the server is asleep and can't send CORS headers yet,
  //   so a preflight would be blocked and Render would never receive the ping.
  fetch(`${BACKEND}/wake`, {
    method: 'GET',
    mode:   'no-cors',
    cache:  'no-store',
  }).catch(() => {})   // opaque response — always silently ignored

  // Readiness check (cors, reads response body):
  //   If the server is up and CORS headers are present, read the JSON and
  //   confirm readiness. Fails with a network error while still booting —
  //   that's expected; the interval will retry.
  return fetch(`${BACKEND}/wake`, {
    method: 'GET',
    mode:   'cors',
    cache:  'no-store',
    signal: AbortSignal.timeout(8_000),
  })
    .then(res => {
      if (res.ok && _wakeGateResolve) _wakeGateResolve()
    })
    .catch(() => { /* booting — next interval retries */ })
    .finally(() => { _wakePending = false })
}

function _startWakePinging() {
  if (_IS_LOCAL) return   // BUG 5 FIX: skip in local dev
  if (_wakeInterval) { clearInterval(_wakeInterval); _wakeInterval = null }
  _pingWake()
  _wakeInterval = setInterval(() => {
    if (_serverConfirmedAwake) {
      clearInterval(_wakeInterval)
      _wakeInterval = null
    } else {
      _pingWake()
    }
  }, 2_000)
}

_startWakePinging()

// Keep-alive: ping every 3.5 min to prevent Render from sleeping mid-session.
setInterval(async () => {
  if (_IS_LOCAL || !_serverConfirmedAwake) return
  try {
    const res = await fetch(`${BACKEND}/wake`, {
      method: 'GET',
      mode:   'cors',
      cache:  'no-store',
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) rearmWakeGate()   // BUG 4 FIX: rearmWakeGate() is unconditional
  } catch {
    rearmWakeGate()
  }
}, 3.5 * 60 * 1000)

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

// ── Request interceptor ────────────────────────────────────────────────────
// BUG 2 FIX: This is the ONLY place the auth token is injected.
// The duplicate top-level interceptor that previously also injected it
// has been removed entirely.
api.interceptors.request.use(
  async (config) => {
    if (isDocumentUpload(config.url, config.method)) {
      // BUG A FIX (retained): read the live gate, not a stale module-load closure.
      await getCurrentWakeGate()

      // Acquire upload slot (unless the caller pre-acquired it).
      if (!config._slotPreacquired) {
        await waitForUploadSlot()
      }

      config._serializedUpload = true
      config.timeout = 120_000   // OCR + AI verification can take 60–90s
    }

    // Single point of token injection — BUG 2 FIX.
    if (!isPublic(config.url, config.method)) {
      const token =
        localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // Let the browser set Content-Type for FormData (multipart boundary).
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
    // Release semaphore slot (unless caller pre-acquired — they own release).
    if (response.config?._serializedUpload && !response.config?._slotPreacquired) {
      releaseUploadSlot()
    }
    // Any successful response confirms server is awake.
    if (!_serverConfirmedAwake && _wakeGateResolve) {
      _wakeGateResolve()
    }
    return response
  },

  async error => {
    // Release semaphore slot on error too (both paths release — FIX 4 retained).
    if (error.config?._serializedUpload && !error.config?._slotPreacquired) {
      releaseUploadSlot()
    }

    if (!error.response) {
      // Network failure — includes apparent "CORS" errors that are really
      // Render dropping connections before the dyno is ready.
      rearmWakeGate()   // BUG 4 FIX: unconditional

      const config = error.config || {}

      // Don't retry wake pings or document uploads here.
      if (config.url?.includes('/wake'))               return Promise.reject(error)
      if (isDocumentUpload(config.url, config.method)) return Promise.reject(error)

      // Retry other requests with exponential backoff (max 3 attempts).
      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      const waitMs = config._retryCount * 2_000
      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 in ${waitMs / 1000}s…`
      )
      _startWakePinging()
      await _sleep(waitMs)
      return api(config)
    }

    // HTTP error responses
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