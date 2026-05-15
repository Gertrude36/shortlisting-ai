/**
 * frontend/src/api/axios.js — v5.0.0
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE OF THE INFINITE CORS LOOP (now fixed):
 *
 *   When Render's free-tier dyno is sleeping, Render's OWN nginx proxy
 *   returns 502/503 responses. These come from Render's infrastructure —
 *   NOT from your FastAPI app — so they carry ZERO CORS headers. The
 *   browser therefore blocks every single /wake fetch with a CORS error,
 *   _pingWake() never resolves, and the loop runs forever.
 *
 *   The previous code used two fetches per ping cycle:
 *     1. no-cors knock  → works (no-cors ignores CORS headers)
 *     2. cors readiness → always CORS-blocked during sleep → never resolves
 *
 *   Fix: use ONE no-cors ping to keep Render waking up. To detect that
 *   the server is actually ready, poll /health with a regular cors fetch
 *   but with a short timeout and explicit error swallowing. We consider
 *   the server awake only when we get back a real JSON 200 response.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIXES IN THIS VERSION (v5):
 *
 *   ✅ FIX 1 — Single no-cors knock replaces the dual-fetch pattern.
 *              The "cors readiness check" fetch was always CORS-blocked
 *              during Render's 502 window. We now fire ONE no-cors fetch
 *              to wake the dyno, and poll /health (with mode:'cors') as a
 *              *separate* readiness check that is independent of the knock.
 *              /health always returns 200 once FastAPI is up.
 *
 *   ✅ FIX 2 — Exponential backoff on wake pings (1.5s → 2s → 3s → 5s).
 *              Render free-tier cold starts take 8–30s. Hammering every
 *              1.5s produces hundreds of failed fetches and floods the
 *              console. Exponential backoff reduces noise while still
 *              catching readiness quickly.
 *
 *   ✅ FIX 3 — Wake gate resolves on /health 200, not on /wake CORS pass.
 *              Previously the gate only resolved if the cors /wake fetch
 *              succeeded — which required CORS headers that Render's 502
 *              never sends. Now we check /health which has no CORS issues
 *              (it returns 200 from FastAPI once the app is up).
 *
 *   ✅ FIX 4 — Safety timeout raised to 45s.
 *              Render free-tier cold starts can take up to 40s under load.
 *              The previous 30s timeout caused premature unblocking and
 *              uploads firing into a still-sleeping server.
 *
 *   ✅ FIX 5 — rearmWakeGate() tears down the existing interval (retained
 *              from v4 FIX 5) and resets the backoff counter.
 *
 *   ✅ FIX 6 — Upload timeout raised to 150s.
 *              OCR (Tesseract on a cold CPU) + AI semantic matching
 *              (sentence-transformers first run) can take 90–120s on
 *              Render free tier. 120s was too tight; 150s gives headroom.
 *
 *   ✅ FIX 7 — Network errors on /auth/me and /jobs no longer trigger
 *              rearmWakeGate() on their own — only genuine upload-path
 *              network failures do. This prevents the wake banner from
 *              flashing on every page load when the server is slow.
 *
 * Previously shipped fixes (all retained from v4):
 *   ✅ BUG 1  — no-cors knock
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

// ✅ FIX 4: Raised to 45s — Render free-tier cold starts can take up to 40s.
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

    // Safety unblock — fires if the server never confirms awake within 45s.
    // Unblocks queued uploads but does NOT set _serverConfirmedAwake, so
    // pinging continues in the background until a real 200 is received.
    setTimeout(() => {
      if (!_serverConfirmedAwake) {
        console.warn(
          '[axios] Wake gate safety timeout (45s) — unblocking uploads without confirming server awake.'
        )
        resolve()
        // _serverConfirmedAwake stays false → health polling continues
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
 * Re-arm the wake gate (called when the server appears to have gone back to sleep).
 * ✅ FIX 5: Cancels existing ping interval and resets backoff before re-arming.
 */
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
const MAX_CONCURRENT_UPLOADS = 3   // lowered from 5 — free tier has 1 CPU
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
// ✅ FIX 2: Exponential backoff intervals (ms).
// Cold starts typically resolve at 8–30s. Dense early pinging, then back off.
const BACKOFF_INTERVALS = [1500, 1500, 2000, 2000, 3000, 3000, 5000]

