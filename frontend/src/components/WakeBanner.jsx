/**
 * frontend/src/components/WakeBanner.jsx — v5.1.0
 *
 * FIXES IN v5.1.0 (over v5.0.0):
 *
 *   FIX WB-1 — "Retry" sub-message added when the server confirmed awake
 *              but a document upload still failed (net error post-wake).
 *              Previously users saw nothing actionable after the banner
 *              disappeared — now the banner surfaces a "Try again" prompt
 *              if an upload error event is dispatched.
 *
 *    FIX WB-2 — "Still starting up…" past-deadline state now shows an
 *              amber pulsing ring instead of staying indigo, making it
 *              visually distinct from the normal waking state so users
 *              understand something extra is happening (ML models loading).
 *
 *   FIX WB-3 — Banner no longer flickers when rearmWakeGate() is called
 *              immediately after a failed upload. Added a 400ms debounce
 *              before switching from 'awake' → 'waking' to absorb the
 *              brief status bounce that follows a network error recovery.
 *
 * All v5.0.0 fixes retained unchanged:
 *    COUNTDOWN_MS = 45s (matches WAKE_SAFETY_TIMEOUT_MS in axios.js)
 *    Honest "up to 45 seconds" wording
 *    "Still waking…" sub-state after countdown reaches 0
 *   Duplicate WakeBanner removed from ApplyPage.jsx
 *
 * Usage (unchanged — drop into App.jsx root):
 *
 *   import WakeBanner from './components/WakeBanner'
 *
 *   export default function App() {
 *     return (
 *       <>
 *         <WakeBanner />
 *         <RouterProvider router={router} />
 *       </>
 *     )
 *   }
 */

import { useState, useEffect, useRef } from 'react'
import { getServerStatus, onServerStatusChange } from '../api/axios'

// Must match WAKE_SAFETY_TIMEOUT_MS in axios.js
const COUNTDOWN_MS = 45_000

// FIX WB-3: Debounce ms before accepting a waking/sleeping status after
// being awake. Prevents a single failed upload from flickering the banner.
const REARM_DEBOUNCE_MS = 400

