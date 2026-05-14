/**
 * frontend/src/api/axios.js — FULLY FIXED v2
 *
 * ROOT CAUSE OF "CORS" ERRORS:
 *   Render free tier drops HTTP/2 connections when multiple requests arrive
 *   simultaneously during cold start. The browser reports this as a CORS error
 *   because no headers (including CORS headers) are sent before the connection
 *   drops. The CORS config on the backend is correct — this is a concurrency
 *   problem, not a CORS configuration problem.
 *
 * FIXES IN THIS VERSION (on top of previous fixes):
 *
 *   ✅ FIX A — _wakeGatePromise read dynamically (not captured at closure time)
 *      The request interceptor now calls getCurrentWakeGate() at execution
 *      time. Previously it closed over _wakeGatePromise at module load, so
 *      re-armed gates were invisible to already-queued uploads — they kept
 *      awaiting the old (already-resolved) promise and fired into a dead server.
 *
 *   ✅ FIX B — Safety timeout no longer marks server as "awake"
 *      Previously _armWakeGate's 35s setTimeout called _wakeGateResolve(),
 *      which set _serverConfirmedAwake = true and stopped wake pinging. This
 *      meant uploads fired into a still-sleeping server. Now the timeout just
 *      resolves the Promise to unblock uploads without touching
 *      _serverConfirmedAwake, so pinging continues until a real /wake 200
 *      is received.
 *
 *   ✅ FIX C — rearmWakeGate() is exported and also re-exported as a getter
 *      so ApplyPage can call it directly if needed, and the interceptor always
 *      reads the live gate.
 *
 * Previously shipped fixes (retained):
 *   ✅ FIX 1 — Upload serializer (one upload at a time, 300ms inter-gap)
 *   ✅ FIX 2 — Re-armable wake gate
 *   ✅ FIX 3 — Dynamic gate reference (now via getCurrentWakeGate())
 *   ✅ FIX 4 — Semaphore released in both success AND error paths
 *   ✅ FIX 5 — Keep-alive detects sleep and re-arms automatically
 *   ✅ FIX 6 — Faster wake ping interval (2s), safety timeout unblocks only
 *   ✅ FIX 7 — 120s timeout for uploads
 *   ✅ FIX 8 — Small inter-upload delay (300ms)
 */

import axios from 'axios'

export const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Axios instance ─────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BACKEND,
  withCredentials: false,
  timeout:         30_000,
})

// ── Server status ──────────────────────────────────────────────────────────────
let _serverStatus      = 'sleeping'
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

// ── Re-armable wake gate ───────────────────────────────────────────────────────
//
// FIX A: The interceptor must call getCurrentWakeGate() at request-execution
// time — NOT capture _wakeGatePromise in a closure at module load. This
// ensures re-armed gates (created after module load) are actually awaited.
//
// FIX B: The 35s safety timeout resolves the Promise to unblock uploads, but
// does NOT set _serverConfirmedAwake = true. Wake pinging continues until a
// real HTTP 200 from /wake is received. This prevents uploads from firing
// into a server that is still cold-starting.
//
let _wakeGatePromise      = null
let _wakeGateResolve      = null   // resolves when server confirmed awake
let _wakeGateUnblock      = null   // resolves on safety timeout only (unblocks, doesn't confirm)
let _serverConfirmedAwake = false

function _armWakeGate() {
  _serverConfirmedAwake = false

  _wakeGatePromise = new Promise((resolve) => {
    // Called when /wake returns 200 — confirms server is truly awake
    _wakeGateResolve = () => {
      if (_serverConfirmedAwake) return
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }

    // FIX B: Safety unblock after 35s — lets uploads proceed but does NOT
    // confirm server awake. Pinging continues. Uploads may still fail if
    // server isn't ready, but ApplyPage will queue them again via isNetwork.
    _wakeGateUnblock = resolve  // save so we can call it from the timeout
    setTimeout(() => {
      if (!_serverConfirmedAwake) {
        console.warn('[axios] Wake gate safety timeout (35s) — unblocking uploads without confirming server awake.')
        resolve()  // unblock waiting uploads
        // _serverConfirmedAwake stays false → pinging continues
      }
    }, 35_000)
  })
}

_armWakeGate() // arm on module load

// FIX A: Always return the CURRENT gate promise (not a stale closure).
export function getCurrentWakeGate() {
  return _wakeGatePromise
}

/**
 * Re-arm the wake gate. Called automatically when network failures are
 * detected. Can also be called by components if needed.
 */
export function rearmWakeGate() {
  if (_serverConfirmedAwake) {
    console.log('[axios] Re-arming wake gate — server may have gone back to sleep.')
    _armWakeGate()
    _setServerStatus('waking')
    _startWakePinging()
  }
}

