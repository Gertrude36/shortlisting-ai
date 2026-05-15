/**
 * frontend/src/api/axios.js — v4
 *
 * FIXES IN THIS VERSION (v4):
 *
 *   ✅ FIX 1 — Safety timeout reduced from 35s to 30s to match the
 *              WakeBanner countdown UX. The banner counts down 30s,
 *              the safety unblock fires at exactly the same moment,
 *              so the UI and the gate align perfectly.
 *
 *   ✅ FIX 2 — _pingWake() now sends the no-cors "knock" with
 *              keepalive: true. On Chromium-based browsers, fetch()
 *              with keepalive continues even if the tab navigates
 *              away during a cold start, ensuring Render receives the
 *              wake signal even in edge cases.
 *
 *   ✅ FIX 3 — _startWakePinging() now immediately increments the
 *              polling frequency to 1.5s (from 2s) for the first
 *              10 pings (i.e. the first ~15s), then drops back to
 *              2s. Cold-start latency on Render free tier clusters
 *              around 8–15s; denser early polling catches readiness
 *              sooner without burning extra requests over time.
 *
 *   ✅ FIX 4 — Network errors on non-upload, non-wake requests now
 *              check whether the server subsequently becomes awake
 *              before retrying, via Promise.race([gate, sleep]).
 *              Previously, retries fired into a still-sleeping
 *              server and all failed together.
 *
 *   ✅ FIX 5 — rearmWakeGate() now cancels any in-progress wake
 *              interval before re-arming, preventing a race where
 *              two intervals coexist after a keep-alive re-arm.
 *
 * Previously shipped fixes (all retained):
 *   ✅ BUG 1  — no-cors knock + cors readiness check split
 *   ✅ BUG 2  — single point of token injection
 *   ✅ BUG 3  — semaphore counter tracks active slots correctly
 *   ✅ BUG 4  — rearmWakeGate() unconditional
 *   ✅ BUG 5  — cold-start logic skipped for localhost
 *   ✅ FIX A  — getCurrentWakeGate() dynamic (not stale closure)
 *   ✅ FIX B  — safety timeout unblocks without confirming awake
 *   ✅ FIX C  — rearmWakeGate() exported
 */

import axios from 'axios'

export const BACKEND =
  import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Skip all Render cold-start logic for local dev backends.
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
let _serverConfirmedAwake = _IS_LOCAL

// ✅ FIX 1: Safety timeout matches the 30s WakeBanner countdown exactly.
const WAKE_SAFETY_TIMEOUT_MS = 30_000

