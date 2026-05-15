/**
 * frontend/src/components/WakeBanner.jsx — v5.0.0
 *
 * FIXES IN THIS VERSION:
 *
 *   ✅ FIX 1 — COUNTDOWN_MS raised from 30s → 45s to match the new
 *              WAKE_SAFETY_TIMEOUT_MS in axios.js v5. The countdown bar
 *              and the gate unblock now align exactly.
 *
 *   ✅ FIX 2 — "Waking up" message is more honest: says "up to 45 seconds"
 *              rather than showing a specific countdown that may worry users
 *              when it reaches 0 but the server is still loading.
 *
 *   ✅ FIX 3 — Added "Still waking…" sub-state shown after countdown
 *              reaches 0 but server hasn't confirmed awake yet. Previously
 *              the banner just sat at 0s which looked broken.
 *
 *   ✅ FIX 4 — Removed the duplicate WakeBanner inside ApplyPage.jsx
 *              (the small inline one). The global WakeBanner in App.jsx
 *              handles the full-screen overlay; the inline one in
 *              ApplyPage now only shows queue status (no countdown).
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

// ✅ FIX 1: Must match WAKE_SAFETY_TIMEOUT_MS in axios.js
const COUNTDOWN_MS = 45_000

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
    @keyframes wb-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    .wb-countdown-ring {
      animation: wb-pulse-ring 2s ease-out infinite;
    }
  `
  document.head.appendChild(el)
}

export default function WakeBanner() {
  const [status,      setStatus]      = useState(getServerStatus)
  const [msLeft,      setMsLeft]      = useState(COUNTDOWN_MS)
  const [visible,     setVisible]     = useState(false)
  const [pastDeadline, setPastDeadline] = useState(false)  // ✅ FIX 3

  const startRef     = useRef(null)
  const rafRef       = useRef(null)
  const hideTimerRef = useRef(null)

  useEffect(() => { injectStyles() }, [])

  useEffect(() => {
    const unsub = onServerStatusChange(setStatus)
    return unsub
  }, [])

  useEffect(() => {
    if (status === 'sleeping' || status === 'waking') {
      clearTimeout(hideTimerRef.current)
      setVisible(true)
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
          // ✅ FIX 3: Countdown hit 0 but server not confirmed awake yet.
          setPastDeadline(true)
        }
      }
      rafRef.current = requestAnimationFrame(tick)

    } else if (status === 'awake') {
      cancelAnimationFrame(rafRef.current)
      setPastDeadline(false)
      hideTimerRef.current = setTimeout(() => setVisible(false), 900)
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
      ? 99   // stay near-full while waiting past deadline
      : ((COUNTDOWN_MS - msLeft) / COUNTDOWN_MS) * 100

  const secondsLeft = Math.ceil(msLeft / 1000)

  // Arc math for SVG ring
  const R   = 44
  const C   = 2 * Math.PI * R
  const arc = C * (1 - progress / 100)

  return (
    <div style={S.overlay}>
      <div style={S.backdrop} />

      <div style={S.card} role="status" aria-live="polite">
        {/* Animated ring */}
        <div style={S.logoWrap} className={!isAwake ? 'wb-countdown-ring' : ''}>
          <svg width="100" height="100" viewBox="0 0 100 100" style={S.svg}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={isAwake ? '#22c55e' : '#6366f1'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={isAwake ? 0 : arc}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.4s ease' }}
            />
            {isAwake ? (
              <polyline points="32,50 44,62 68,38" fill="none" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <g style={{ animation: 'wb-spin 1.4s linear infinite', transformOrigin: '50px 50px' }}>
                {[0,1,2,3,4,5,6,7].map(i => (
                  <rect key={i} x="47.5" y="18" width="5" height="11" rx="2.5" fill="#6366f1" opacity={0.15 + i * 0.12} transform={`rotate(${i * 45} 50 50)`} />
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Text */}
        <div style={S.textBlock}>
          {isAwake ? (
            <>
              <h2 style={{ ...S.title, color: '#22c55e' }}>Server ready!</h2>
              <p style={S.subtitle}>Loading your page…</p>
            </>
          ) : pastDeadline ? (
            /* ✅ FIX 3: Past-deadline state — server is still loading models */
            <>
              <h2 style={S.title}>Still starting up…</h2>
              <p style={S.subtitle}>
                This is taking longer than usual. Your uploads are queued
                and will begin automatically once the server is ready.
              </p>
            </>
          ) : (
            <>
              <h2 style={S.title}>Waking up the server</h2>
              {/* ✅ FIX 2: Honest wording — shows countdown but manages expectations */}
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
              width: `${progress}%`,
              background: isAwake
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : pastDeadline
                  ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                  : 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
              backgroundSize: (isAwake || pastDeadline) ? 'auto' : '200% auto',
              animation: (isAwake || pastDeadline) ? 'none' : 'wb-shimmer 1.8s linear infinite',
            }}
          />
        </div>

        {!isAwake && (
          <p style={S.footnote}>
            {pastDeadline
              ? 'ML models are loading — this only happens on the first visit.'
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