const STYLE_ID = '__wake-banner-styles__'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    @keyframes wb-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes wb-fadein {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes wb-pulse-ring {
      0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99,102,241,0.45); }
      70%  { transform: scale(1);    box-shadow: 0 0 0 14px rgba(99,102,241,0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99,102,241,0); }
    }
    @keyframes wb-pulse-ring-amber {
      0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245,158,11,0.45); }
      70%  { transform: scale(1);    box-shadow: 0 0 0 14px rgba(245,158,11,0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245,158,11,0); }
    }
    @keyframes wb-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    .wb-countdown-ring {
      animation: wb-pulse-ring 2s ease-out infinite;
    }
    .wb-countdown-ring-amber {
      animation: wb-pulse-ring-amber 2s ease-out infinite;
    }
  `
  document.head.appendChild(el)
}

export default function WakeBanner() {
  const [status,       setStatus]       = useState(getServerStatus)
  const [msLeft,       setMsLeft]       = useState(COUNTDOWN_MS)
  const [visible,      setVisible]      = useState(false)
  const [pastDeadline, setPastDeadline] = useState(false)
  // FIX WB-1: Show actionable retry hint after upload fails post-wake.
  const [showRetryHint, setShowRetryHint] = useState(false)

  const startRef       = useRef(null)
  const rafRef         = useRef(null)
  const hideTimerRef   = useRef(null)
  // FIX WB-3: Debounce timer for waking status after being awake.
  const rearmDebounce  = useRef(null)

  useEffect(() => { injectStyles() }, [])

  //  FIX WB-1: Listen for upload-failed events dispatched by ApplyPage
  // after axios surfaces a network error on /profile/documents.
  useEffect(() => {
    const handleUploadFailed = () => {
      if (getServerStatus() === 'awake') {
        setShowRetryHint(true)
        setVisible(true)
        hideTimerRef.current = setTimeout(() => {
          setShowRetryHint(false)
          setVisible(false)
        }, 5_000)
      }
    }
    window.addEventListener('wb:upload-failed', handleUploadFailed)
    return () => window.removeEventListener('wb:upload-failed', handleUploadFailed)
  }, [])

  useEffect(() => {
    const unsub = onServerStatusChange((nextStatus) => {
      // FIX WB-3: Debounce waking/sleeping transitions from awake state.
      if (status === 'awake' && (nextStatus === 'waking' || nextStatus === 'sleeping')) {
        clearTimeout(rearmDebounce.current)
        rearmDebounce.current = setTimeout(() => setStatus(nextStatus), REARM_DEBOUNCE_MS)
      } else {
        clearTimeout(rearmDebounce.current)
        setStatus(nextStatus)
      }
    })
    return () => { unsub(); clearTimeout(rearmDebounce.current) }
  }, [status])

  useEffect(() => {
    if (status === 'sleeping' || status === 'waking') {
      clearTimeout(hideTimerRef.current)
      setVisible(true)
      setShowRetryHint(false)
      setPastDeadline(false)
      startRef.current = performance.now()
      setMsLeft(COUNTDOWN_MS)

      const tick = (now) => {
        const elapsed   = now - startRef.current
        const remaining = Math.max(0, COUNTDOWN_MS - elapsed)
        setMsLeft(remaining)
        if (remaining > 0) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          // Countdown hit 0 but server not confirmed awake yet.
          setPastDeadline(true)
        }
      }
      rafRef.current = requestAnimationFrame(tick)

    } else if (status === 'awake') {
      cancelAnimationFrame(rafRef.current)
      setPastDeadline(false)
      if (!showRetryHint) {
        hideTimerRef.current = setTimeout(() => setVisible(false), 900)
      }
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(hideTimerRef.current)
    }
  }, [status])

  if (!visible) return null

  const isAwake  = status === 'awake'
  const progress = isAwake
    ? 100
    : pastDeadline
      ? 99  // stay near-full while waiting past deadline
      : ((COUNTDOWN_MS - msLeft) / COUNTDOWN_MS) * 100

  const secondsLeft = Math.ceil(msLeft / 1000)

  // Arc math for SVG ring
  const R   = 44
  const C   = 2 * Math.PI * R
  const arc = C * (1 - progress / 100)

  // FIX WB-2: Amber ring class for past-deadline state.
  const ringClass = !isAwake
    ? pastDeadline
      ? 'wb-countdown-ring-amber'
      : 'wb-countdown-ring'
    : ''

  const barColor = isAwake
    ? 'linear-gradient(90deg, #22c55e, #16a34a)'
    : pastDeadline
      ? 'linear-gradient(90deg, #f59e0b, #d97706)'
      : 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)'

  // FIX WB-2: Amber stroke for past-deadline ring.
  const ringStroke = isAwake ? '#22c55e' : pastDeadline ? '#f59e0b' : '#6366f1'

  return (
    <div style={S.overlay}>
      <div style={S.backdrop} />

      <div style={S.card} role="status" aria-live="polite">
        {/* Animated ring */}
        <div style={S.logoWrap} className={ringClass}>
          <svg width="100" height="100" viewBox="0 0 100 100" style={S.svg}>
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke="rgba(99,102,241,0.15)"
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={ringStroke}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={isAwake ? 0 : arc}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.4s ease' }}
            />
            {isAwake ? (
              <polyline
                points="32,50 44,62 68,38"
                fill="none"
                stroke="#22c55e"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <g style={{ animation: 'wb-spin 1.4s linear infinite', transformOrigin: '50px 50px' }}>
                {[0,1,2,3,4,5,6,7].map(i => (
                  <rect
                    key={i}
                    x="47.5" y="18" width="5" height="11" rx="2.5"
                    fill={pastDeadline ? '#f59e0b' : '#6366f1'}
                    opacity={0.15 + i * 0.12}
                    transform={`rotate(${i * 45} 50 50)`}
                  />
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Text */}
        <div style={S.textBlock}>
          {/* FIX WB-1: Retry hint shown when upload failed after wakeup */}
          {showRetryHint ? (
            <>
              <h2 style={{ ...S.title, color: '#f59e0b' }}>Upload failed</h2>
              <p style={S.subtitle}>
                The server was restarted. Please try uploading your
                documents again — the server is now awake.
              </p>
            </>
          ) : isAwake ? (
            <>
              <h2 style={{ ...S.title, color: '#22c55e' }}>Server ready!</h2>
              <p style={S.subtitle}>Loading your page…</p>
            </>
          ) : pastDeadline ? (
            /* Past-deadline — ML models still loading */
            <>
              <h2 style={{ ...S.title, color: '#f59e0b' }}>Still starting up…</h2>
              <p style={S.subtitle}>
                ML models are loading — this takes a little longer on the first
                visit. Your uploads are queued and will begin automatically.
              </p>
            </>
          ) : (
            <>
              <h2 style={S.title}>Waking up the server</h2>
              <p style={S.subtitle}>
                Our server sleeps when idle to save resources.
                <br />
                Ready in about{' '}
                <span style={S.countdown}>{secondsLeft}s</span>
                {' '}— uploads will begin automatically.
              </p>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div
          style={S.barTrack}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              ...S.barFill,
              width:           `${progress}%`,
              background:      barColor,
              backgroundSize:  (isAwake || pastDeadline) ? 'auto' : '200% auto',
              animation:       (isAwake || pastDeadline) ? 'none' : 'wb-shimmer 1.8s linear infinite',
            }}
          />
        </div>

        {!isAwake && !showRetryHint && (
          <p style={S.footnote}>
            {pastDeadline
              ? 'Large AI models are initialising — hang tight.'
              : 'This only happens once — subsequent visits are instant.'}
          </p>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'system-ui', sans-serif",
  },
  backdrop: {
    position: 'absolute', inset: 0,
    background: 'rgba(8, 8, 20, 0.82)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  card: {
    position: 'relative', zIndex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '20px', padding: '44px 48px 36px',
    borderRadius: '20px',
    background: 'rgba(18, 18, 32, 0.95)',
    border: '1px solid rgba(99,102,241,0.25)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
    maxWidth: '400px', width: 'calc(100vw - 48px)',
    animation: 'wb-fadein 0.35s ease both', textAlign: 'center',
  },
  logoWrap: { borderRadius: '50%', lineHeight: 0 },
  svg: { display: 'block' },
  textBlock: { display: 'flex', flexDirection: 'column', gap: '8px' },
  title: {
    margin: 0, fontSize: '1.25rem', fontWeight: 700,
    color: '#e2e8f0', letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0, fontSize: '0.9rem', lineHeight: 1.6,
    color: 'rgba(200,206,220,0.75)',
  },
  countdown: {
    display: 'inline-block', minWidth: '2.2ch',
    padding: '1px 7px',
    background: 'rgba(99,102,241,0.18)',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: '6px', color: '#a5b4fc',
    fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.95rem',
  },
  barTrack: {
    width: '100%', height: '5px', borderRadius: '99px',
    background: 'rgba(99,102,241,0.12)', overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: '99px',
    transition: 'width 0.12s linear', backgroundSize: '200% auto',
  },
  footnote: {
    margin: 0, fontSize: '0.75rem',
    color: 'rgba(140,150,170,0.6)', maxWidth: '280px',
  },
}