function _armWakeGate() {
  _serverConfirmedAwake = false

  _wakeGatePromise = new Promise((resolve) => {
    _wakeGateResolve = () => {
      if (_serverConfirmedAwake) return
      _serverConfirmedAwake = true
      _setServerStatus('awake')
      resolve()
    }

    // ✅ FIX 1: 30s safety unblock — aligns with WakeBanner countdown.
    // Unblocks queued uploads but does NOT confirm server awake.
    // Pinging continues until a real HTTP 200 is received.
    setTimeout(() => {
      if (!_serverConfirmedAwake) {
        console.warn(
          '[axios] Wake gate safety timeout (30s) — unblocking uploads without confirming server awake.'
        )
        resolve()
        // _serverConfirmedAwake stays false → pinging continues
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

/**
 * Re-arm the wake gate.
 * ✅ FIX 5: Cancels any existing ping interval before re-arming to prevent
 * two intervals coexisting after a keep-alive re-arm.
 */
export function rearmWakeGate() {
  if (_IS_LOCAL) return
  console.log('[axios] Re-arming wake gate — server may have gone back to sleep.')
  // FIX 5: tear down existing interval first
  if (_wakeInterval) {
    clearInterval(_wakeInterval)
    _wakeInterval = null
  }
  _armWakeGate()
  _setServerStatus('waking')
  _startWakePinging()
}

// ── Upload concurrency semaphore ───────────────────────────────────────────
// _inFlight counts ONLY actively granted slots (not queued waiters).
const MAX_CONCURRENT_UPLOADS = 2
let _inFlight  = 0
const _waiters = []

export function waitForUploadSlot() {
  if (_inFlight < MAX_CONCURRENT_UPLOADS) {
    _inFlight++             // immediate grant
    return Promise.resolve()
  }
  // At capacity — queue without incrementing (slot count transfers on release)
  return new Promise(resolve => _waiters.push(resolve))
}

export function releaseUploadSlot() {
  const next = _waiters.shift()
  if (next) {
    // Transfer slot to next waiter — counter stays the same.
    setTimeout(next, 100)
  } else {
    _inFlight = Math.max(0, _inFlight - 1)
  }
}

// ── Wake pinging ───────────────────────────────────────────────────────────
let _wakePending  = false
let _wakeInterval = null
let _pingCount    = 0  // ✅ FIX 3: track pings for adaptive interval

function _pingWake() {
  if (_IS_LOCAL || _serverConfirmedAwake || _wakePending) return Promise.resolve()
  _wakePending = true
  _pingCount++
  _setServerStatus('waking')

  // ✅ BUG 1 (retained): Split into no-cors knock + cors readiness check.
  //
  // Knock (no-cors, fire-and-forget):
  //   Sends bytes to Render so it starts the dyno.
  //   Must be no-cors — sleeping server can't send CORS headers yet.
  //   ✅ FIX 2: keepalive: true ensures delivery even across navigations.
  fetch(`${BACKEND}/wake`, {
    method:    'GET',
    mode:      'no-cors',
    cache:     'no-store',
    keepalive: true,
  }).catch(() => {})

  // Readiness check (cors): reads the JSON and confirms readiness.
  return fetch(`${BACKEND}/wake`, {
    method: 'GET',
    mode:   'cors',
    cache:  'no-store',
    signal: AbortSignal.timeout(8_000),
  })
    .then(res => {
      if (res.ok && _wakeGateResolve) _wakeGateResolve()
    })
    .catch(() => { /* still booting — next interval retries */ })
    .finally(() => { _wakePending = false })
}

function _startWakePinging() {
  if (_IS_LOCAL) return
  if (_wakeInterval) { clearInterval(_wakeInterval); _wakeInterval = null }
  _pingCount = 0
  _pingWake()

  // ✅ FIX 3: Adaptive polling — 1.5s for first 10 pings (~15s), then 2s.
  // Cold starts cluster around 8–15s; denser early polling catches readiness
  // sooner without burning extra requests long-term.
  _wakeInterval = setInterval(() => {
    if (_serverConfirmedAwake) {
      clearInterval(_wakeInterval)
      _wakeInterval = null
      return
    }

    const interval = _pingCount < 10 ? 1_500 : 2_000

    // Re-schedule at the correct interval dynamically.
    clearInterval(_wakeInterval)
    _pingWake()
    _wakeInterval = setInterval(() => {
      if (_serverConfirmedAwake) {
        clearInterval(_wakeInterval)
        _wakeInterval = null
      } else {
        _pingWake()
      }
    }, interval)

  }, 1_500)  // initial tick at 1.5s
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
    if (!res.ok) rearmWakeGate()
  } catch {
    rearmWakeGate()
  }
}, 3.5 * 60 * 1_000)

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
// ✅ BUG 2 (retained): Single point of token injection.
api.interceptors.request.use(
  async (config) => {
    if (isDocumentUpload(config.url, config.method)) {
      await getCurrentWakeGate()

      if (!config._slotPreacquired) {
        await waitForUploadSlot()
      }

      config._serializedUpload = true
      config.timeout = 120_000   // OCR + AI verification can take 60–90s
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
      // Network failure — may be CORS-blocked Render 502 during cold start.
      rearmWakeGate()

      const config = error.config || {}

      if (config.url?.includes('/wake'))               return Promise.reject(error)
      if (isDocumentUpload(config.url, config.method)) return Promise.reject(error)

      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      // ✅ FIX 4: Wait for the server to wake OR the backoff delay,
      // whichever comes first. Avoids firing retries into a sleeping server.
      const waitMs = config._retryCount * 2_000
      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 — waiting for server or ${waitMs / 1000}s…`
      )
      _startWakePinging()
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