// ── Upload serializer semaphore ────────────────────────────────────────────────
//
// Only 1 document upload runs at a time.
// Render free tier drops HTTP/2 connections under concurrent load.
// Sequential uploads prevent ERR_HTTP2_PROTOCOL_ERROR / "CORS" errors.
//
let _uploadInFlight  = false
const _uploadWaiters = []

function _waitForUploadSlot() {
  if (!_uploadInFlight) {
    _uploadInFlight = true
    return Promise.resolve()
  }
  return new Promise(resolve => _uploadWaiters.push(resolve))
}

function _releaseUploadSlot() {
  if (_uploadWaiters.length > 0) {
    const next = _uploadWaiters.shift()
    // Small delay between uploads — lets Render finish writing the previous
    // file and frees the HTTP/2 stream cleanly.
    setTimeout(next, 300)
  } else {
    _uploadInFlight = false
  }
}

// ── Wake pinging ───────────────────────────────────────────────────────────────
let _wakePending  = false
let _wakeInterval = null

function _pingWake() {
  if (_serverConfirmedAwake || _wakePending) return Promise.resolve()
  _wakePending = true
  _setServerStatus('waking')

  return fetch(`${BACKEND}/wake`, {
    method: 'GET',
    signal: AbortSignal.timeout(8_000),
  })
    .then(res => {
      if (res.ok && _wakeGateResolve) _wakeGateResolve()
    })
    .catch(() => { /* server still sleeping — next tick will retry */ })
    .finally(() => { _wakePending = false })
}

function _startWakePinging() {
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

// Keep-alive + sleep detection: ping every 3.5 min.
// If the ping fails, re-arm the wake gate so queued uploads wait for
// the server to come back instead of firing into a dead connection.
setInterval(async () => {
  if (!_serverConfirmedAwake) return
  try {
    const res = await fetch(`${BACKEND}/wake`, {
      method: 'GET',
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) rearmWakeGate()
  } catch {
    rearmWakeGate()
  }
}, 3.5 * 60 * 1000)

// ── Auth helpers ───────────────────────────────────────────────────────────────
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

// ── Route classification ───────────────────────────────────────────────────────
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

// Only document upload POSTs are serialized and gated.
const isDocumentUpload = (url = '', method = '') =>
  method.toUpperCase() === 'POST' &&
  /\/applications\/\d+\/documents$/.test(url.split('?')[0])

// ── Request interceptor ────────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    if (isDocumentUpload(config.url, config.method)) {
      // FIX A: Read the CURRENT gate at call time — not a stale module-load closure.
      // This ensures re-armed gates (after network failures) are actually awaited.
      await getCurrentWakeGate()

      // Serialize — wait for any in-flight upload to finish
      await _waitForUploadSlot()

      // Mark so the response interceptor knows to release the slot
      config._serializedUpload = true
      config.timeout = 120_000   // OCR + AI verification can take 60–90s
    }

    if (!isPublic(config.url, config.method)) {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      if (token) config.headers.Authorization = `Bearer ${token}`
    }

    // Let browser set Content-Type for FormData (multipart boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  err => Promise.reject(err),
)

// ── Response interceptor ───────────────────────────────────────────────────────
let _redirecting = false
const _sleep = ms => new Promise(r => setTimeout(r, ms))

api.interceptors.response.use(
  response => {
    // Release serializer slot (must happen even on success)
    if (response.config?._serializedUpload) {
      _releaseUploadSlot()
    }
    // Any successful response confirms server is awake
    if (!_serverConfirmedAwake && _wakeGateResolve) {
      _wakeGateResolve()
    }
    return response
  },

  async error => {
    // Always release serializer slot on error — prevents deadlock
    if (error.config?._serializedUpload) {
      _releaseUploadSlot()
    }

    if (!error.response) {
      // ── Network failure (no HTTP response received) ───────────────────────
      // This includes the "CORS" errors that are actually dropped connections.
      // Re-arm the wake gate so subsequent uploads queue until server recovers.
      if (_serverConfirmedAwake) {
        rearmWakeGate()
      }

      const config = error.config || {}

      // Don't retry wake pings or document uploads
      // (document uploads are queued by ApplyPage.jsx, not retried here)
      if (config.url?.includes('/wake'))              return Promise.reject(error)
      if (isDocumentUpload(config.url, config.method)) return Promise.reject(error)

      // Retry other requests (form submits, job loads, etc.) with backoff
      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      const waitMs = config._retryCount * 2_000   // 2s, 4s, 8s
      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 in ${waitMs / 1000}s…`
      )
      _startWakePinging()
      await _sleep(waitMs)
      return api(config)
    }

    // ── HTTP error responses ────────────────────────────────────────────────
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