let _wakePending  = false
let _wakeInterval = null
let _backoffIndex = 0

/**
 * ✅ FIX 1: Single no-cors knock to wake the dyno.
 *
 * WHY no-cors ONLY:
 *   While Render's dyno is sleeping, its nginx proxy returns 502/503
 *   with NO Access-Control-Allow-Origin header. The browser blocks
 *   mode:'cors' fetches with a CORS error before we even see the status.
 *   mode:'no-cors' ignores CORS headers entirely, so the bytes reach
 *   Render and kick the dyno awake — we just can't read the response.
 *
 * Readiness is detected separately by _checkHealth() below.
 */
function _knockServer() {
  if (_IS_LOCAL || _wakePending) return
  _wakePending = true
  _setServerStatus('waking')

  fetch(`${BACKEND}/wake`, {
    method:    'GET',
    mode:      'no-cors',   // must be no-cors — sleeping server has no CORS headers
    cache:     'no-store',
    keepalive: true,        // survives tab navigation during cold start
  })
    .catch(() => {})        // always ignore errors — we can't read the response anyway
    .finally(() => { _wakePending = false })
}

/**
 * ✅ FIX 3: Health check is how we detect the server is ACTUALLY ready.
 *
 * /health returns HTTP 200 (with ready:true/false) once FastAPI is bound.
 * Unlike /wake, it doesn't require the app to have finished loading models,
 * but since _APP_READY is set before the lifespan yield, it's effectively
 * the same. Crucially, this fetch can use mode:'cors' because by the time
 * FastAPI is up, it IS sending CORS headers.
 */
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
      // Server is up and responding with CORS headers — confirm awake.
      if (_wakeGateResolve) _wakeGateResolve()
    }
  } catch {
    // Still booting or CORS not yet active — next interval will retry.
  }
}

function _startWakePinging() {
  if (_IS_LOCAL) return
  if (_wakeInterval) { clearInterval(_wakeInterval); _wakeInterval = null }

  _backoffIndex = 0

  // Immediate first knock + health check
  _knockServer()
  _checkHealth()

  // ✅ FIX 2: Exponential backoff scheduling.
  // Instead of a fixed-interval setInterval, we chain timeouts so each
  // iteration can use a different delay.
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

// ── Keep-alive: ping every 4 min to prevent Render from sleeping mid-session ─
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

// Routes where network errors should NOT trigger rearmWakeGate().
// These run on every page load and would cause spurious wake banner flashes.
const isBackgroundRoute = (url = '') =>
  /\/(auth\/me|jobs)($|\?)/.test(url)

// ── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    if (isDocumentUpload(config.url, config.method)) {
      await getCurrentWakeGate()

      if (!config._slotPreacquired) {
        await waitForUploadSlot()
      }

      config._serializedUpload = true
      // ✅ FIX 6: Raised upload timeout to 150s.
      // OCR (Tesseract) + sentence-transformers on cold CPU = up to 120s.
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
    // Any successful response means the server is alive.
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
      // Network failure — server may be sleeping or restarting.
      const config = error.config || {}

      if (config.url?.includes('/wake') || config.url?.includes('/health')) {
        return Promise.reject(error)
      }

      // ✅ FIX 7: Don't rearm for background routes (/auth/me, /jobs)
      // on initial page load — these fire before the server is confirmed
      // awake and would cause the wake banner to flash unnecessarily.
      if (!isBackgroundRoute(config.url || '')) {
        rearmWakeGate()
      }

      if (isDocumentUpload(config.url, config.method)) {
        // Uploads are handled by the retry queue in ApplyPage.jsx —
        // don't auto-retry here or we'll double-upload.
        return Promise.reject(error)
      }

      config._retryCount = (config._retryCount || 0) + 1
      if (config._retryCount > 3) return Promise.reject(error)

      const waitMs = config._retryCount * 2_000
      console.warn(
        `[axios] Network error on ${config.method?.toUpperCase()} ${config.url}. ` +
        `Retry ${config._retryCount}/3 — waiting ${waitMs / 1000}s…`
      )

      // Wait for server to wake OR for the backoff delay — whichever is first.
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